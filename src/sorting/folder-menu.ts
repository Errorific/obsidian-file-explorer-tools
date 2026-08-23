import type { EventRef, Menu, TAbstractFile } from 'obsidian';
import type { FileExplorerToolsSettings, SortMode } from '../settings';

interface FolderSortMenuHost {
	app: {
		workspace: {
			on(
				name: 'file-menu',
				callback: (menu: Menu, file: TAbstractFile) => void,
			): EventRef;
		};
	};
	registerEvent(event: EventRef): void;
	saveSettings(): Promise<void>;
	settings: FileExplorerToolsSettings;
}

const SORT_CHOICES: ReadonlyArray<{
	mode: SortMode | undefined;
	title: string;
}> = [
	{ mode: undefined, title: 'Use global sort' },
	{ mode: 'name-ascending', title: 'Sort folder: Name (A to Z)' },
	{ mode: 'name-descending', title: 'Sort folder: Name (Z to A)' },
	{ mode: 'modified-descending', title: 'Sort folder: Modified (newest)' },
	{ mode: 'modified-ascending', title: 'Sort folder: Modified (oldest)' },
	{ mode: 'created-descending', title: 'Sort folder: Created (newest)' },
	{ mode: 'created-ascending', title: 'Sort folder: Created (oldest)' },
];

export function registerFolderSortMenu(host: FolderSortMenuHost): void {
	host.registerEvent(
		host.app.workspace.on('file-menu', (menu, file) => {
			if (!isFolder(file)) {
				return;
			}

			const configuredMode = host.settings.folders[file.path]?.sortMode;
			for (const choice of SORT_CHOICES) {
				menu.addItem((item) => {
					item
						.setTitle(choice.title)
						.setChecked(configuredMode === choice.mode)
						.setSection('file-explorer-tools-sort')
						.onClick(async () => {
							setFolderSortMode(host.settings, file.path, choice.mode);
							await host.saveSettings();
						});
				});
			}
		}),
	);
}

export function setFolderSortMode(
	settings: FileExplorerToolsSettings,
	folderPath: string,
	sortMode: SortMode | undefined,
): void {
	const configuration = settings.folders[folderPath];
	if (configuration === undefined) {
		if (sortMode !== undefined) {
			settings.folders[folderPath] = { orderedPrefix: [], sortMode };
		}
		return;
	}

	if (sortMode === undefined) {
		delete configuration.sortMode;
		if (configuration.orderedPrefix.length === 0) {
			delete settings.folders[folderPath];
		}
		return;
	}

	configuration.sortMode = sortMode;
}

function isFolder(file: TAbstractFile): file is TAbstractFile & { children: unknown[] } {
	return 'children' in file && Array.isArray(file.children);
}
