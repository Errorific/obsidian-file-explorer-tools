import type { Menu } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { loadSettings } from '../settings';
import { addHiddenItemMenu } from './menu';

interface FakeMenuItem {
	title?: string;
	icon?: string;
	callback?: () => Promise<void>;
	setTitle(title: string): FakeMenuItem;
	setIcon(icon: string): FakeMenuItem;
	setSection(): FakeMenuItem;
	onClick(callback: () => Promise<void>): FakeMenuItem;
}

function createMenu() {
	const items: FakeMenuItem[] = [];
	const menu = {
		addItem(callback: (item: FakeMenuItem) => void) {
			const item: FakeMenuItem = {
				setTitle(title) {
					this.title = title;
					return this;
				},
				setIcon(icon) {
					this.icon = icon;
					return this;
				},
				setSection() {
					return this;
				},
				onClick(callback) {
					this.callback = callback;
					return this;
				},
			};
			callback(item);
			items.push(item);
			return menu;
		},
	};
	return { items, menu: menu as unknown as Menu };
}

describe('hidden item menu', () => {
	it('hides and unhides files through the context menu', async () => {
		const settings = loadSettings({ hiddenPaths: [] });
		const saveSettings = vi.fn(async () => undefined);
		const first = createMenu();
		addHiddenItemMenu(first.menu, 'Private.md', { settings, saveSettings });
		expect(first.items[0]?.title).toBe('Hide');
		await first.items[0]?.callback?.();
		expect(settings.hiddenPaths).toEqual(['Private.md']);
		expect(saveSettings).toHaveBeenCalledOnce();

		const second = createMenu();
		addHiddenItemMenu(second.menu, 'Private.md', { settings, saveSettings });
		expect(second.items[0]?.title).toBe('Unhide');
	});
});
