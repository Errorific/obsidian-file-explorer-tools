import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	loadSettings,
	migrateSettings,
	prepareSettings,
	reconcileSettings,
} from './settings';
import { FakeVault } from './testing/vault-fakes';

describe('migrateSettings', () => {
	it('creates version 1 settings from missing data', () => {
		expect(migrateSettings(null)).toEqual({ schemaVersion: 1 });
	});

	it('adds version 1 without discarding stored fields', () => {
		expect(
			migrateSettings({
				groupFoldersFirst: true,
				hiddenPaths: ['Private'],
			}),
		).toEqual({
			schemaVersion: 1,
			groupFoldersFirst: true,
			hiddenPaths: ['Private'],
		});
	});

	it('leaves data from later schema versions available to normalization', () => {
		expect(migrateSettings({ schemaVersion: 2, futureSetting: true })).toEqual({
			schemaVersion: 2,
			futureSetting: true,
		});
	});
});

describe('loadSettings', () => {
	it('returns independent default collections', () => {
		const first = loadSettings(undefined);
		const second = loadSettings(undefined);

		first.hiddenPaths.push('Private');
		first.folders.Root = { orderedPrefix: [] };

		expect(second).toEqual(DEFAULT_SETTINGS);
	});

	it('normalizes valid stored settings', () => {
		expect(
			loadSettings({
				schemaVersion: 1,
				groupFoldersFirst: true,
				hiddenPaths: ['Private', 'Private', 'Archive'],
				folders: {
					'': {
						sortMode: 'modified-descending',
						orderedPrefix: ['Projects', 'Projects', 'Areas'],
					},
					Reference: { orderedPrefix: [] },
				},
			}),
		).toEqual({
			schemaVersion: 1,
			groupFoldersFirst: true,
			hiddenPaths: ['Private', 'Archive'],
			folders: {
				'': {
					sortMode: 'modified-descending',
					orderedPrefix: ['Projects', 'Areas'],
				},
				Reference: { orderedPrefix: [] },
			},
		});
	});

	it('preserves fields from later schema versions', () => {
		expect(
			loadSettings({
				schemaVersion: 2,
				futureSetting: true,
				folders: {
					Projects: {
						orderedPrefix: [],
						futureFolderSetting: true,
					},
				},
			}),
		).toEqual({
			schemaVersion: 2,
			futureSetting: true,
			groupFoldersFirst: false,
			hiddenPaths: [],
			folders: {
				Projects: {
					orderedPrefix: [],
					futureFolderSetting: true,
				},
			},
		});
	});

	it('uses defaults for malformed values', () => {
		expect(
			loadSettings({
				schemaVersion: 'one',
				groupFoldersFirst: 'yes',
				hiddenPaths: ['Private', null, 42],
				folders: {
					Invalid: null,
					Projects: {
						sortMode: 'recent-first',
						orderedPrefix: 'Inbox',
					},
				},
			}),
		).toEqual({
			schemaVersion: 1,
			groupFoldersFirst: false,
			hiddenPaths: ['Private'],
			folders: {
				Projects: { orderedPrefix: [] },
			},
		});
	});
});

describe('prepareSettings', () => {
	it('reports when migrated settings need to be saved', () => {
		const vault = new FakeVault();
		const prepared = prepareSettings({ futureSetting: true }, vault);

		expect(prepared).toEqual({
			needsSave: true,
			settings: {
				schemaVersion: 1,
				futureSetting: true,
				groupFoldersFirst: false,
				hiddenPaths: [],
				folders: {},
			},
		});
		expect(prepareSettings(prepared.settings, vault).needsSave).toBe(false);
	});
});

describe('reconcileSettings', () => {
	it('removes missing paths and prefix entries', () => {
		const vault = new FakeVault();
		vault.createFolder('Projects');
		vault.createFile('Projects/Current.md');
		vault.createFile('Inbox.md');

		const settings = loadSettings({
			schemaVersion: 1,
			hiddenPaths: ['Inbox.md', 'Missing.md'],
			folders: {
				'': { orderedPrefix: ['Projects', 'Missing'] },
				Projects: { orderedPrefix: ['Current.md', 'Missing.md'] },
				Missing: { orderedPrefix: [] },
			},
		});

		expect(reconcileSettings(settings, vault)).toEqual({
			schemaVersion: 1,
			groupFoldersFirst: false,
			hiddenPaths: ['Inbox.md'],
			folders: {
				'': { orderedPrefix: ['Projects'] },
				Projects: { orderedPrefix: ['Current.md'] },
			},
		});
	});

	it('preserves future settings while normalizing prefix entries', () => {
		const vault = new FakeVault();
		vault.createFolder('Projects');
		vault.createFile('Projects/Current.md');

		const settings = {
			schemaVersion: 2,
			futureSetting: true,
			groupFoldersFirst: false,
			hiddenPaths: [],
			folders: {
				Projects: {
					orderedPrefix: ['Current.md', 'Current.md'],
					futureFolderSetting: true,
				},
			},
		};

		expect(reconcileSettings(settings, vault)).toEqual({
			schemaVersion: 2,
			futureSetting: true,
			groupFoldersFirst: false,
			hiddenPaths: [],
			folders: {
				Projects: {
					orderedPrefix: ['Current.md'],
					futureFolderSetting: true,
				},
			},
		});
	});
});
