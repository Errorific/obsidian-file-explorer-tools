import { compareExplorerItems, type ExplorerSortItem } from '../sorting/comparator';
import {
	CORE_SORT_MODES,
	type CoreSortMode,
	type ExplorerAdapter,
	type ExplorerCompatibilityReport,
	type ExplorerItemSnapshot,
	type ItemVisibility,
	type PinnedItemOptions,
	type PinnedReorderRequest,
	type SortingOptionsProvider,
	type ToolbarAction,
} from './adapter-types';

type UnknownFunction = (...arguments_: unknown[]) => unknown;

interface InternalExplorerItem {
	collapsed?: unknown;
	el?: unknown;
	file?: { path?: unknown };
	selfEl?: unknown;
	titleEl?: unknown;
	setCollapsed?: UnknownFunction;
}

interface InternalExplorerTree {
	clearSelectedDoms?: UnknownFunction;
	focusedItem?: InternalExplorerItem;
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
	getSortedFolderItems?: UnknownFunction;
	headerDom?: InternalExplorerHeader;
	lastDropTargetEl?: unknown;
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
	customSort: 'apply custom sorting',
	collapse: 'expand and collapse folders',
	select: 'select items',
	scroll: 'scroll to items',
	toolbar: 'add toolbar actions',
	pinnedItems: 'add pinned item interactions',
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
	private readonly toolbarUpdates = new Set<() => void>();
	private pinnedItems: PinnedItemController | null = null;

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

		let element: unknown;
		try {
			const callback = () => {
				action.callback();
				updatePressedState(element, action.getPressed);
			};
			element = registration.add.call(
				registration.receiver,
				action.icon,
				action.title,
				callback,
			);
			if (!isRemovable(element)) {
				removeToolbarElement(element);
				this.failedCapabilities.add(CAPABILITY_LABELS.toolbar);
				return null;
			}
			const removableElement = element;
			const update = () =>
				updatePressedState(removableElement, action.getPressed);
			update();
			this.toolbarUpdates.add(update);
			return () => {
				this.toolbarUpdates.delete(update);
				removableElement.remove();
			};
		} catch {
			removeToolbarElement(element);
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
			CAPABILITY_LABELS.customSort,
			typeof this.view.getSortedFolderItems !== 'function',
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
		this.addUnavailable(
			unavailableCapabilities,
			CAPABILITY_LABELS.pinnedItems,
			false,
		);

		return {
			available: unavailableCapabilities.length === 0,
			unavailableCapabilities,
			itemCount: items?.length ?? 0,
			sortMode: this.getSortMode(),
		};
	}

