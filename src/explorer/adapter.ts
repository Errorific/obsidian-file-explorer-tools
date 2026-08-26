import { compareExplorerItems, type ExplorerSortItem } from '../sorting/comparator';
import {
	CORE_SORT_MODES,
	type CoreSortMode,
	type ExplorerAdapter,
	type ExplorerCompatibilityReport,
	type ExplorerItemSnapshot,
	type ItemVisibility,
	type PrefixHandleOptions,
	type PrefixReorderRequest,
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
	prefixHandles: 'add ordered-prefix handles',
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
	private prefixHandles: PrefixHandleController | null = null;

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
			CAPABILITY_LABELS.prefixHandles,
			false,
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

	installPrefixHandles(options: PrefixHandleOptions): (() => void) | null {
		const document = readOwnerDocument(this.view.navFileContainerEl);
		if (document === null) {
			this.failedCapabilities.add(CAPABILITY_LABELS.prefixHandles);
			return null;
		}

		this.prefixHandles?.dispose();
		const controller = new PrefixHandleController(
			document,
			() => this.readItems() ?? [],
			options,
		);
		this.prefixHandles = controller;
		try {
			controller.refresh();
		} catch {
			controller.dispose();
			this.prefixHandles = null;
			this.failedCapabilities.add(CAPABILITY_LABELS.prefixHandles);
			return null;
		}
		return () => {
			if (this.prefixHandles === controller) {
				this.prefixHandles = null;
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

	refreshPrefixHandles(): void {
		const controller = this.prefixHandles;
		if (controller === null) {
			return;
		}
		try {
			controller.refresh();
		} catch {
			controller.dispose();
			this.prefixHandles = null;
			this.failedCapabilities.add(CAPABILITY_LABELS.prefixHandles);
		}
	}

	refreshToolbarActions(): void {
		for (const update of this.toolbarUpdates) {
			update();
		}
	}

	restorePrefixHandleFocus(path: string): void {
		this.prefixHandles?.restoreFocus(path);
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
		const folderPath = readPath(folder);
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

interface PrefixHandleEntry {
	dispose(): void;
	handle: HTMLElement;
	row: HTMLElement;
}

interface PrefixPointerDrag {
	dragging: boolean;
	pointerId: number;
	sourcePath: string;
	startX: number;
	startY: number;
	target: PrefixReorderRequest | null;
}

class PrefixHandleController {
	private readonly entries = new Map<string, PrefixHandleEntry>();
	private activeDrag: PrefixPointerDrag | null = null;
	private disposed = false;

	constructor(
		private readonly document: Document,
		private readonly readItems: () => Array<{
			path: string;
			value: InternalExplorerItem;
		}>,
		private readonly options: PrefixHandleOptions,
	) {}

	dispose(): void {
		this.disposed = true;
		this.clearDrag();
		for (const entry of this.entries.values()) {
			entry.dispose();
		}
		this.entries.clear();
	}

	refresh(): void {
		if (this.disposed) {
			return;
		}

		const retainedPaths = new Set<string>();
		for (const item of this.readItems()) {
			if (!this.options.isOrdered(item.path)) {
				continue;
			}
			const row = readItemTitleRow(item.value);
			if (row === null) {
				continue;
			}

			retainedPaths.add(item.path);
			const existing = this.entries.get(item.path);
			if (
				existing !== undefined &&
				existing.row === row &&
				row.contains(existing.handle)
			) {
				continue;
			}
			existing?.dispose();
			this.entries.set(item.path, this.addHandle(item.path, row));
		}

		for (const [path, entry] of this.entries) {
			if (!retainedPaths.has(path)) {
				entry.dispose();
				this.entries.delete(path);
			}
		}
	}

	restoreFocus(path: string): void {
		const focus = () => {
			if (this.disposed) {
				return;
			}
			try {
				this.refresh();
				this.entries.get(path)?.handle.focus({ preventScroll: true });
			} catch {
				try {
					this.entries.get(path)?.handle.focus();
				} catch {
					return;
				}
			}
		};
		const window = this.document.defaultView;
		if (typeof window?.requestAnimationFrame === 'function') {
			window.requestAnimationFrame(focus);
		} else {
			focus();
		}
	}

	private addHandle(path: string, row: HTMLElement): PrefixHandleEntry {
		const handle = this.document.createElement('button');
		handle.type = 'button';
		handle.tabIndex = 0;
		handle.draggable = false;
		handle.classList.add('file-explorer-tools-prefix-handle');
		handle.setAttribute('aria-label', `Reorder ${nameOf(path)}`);
		handle.setAttribute('aria-roledescription', 'drag handle');
		handle.setAttribute('title', `Reorder ${nameOf(path)}`);

		const onPointerDown = (event: PointerEvent) =>
			this.startDrag(path, handle, event);
		const onPointerMove = (event: PointerEvent) =>
			this.updateDrag(path, event);
		const onPointerUp = (event: PointerEvent) =>
			this.finishDrag(path, handle, event);
		const onPointerCancel = (event: PointerEvent) =>
			this.cancelDrag(path, handle, event);
		const stopClick = (event: MouseEvent) => {
			event.preventDefault();
			event.stopPropagation();
		};
		const stopNativeDrag = (event: DragEvent) => {
			event.preventDefault();
			event.stopPropagation();
		};
		handle.addEventListener('pointerdown', onPointerDown);
		handle.addEventListener('pointermove', onPointerMove);
		handle.addEventListener('pointerup', onPointerUp);
		handle.addEventListener('pointercancel', onPointerCancel);
		handle.addEventListener('click', stopClick);
		handle.addEventListener('dragstart', stopNativeDrag);

		const content = readTitleContent(row);
		row.insertBefore(handle, content);
		return {
			handle,
			row,
			dispose: () => {
				handle.removeEventListener('pointerdown', onPointerDown);
				handle.removeEventListener('pointermove', onPointerMove);
				handle.removeEventListener('pointerup', onPointerUp);
				handle.removeEventListener('pointercancel', onPointerCancel);
				handle.removeEventListener('click', stopClick);
				handle.removeEventListener('dragstart', stopNativeDrag);
				handle.remove();
				clearDropClasses(row);
			},
		};
	}

	private startDrag(
		path: string,
		handle: HTMLElement,
		event: PointerEvent,
	): void {
		if (event.button !== 0 || event.isPrimary === false) {
			return;
		}
		this.clearDrag();
		event.preventDefault();
		event.stopPropagation();
		try {
			handle.setPointerCapture(event.pointerId);
		} catch {
			// Pointer capture can be unavailable for detached explorer rows.
		}
		this.activeDrag = {
			dragging: false,
			pointerId: event.pointerId,
			sourcePath: path,
			startX: event.clientX,
			startY: event.clientY,
			target: null,
		};
	}

	private updateDrag(path: string, event: PointerEvent): void {
		const drag = this.activeDrag;
		if (
			drag === null ||
			drag.sourcePath !== path ||
			drag.pointerId !== event.pointerId
		) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		if (
			!drag.dragging &&
			Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 6
		) {
			return;
		}
		drag.dragging = true;
		this.entries
			.get(path)
			?.handle.classList.add('file-explorer-tools-prefix-dragging');
		drag.target = this.findDropTarget(path, event.clientY);
		this.updateDropClasses(drag.target);
	}

	private finishDrag(
		path: string,
		handle: HTMLElement,
		event: PointerEvent,
	): void {
		const drag = this.activeDrag;
		if (
			drag === null ||
			drag.sourcePath !== path ||
			drag.pointerId !== event.pointerId
		) {
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		const target = drag.dragging ? drag.target : null;
		this.releasePointer(handle, event.pointerId);
		this.clearDrag();
		if (target !== null) {
			void this.applyReorder(target);
		}
	}

	private cancelDrag(
		path: string,
		handle: HTMLElement,
		event: PointerEvent,
	): void {
		if (
			this.activeDrag?.sourcePath !== path ||
			this.activeDrag.pointerId !== event.pointerId
		) {
			return;
		}
		this.releasePointer(handle, event.pointerId);
		this.clearDrag();
	}

	private async applyReorder(request: PrefixReorderRequest): Promise<void> {
		try {
			if (await this.options.onReorder(request)) {
				this.restoreFocus(request.sourcePath);
			}
		} catch {
			// The explorer remains usable when persistence fails during a reorder.
		}
	}

	private findDropTarget(
		sourcePath: string,
		clientY: number,
	): PrefixReorderRequest | null {
		const sourceParent = parentOf(sourcePath);
		for (const [targetPath, entry] of this.entries) {
			if (targetPath === sourcePath || parentOf(targetPath) !== sourceParent) {
				continue;
			}
			const bounds = readBounds(entry.row);
			if (
				bounds === null ||
				bounds.height <= 0 ||
				clientY < bounds.top ||
				clientY > bounds.bottom
			) {
				continue;
			}
			return {
				sourcePath,
				targetPath,
				position:
					clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
			};
		}
		return null;
	}

	private updateDropClasses(target: PrefixReorderRequest | null): void {
		for (const [path, entry] of this.entries) {
			entry.row.classList.toggle(
				'file-explorer-tools-prefix-drop-before',
				target?.targetPath === path && target.position === 'before',
			);
			entry.row.classList.toggle(
				'file-explorer-tools-prefix-drop-after',
				target?.targetPath === path && target.position === 'after',
			);
		}
	}

	private clearDrag(): void {
		for (const entry of this.entries.values()) {
			entry.handle.classList.remove('file-explorer-tools-prefix-dragging');
			clearDropClasses(entry.row);
		}
		this.activeDrag = null;
	}

	private releasePointer(handle: HTMLElement, pointerId: number): void {
		try {
			handle.releasePointerCapture(pointerId);
		} catch {
			// Pointer capture may already be released after cancellation.
		}
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

function readTitleContent(row: HTMLElement): HTMLElement | null {
	try {
		return readDomElement(
			row.querySelector(
				'.nav-file-title-content, .nav-folder-title-content',
			),
		);
	} catch {
		return null;
	}
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

function clearDropClasses(row: HTMLElement): void {
	row.classList.remove('file-explorer-tools-prefix-drop-before');
	row.classList.remove('file-explorer-tools-prefix-drop-after');
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
