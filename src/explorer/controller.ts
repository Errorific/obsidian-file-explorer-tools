import type { EventRef, TFile } from 'obsidian';
import type { FolderNoteIntegration } from '../integrations/folder-notes';
import { DEFAULT_SETTINGS, type FileExplorerToolsSettings } from '../settings';
import { isHidden, pathsToReveal } from '../hiding/hidden-items';
import {
	createLeafState,
	moveTemporaryVisibility,
	resetTemporaryVisibility,
	type ExplorerLeafState,
} from './leaf-state';
import { createSortingOptions } from '../sorting/order';
import { reorderPrefixItem } from '../sorting/prefix-controller';
import {
	getAncestorFolderPaths,
	getFoldersToCollapse,
} from '../navigation/path-state';
import { createExplorerAdapter } from './adapter';
import type {
	ExplorerAdapter,
	PrefixReorderRequest,
} from './adapter-types';
import { formatCompatibilityReport } from './toolbar';

const FILE_EXPLORER_VIEW_TYPE = 'file-explorer';
const ATTACHMENT_FAILURE_MESSAGE =
	'File Explorer Tools: file explorer compatibility check failed.';

export interface ExplorerLeaf {
	view: unknown;
}

export interface ExplorerPluginHost {
	app: {
		workspace: {
			getLeavesOfType(viewType: string): ExplorerLeaf[];
			getActiveFile(): TFile | null;
			on(
				name: 'layout-change' | 'file-open',
				callback: (file?: TFile | null) => void,
			): EventRef;
			onLayoutReady(callback: () => void): void;
		};
	};
	registerEvent(event: EventRef): void;
}

export interface ExplorerControllerOptions {
	createAdapter?: (view: unknown) => ExplorerAdapter;
	getSettings?: () => FileExplorerToolsSettings;
	saveSettings?: () => Promise<void>;
	showNotice: (message: string) => void;
	folderNotes?: FolderNoteIntegration | null;
}

interface AttachedExplorer {
	adapter: ExplorerAdapter;
	state: ExplorerLeafState;
	dispose: () => void;
}

export class ExplorerController {
	private readonly attachedLeaves = new Map<ExplorerLeaf, AttachedExplorer>();
	private readonly createAdapter: (view: unknown) => ExplorerAdapter;
	private readonly getSettings: () => FileExplorerToolsSettings;
	private readonly saveSettings: () => Promise<void>;
	private readonly showNotice: (message: string) => void;
	private readonly folderNotes: FolderNoteIntegration | null;
	private disposed = false;
	private forceGlobal = false;
	private started = false;

	constructor(
		private readonly plugin: ExplorerPluginHost,
		options: ExplorerControllerOptions,
	) {
		this.createAdapter = options.createAdapter ?? createExplorerAdapter;
		this.getSettings = options.getSettings ?? (() => DEFAULT_SETTINGS);
		this.saveSettings = options.saveSettings ?? (async () => undefined);
		this.showNotice = options.showNotice;
		this.folderNotes = options.folderNotes ?? null;
	}

	start(): void {
		if (this.started) {
			return;
		}
		this.started = true;

		this.plugin.app.workspace.onLayoutReady(() => {
			if (this.disposed) {
				return;
			}

			this.attachExplorerLeaves();
			this.plugin.registerEvent(
				this.plugin.app.workspace.on('layout-change', () => {
					this.attachExplorerLeaves();
				}),
			);
			this.plugin.registerEvent(
				this.plugin.app.workspace.on('file-open', (file) => {
					for (const attached of this.attachedLeaves.values()) {
						resetTemporaryVisibility(attached.state);
						if (file != null) {
							for (const path of this.pathsToReveal(file)) {
								attached.state.temporaryVisiblePaths.add(path);
							}
						}
						this.applyVisibility(attached);
					}
				}),
			);
		});
	}

	dispose(): void {
		this.disposed = true;
		for (const attached of this.attachedLeaves.values()) {
			runSafely(attached.dispose);
		}
		this.attachedLeaves.clear();
	}

	isForceGlobal(): boolean {
		return this.forceGlobal;
	}

	refreshSorting(): void {
		for (const attached of this.attachedLeaves.values()) {
			attached.adapter.runOriginalSort();
			attached.adapter.refreshPrefixHandles();
			this.applyVisibility(attached);
		}
	}

	refreshVisibility(): void {
		for (const attached of this.attachedLeaves.values()) {
			this.applyVisibility(attached);
		}
	}

	restorePrefixHandleFocus(path: string, leaf?: ExplorerLeaf): void {
		if (leaf === undefined) {
			return;
		}
		this.attachedLeaves.get(leaf)?.adapter.restorePrefixHandleFocus(path);
	}

