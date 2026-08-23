import type { EventRef } from 'obsidian';
import { DEFAULT_SETTINGS, type FileExplorerToolsSettings } from '../settings';
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
			on(name: 'layout-change', callback: () => void): EventRef;
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
		for (const { adapter } of this.attachedLeaves.values()) {
			adapter.runOriginalSort();
		}
	}

	toggleForceGlobal(): void {
		this.forceGlobal = !this.forceGlobal;
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
				this.attachedLeaves.set(leaf, {
					adapter,
					dispose: this.attachLeaf(adapter),
				});
			} catch {
				runSafely(() => this.showNotice(ATTACHMENT_FAILURE_MESSAGE));
			}
		}
	}

	private attachLeaf(adapter: ExplorerAdapter): () => void {
		const disposers: Array<() => void> = [];
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

			const disposeForceGlobalAction = adapter.addToolbarAction({
				icon: 'list-ordered',
				title: 'Toggle force global sorting',
				callback: () => this.toggleForceGlobal(),
			});
			if (disposeForceGlobalAction !== null) {
				disposers.push(disposeForceGlobalAction);
			}

			adapter.runOriginalSort();
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

		return () => runDisposers(disposers);
	}
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
