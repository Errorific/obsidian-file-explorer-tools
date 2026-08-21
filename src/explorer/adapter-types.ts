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
}

export interface ExplorerAdapter {
	addToolbarAction(action: ToolbarAction): (() => void) | null;
	collapse(path: string): boolean;
	expand(path: string): boolean;
	getCompatibilityReport(): ExplorerCompatibilityReport;
	getItems(): ExplorerItemSnapshot[];
	getSortMode(): CoreSortMode | null;
	observeRenders(callback: () => void): (() => void) | null;
	runOriginalSort(): boolean;
	scrollTo(path: string): boolean;
	select(path: string): boolean;
}