	moveTemporaryVisibility(oldPath: string, newPath: string): void {
		for (const attached of this.attachedLeaves.values()) {
			moveTemporaryVisibility(attached.state, oldPath, newPath);
			this.applyVisibility(attached);
		}
	}

	toggleHiddenItems(): void {
		for (const attached of this.attachedLeaves.values()) {
			this.toggleHiddenItemsFor(attached);
		}
	}

	toggleForceGlobal(): void {
		this.forceGlobal = !this.forceGlobal;
		for (const { adapter } of this.attachedLeaves.values()) {
			adapter.refreshToolbarActions();
		}
		this.refreshSorting();
	}

	locateCurrentFile(leaf?: ExplorerLeaf): void {
		const file = this.plugin.app.workspace.getActiveFile();
		if (file === null) {
			return;
		}

		for (const [candidate, attached] of this.attachedLeaves) {
			if (leaf !== undefined && candidate !== leaf) {
				continue;
			}
			const item = attached.adapter
				.getItems()
				.find(({ path }) => path === file.path);
			if (item?.selected && attached.adapter.isItemVisible(file.path)) {
				this.collapseAttachedExplorer(attached, file);
				continue;
			}

			for (const path of this.pathsToReveal(file)) {
				attached.state.temporaryVisiblePaths.add(path);
			}
			this.applyVisibility(attached);
			for (const path of getAncestorFolderPaths(file.path)) {
				attached.adapter.expand(path);
			}
			attached.adapter.scrollTo(file.path);
			attached.adapter.select(file.path);
		}
	}

	collapseToCurrentPath(leaf?: ExplorerLeaf): void {
		const file = this.plugin.app.workspace.getActiveFile();
		if (file === null) {
			return;
		}

		for (const [candidate, attached] of this.attachedLeaves) {
			if (leaf === undefined || candidate === leaf) {
				this.collapseAttachedExplorer(attached, file);
			}
		}
	}

	private attachExplorerLeaves(): void {
		if (this.disposed) {
			return;
		}

		const currentLeaves = new Set(
			this.plugin.app.workspace.getLeavesOfType(FILE_EXPLORER_VIEW_TYPE),
		);

		for (const [leaf, attached] of this.attachedLeaves) {
			if (!currentLeaves.has(leaf)) {
				runSafely(attached.dispose);
				this.attachedLeaves.delete(leaf);
			}
		}

		for (const leaf of currentLeaves) {
			if (this.attachedLeaves.has(leaf)) {
				continue;
			}

			try {
				const adapter = this.createAdapter(leaf.view);
				const attached = this.attachLeaf(leaf, adapter);
				this.attachedLeaves.set(leaf, attached);
			} catch {
				runSafely(() => this.showNotice(ATTACHMENT_FAILURE_MESSAGE));
			}
		}
	}

	private attachLeaf(
		leaf: ExplorerLeaf,
		adapter: ExplorerAdapter,
	): AttachedExplorer {
		const disposers: Array<() => void> = [];
		const attached: AttachedExplorer = {
			adapter,
			state: createLeafState(),
			dispose: () => runDisposers(disposers),
		};
		try {
			const disposeSorting = adapter.installSorting((folderPath, coreSortMode) =>
				createSortingOptions(
					this.getSettings(),
					folderPath,
					coreSortMode,
					this.forceGlobal,
				),
			);
			if (disposeSorting !== null) {
				disposers.push(disposeSorting);
				const disposePrefixHandles = adapter.installPrefixHandles({
					isOrdered: (path) => this.isOrderedPrefixPath(path),
					onReorder: (request) => this.reorderPrefix(request),
				});
				if (disposePrefixHandles !== null) {
					disposers.push(disposePrefixHandles);
				}
			}

			let renderCount = 0;
			const disposeRenderObserver = adapter.observeRenders(() => {
				renderCount += 1;
				adapter.refreshPrefixHandles();
				this.applyVisibility(attached);
			});
			if (disposeRenderObserver !== null) {
				disposers.push(disposeRenderObserver);
			}

			const disposeRevealAction = adapter.addToolbarAction({
				icon: 'eye-off',
				title: 'Toggle hidden items',
				callback: () => this.toggleHiddenItemsFor(attached),
				getPressed: () => attached.state.showHidden,
			});
			if (disposeRevealAction !== null) {
				disposers.push(disposeRevealAction);
			}

			const disposeLocateAction = adapter.addToolbarAction({
				icon: 'locate-fixed',
				title: 'Locate current file',
				callback: () => this.locateCurrentFile(leaf),
			});
			if (disposeLocateAction !== null) {
				disposers.push(disposeLocateAction);
			}

			const disposeForceGlobalAction = adapter.addToolbarAction({
				icon: 'list-ordered',
				title: 'Toggle force global sorting',
				callback: () => this.toggleForceGlobal(),
				getPressed: () => this.forceGlobal,
			});
			if (disposeForceGlobalAction !== null) {
				disposers.push(disposeForceGlobalAction);
			}

			adapter.runOriginalSort();
			const activeFile = this.plugin.app.workspace.getActiveFile();
			if (activeFile !== null) {
				for (const path of this.pathsToReveal(activeFile)) {
					attached.state.temporaryVisiblePaths.add(path);
				}
			}
			this.applyVisibility(attached);
			const report = adapter.getCompatibilityReport();
			if (!report.available) {
				runSafely(() =>
					this.showNotice(formatCompatibilityReport(report, renderCount)),
				);
			}
		} catch (error) {
			runDisposers(disposers);
			throw error;
		}

		return attached;
	}

