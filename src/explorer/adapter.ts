import {
	CORE_SORT_MODES,
	type CoreSortMode,
	type ExplorerAdapter,
	type ExplorerCompatibilityReport,
	type ExplorerItemSnapshot,
	type ToolbarAction,
} from './adapter-types';

type UnknownFunction = (...arguments_: unknown[]) => unknown;

interface InternalExplorerItem {
	collapsed?: unknown;
	file?: { path?: unknown };
	setCollapsed?: UnknownFunction;
}

interface InternalExplorerTree {
	clearSelectedDoms?: UnknownFunction;
	infinityScroll?: {
		scrollIntoView?: UnknownFunction;
	};
	selectItem?: UnknownFunction;
	selectedDoms?: {
		has?: (item: InternalExplorerItem) => boolean;
	};
	setFocusedItem?: UnknownFunction;
}

interface InternalExplorerHeader {
	addNavButton?: (
		icon: string,
		title: string,
		callback: (event: MouseEvent) => unknown,
	) => unknown;
}

interface InternalExplorerView {
	addAction?: (
		icon: string,
		title: string,
		callback: (event: MouseEvent) => unknown,
	) => unknown;
	fileItems?: unknown;
	headerDom?: InternalExplorerHeader;
	navFileContainerEl?: Node;
	sort?: UnknownFunction;
	sortOrder?: unknown;
	tree?: InternalExplorerTree;
}

interface RenderObserver {
	disconnect(): void;
	observe(target: Node, options: MutationObserverInit): void;
}

export type RenderObserverFactory = (
	callback: MutationCallback,
) => RenderObserver;

const CAPABILITY_LABELS = {
	items: 'enumerate tree items',
	renders: 'observe explorer renders',
	sortMode: 'read core sort mode',
	sort: 'run core sorting',
	collapse: 'expand and collapse folders',
	select: 'select items',
	scroll: 'scroll to items',
	toolbar: 'add toolbar actions',
} as const;

export function createExplorerAdapter(
	view: unknown,
	createObserver: RenderObserverFactory = (callback) =>
		new MutationObserver(callback),
): ExplorerAdapter {
	return new ObsidianExplorerAdapter(asExplorerView(view), createObserver);
}

class ObsidianExplorerAdapter implements ExplorerAdapter {
	private readonly originalSort: UnknownFunction | null;
	private readonly failedCapabilities = new Set<string>();

	constructor(
		private readonly view: InternalExplorerView,
		private readonly createObserver: RenderObserverFactory,
	) {
		this.originalSort = readFunction(view.sort);
	}

	addToolbarAction(action: ToolbarAction): (() => void) | null {
		const registration = this.getToolbarRegistration();
		if (registration === null) {
			return null;
		}

		try {
			const element = registration.add.call(
				registration.receiver,
				action.icon,
				action.title,
				action.callback,
			);
			if (!isRemovable(element)) {
				this.failedCapabilities.add(CAPABILITY_LABELS.toolbar);
				return null;
			}
			return () => element.remove();
		} catch {
			this.failedCapabilities.add(CAPABILITY_LABELS.toolbar);
			return null;
		}
	}

	collapse(path: string): boolean {
		return this.setCollapsed(path, true);
	}

	expand(path: string): boolean {
		return this.setCollapsed(path, false);
	}

	getCompatibilityReport(): ExplorerCompatibilityReport {
		const unavailableCapabilities: string[] = [];
		const items = this.readItems();
		const tree = this.view.tree;

		this.addUnavailable(
			unavailableCapabilities,
			CAPABILITY_LABELS.items,
			items === null,
		);
		this.addUnavailable(
			unavailableCapabilities,
			CAPABILITY_LABELS.renders,
			!isNode(this.view.navFileContainerEl),
		);
		this.addUnavailable(
			unavailableCapabilities,
			CAPABILITY_LABELS.sortMode,
			this.getSortMode() === null,
		);
		this.addUnavailable(
			unavailableCapabilities,
			CAPABILITY_LABELS.sort,
			this.originalSort === null,
		);
		this.addUnavailable(
			unavailableCapabilities,
			CAPABILITY_LABELS.collapse,
			!hasFolderControls(items),
		);
		this.addUnavailable(
			unavailableCapabilities,
			CAPABILITY_LABELS.select,
			typeof tree?.clearSelectedDoms !== 'function' ||
				typeof tree.selectItem !== 'function' ||
				typeof tree.setFocusedItem !== 'function',
		);
		this.addUnavailable(
			unavailableCapabilities,
			CAPABILITY_LABELS.scroll,
			typeof tree?.infinityScroll?.scrollIntoView !== 'function',
		);
		this.addUnavailable(
			unavailableCapabilities,
			CAPABILITY_LABELS.toolbar,
			typeof this.view.addAction !== 'function' &&
				typeof this.view.headerDom?.addNavButton !== 'function',
		);

		return {
			available: unavailableCapabilities.length === 0,
			unavailableCapabilities,
			itemCount: items?.length ?? 0,
			sortMode: this.getSortMode(),
		};
	}

