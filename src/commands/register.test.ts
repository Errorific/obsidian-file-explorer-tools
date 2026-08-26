import { describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';
import type { ExplorerController } from '../explorer/controller';
import { registerCommands } from './register';

describe('registerCommands', () => {
	it('registers each explorer command and delegates to the controller', () => {
		const commands = new Map<string, () => void>();
		const plugin = {
			addCommand: vi.fn(
				(command: { id: string; callback?: () => void }) => {
					if (command.callback !== undefined) {
						commands.set(command.id, command.callback);
					}
				},
		)} as unknown as Plugin;
		const collapseToCurrentPath = vi.fn();
		const locateCurrentFile = vi.fn();
		const moveSelectedPinnedItem = vi.fn();
		const toggleForceGlobal = vi.fn();
		const toggleHiddenItems = vi.fn();
		const controller = {
			collapseToCurrentPath,
			locateCurrentFile,
			moveSelectedPinnedItem,
			toggleForceGlobal,
			toggleHiddenItems,
		} as unknown as ExplorerController;

		registerCommands(plugin, () => controller);
		for (const command of commands.values()) {
			command();
		}

		expect([...commands.keys()]).toEqual([
			'toggle-hidden-items',
			'locate-current-file',
			'collapse-to-current-path',
			'toggle-force-global-sorting',
			'move-pinned-item-up',
			'move-pinned-item-down',
		]);
		expect(toggleHiddenItems).toHaveBeenCalledOnce();
		expect(locateCurrentFile).toHaveBeenCalledOnce();
		expect(collapseToCurrentPath).toHaveBeenCalledOnce();
		expect(toggleForceGlobal).toHaveBeenCalledOnce();
		expect(moveSelectedPinnedItem).toHaveBeenNthCalledWith(1, -1);
		expect(moveSelectedPinnedItem).toHaveBeenNthCalledWith(2, 1);
	});
});
