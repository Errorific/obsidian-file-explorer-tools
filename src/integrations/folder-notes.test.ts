import type { App, TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { FakeVault } from '../testing/vault-fakes';
import { createFolderNoteIntegration } from './folder-notes';

interface FolderNotesSettings {
	folderNoteName: unknown;
	storageLocation: unknown;
}

function createApp(
	settings: FolderNotesSettings,
	vault = new FakeVault(),
): { app: App; vault: FakeVault } {
	return {
		app: {
			plugins: {
				getPlugin: () => ({ settings }),
			},
			vault,
		} as unknown as App,
		vault,
	};
}

function createFile(vault: FakeVault, path: string): TFile {
	const separator = path.lastIndexOf('/');
	if (separator >= 0) {
		vault.createFolder(path.slice(0, separator));
	}
	return vault.createFile(path);
}

function defaultSettings(
	overrides: Partial<FolderNotesSettings> = {},
): FolderNotesSettings {
	return {
		folderNoteName: '{{folder_name}}',
		storageLocation: 'parentFolder',
		...overrides,
	};
}

describe('Folder Notes integration', () => {
	it('maps an adjacent parent-folder note to an existing folder', () => {
		const { app, vault } = createApp(defaultSettings());
		vault.createFolder('Projects/Active');
		const file = createFile(vault, 'Projects/Active.md');

		const integration = createFolderNoteIntegration(app);

		expect(integration?.getAssociatedFolderPath(file)).toBe('Projects/Active');
	});

	it('maps a root adjacent note to an existing top-level folder', () => {
		const { app, vault } = createApp(defaultSettings());
		vault.createFolder('Private');
		const file = createFile(vault, 'Private.md');

		expect(
			createFolderNoteIntegration(app)?.getAssociatedFolderPath(file),
		).toBe('Private');
	});

	it('supports prefixes and suffixes in parent-folder note names', () => {
		const { app, vault } = createApp(
			defaultSettings({ folderNoteName: 'About {{folder_name}} index' }),
		);
		vault.createFolder('Projects/Active');
		const file = createFile(vault, 'Projects/About Active index.md');

		expect(
			createFolderNoteIntegration(app)?.getAssociatedFolderPath(file),
		).toBe('Projects/Active');
	});

	it('maps an inside-folder note only when its name matches the folder', () => {
		const { app, vault } = createApp(
			defaultSettings({
				folderNoteName: 'About {{folder_name}}',
				storageLocation: 'insideFolder',
			}),
		);
		const folderNote = createFile(vault, 'Projects/Active/About Active.md');
		const ordinaryNote = createFile(vault, 'Projects/Active/About Other.md');

		const integration = createFolderNoteIntegration(app);

		expect(integration?.getAssociatedFolderPath(folderNote)).toBe(
			'Projects/Active',
		);
		expect(integration?.getAssociatedFolderPath(ordinaryNote)).toBeNull();
	});

	it('supports a fixed inside-folder note name', () => {
		const { app, vault } = createApp(
			defaultSettings({
				folderNoteName: 'folder note',
				storageLocation: 'insideFolder',
			}),
		);
		const folderNote = createFile(vault, 'Projects/Active/folder note.md');
		const ordinaryNote = createFile(vault, 'Projects/Active/Plan.md');

		const integration = createFolderNoteIntegration(app);

		expect(integration?.getAssociatedFolderPath(folderNote)).toBe(
			'Projects/Active',
		);
		expect(integration?.getAssociatedFolderPath(ordinaryNote)).toBeNull();
	});

	it('does not associate a note when the derived folder does not exist', () => {
		const { app, vault } = createApp(defaultSettings());
		const file = createFile(vault, 'Projects/Missing.md');

		expect(
			createFolderNoteIntegration(app)?.getAssociatedFolderPath(file),
		).toBeNull();
	});

	it('reads a plugin stored in the plugin manager registry', () => {
		const vault = new FakeVault();
		vault.createFolder('Private');
		const file = createFile(vault, 'Private.md');
		const integration = createFolderNoteIntegration({
			plugins: {
				getPlugin: () => null,
				plugins: {
					'folder-notes': {
						settings: defaultSettings(),
					},
				},
			},
			vault,
		} as unknown as App);

		expect(integration?.getAssociatedFolderPath(file)).toBe('Private');
	});

	it('uses the plugin manager registry when plugin lookup throws', () => {
		const vault = new FakeVault();
		vault.createFolder('Private');
		const file = createFile(vault, 'Private.md');
		const integration = createFolderNoteIntegration({
			plugins: {
				getPlugin: () => {
					throw new Error('Unavailable plugin accessor');
				},
				plugins: {
					'folder-notes': {
						settings: defaultSettings(),
					},
				},
			},
			vault,
		} as unknown as App);

		expect(integration?.getAssociatedFolderPath(file)).toBe('Private');
	});

	it('does not activate when Folder Notes is disabled', () => {
		const { app } = createApp(defaultSettings());
		Object.assign(app.plugins, { enabledPlugins: new Set<string>() });

		expect(createFolderNoteIntegration(app)).toBeNull();
	});

	it('fails open when plugin lookup throws', () => {
		expect(
			createFolderNoteIntegration({
				plugins: {
					getPlugin: () => {
						throw new Error('Unavailable plugin registry');
					},
				},
			} as unknown as App),
		).toBeNull();
	});

	it.each([
		undefined,
		{},
		{ folderNoteName: 42, storageLocation: 'insideFolder' },
		{ folderNoteName: '', storageLocation: 'insideFolder' },
		{ folderNoteName: '{{folder_name}}', storageLocation: 'vaultFolder' },
	])('does not activate for unavailable or unsupported settings: %j', (settings) => {
		const app =
			settings === undefined
				? ({} as App)
				: ({
						plugins: { getPlugin: () => ({ settings }) },
					} as unknown as App);

		expect(createFolderNoteIntegration(app)).toBeNull();
	});
});
