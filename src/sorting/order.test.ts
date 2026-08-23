import { describe, expect, it } from 'vitest';
import type { FileExplorerToolsSettings } from '../settings';
import { createSortingOptions, mapCoreSortMode } from './order';

const settings: FileExplorerToolsSettings = {
	schemaVersion: 1,
	groupFoldersFirst: true,
	hiddenPaths: [],
	folders: {
		Projects: {
			sortMode: 'modified-descending',
			orderedPrefix: ['Current.md', 'Notes.md'],
		},
	},
};

describe('mapCoreSortMode', () => {
	it.each([
		['alphabetical', 'name-ascending'],
		['alphabeticalReverse', 'name-descending'],
		['byModifiedTime', 'modified-descending'],
		['byModifiedTimeReverse', 'modified-ascending'],
		['byCreatedTime', 'created-descending'],
		['byCreatedTimeReverse', 'created-ascending'],
	] as const)('maps %s to %s', (coreMode, sortMode) => {
		expect(mapCoreSortMode(coreMode)).toBe(sortMode);
	});
});

describe('createSortingOptions', () => {
	it('uses the folder override and ordered prefix', () => {
		expect(
			createSortingOptions(settings, 'Projects', 'alphabetical', false),
		).toEqual({
			groupFoldersFirst: true,
			prefixPositions: new Map([
				['Current.md', 0],
				['Notes.md', 1],
			]),
			sortMode: 'modified-descending',
		});
	});

	it('uses the core mode when the folder has no override', () => {
		expect(createSortingOptions(settings, '', 'alphabeticalReverse', false)).toEqual({
			groupFoldersFirst: true,
			prefixPositions: new Map(),
			sortMode: 'name-descending',
		});
	});

	it('ignores folder configuration while force-global sorting is active', () => {
		expect(
			createSortingOptions(settings, 'Projects', 'alphabetical', true),
		).toEqual({
			groupFoldersFirst: true,
			prefixPositions: new Map(),
			sortMode: 'name-ascending',
		});
	});
});
