import type { EventRef, Menu, TAbstractFile } from 'obsidian';
import type { FileExplorerToolsSettings, SortMode } from '../settings';
import { getSubmenu } from '../ui/menu';

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
	{ mode: undefined, title: 'Use global' },
	{ mode: 'name-ascending', title: 'Name (A to Z)' },
	{ mode: 'name-descending', title: 'Name (Z to A)' },
	{ mode: 'modified-descending', title: 'Modified (newest)' },
	{ mode: 'modified-ascending', title: 'Modified (oldest)' },
	{ mode: 'created-descending', title: 'Created (newest)' },
	{ mode: 'created-ascending', title: 'Created (oldest)' },
];

export function registerFolderSortMenu(host: FolderSortMenuHost): void {
	host.registerEvent(
		host.app.workspace.on('file-menu', (menu, file) => {
			if (!isFolder(file)) {
				return;
			}

			addFolderSortMenu(menu, file.path, host);
		}),
	);
}

export function addFolderSortMenu(
	menu: Menu,
	folderPath: string,
	host: Pick<FolderSortMenuHost, 'saveSettings' | 'settings'>,
): void {
	let submenu: Menu | null = null;
	menu.addItem((item) => {
		item
			.setTitle('Sort folder')
			.setIcon('list-ordered')
			.setSection('file-explorer-tools-sort');
		submenu = getSubmenu(item);
	});

	addSortChoices(submenu ?? menu, folderPath, host);
}

function addSortChoices(
	menu: Menu,
	folderPath: string,
	host: Pick<FolderSortMenuHost, 'saveSettings' | 'settings'>,
): void {
	const configuredMode = host.settings.folders[folderPath]?.sortMode;
	for (const choice of SORT_CHOICES) {
		menu.addItem((item) => {
			item
				.setTitle(choice.title)
				.setChecked(configuredMode === choice.mode)
				.onClick(async () => {
					setFolderSortMode(host.settings, folderPath, choice.mode);
					await host.saveSettings();
				});
		});
	}
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
