import type { SortMode } from '../settings';

export interface ExplorerSortItem {
	path: string;
	name: string;
	folder: boolean;
	createdAt: number | null;
	modifiedAt: number | null;
}

export interface SortingOptions {
	mixFilesAndFolders: boolean;
	sortMode: SortMode;
	prefixPositions?: ReadonlyMap<string, number>;
}

const NAME_COMPARER = new Intl.Collator(undefined, {
	numeric: true,
	sensitivity: 'base',
});

export function compareExplorerItems(
	left: ExplorerSortItem,
	right: ExplorerSortItem,
	options: SortingOptions,
): number {
	const prefixComparison = comparePrefixPositions(left, right, options);
	if (prefixComparison !== 0) {
		return prefixComparison;
	}

	const typeComparison = compareTypes(left, right, options);
	if (typeComparison !== 0) {
		return typeComparison;
	}

	const modeComparison = compareByMode(left, right, options.sortMode);
	if (modeComparison !== 0) {
		return modeComparison;
	}

	return comparePaths(left.path, right.path);
}

function comparePrefixPositions(
	left: ExplorerSortItem,
	right: ExplorerSortItem,
	options: SortingOptions,
): number {
	const leftPosition = options.prefixPositions?.get(left.name);
	const rightPosition = options.prefixPositions?.get(right.name);

	if (leftPosition !== undefined && rightPosition !== undefined) {
		return leftPosition - rightPosition;
	}
	if (leftPosition !== undefined) {
		return -1;
	}
	if (rightPosition !== undefined) {
		return 1;
	}
	return 0;
}

function compareTypes(
	left: ExplorerSortItem,
	right: ExplorerSortItem,
	options: SortingOptions,
): number {
	const timeMode = options.sortMode.startsWith('modified-') ||
		options.sortMode.startsWith('created-');
	if ((options.mixFilesAndFolders && !timeMode) || left.folder === right.folder) {
		return 0;
	}
	return left.folder ? -1 : 1;
}

function compareByMode(
	left: ExplorerSortItem,
	right: ExplorerSortItem,
	mode: SortMode,
): number {
	if (left.folder && right.folder && isTimeMode(mode)) {
		return compareText(left.name, right.name);
	}

	switch (mode) {
		case 'name-ascending':
			return compareText(left.name, right.name);
		case 'name-descending':
			return compareText(right.name, left.name);
		case 'modified-ascending':
			return compareNumbers(left.modifiedAt, right.modifiedAt);
		case 'modified-descending':
			return compareNumbers(right.modifiedAt, left.modifiedAt);
		case 'created-ascending':
			return compareNumbers(left.createdAt, right.createdAt);
		case 'created-descending':
			return compareNumbers(right.createdAt, left.createdAt);
	}
}

function compareNumbers(left: number | null, right: number | null): number {
	if (left === null || right === null) {
		return 0;
	}
	return left - right;
}

function compareText(left: string, right: string): number {
	return NAME_COMPARER.compare(left, right);
}

function comparePaths(left: string, right: string): number {
	const localizedComparison = compareText(left, right);
	if (localizedComparison !== 0) {
		return localizedComparison;
	}
	return left < right ? -1 : left > right ? 1 : 0;
}

function isTimeMode(mode: SortMode): boolean {
	return mode.startsWith('modified-') || mode.startsWith('created-');
}
