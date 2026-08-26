import type {
	EventRef,
	Menu,
	TAbstractFile,
	WorkspaceLeaf,
} from 'obsidian';
import type { FileExplorerToolsSettings } from '../settings';
import { getSubmenu } from '../ui/menu';
import {
	addPrefixItem,
	movePrefixItem,
	removePrefixItem,
} from './prefix-controller';

interface PrefixMenuHost {
	app: {
		workspace: {
			on(
				name: 'file-menu',
				callback: (
					menu: Menu,
					file: TAbstractFile,
					source: string,
					leaf?: WorkspaceLeaf,
				) => void,
			): EventRef;
		};
	};
	registerEvent(event: EventRef): void;
	restorePrefixHandleFocus(path: string, leaf?: WorkspaceLeaf): void;
	saveSettings(): Promise<void>;
	settings: FileExplorerToolsSettings;
}

export function registerPrefixMenu(host: PrefixMenuHost): void {
	host.registerEvent(
		host.app.workspace.on('file-menu', (menu, file, _source, leaf) => {
			addPrefixMenu(menu, file.path, host, leaf);
		}),
	);
}

export function addPrefixMenu(
	menu: Menu,
	path: string,
	host: Pick<
		PrefixMenuHost,
		'restorePrefixHandleFocus' | 'saveSettings' | 'settings'
	>,
	leaf?: WorkspaceLeaf,
): void {
	const itemName = nameOf(path);
	if (itemName === null) {
		return;
	}

	const folderPath = parentOf(path);
	const prefix = host.settings.folders[folderPath]?.orderedPrefix ?? [];
	const prefixIndex = prefix.indexOf(itemName);
	let submenu: Menu | null = null;
	menu.addItem((item) => {
		item
			.setTitle('Ordered prefix')
			.setIcon('grip-vertical')
			.setSection('file-explorer-tools-prefix');
		submenu = getSubmenu(item);
	});

	const actionMenu = submenu ?? menu;
	if (prefixIndex < 0) {
		actionMenu.addItem((item) => {
			item.setTitle('Add to ordered prefix').onClick(async () => {
				addPrefixItem(host.settings, folderPath, itemName);
				await host.saveSettings();
				host.restorePrefixHandleFocus(path, leaf);
			});
		});
		return;
	}

	actionMenu.addItem((item) => {
		item.setTitle('Remove from ordered prefix').onClick(async () => {
			removePrefixItem(host.settings, folderPath, itemName);
			await host.saveSettings();
		});
	});
	addMoveAction(
		actionMenu,
		host,
		path,
		leaf,
		folderPath,
		itemName,
		'Move up',
		-1,
		prefixIndex === 0,
	);
	addMoveAction(
		actionMenu,
		host,
		path,
		leaf,
		folderPath,
		itemName,
		'Move down',
		1,
		prefixIndex === prefix.length - 1,
	);
}

function addMoveAction(
	menu: Menu,
	host: Pick<
		PrefixMenuHost,
		'restorePrefixHandleFocus' | 'saveSettings' | 'settings'
	>,
	path: string,
	leaf: WorkspaceLeaf | undefined,
	folderPath: string,
	itemName: string,
	title: string,
	offset: -1 | 1,
	disabled: boolean,
): void {
	menu.addItem((item) => {
		item
			.setTitle(title)
			.setDisabled(disabled)
			.onClick(async () => {
				if (movePrefixItem(host.settings, folderPath, itemName, offset)) {
					await host.saveSettings();
					host.restorePrefixHandleFocus(path, leaf);
				}
			});
	});
}

function parentOf(path: string): string {
	const separatorIndex = path.lastIndexOf('/');
	return separatorIndex < 0 ? '' : path.slice(0, separatorIndex);
}

function nameOf(path: string): string | null {
	if (path.length === 0) {
		return null;
	}
	const separatorIndex = path.lastIndexOf('/');
	return path.slice(separatorIndex + 1);
}