	private isOrderedPrefixPath(path: string): boolean {
		if (this.forceGlobal || path.length === 0) {
			return false;
		}
		const folderPath = parentOf(path);
		return (
			this.getSettings().folders[folderPath]?.orderedPrefix.includes(
				nameOf(path),
			) ?? false
		);
	}

	private async reorderPrefix(
		request: PrefixReorderRequest,
	): Promise<boolean> {
		if (
			this.forceGlobal ||
			parentOf(request.sourcePath) !== parentOf(request.targetPath)
		) {
			return false;
		}
		const changed = reorderPrefixItem(
			this.getSettings(),
			parentOf(request.sourcePath),
			nameOf(request.sourcePath),
			nameOf(request.targetPath),
			request.position,
		);
		if (!changed) {
			return false;
		}
		await this.saveSettings();
		return true;
	}

	private collapseAttachedExplorer(
		attached: AttachedExplorer,
		file: TFile,
	): void {
		const associatedFolder = this.folderNotes?.getAssociatedFolderPath(file);
		const retainedPath = associatedFolder ?? file.path;
		for (const path of getFoldersToCollapse(
			attached.adapter.getItems(),
			retainedPath,
			associatedFolder !== null && associatedFolder !== undefined,
		)) {
			attached.adapter.collapse(path);
		}
	}

	private toggleHiddenItemsFor(attached: AttachedExplorer): void {
		attached.state.showHidden = !attached.state.showHidden;
		this.applyVisibility(attached);
		attached.adapter.refreshToolbarActions();
	}

	private applyVisibility(attached: AttachedExplorer): void {
		const settings = this.getSettings();
		const hiddenPaths = settings.hiddenPaths;
		for (const item of attached.adapter.getItems()) {
			const hidden = isHidden(settings, item.path);
			const visible =
				attached.state.showHidden ||
				attached.state.temporaryVisiblePaths.has(item.path);
			const hiddenAncestorIsVisible = hiddenPaths.some(
				(path) =>
					isPathOrDescendant(item.path, path) &&
					(attached.state.showHidden ||
						attached.state.temporaryVisiblePaths.has(path)),
			);
			attached.adapter.setItemVisibility(item.path, {
				hidden,
				showHidden: visible,
				dimmed: hiddenAncestorIsVisible,
				marked: hidden,
			});
		}
	}

	private pathsToReveal(file: TFile): string[] {
		const paths = pathsToReveal(file.path, this.getSettings());
		const associatedFolder = this.folderNotes?.getAssociatedFolderPath(file);
		if (associatedFolder !== null && associatedFolder !== undefined) {
			for (const path of pathsToReveal(associatedFolder, this.getSettings())) {
				if (!paths.includes(path)) {
					paths.push(path);
				}
			}
		}
		return paths;
	}

	revealPath(path: string, leaf?: ExplorerLeaf): void {
		for (const [candidate, attached] of this.attachedLeaves) {
			if (leaf !== undefined && candidate !== leaf) {
				continue;
			}
			for (const revealed of pathsToReveal(path, this.getSettings())) {
				attached.state.temporaryVisiblePaths.add(revealed);
			}
			this.applyVisibility(attached);
		}
	}
}

function parentOf(path: string): string {
	const separatorIndex = path.lastIndexOf('/');
	return separatorIndex < 0 ? '' : path.slice(0, separatorIndex);
}

function nameOf(path: string): string {
	const separatorIndex = path.lastIndexOf('/');
	return separatorIndex < 0 ? path : path.slice(separatorIndex + 1);
}

function isPathOrDescendant(path: string, ancestor: string): boolean {
	return path === ancestor || path.startsWith(`${ancestor}/`);
}

function runDisposers(disposers: Array<() => void>): void {
	for (const dispose of [...disposers].reverse()) {
		runSafely(dispose);
	}
}

function runSafely(operation: () => void): void {
	try {
		operation();
	} catch {
		// Compatibility cleanup is best-effort so one failed resource does not leak others.
	}
}
