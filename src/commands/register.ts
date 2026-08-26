import type { Plugin } from 'obsidian';
import type { ExplorerController } from '../explorer/controller';

export function registerCommands(
	plugin: Plugin,
	getController: () => ExplorerController | null,
): void {
	plugin.addCommand({
		id: 'toggle-hidden-items',
		name: 'Toggle hidden items',
		callback: () => getController()?.toggleHiddenItems(),
	});
	plugin.addCommand({
		id: 'locate-current-file',
		name: 'Locate current file',
		callback: () => getController()?.locateCurrentFile(),
	});
	plugin.addCommand({
		id: 'collapse-to-current-path',
		name: 'Collapse to current path',
		callback: () => getController()?.collapseToCurrentPath(),
	});
	plugin.addCommand({
		id: 'toggle-force-global-sorting',
		name: 'Toggle force global sorting',
		callback: () => getController()?.toggleForceGlobal(),
	});
	plugin.addCommand({
		id: 'move-pinned-item-up',
		name: 'Move pinned item up',
		callback: () => {
			void getController()?.moveSelectedPinnedItem(-1);
		},
	});
	plugin.addCommand({
		id: 'move-pinned-item-down',
		name: 'Move pinned item down',
		callback: () => {
			void getController()?.moveSelectedPinnedItem(1);
		},
	});
}
