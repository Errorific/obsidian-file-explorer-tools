import { compareExplorerItems, type ExplorerSortItem } from '../sorting/comparator';
import {
	CORE_SORT_MODES,
	type CoreSortMode,
	type ExplorerAdapter,
	type ExplorerCompatibilityReport,
	type ExplorerItemSnapshot,
	type ItemVisibility,
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

function readItemElement(
	item: InternalExplorerItem | null,
): {
	classList: DOMTokenList;
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
			setAttribute(name: string, value: string): void;
			removeAttribute(name: string): void;
		};
	}
	return null;
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
