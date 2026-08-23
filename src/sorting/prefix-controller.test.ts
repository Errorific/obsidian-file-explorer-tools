import { describe, expect, it } from 'vitest';
import { loadSettings } from '../settings';
import {
	addPrefixItem,
	movePrefixItem,
	removePrefixItem,
} from './prefix-controller';

describe('ordered-prefix settings', () => {
	it('adds an item without duplicating existing entries', () => {
		const settings = loadSettings(undefined);

		addPrefixItem(settings, 'Projects', 'Current.md');
		addPrefixItem(settings, 'Projects', 'Current.md');

		expect(settings.folders.Projects).toEqual({
			orderedPrefix: ['Current.md'],
		});
	});

	it('moves an item within its ordered prefix', () => {
		const settings = loadSettings({
			folders: {
				Projects: {
					orderedPrefix: ['First.md', 'Second.md', 'Third.md'],
				},
			},
		});

		expect(movePrefixItem(settings, 'Projects', 'Third.md', -1)).toBe(true);
		expect(settings.folders.Projects?.orderedPrefix).toEqual([
			'First.md',
			'Third.md',
			'Second.md',
		]);
		expect(movePrefixItem(settings, 'Projects', 'First.md', -1)).toBe(false);
	});

	it('removes an empty configuration but preserves sort overrides', () => {
		const prefixOnly = loadSettings({
			folders: {
				Projects: { orderedPrefix: ['Current.md'] },
			},
		});
		const withOverride = loadSettings({
			folders: {
				Projects: {
					orderedPrefix: ['Current.md'],
					sortMode: 'name-descending',
				},
			},
		});

		removePrefixItem(prefixOnly, 'Projects', 'Current.md');
		removePrefixItem(withOverride, 'Projects', 'Current.md');

		expect(prefixOnly.folders).toEqual({});
		expect(withOverride.folders.Projects).toEqual({
			orderedPrefix: [],
			sortMode: 'name-descending',
		});
	});
});
