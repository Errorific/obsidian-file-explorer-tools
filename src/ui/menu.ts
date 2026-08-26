import type { Menu, MenuItem } from 'obsidian';

export function getSubmenu(item: MenuItem): Menu | null {
	const value: unknown = item;
	if (!isRecord(value) || typeof value.setSubmenu !== 'function') {
		return null;
	}

	try {
		const submenu: unknown = Reflect.apply(value.setSubmenu, value, []);
		return isMenu(submenu) ? submenu : null;
	} catch {
		return null;
	}
}

function isMenu(value: unknown): value is Menu {
	return isRecord(value) && typeof value.addItem === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
