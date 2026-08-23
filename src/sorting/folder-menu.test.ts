import { describe, expect, it } from 'vitest';
import { loadSettings } from '../settings';
import { setFolderSortMode } from './folder-menu';

describe('setFolderSortMode', () => {
	it('creates a folder configuration for an override', () => {
		const settings = loadSettings(undefined);

		setFolderSortMode(settings, 'Projects', 'modified-descending');

		expect(settings.folders).toEqual({
			Projects: {
				orderedPrefix: [],
				sortMode: 'modified-descending',
			},
		});
	});

	it('updates an override without changing the ordered prefix', () => {
		const settings = loadSettings({
			folders: {
				Projects: {
					orderedPrefix: ['Current.md'],
					sortMode: 'name-ascending',
				},
			},
		});

		setFolderSortMode(settings, 'Projects', 'created-ascending');

		expect(settings.folders.Projects).toEqual({
			orderedPrefix: ['Current.md'],
			sortMode: 'created-ascending',
		});
	});

	it('removes an empty configuration when returning to global sorting', () => {
		const settings = loadSettings({
			folders: {
				Projects: {
					orderedPrefix: [],
					sortMode: 'name-ascending',
				},
			},
		});

		setFolderSortMode(settings, 'Projects', undefined);

		expect(settings.folders).toEqual({});
	});

	it('keeps ordered-prefix configuration when returning to global sorting', () => {
		const settings = loadSettings({
			folders: {
				Projects: {
					orderedPrefix: ['Current.md'],
					sortMode: 'name-ascending',
				},
			},
		});

		setFolderSortMode(settings, 'Projects', undefined);

		expect(settings.folders.Projects).toEqual({
			orderedPrefix: ['Current.md'],
		});
	});
});
