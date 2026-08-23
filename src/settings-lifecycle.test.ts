import type { Vault } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { loadSettings, reconcileSettings } from './settings';
import { FakeVault } from './testing/vault-fakes';

describe('settings reconciliation lifecycle', () => {
	it('retains persisted folder settings until the vault is ready', () => {
		const persisted = {
			schemaVersion: 1,
			mixFilesAndFolders: true,
			hiddenPaths: [],
			folders: {
				'Migration Source': {
					orderedPrefix: [],
					sortMode: 'name-descending',
				},
			},
		};
		const unavailableVault = {
			getAbstractFileByPath: vi.fn(() => null),
			getRoot: vi.fn(() => ({ children: [] })),
		} as unknown as Pick<Vault, 'getAbstractFileByPath' | 'getRoot'>;

		const loaded = loadSettings(persisted);

		expect(loaded.folders).toEqual(persisted.folders);
		expect(reconcileSettings(loaded, unavailableVault).folders).toEqual({});
	});

	it('reconciles folder settings after the vault is ready', () => {
		const vault = new FakeVault();
		vault.createFolder('Migration Source');
		vault.createFile('Migration Source/Alpha.md');
		const settings = loadSettings({
			folders: {
				'Migration Source': {
					orderedPrefix: ['Alpha.md', 'Missing.md'],
					sortMode: 'name-descending',
				},
			},
		});

		expect(reconcileSettings(settings, vault).folders).toEqual({
			'Migration Source': {
				orderedPrefix: ['Alpha.md'],
				sortMode: 'name-descending',
			},
		});
	});
});
