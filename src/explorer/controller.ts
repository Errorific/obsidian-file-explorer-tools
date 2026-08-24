import type { EventRef, TFile } from 'obsidian';
import { DEFAULT_SETTINGS, type FileExplorerToolsSettings } from '../settings';
import { isHidden, pathsToReveal } from '../hiding/hidden-items';
import { createLeafState, resetTemporaryVisibility, type ExplorerLeafState } from './leaf-state';
import { createSortingOptions } from '../sorting/order';
import { createExplorerAdapter } from './adapter';
import type { ExplorerAdapter } from './adapter-types';
import { addCompatibilityAction, formatCompatibilityReport } from './toolbar';

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
	showNotice: (message: string) => void;
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
	private readonly showNotice: (message: string) => void;
	private disposed = false;
	private forceGlobal = false;
	private started = false;

	constructor(
		private readonly plugin: ExplorerPluginHost,
		options: ExplorerControllerOptions,
	) {
		this.createAdapter = options.createAdapter ?? createExplorerAdapter;
		this.getSettings = options.getSettings ?? (() => DEFAULT_SETTINGS);
		this.showNotice = options.showNotice;
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
							for (const path of pathsToReveal(file.path, this.getSettings())) {
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
			this.applyVisibility(attached);
		}
	}

	refreshVisibility(): void {
		for (const attached of this.attachedLeaves.values()) {
			this.applyVisibility(attached);
		}
	}

	toggleForceGlobal(): void {
		this.forceGlobal = !this.forceGlobal;
		for (const { adapter } of this.attachedLeaves.values()) {
			adapter.refreshToolbarActions();
		}
		this.refreshSorting();
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
				const attached = this.attachLeaf(adapter);
				this.attachedLeaves.set(leaf, attached);
			} catch {
				runSafely(() => this.showNotice(ATTACHMENT_FAILURE_MESSAGE));
			}
		}
	}

	private attachLeaf(adapter: ExplorerAdapter): AttachedExplorer {
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
			}

			let renderCount = 0;
			const disposeRenderObserver = adapter.observeRenders(() => {
				renderCount += 1;
				this.applyVisibility(attached);
			});
			if (disposeRenderObserver !== null) {
				disposers.push(disposeRenderObserver);
			}

			const disposeToolbarAction = addCompatibilityAction(
				adapter,
				() => renderCount,
				this.showNotice,
			);
			if (disposeToolbarAction !== null) {
				disposers.push(disposeToolbarAction);
			}

			const disposeRevealAction = adapter.addToolbarAction({
				icon: 'eye-off',
				title: 'Toggle hidden items',
				callback: () => {
					attached.state.showHidden = !attached.state.showHidden;
					this.applyVisibility(attached);
					adapter.refreshToolbarActions();
				},
				getPressed: () => attached.state.showHidden,
			});
			if (disposeRevealAction !== null) {
				disposers.push(disposeRevealAction);
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
				for (const path of pathsToReveal(activeFile.path, this.getSettings())) {
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
