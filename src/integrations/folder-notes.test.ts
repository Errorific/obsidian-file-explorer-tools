import type { App, TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { createFolderNoteIntegration } from './folder-notes';

function createFile(path: string): TFile {
	const separator = path.lastIndexOf('/');
	const name = path.slice(separator + 1);
	return asType<TFile>({
		path,
		name,
		basename: name.slice(0, name.lastIndexOf('.')),
		parent: {
			path: separator < 0 ? '' : path.slice(0, separator),
		},
	});
}

function asType<T>(value: unknown): T {
	return value as T;
}

describe('Folder Notes integration', () => {
	it('maps an adjacent parent-folder note to its folder', () => {
		const integration = createFolderNoteIntegration({
			plugins: {
				getPlugin: () => ({
					settings: {
						folderNoteName: '{{folder_name}}',
						storageLocation: 'parentFolder',
					},
				}),
			},
		} as unknown as App);

		expect(integration?.getAssociatedFolderPath(createFile('Test hide dir/Hidden grandchild.md'))).toBe(
			'Test hide dir/Hidden grandchild',
		);
	});

	it('reads a plugin stored in the plugin manager registry', () => {
		const integration = createFolderNoteIntegration({
			plugins: {
				getPlugin: () => null,
				plugins: {
					'folder-notes': {
						settings: {
							folderNoteName: '{{folder_name}}',
							storageLocation: 'parentFolder',
						},
					},
				},
			},
		} as unknown as App);

		expect(integration?.getAssociatedFolderPath(createFile('Private.md'))).toBe(
			'Private',
		);
	});

	it('does not activate for unavailable or unsupported settings', () => {
		expect(createFolderNoteIntegration({} as App)).toBeNull();
		expect(
			createFolderNoteIntegration({
				plugins: { getPlugin: () => ({ settings: { storageLocation: 'vaultFolder' } }) },
			} as unknown as App),
		).toBeNull();
	});
});