	getFocusedPath(): string | null {
		const focusedItem = this.view.tree?.focusedItem;
		if (focusedItem === undefined) {
			return null;
		}
		return (
			this.readItems()?.find((item) => item.value === focusedItem)?.path ?? null
		);
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

	setItemVisibility(path: string, visibility: ItemVisibility): boolean {
		const item = this.findItem(path);
		const element = readItemElement(item);
		if (element === null) {
			return false;
		}

		try {
			if (visibility.hidden && !visibility.showHidden) {
				element.classList.add('file-explorer-tools-hidden');
			} else {
				element.classList.remove('file-explorer-tools-hidden');
			}
			element.classList.toggle(
				'file-explorer-tools-hidden-revealed',
				visibility.dimmed,
			);
			element.classList.toggle(
				'file-explorer-tools-hidden-marked',
				visibility.marked,
			);
			if (visibility.hidden) {
				element.setAttribute('aria-hidden', String(!visibility.showHidden));
				element.setAttribute('data-file-explorer-tools-hidden', 'true');
			} else {
				element.removeAttribute('aria-hidden');
				element.removeAttribute('data-file-explorer-tools-hidden');
			}
			return true;
		} catch {
			return false;
		}
	}

	getSortMode(): CoreSortMode | null {
		return isCoreSortMode(this.view.sortOrder) ? this.view.sortOrder : null;
	}

	installPinnedItems(options: PinnedItemOptions): (() => void) | null {
		const container = readDomElement(this.view.navFileContainerEl);
		const document = readOwnerDocument(container);
		if (container === null || document === null) {
			this.failedCapabilities.add(CAPABILITY_LABELS.pinnedItems);
			return null;
		}

		this.pinnedItems?.dispose();
		const controller = new PinnedItemController(
			container,
			document,
			() => {
				this.view.lastDropTargetEl = null;
			},
			() =>
				(this.readItems() ?? []).map((item) => ({
					...item,
					isSelected: () =>
						this.view.tree?.selectedDoms?.has?.(item.value) ?? false,
				})),
			options,
		);
		this.pinnedItems = controller;
		try {
			controller.attach();
			controller.refresh();
		} catch {
			try {
				controller.dispose();
			} catch {
				// Compatibility cleanup is best-effort after partial attachment.
			}
			this.pinnedItems = null;
			this.failedCapabilities.add(CAPABILITY_LABELS.pinnedItems);
			return null;
		}
		return () => {
			if (this.pinnedItems === controller) {
				this.pinnedItems = null;
			}
			controller.dispose();
		};
	}

	installSorting(getOptions: SortingOptionsProvider): (() => void) | null {
		const original = this.view.getSortedFolderItems;
		if (typeof original !== 'function') {
			return null;
		}

		const sortFolderItems = this.sortFolderItems.bind(this);
		const sortedFolderItems = function (
			this: InternalExplorerView,
			...arguments_: unknown[]
		): unknown {
			const result: unknown = Reflect.apply(original, this, arguments_);
			return sortFolderItems(result, arguments_[0], getOptions);
		};

		try {
			this.view.getSortedFolderItems = sortedFolderItems;
		} catch {
			this.failedCapabilities.add(CAPABILITY_LABELS.customSort);
			return null;
		}
		return () => {
			if (this.view.getSortedFolderItems === sortedFolderItems) {
				this.view.getSortedFolderItems = original;
			}
		};
	}

	isItemVisible(path: string): boolean {
		const itemBounds = readBounds(readItemElement(this.findItem(path)));
		const containerBounds = readBounds(this.view.navFileContainerEl);
		if (itemBounds === null || containerBounds === null) {
			return false;
		}

		return (
			itemBounds.width > 0 &&
			itemBounds.height > 0 &&
			itemBounds.bottom > containerBounds.top &&
			itemBounds.top < containerBounds.bottom &&
			itemBounds.right > containerBounds.left &&
			itemBounds.left < containerBounds.right
		);
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

	refreshPinnedItems(): void {
		const controller = this.pinnedItems;
		if (controller === null) {
			return;
		}
		try {
			controller.refresh();
		} catch {
			try {
				controller.dispose();
			} catch {
				// Compatibility cleanup is best-effort after a failed refresh.
			}
			this.pinnedItems = null;
			this.failedCapabilities.add(CAPABILITY_LABELS.pinnedItems);
		}
	}

	refreshToolbarActions(): void {
		for (const update of this.toolbarUpdates) {
			update();
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
			const containerHeight = readBounds(this.view.navFileContainerEl)?.height;
			const padding =
				containerHeight === undefined
					? 4
					: Math.max(4, Math.floor(containerHeight / 2));
			scrollIntoView.call(this.view.tree?.infinityScroll, item, padding);
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

	private sortFolderItems(
		result: unknown,
		folder: unknown,
		getOptions: SortingOptionsProvider,
	): unknown {
		const coreSortMode = this.getSortMode();
		const folderPath = normalizeFolderPath(readPath(folder));
		if (!isUnknownArray(result) || coreSortMode === null || folderPath === null) {
			return result;
		}

		const items = result.map(readSortItem);
		if (items.some((item) => item === null)) {
			return result;
		}

		try {
			const options = getOptions(folderPath, coreSortMode);
			return result
				.map((value, index) => ({
					item: items[index] as ExplorerSortItem,
					value,
				}))
				.sort((left, right) =>
					compareExplorerItems(left.item, right.item, options),
				)
				.map(({ value }) => value);
		} catch {
			this.failedCapabilities.add(CAPABILITY_LABELS.customSort);
			return result;
		}
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

interface PinnedIndicatorEntry {
	dispose(): void;
	indicator: HTMLElement;
	row: HTMLElement;
}

interface RenderedPinnedItem {
	afterElement: HTMLElement;
	folder: boolean;
	isSelected(): boolean;
	path: string;
	row: HTMLElement;
}

type PinnedDropAction =
	| { request: PinnedReorderRequest; type: 'reorder' }
	| { sourcePath: string; targetPath: string; type: 'unpin' };

class PinnedItemController {
	private readonly decoratedElements = new Set<HTMLElement>();
	private readonly indicators = new Map<string, PinnedIndicatorEntry>();
	private readonly renderedItems = new Map<string, RenderedPinnedItem>();
	private itemsByRow = new WeakMap<HTMLElement, RenderedPinnedItem>();
	private draggingPath: string | null = null;
	private disposed = false;

	constructor(
		private readonly container: HTMLElement,
		private readonly document: Document,
		private readonly clearNativeDropTarget: () => void,
		private readonly readItems: () => Array<{
			isSelected(): boolean;
			path: string;
			value: InternalExplorerItem;
		}>,
		private readonly options: PinnedItemOptions,
	) {}

	attach(): void {
		this.container.addEventListener('dragstart', this.onDragStart, true);
		this.container.addEventListener('dragenter', this.onDragOver, true);
		this.container.addEventListener('dragover', this.onDragOver, true);
		this.container.addEventListener('drop', this.onDrop, true);
		this.container.addEventListener('dragend', this.onDragEnd, true);
		this.container.addEventListener('dragleave', this.onDragLeave, true);
	}

	dispose(): void {
		this.disposed = true;
		this.container.removeEventListener('dragstart', this.onDragStart, true);
		this.container.removeEventListener('dragenter', this.onDragOver, true);
		this.container.removeEventListener('dragover', this.onDragOver, true);
		this.container.removeEventListener('drop', this.onDrop, true);
		this.container.removeEventListener('dragend', this.onDragEnd, true);
		this.container.removeEventListener('dragleave', this.onDragLeave, true);
		this.clearDrag();
		for (const entry of this.indicators.values()) {
			entry.dispose();
		}
		this.indicators.clear();
		this.renderedItems.clear();
		this.itemsByRow = new WeakMap();
	}

	refresh(): void {
		if (this.disposed) {
			return;
		}

		this.clearDropClasses();
		this.renderedItems.clear();
		this.itemsByRow = new WeakMap();
		const retainedPaths = new Set<string>();
		for (const item of this.readItems()) {
			const row = readItemTitleRow(item.value);
			if (row === null) {
				continue;
			}
			const folder = typeof item.value.setCollapsed === 'function';
			const rendered = {
				afterElement: folder ? readItemContainer(item.value, row) : row,
				folder,
				isSelected: () => item.isSelected(),
				path: item.path,
				row,
			};
			this.renderedItems.set(item.path, rendered);
			this.itemsByRow.set(row, rendered);
			if (!this.options.isPinned(item.path)) {
				continue;
			}

			retainedPaths.add(item.path);
			const existing = this.indicators.get(item.path);
			if (
				existing !== undefined &&
				existing.row === row &&
				row.contains(existing.indicator)
			) {
				continue;
			}
			existing?.dispose();
			this.indicators.set(item.path, this.addIndicator(row));
		}

		for (const [path, entry] of this.indicators) {
			if (!retainedPaths.has(path)) {
				entry.dispose();
				this.indicators.delete(path);
			}
		}
	}

	private readonly onDragStart = (event: DragEvent): void => {
		this.clearDrag();
		if (!this.options.isInteractionEnabled()) {
			return;
		}
		const item = this.findEventItem(event.target);
		if (
			item === null ||
			!this.options.isPinned(item.path) ||
			(item.isSelected() && this.selectedItemCount() > 1)
		) {
			return;
		}
		this.draggingPath = item.path;
	};

	private readonly onDragOver = (event: DragEvent): void => {
		if (this.draggingPath === null) {
			return;
		}
		const action = this.getDropAction(event);
		this.updateDropClasses(action);
		if (action === null) {
			return;
		}
		this.clearNativeDropTarget();
		event.preventDefault();
		event.stopPropagation();
		if (event.dataTransfer !== null) {
			event.dataTransfer.dropEffect = 'move';
		}
	};

	private readonly onDrop = (event: DragEvent): void => {
		const action = this.getDropAction(event);
		this.clearDrag();
		if (action === null) {
			return;
		}
		this.clearNativeDropTarget();
		event.preventDefault();
		event.stopPropagation();
		void this.applyDropAction(action);
	};

	private readonly onDragEnd = (): void => {
		this.clearDrag();
	};

	private readonly onDragLeave = (event: DragEvent): void => {
		if (!isNodeWithin(this.container, event.relatedTarget)) {
			this.clearDropClasses();
		}
	};

	private addIndicator(row: HTMLElement): PinnedIndicatorEntry {
		const indicator = this.document.createElement('span');
		indicator.classList.add('file-explorer-tools-pin-indicator');
		indicator.draggable = false;
		indicator.setAttribute('aria-hidden', 'true');
		row.setAttribute('data-file-explorer-tools-pinned', 'true');
		row.insertBefore(indicator, null);
		return {
			indicator,
			row,
			dispose: () => {
				indicator.remove();
				row.removeAttribute('data-file-explorer-tools-pinned');
				clearPinnedDropClasses(row);
			},
		};
	}

	private getDropAction(event: DragEvent): PinnedDropAction | null {
		const sourcePath = this.draggingPath;
		if (
			sourcePath === null ||
			!this.options.isInteractionEnabled() ||
			!this.options.isPinned(sourcePath)
		) {
			return null;
		}

		const folderAfterAction = this.findFolderAfterAction(sourcePath, event);
		if (folderAfterAction !== null) {
			return folderAfterAction;
		}

		const target = this.findEventItem(event.target);
		if (
			target === null ||
			target.path === sourcePath ||
			parentOf(target.path) !== parentOf(sourcePath)
		) {
			return null;
		}
		const bounds = readBounds(target.row);
		if (
			bounds === null ||
			bounds.height <= 0 ||
			event.clientY < bounds.top ||
			event.clientY > bounds.bottom
		) {
			return null;
		}

		const relativeY = event.clientY - bounds.top;
		if (
			target.folder &&
			relativeY >= bounds.height / 3 &&
			relativeY <= (bounds.height * 2) / 3
		) {
			return null;
		}
		if (!this.options.isPinned(target.path)) {
			return { sourcePath, targetPath: target.path, type: 'unpin' };
		}
		return {
			type: 'reorder',
			request: {
				sourcePath,
				targetPath: target.path,
				position: relativeY < bounds.height / 2 ? 'before' : 'after',
			},
		};
	}

	private findFolderAfterAction(
		sourcePath: string,
		event: DragEvent,
	): PinnedDropAction | null {
		const eventElement = readEventElement(event.target);
		if (eventElement === null) {
			return null;
		}
		const sourceParent = parentOf(sourcePath);
		for (const item of this.renderedItems.values()) {
			if (
				!item.folder ||
				item.path === sourcePath ||
				parentOf(item.path) !== sourceParent ||
				!this.options.isPinned(item.path) ||
				!item.afterElement.contains(eventElement)
			) {
				continue;
			}
			const bounds = readBounds(item.afterElement);
			const rowBounds = readBounds(item.row);
			if (bounds === null || rowBounds === null) {
				continue;
			}
			const zoneHeight = Math.max(6, rowBounds.height / 3);
			if (
				event.clientY >= bounds.bottom - zoneHeight &&
				event.clientY <= bounds.bottom
			) {
				return {
					type: 'reorder',
					request: {
						position: 'after',
						sourcePath,
						targetPath: item.path,
					},
				};
			}
		}
		return null;
	}

	private findEventItem(target: EventTarget | null): RenderedPinnedItem | null {
		let element = readEventElement(target);
		while (element !== null && this.container.contains(element)) {
			const item = this.itemsByRow.get(element);
			if (item !== undefined) {
				return item;
			}
			element = readDomElement(element.parentElement);
		}
		return null;
	}

	private updateDropClasses(action: PinnedDropAction | null): void {
		this.clearDropClasses();
		if (action === null) {
			return;
		}
		if (action.type === 'reorder') {
			const targetItem = this.renderedItems.get(action.request.targetPath);
			const target =
				action.request.position === 'after'
					? targetItem?.afterElement
					: targetItem?.row;
			if (target === undefined) {
				return;
			}
			target.classList.add(
				action.request.position === 'before'
					? 'file-explorer-tools-pin-drop-before'
					: 'file-explorer-tools-pin-drop-after',
			);
			this.decoratedElements.add(target);
			return;
		}

		const source = this.renderedItems.get(action.sourcePath)?.row;
		const target = this.renderedItems.get(action.targetPath)?.row;
		if (source !== undefined) {
			source.classList.add('file-explorer-tools-pinned-will-unpin');
			this.decoratedElements.add(source);
		}
		if (target !== undefined) {
			target.classList.add('file-explorer-tools-pin-drop-unpin');
			this.decoratedElements.add(target);
		}
	}

	private async applyDropAction(action: PinnedDropAction): Promise<void> {
		try {
			if (action.type === 'reorder') {
				await this.options.onReorder(action.request);
			} else {
				await this.options.onUnpin(action.sourcePath);
			}
		} catch {
			// The explorer remains usable when persistence fails during a drop.
		}
	}

	private selectedItemCount(): number {
		return [...this.renderedItems.values()].filter((item) => item.isSelected())
			.length;
	}

	private clearDropClasses(): void {
		for (const element of this.decoratedElements) {
			clearPinnedDropClasses(element);
		}
		this.decoratedElements.clear();
	}

	private clearDrag(): void {
		this.clearDropClasses();
		this.draggingPath = null;
	}
}

function readItemElement(
	item: InternalExplorerItem | null,
): {
	classList: DOMTokenList;
	getBoundingClientRect?: () => DOMRect;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
} | null {
	for (const candidate of [item?.el, item?.selfEl, item?.titleEl]) {
		if (!isRecord(candidate) || !isRecord(candidate.classList)) {
			continue;
		}
		const classList = candidate.classList;
		if (
			typeof classList.add !== 'function' ||
			typeof classList.remove !== 'function' ||
			typeof classList.toggle !== 'function' ||
			typeof candidate.setAttribute !== 'function' ||
			typeof candidate.removeAttribute !== 'function'
		) {
			continue;
		}
		return candidate as {
			classList: DOMTokenList;
			getBoundingClientRect?: () => DOMRect;
			setAttribute(name: string, value: string): void;
			removeAttribute(name: string): void;
		};
	}
	return null;
}

function readItemContainer(
	item: InternalExplorerItem,
	row: HTMLElement,
): HTMLElement {
	for (const candidate of [item.el, item.selfEl, item.titleEl]) {
		const element = readDomElement(candidate);
		if (element !== null && element !== row && element.contains(row)) {
			return element;
		}
	}
	return row;
}

function readItemTitleRow(item: InternalExplorerItem): HTMLElement | null {
	for (const candidate of [item.titleEl, item.selfEl, item.el]) {
		const element = readDomElement(candidate);
		if (element === null) {
			continue;
		}
		if (isTitleRow(element)) {
			return element;
		}
		if (isTitleContent(element)) {
			const parent = readDomElement(element.parentElement);
			if (parent !== null && isTitleRow(parent)) {
				return parent;
			}
		}
		try {
			const row = readDomElement(
				element.querySelector('.nav-file-title, .nav-folder-title'),
			);
			if (row !== null) {
				return row;
			}
		} catch {
			continue;
		}
	}
	return null;
}

function readEventElement(value: unknown): HTMLElement | null {
	let candidate = value;
	while (candidate !== null) {
		const element = readDomElement(candidate);
		if (element !== null) {
			return element;
		}
		if (!isRecord(candidate)) {
			return null;
		}
		candidate = candidate.parentElement ?? candidate.parentNode ?? null;
	}
	return null;
}

function readDomElement(value: unknown): HTMLElement | null {
	if (
		!isRecord(value) ||
		value.nodeType !== 1 ||
		!isRecord(value.classList) ||
		typeof value.classList.add !== 'function' ||
		typeof value.classList.contains !== 'function' ||
		typeof value.classList.remove !== 'function' ||
		typeof value.classList.toggle !== 'function' ||
		typeof value.addEventListener !== 'function' ||
		typeof value.removeEventListener !== 'function' ||
		typeof value.contains !== 'function' ||
		typeof value.insertBefore !== 'function' ||
		typeof value.querySelector !== 'function'
	) {
		return null;
	}
	return value as unknown as HTMLElement;
}

function readOwnerDocument(value: unknown): Document | null {
	if (
		!isRecord(value) ||
		!isRecord(value.ownerDocument) ||
		typeof value.ownerDocument.createElement !== 'function'
	) {
		return null;
	}
	return value.ownerDocument as unknown as Document;
}

function isTitleRow(element: HTMLElement): boolean {
	return (
		element.classList.contains('nav-file-title') ||
		element.classList.contains('nav-folder-title')
	);
}

function isTitleContent(element: HTMLElement): boolean {
	return (
		element.classList.contains('nav-file-title-content') ||
		element.classList.contains('nav-folder-title-content')
	);
}

function clearPinnedDropClasses(row: HTMLElement): void {
	row.classList.remove('file-explorer-tools-pinned-will-unpin');
	row.classList.remove('file-explorer-tools-pin-drop-before');
	row.classList.remove('file-explorer-tools-pin-drop-after');
	row.classList.remove('file-explorer-tools-pin-drop-unpin');
}

function parentOf(path: string): string {
	const separatorIndex = path.lastIndexOf('/');
	return separatorIndex < 0 ? '' : path.slice(0, separatorIndex);
}

interface Bounds {
	bottom: number;
	height: number;
	left: number;
	right: number;
	top: number;
	width: number;
}

function readBounds(value: unknown): Bounds | null {
	if (!isRecord(value) || typeof value.getBoundingClientRect !== 'function') {
		return null;
	}

	try {
		const bounds: unknown = Reflect.apply(value.getBoundingClientRect, value, []);
		if (!isRecord(bounds)) {
			return null;
		}
		const top = readFiniteNumber(bounds.top);
		const right = readFiniteNumber(bounds.right);
		const bottom = readFiniteNumber(bounds.bottom);
		const left = readFiniteNumber(bounds.left);
		if (top === null || right === null || bottom === null || left === null) {
			return null;
		}
		return {
			top,
			right,
			bottom,
			left,
			width: readFiniteNumber(bounds.width) ?? right - left,
			height: readFiniteNumber(bounds.height) ?? bottom - top,
		};
	} catch {
		return null;
	}
}

function readFiniteNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readSortItem(value: unknown): ExplorerSortItem | null {
	if (!isRecord(value)) {
		return null;
	}

	const file = isRecord(value.file) ? value.file : value;
	const path = readPath(file);
	if (path === null) {
		return null;
	}

	const folder = Array.isArray(file.children);
	const stat = isRecord(file.stat) ? file.stat : null;
	return {
		path,
		name: typeof file.name === 'string' ? file.name : nameOf(path),
		basename: !folder && typeof file.basename === 'string' ? file.basename : undefined,
		folder,
		createdAt: folder ? null : readTimestamp(stat?.ctime),
		modifiedAt: folder ? null : readTimestamp(stat?.mtime),
	};
}

function readPath(value: unknown): string | null {
	return isRecord(value) && typeof value.path === 'string' ? value.path : null;
}

function normalizeFolderPath(path: string | null): string | null {
	return path === '/' ? '' : path;
}

function readTimestamp(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nameOf(path: string): string {
	const separatorIndex = path.lastIndexOf('/');
	return separatorIndex < 0 ? path : path.slice(separatorIndex + 1);
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

function isNodeWithin(container: HTMLElement, value: unknown): boolean {
	return isNode(value) && container.contains(value);
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

function isUnknownArray(value: unknown): value is unknown[] {
	return Array.isArray(value);
}

function isRemovable(value: unknown): value is { remove(): void } {
	return isRecord(value) && typeof value.remove === 'function';
}

function removeToolbarElement(value: unknown): void {
	try {
		if (isRemovable(value)) {
			value.remove();
			return;
		}
		if (
			isRecord(value) &&
			isRecord(value.parentNode) &&
			typeof value.parentNode.removeChild === 'function'
		) {
			Reflect.apply(value.parentNode.removeChild, value.parentNode, [value]);
		}
	} catch {
		// Compatibility cleanup is best-effort when explorer internals are malformed.
	}
}

function updatePressedState(
	element: unknown,
	getPressed: (() => boolean) | undefined,
): void {
	if (getPressed === undefined || !isRecord(element)) {
		return;
	}

	const pressed = getPressed();
	if (typeof element.setAttribute === 'function') {
		Reflect.apply(element.setAttribute, element, [
			'aria-pressed',
			String(pressed),
		]);
	}
	if (
		isRecord(element.classList) &&
		typeof element.classList.toggle === 'function'
	) {
		Reflect.apply(element.classList.toggle, element.classList, [
			'is-active',
			pressed,
		]);
	}
}

function readFunction(value: unknown): UnknownFunction | null {
	return isUnknownFunction(value) ? value : null;
}

function isUnknownFunction(value: unknown): value is UnknownFunction {
	return typeof value === 'function';
}
