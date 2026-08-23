import { describe, expect, it } from 'vitest';
import type { SortMode } from '../settings';
import {
	compareExplorerItems,
	type ExplorerSortItem,
	type SortingOptions,
} from './comparator';

const DEFAULT_OPTIONS: SortingOptions = {
	groupFoldersFirst: false,
	sortMode: 'name-ascending',
};

function file(
	path: string,
	createdAt = 0,
	modifiedAt = createdAt,
): ExplorerSortItem {
	return {
		path,
		name: path.slice(path.lastIndexOf('/') + 1),
		folder: false,
		createdAt,
		modifiedAt,
	};
}

function folder(path: string): ExplorerSortItem {
	return {
		path,
		name: path.slice(path.lastIndexOf('/') + 1),
		folder: true,
		createdAt: null,
		modifiedAt: null,
	};
}

function sortedPaths(
	items: ExplorerSortItem[],
	overrides: Partial<SortingOptions> = {},
): string[] {
	const options = { ...DEFAULT_OPTIONS, ...overrides };
	return [...items]
		.sort((left, right) => compareExplorerItems(left, right, options))
		.map((item) => item.path);
}

describe('compareExplorerItems', () => {
	it.each<{
		mode: SortMode;
		expected: string[];
	}>([
		{
			mode: 'name-ascending',
			expected: ['alpha.md', 'Folder', 'zeta.md'],
		},
		{
			mode: 'name-descending',
			expected: ['zeta.md', 'Folder', 'alpha.md'],
		},
		{
			mode: 'modified-ascending',
			expected: ['Folder', 'alpha.md', 'zeta.md'],
		},
		{
			mode: 'modified-descending',
			expected: ['Folder', 'zeta.md', 'alpha.md'],
		},
		{
			mode: 'created-ascending',
			expected: ['Folder', 'zeta.md', 'alpha.md'],
		},
		{
			mode: 'created-descending',
			expected: ['Folder', 'alpha.md', 'zeta.md'],
		},
	])('sorts $mode', ({ mode, expected }) => {
		const items = [
			file('zeta.md', 10, 30),
			folder('Folder'),
			file('alpha.md', 30, 10),
		];

		expect(sortedPaths(items, { sortMode: mode })).toEqual(expected);
	});

	it('mixes files and folders by name when folder grouping is disabled', () => {
		expect(
			sortedPaths([folder('Bravo'), file('Alpha.md'), file('Charlie.md')]),
		).toEqual(['Alpha.md', 'Bravo', 'Charlie.md']);
	});

	it('groups folders before files when configured', () => {
		expect(
			sortedPaths(
				[folder('Zulu'), file('Alpha.md'), folder('Bravo'), file('Able.md')],
				{ groupFoldersFirst: true },
			),
		).toEqual(['Bravo', 'Zulu', 'Able.md', 'Alpha.md']);
	});

	it('always groups folders first by ascending name for time modes', () => {
		expect(
			sortedPaths(
				[
					folder('Zulu'),
					file('Alpha.md', 20, 20),
					folder('Bravo'),
					file('Able.md', 10, 10),
				],
				{ sortMode: 'modified-descending' },
			),
		).toEqual(['Bravo', 'Zulu', 'Alpha.md', 'Able.md']);
	});

	it('places ordered-prefix items before the sorted remainder', () => {
		expect(
			sortedPaths(
				[file('Alpha.md'), folder('Projects'), folder('Areas'), file('Zulu.md')],
				{ prefixPositions: new Map([['Projects', 1], ['Areas', 0]]) },
			),
		).toEqual(['Areas', 'Projects', 'Alpha.md', 'Zulu.md']);
	});

	it('keeps prefix ordering ahead of type grouping and time sorting', () => {
		expect(
			sortedPaths(
				[
					folder('Folder'),
					file('Old.md', 10, 10),
					file('Pinned.md', 5, 5),
					file('Recent.md', 20, 20),
				],
				{
					groupFoldersFirst: true,
					prefixPositions: new Map([['Pinned.md', 0]]),
					sortMode: 'modified-descending',
				},
			),
		).toEqual(['Pinned.md', 'Folder', 'Recent.md', 'Old.md']);
	});

	it('uses deterministic paths when timestamps are equal or missing', () => {
		const missing = { ...file('Missing.md'), modifiedAt: null };
		const otherMissing = { ...file('missing.md'), modifiedAt: null };
		const sameTime = file('Same-time.md', 10, 10);

		expect(
			sortedPaths([otherMissing, sameTime, missing], {
				sortMode: 'modified-descending',
			}),
		).toEqual(['Missing.md', 'missing.md', 'Same-time.md']);
	});

	it('uses paths as deterministic tie-breakers', () => {
		const left = { ...file('one/Same.md', 10, 10), name: 'Same.md' };
		const right = { ...file('two/Same.md', 10, 10), name: 'Same.md' };

		expect(
			sortedPaths([right, left], { sortMode: 'modified-ascending' }),
		).toEqual(['one/Same.md', 'two/Same.md']);
	});

	it('distinguishes case-only path differences in the final tie-breaker', () => {
		const upper = { ...file('A.md', 10, 10), name: 'same.md' };
		const lower = { ...file('a.md', 10, 10), name: 'same.md' };

		expect(
			sortedPaths([lower, upper], { sortMode: 'modified-ascending' }),
		).toEqual(['A.md', 'a.md']);
	});
});
