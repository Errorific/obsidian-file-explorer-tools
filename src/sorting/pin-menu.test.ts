import type { Menu } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { loadSettings } from '../settings';
import { addPinMenu } from './pin-menu';

interface FakeMenuItem {
	clickCallback: (() => Promise<void>) | null;
	icon: string | null;
	section: string | null;
	title: string;
	onClick(callback: () => Promise<void>): FakeMenuItem;
	setIcon(value: string): FakeMenuItem;
	setSection(value: string): FakeMenuItem;
	setTitle(value: string): FakeMenuItem;
}

function createMenu() {
	const items: FakeMenuItem[] = [];
	const menu = {
		addItem(callback: (item: FakeMenuItem) => void) {
			const item: FakeMenuItem = {
				clickCallback: null,
				icon: null,
				section: null,
				title: '',
				onClick(clickCallback) {
					this.clickCallback = clickCallback;
					return this;
				},
				setIcon(icon) {
					this.icon = icon;
					return this;
				},
				setSection(section) {
					this.section = section;
					return this;
				},
				setTitle(title) {
					this.title = title;
					return this;
				},
			};
			callback(item);
			items.push(item);
			return this;
		},
	};
	return { items, menu: menu as unknown as Menu };
}

describe('addPinMenu', () => {
	it('pins an item through one direct context-menu action', async () => {
		const { items, menu } = createMenu();
		const settings = loadSettings(undefined);
		const saveSettings = vi.fn(async () => undefined);

		addPinMenu(menu, 'Projects/Current.md', { saveSettings, settings });

		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			icon: 'pin',
			section: 'file-explorer-tools-pin',
			title: 'Pin',
		});
		await items[0]?.clickCallback?.();
		expect(settings.folders.Projects?.orderedPrefix).toEqual(['Current.md']);
		expect(saveSettings).toHaveBeenCalledOnce();
	});

	it('unpins an item while preserving its parent sort override', async () => {
		const { items, menu } = createMenu();
		const settings = loadSettings({
			folders: {
				Projects: {
					orderedPrefix: ['Current.md'],
					sortMode: 'name-descending',
				},
			},
		});
		const saveSettings = vi.fn(async () => undefined);

		addPinMenu(menu, 'Projects/Current.md', { saveSettings, settings });

		expect(items[0]).toMatchObject({ icon: 'pin-off', title: 'Unpin' });
		await items[0]?.clickCallback?.();
		expect(settings.folders.Projects).toEqual({
			orderedPrefix: [],
			sortMode: 'name-descending',
		});
		expect(saveSettings).toHaveBeenCalledOnce();
	});

	it('does not add controls for the vault root', () => {
		const { items, menu } = createMenu();

		addPinMenu(menu, '', {
			saveSettings: vi.fn(),
			settings: loadSettings(undefined),
		});

		expect(items).toEqual([]);
	});
});
