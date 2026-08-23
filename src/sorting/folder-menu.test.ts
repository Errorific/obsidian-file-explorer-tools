import type { Menu } from 'obsidian';
import { describe, expect, it, vi } from 'vitest';
import { loadSettings } from '../settings';
import { addFolderSortMenu, setFolderSortMode } from './folder-menu';

interface FakeMenuItem {
	checked: boolean | null;
	clickCallback: (() => Promise<void>) | null;
	icon: string | null;
	section: string | null;
	title: string;
	setChecked(value: boolean | null): FakeMenuItem;
	setIcon(value: string): FakeMenuItem;
	onClick(callback: () => Promise<void>): FakeMenuItem;
	setSection(value: string): FakeMenuItem;
	setTitle(value: string): FakeMenuItem;
}

function createMenu(withSubmenu: boolean) {
	const items: FakeMenuItem[] = [];
	const submenuItems: FakeMenuItem[] = [];
	const createItem = (target: FakeMenuItem[]) => {
		const item: FakeMenuItem = {
			checked: null,
			clickCallback: null,
			icon: null,
			section: null,
			title: '',
			setChecked(value) {
				this.checked = value;
				return this;
			},
			setIcon(value) {
				this.icon = value;
				return this;
			},
			onClick(callback) {
				this.clickCallback = callback;
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

describe('addFolderSortMenu', () => {
	it('adds sorting choices beneath one submenu', () => {
		const { items, menu, submenuItems } = createMenu(true);
		const settings = loadSettings({
			folders: {
				Projects: {
					orderedPrefix: [],
					sortMode: 'name-descending',
				},
			},
		});

		addFolderSortMenu(menu, 'Projects', {
			saveSettings: vi.fn(),
			settings,
		});

		expect(items).toHaveLength(1);
		expect(items[0]).toMatchObject({
			icon: 'list-ordered',
			section: 'file-explorer-tools-sort',
			title: 'Sort folder',
		});
		expect(submenuItems.map(({ title }) => title)).toEqual([
			'Use global',
			'Name (A to Z)',
			'Name (Z to A)',
			'Modified (newest)',
			'Modified (oldest)',
			'Created (newest)',
			'Created (oldest)',
		]);
		expect(submenuItems[2]?.checked).toBe(true);
	});

	it('falls back to flat choices when submenus are unavailable', () => {
		const { items, menu, submenuItems } = createMenu(false);

		addFolderSortMenu(menu, 'Projects', {
			saveSettings: vi.fn(),
			settings: loadSettings(undefined),
		});

		expect(submenuItems).toEqual([]);
		expect(items.map(({ title }) => title)).toEqual([
			'Sort folder',
			'Use global',
			'Name (A to Z)',
			'Name (Z to A)',
			'Modified (newest)',
			'Modified (oldest)',
			'Created (newest)',
			'Created (oldest)',
		]);
	});
});

describe('setFolderSortMode', () => {
	it('creates a folder configuration for an override', () => {
		const settings = loadSettings(undefined);

		setFolderSortMode(settings, 'Projects', 'modified-descending');

		expect(settings.folders).toEqual({
			Projects: {
				orderedPrefix: [],
				sortMode: 'modified-descending',
			},
		});
	});

	it('updates an override without changing the ordered prefix', () => {
		const settings = loadSettings({
			folders: {
				Projects: {
					orderedPrefix: ['Current.md'],
					sortMode: 'name-ascending',
				},
			},
		});

		setFolderSortMode(settings, 'Projects', 'created-ascending');

		expect(settings.folders.Projects).toEqual({
			orderedPrefix: ['Current.md'],
			sortMode: 'created-ascending',
		});
	});

	it('removes an empty configuration when returning to global sorting', () => {
		const settings = loadSettings({
			folders: {
				Projects: {
					orderedPrefix: [],
					sortMode: 'name-ascending',
				},
			},
		});

		setFolderSortMode(settings, 'Projects', undefined);

		expect(settings.folders).toEqual({});
	});

	it('keeps ordered-prefix configuration when returning to global sorting', () => {
		const settings = loadSettings({
			folders: {
				Projects: {
					orderedPrefix: ['Current.md'],
					sortMode: 'name-ascending',
				},
			},
		});

		setFolderSortMode(settings, 'Projects', undefined);

		expect(settings.folders.Projects).toEqual({
			orderedPrefix: ['Current.md'],
		});
	});
});
