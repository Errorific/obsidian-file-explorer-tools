import type { EventRef, Menu, TAbstractFile } from 'obsidian';
import type { FileExplorerToolsSettings } from '../settings';
import { isHidden, setHidden } from './hidden-items';

interface HidingMenuHost {
	app: { workspace: { on(name: 'file-menu', callback: (menu: Menu, file: TAbstractFile) => void): EventRef } };
	registerEvent(event: EventRef): void;
	settings: FileExplorerToolsSettings;
	saveSettings(): Promise<void>;
}

export function registerHiddenItemMenu(host: HidingMenuHost): void {
	host.registerEvent(
		host.app.workspace.on('file-menu', (menu, file) => {
			addHiddenItemMenu(menu, file.path, host);
		}),
	);
}

export function addHiddenItemMenu(
	menu: Menu,
	path: string,
	host: Pick<HidingMenuHost, 'settings' | 'saveSettings'>,
): void {
	const hidden = isHidden(host.settings, path);
	menu.addItem((item) => {
		item
			.setTitle(hidden ? 'Unhide' : 'Hide')
			.setIcon(hidden ? 'eye' : 'eye-off')
			.setSection('file-explorer-tools-hidden')
			.onClick(async () => {
				if (setHidden(host.settings, path, !hidden)) {
					await host.saveSettings();
				}
			});
	});
}
