import type { EventRef, Menu, TAbstractFile } from 'obsidian';
import type { FileExplorerToolsSettings } from '../settings';
import { pinItem, unpinItem } from './pinned-items';

interface PinMenuHost {
	app: {
		workspace: {
			on(
				name: 'file-menu',
				callback: (menu: Menu, file: TAbstractFile) => void,
			): EventRef;
		};
	};
	isPinningAvailable(): boolean;
	registerEvent(event: EventRef): void;
	saveSettings(): Promise<void>;
	settings: FileExplorerToolsSettings;
}

export function registerPinMenu(host: PinMenuHost): void {
	host.registerEvent(
		host.app.workspace.on('file-menu', (menu, file) => {
			if (host.isPinningAvailable()) {
				addPinMenu(menu, file.path, host);
			}
		}),
	);
}

export function addPinMenu(
	menu: Menu,
	path: string,
	host: Pick<PinMenuHost, 'saveSettings' | 'settings'>,
): void {
	const itemName = nameOf(path);
	if (itemName === null || itemName.length === 0) {
		return;
	}

	const folderPath = parentOf(path);
	const pinned =
		host.settings.folders[folderPath]?.orderedPrefix.includes(itemName) ?? false;
	menu.addItem((item) => {
		item
			.setTitle(pinned ? 'Unpin' : 'Pin')
			.setIcon(pinned ? 'pin-off' : 'pin')
			.setSection('file-explorer-tools-pin')
			.onClick(async () => {
				if (pinned) {
					unpinItem(host.settings, folderPath, itemName);
				} else {
					pinItem(host.settings, folderPath, itemName);
				}
				await host.saveSettings();
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
