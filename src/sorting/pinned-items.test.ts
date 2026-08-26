import { describe, expect, it } from 'vitest';
import { loadSettings } from '../settings';
import {
	movePinnedItem,
	pinItem,
	reorderPinnedItem,
	unpinItem,
} from './pinned-items';

describe('pinned item settings', () => {
	it('pins an item without duplicating existing entries', () => {
		const settings = loadSettings(undefined);

		pinItem(settings, 'Projects', 'Current.md');
		pinItem(settings, 'Projects', 'Current.md');

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

		expect(movePinnedItem(settings, 'Projects', 'Third.md', -1)).toBe(true);
		expect(settings.folders.Projects?.orderedPrefix).toEqual([
			'First.md',
			'Third.md',
			'Second.md',
		]);
		expect(movePinnedItem(settings, 'Projects', 'First.md', -1)).toBe(false);
	});

	it('reorders an item before or after another prefix item', () => {
		const settings = loadSettings({
			folders: {
				Projects: {
					orderedPrefix: ['First.md', 'Second.md', 'Third.md'],
				},
			},
		});

		expect(
			reorderPinnedItem(
				settings,
				'Projects',
				'Third.md',
				'First.md',
				'before',
			),
		).toBe(true);
		expect(settings.folders.Projects?.orderedPrefix).toEqual([
			'Third.md',
			'First.md',
			'Second.md',
		]);
		expect(
			reorderPinnedItem(
				settings,
				'Projects',
				'Third.md',
				'Second.md',
				'after',
			),
		).toBe(true);
		expect(settings.folders.Projects?.orderedPrefix).toEqual([
			'First.md',
			'Second.md',
			'Third.md',
		]);
	});

	it('rejects invalid and unchanged reorder requests', () => {
		const settings = loadSettings({
			folders: {
				Projects: {
					orderedPrefix: ['First.md', 'Second.md'],
				},
			},
		});

		expect(
			reorderPinnedItem(
				settings,
				'Projects',
				'First.md',
				'Second.md',
				'before',
			),
		).toBe(false);
		expect(
			reorderPinnedItem(
				settings,
				'Projects',
				'First.md',
				'Missing.md',
				'after',
			),
		).toBe(false);
		expect(
			reorderPinnedItem(
				settings,
				'Missing',
				'First.md',
				'Second.md',
				'after',
			),
		).toBe(false);
		expect(settings.folders.Projects?.orderedPrefix).toEqual([
			'First.md',
			'Second.md',
		]);
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

		unpinItem(prefixOnly, 'Projects', 'Current.md');
		unpinItem(withOverride, 'Projects', 'Current.md');

		expect(prefixOnly.folders).toEqual({});
		expect(withOverride.folders.Projects).toEqual({
			orderedPrefix: [],
			sortMode: 'name-descending',
		});
	});
});
