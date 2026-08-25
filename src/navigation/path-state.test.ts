import { describe, expect, it } from 'vitest';
import type { ExplorerItemSnapshot } from '../explorer/adapter-types';
import {
	getAncestorFolderPaths,
	getFoldersToCollapse,
} from './path-state';

function folder(
	path: string,
	collapsed = false,
): ExplorerItemSnapshot {
	return {
		path,
		folder: true,
		collapsed,
		selected: false,
	};
}

describe('getAncestorFolderPaths', () => {
	it('returns ancestors from the vault root to the parent folder', () => {
		expect(getAncestorFolderPaths('Projects/Active/Plan.md')).toEqual([
			'Projects',
			'Projects/Active',
		]);
	});

	it('returns no ancestors for a root item', () => {
		expect(getAncestorFolderPaths('Welcome.md')).toEqual([]);
	});
});

describe('getFoldersToCollapse', () => {
	it('preserves the vault root as an ancestor', () => {
		expect(getFoldersToCollapse([folder('')], 'Current.md', false)).toEqual([]);
	});

	it('preserves every folder for an associated vault-root note', () => {
		expect(
			getFoldersToCollapse([folder('Projects'), folder('Areas')], '', true),
		).toEqual([]);
	});

	it('collapses expanded folders outside the retained path', () => {
		const items = [
			folder('Projects'),
			folder('Projects/Active'),
			folder('Projects/Archive'),
			folder('Areas'),
			folder('Collapsed', true),
		];

		expect(
			getFoldersToCollapse(items, 'Projects/Active/Plan.md', false),
		).toEqual(['Projects/Archive', 'Areas']);
	});

	it('preserves an associated folder and its expanded subtree', () => {
		const items = [
			folder('Projects'),
			folder('Projects/Active'),
			folder('Projects/Active/Research'),
			folder('Projects/Archive'),
			folder('Areas'),
		];

		expect(
			getFoldersToCollapse(items, 'Projects/Active', true),
		).toEqual(['Projects/Archive', 'Areas']);
	});

	it('ignores files and folders that are already collapsed', () => {
		const items: ExplorerItemSnapshot[] = [
			folder('Archive', true),
			{
				path: 'Loose.md',
				folder: false,
				collapsed: null,
				selected: false,
			},
		];

		expect(getFoldersToCollapse(items, 'Current.md', false)).toEqual([]);
	});
});
