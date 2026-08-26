import type { Menu } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { loadSettings } from '../settings';
import { addPrefixMenu } from './prefix-menu';

interface FakeMenuItem {
	clickCallback: (() => Promise<void>) | null;
	disabled: boolean;
	icon: string | null;
	section: string | null;
	title: string;
	onClick(callback: () => Promise<void>): FakeMenuItem;
	setDisabled(value: boolean): FakeMenuItem;
	setIcon(value: string): FakeMenuItem;
	setSection(value: string): FakeMenuItem;
	setTitle(value: string): FakeMenuItem;
}

function createMenu(withSubmenu = true) {
	const items: FakeMenuItem[] = [];
	const submenuItems: FakeMenuItem[] = [];
	const createItem = (target: FakeMenuItem[]) => {
		const item: FakeMenuItem = {
			clickCallback: null,
			disabled: false,
			icon: null,
			section: null,
			title: '',
			onClick(callback) {
				this.clickCallback = callback;
				return this;
			},
			setDisabled(value) {
				this.disabled = value;
				return this;
			},
			setIcon(value) {
				this.icon = value;
				return this;
			},
			setSection(value) {
				this.section = value;
				return this;
			},
			setTitle(value) {
				this.title = value;
				return this;
			},
		};
		target.push(item);
		return item;
	};
	const submenu = {
		addItem(callback: (item: FakeMenuItem) => void) {
			callback(createItem(submenuItems));
			return this;
		},
	};
	const menu = {
		addItem(callback: (item: FakeMenuItem) => void) {
			const item = createItem(items) as FakeMenuItem & {
				setSubmenu?: () => typeof submenu;
			};
			if (withSubmenu) {
				item.setSubmenu = () => submenu;
			}
			callback(item);
			return this;
		},
	};
	return { items, menu: menu as unknown as Menu, submenuItems };
}

describe('addPrefixMenu', () => {
	it('adds an item to its parent ordered prefix', async () => {
		const { items, menu, submenuItems } = createMenu();
		const settings = loadSettings(undefined);
		const saveSettings = vi.fn(async () => undefined);

		addPrefixMenu(menu, 'Projects/Current.md', {
			saveSettings,
			settings,
		});

		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			icon: 'grip-vertical',
			section: 'file-explorer-tools-prefix',
			title: 'Ordered prefix',
		});
		expect(submenuItems.map(({ title }) => title)).toEqual([
			'Add to ordered prefix',
		]);

		await submenuItems[0]?.clickCallback?.();

		expect(settings.folders.Projects?.orderedPrefix).toEqual(['Current.md']);
		expect(saveSettings).toHaveBeenCalledOnce();
	});

	it('removes a prefix item without removing its parent sort override', async () => {
		const { menu, submenuItems } = createMenu();
		const settings = loadSettings({
			folders: {
				Projects: {
					orderedPrefix: ['Current.md'],
					sortMode: 'name-descending',
				},
			},
		});
		const saveSettings = vi.fn(async () => undefined);

		addPrefixMenu(menu, 'Projects/Current.md', { saveSettings, settings });
		expect(submenuItems.map(({ title }) => title)).toEqual([
			'Remove from ordered prefix',
			'Move up',
			'Move down',
		]);

		await submenuItems[0]?.clickCallback?.();

		expect(settings.folders.Projects).toEqual({
			orderedPrefix: [],
			sortMode: 'name-descending',
		});
		expect(saveSettings).toHaveBeenCalledOnce();
	});

	it('moves prefix items and disables unavailable directions', async () => {
		const { menu, submenuItems } = createMenu();
		const settings = loadSettings({
			folders: {
				Projects: {
					orderedPrefix: ['First.md', 'Second.md', 'Third.md'],
				},
			},
		});
		const saveSettings = vi.fn(async () => undefined);

		addPrefixMenu(menu, 'Projects/Second.md', { saveSettings, settings });

		expect(submenuItems[1]).toMatchObject({ disabled: false, title: 'Move up' });
		expect(submenuItems[2]).toMatchObject({ disabled: false, title: 'Move down' });
		await submenuItems[1]?.clickCallback?.();
		expect(settings.folders.Projects?.orderedPrefix).toEqual([
			'Second.md',
			'First.md',
			'Third.md',
		]);
		expect(saveSettings).toHaveBeenCalledOnce();

		const first = createMenu();
		addPrefixMenu(first.menu, 'Projects/Second.md', { saveSettings, settings });
		expect(first.submenuItems[1]).toMatchObject({ disabled: true, title: 'Move up' });
		expect(first.submenuItems[2]).toMatchObject({
			disabled: false,
			title: 'Move down',
		});
	});

	it('supports vault-root children and flat-menu fallback', () => {
		const { items, menu, submenuItems } = createMenu(false);

		addPrefixMenu(menu, 'Current.md', {
			saveSettings: vi.fn(),
			settings: loadSettings(undefined),
		});

		expect(submenuItems).toEqual([]);
		expect(items.map(({ title }) => title)).toEqual([
			'Ordered prefix',
			'Add to ordered prefix',
		]);
	});

	it('does not add controls for the vault root', () => {
		const { items, menu } = createMenu();

		addPrefixMenu(menu, '', {
			saveSettings: vi.fn(),
			settings: loadSettings(undefined),
		});

		expect(items).toEqual([]);
	});
});
