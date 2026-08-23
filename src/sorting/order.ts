import type { CoreSortMode } from '../explorer/adapter-types';
import type { FileExplorerToolsSettings, SortMode } from '../settings';
import type { SortingOptions } from './comparator';

const CORE_SORT_MODE_MAP: Record<CoreSortMode, SortMode> = {
	alphabetical: 'name-ascending',
	alphabeticalReverse: 'name-descending',
	byModifiedTime: 'modified-descending',
	byModifiedTimeReverse: 'modified-ascending',
	byCreatedTime: 'created-descending',
	byCreatedTimeReverse: 'created-ascending',
};

export function mapCoreSortMode(coreSortMode: CoreSortMode): SortMode {
	return CORE_SORT_MODE_MAP[coreSortMode];
}

export function createSortingOptions(
	settings: FileExplorerToolsSettings,
	folderPath: string,
	coreSortMode: CoreSortMode,
	forceGlobal: boolean,
): SortingOptions {
	const configuration = forceGlobal ? undefined : settings.folders[folderPath];
	return {
		groupFoldersFirst: settings.groupFoldersFirst,
		prefixPositions: new Map(
			(configuration?.orderedPrefix ?? []).map((name, index) => [name, index]),
		),
		sortMode:
			configuration?.sortMode ?? mapCoreSortMode(coreSortMode),
	};
}
