import type { SortingOptions } from '../sorting/comparator';

export const CORE_SORT_MODES = [
	'alphabetical',
	'alphabeticalReverse',
	'byModifiedTime',
	'byModifiedTimeReverse',
	'byCreatedTime',
	'byCreatedTimeReverse',
] as const;

export type CoreSortMode = (typeof CORE_SORT_MODES)[number];

export interface ExplorerItemSnapshot {
	path: string;
	folder: boolean;
	collapsed: boolean | null;
	selected: boolean;
}

export interface ItemVisibility {
	hidden: boolean;
	showHidden: boolean;
	dimmed: boolean;
	marked: boolean;
}

export interface ExplorerCompatibilityReport {
	available: boolean;
	unavailableCapabilities: string[];
	itemCount: number;
	sortMode: CoreSortMode | null;
}

export interface ToolbarAction {
	icon: string;
	title: string;
	callback: () => void;
	getPressed?: () => boolean;
}

export type PinnedDropPosition = 'before' | 'after';

export interface PinnedReorderRequest {
	sourcePath: string;
	targetPath: string;
	position: PinnedDropPosition;
}

export interface PinnedItemOptions {
	isInteractionEnabled(): boolean;
	isPinned(path: string): boolean;
	onReorder(request: PinnedReorderRequest): boolean | Promise<boolean>;
	onUnpin(path: string): boolean | Promise<boolean>;
}

export type SortingOptionsProvider = (
	folderPath: string,
	coreSortMode: CoreSortMode,
) => SortingOptions;

export interface ExplorerAdapter {
	addToolbarAction(action: ToolbarAction): (() => void) | null;
	collapse(path: string): boolean;
	expand(path: string): boolean;
	getCompatibilityReport(): ExplorerCompatibilityReport;
	getFocusedPath(): string | null;
	getItems(): ExplorerItemSnapshot[];
	setItemVisibility(path: string, visibility: ItemVisibility): boolean;
	getSortMode(): CoreSortMode | null;
	installPinnedItems(options: PinnedItemOptions): (() => void) | null;
	installSorting(getOptions: SortingOptionsProvider): (() => void) | null;
	isItemVisible(path: string): boolean;
	observeRenders(callback: () => void): (() => void) | null;
	refreshPinnedItems(): void;
	refreshToolbarActions(): void;
	runOriginalSort(): boolean;
	scrollTo(path: string): boolean;
	select(path: string): boolean;
}
