import type { App, TFile } from 'obsidian';
import { describe, expect, it } from 'vitest';
import { createFolderNoteIntegration } from './folder-notes';

function createFile(path: string): TFile {
	const name = path.slice(path.lastIndexOf('/') + 1);
	return asType<TFile>({
		path,
		name,
		basename: name.slice(0, name.lastIndexOf('.')),
		parent: {
			path: path.slice(0, path.lastIndexOf('/')),
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

	it('does not activate for unavailable or unsupported settings', () => {
		expect(createFolderNoteIntegration({} as App)).toBeNull();
		expect(
			createFolderNoteIntegration({
				plugins: { getPlugin: () => ({ settings: { storageLocation: 'vaultFolder' } }) },
			} as unknown as App),
		).toBeNull();
	});
});