	getItems(): ExplorerItemSnapshot[] {
		return (this.readItems() ?? []).map((item) => ({
			path: item.path,
			folder: typeof item.value.setCollapsed === 'function',
			collapsed:
				typeof item.value.collapsed === 'boolean'
					? item.value.collapsed
					: null,
			selected: this.view.tree?.selectedDoms?.has?.(item.value) ?? false,
		}));
	}

	getSortMode(): CoreSortMode | null {
		return isCoreSortMode(this.view.sortOrder) ? this.view.sortOrder : null;
	}

	observeRenders(callback: () => void): (() => void) | null {
		const container = this.view.navFileContainerEl;
		if (!isNode(container)) {
			return null;
		}

		try {
			const observer = this.createObserver(callback);
			observer.observe(container, { childList: true, subtree: true });
			return () => observer.disconnect();
		} catch {
			this.failedCapabilities.add(CAPABILITY_LABELS.renders);
			return null;
		}
	}

	runOriginalSort(): boolean {
		if (this.originalSort === null) {
			return false;
		}

		try {
			this.originalSort.call(this.view);
			return true;
		} catch {
			this.failedCapabilities.add(CAPABILITY_LABELS.sort);
			return false;
		}
	}

	scrollTo(path: string): boolean {
		const item = this.findItem(path);
		const scrollIntoView = this.view.tree?.infinityScroll?.scrollIntoView;
		if (item === null || typeof scrollIntoView !== 'function') {
			return false;
		}

		try {
			scrollIntoView.call(this.view.tree?.infinityScroll, item, 4);
			return true;
		} catch {
			this.failedCapabilities.add(CAPABILITY_LABELS.scroll);
			return false;
		}
	}

	select(path: string): boolean {
		const item = this.findItem(path);
		const tree = this.view.tree;
		if (
			item === null ||
			typeof tree?.clearSelectedDoms !== 'function' ||
			typeof tree.selectItem !== 'function' ||
			typeof tree.setFocusedItem !== 'function'
		) {
			return false;
		}

		try {
			tree.clearSelectedDoms.call(tree);
			tree.selectItem.call(tree, item);
			tree.setFocusedItem.call(tree, item, true);
			return true;
		} catch {
			this.failedCapabilities.add(CAPABILITY_LABELS.select);
			return false;
		}
	}

	private addUnavailable(
		unavailableCapabilities: string[],
		capability: string,
		unavailable: boolean,
	): void {
		if (unavailable || this.failedCapabilities.has(capability)) {
			unavailableCapabilities.push(capability);
		}
	}

	private findItem(path: string): InternalExplorerItem | null {
		return this.readItems()?.find((item) => item.path === path)?.value ?? null;
	}

	private getToolbarRegistration(): {
		add: NonNullable<InternalExplorerView['addAction']>;
		receiver: InternalExplorerView | InternalExplorerHeader;
	} | null {
		if (typeof this.view.addAction === 'function') {
			return { add: this.view.addAction, receiver: this.view };
		}
		if (typeof this.view.headerDom?.addNavButton === 'function') {
			return {
				add: this.view.headerDom.addNavButton,
				receiver: this.view.headerDom,
			};
		}
		return null;
	}

	private readItems(): Array<{
		path: string;
		value: InternalExplorerItem;
	}> | null {
		if (!isRecord(this.view.fileItems)) {
			return null;
		}

		return Object.values(this.view.fileItems).flatMap((value) => {
			if (!isRecord(value) || !isRecord(value.file)) {
				return [];
			}
			const path = value.file.path;
			return typeof path === 'string' ? [{ path, value }] : [];
		});
	}

	private setCollapsed(path: string, collapsed: boolean): boolean {
		const item = this.findItem(path);
		if (item === null || typeof item.setCollapsed !== 'function') {
			return false;
		}

		try {
			item.setCollapsed.call(item, collapsed, true);
			return true;
		} catch {
			this.failedCapabilities.add(CAPABILITY_LABELS.collapse);
			return false;
		}
	}
}

function asExplorerView(value: unknown): InternalExplorerView {
	return isRecord(value) ? value : {};
}

function hasFolderControls(
	items: Array<{ value: InternalExplorerItem }> | null,
): boolean {
	if (items === null) {
		return false;
	}

	const folderItems = items.filter(
		(item) => typeof item.value.collapsed === 'boolean',
	);
	return (
		folderItems.length === 0 ||
		folderItems.every(
			(item) => typeof item.value.setCollapsed === 'function',
		)
	);
}

function isCoreSortMode(value: unknown): value is CoreSortMode {
	return CORE_SORT_MODES.some((mode) => mode === value);
}

function isNode(value: unknown): value is Node {
	return (
		typeof value === 'object' &&
		value !== null &&
		'nodeType' in value &&
		typeof value.nodeType === 'number'
	);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

function isRemovable(value: unknown): value is { remove(): void } {
	return isRecord(value) && typeof value.remove === 'function';
}

function readFunction(value: unknown): UnknownFunction | null {
	return isUnknownFunction(value) ? value : null;
}

function isUnknownFunction(value: unknown): value is UnknownFunction {
	return typeof value === 'function';
}
