import { describe, expect, it } from 'vitest';
import { loadSettings } from './settings';
import { applyDelete, applyRename } from './settings-events';

describe('applyRename', () => {
	it('moves folder settings, descendants, hidden paths, and parent prefixes', () => {
		const settings = loadSettings({
			hiddenPaths: ['Projects', 'Projects/Private.md'],
			folders: {
				'': { orderedPrefix: ['Projects'] },
				Projects: { orderedPrefix: ['Private.md'] },
				'Projects/Current': { orderedPrefix: [] },
			},
		});

		expect(applyRename(settings, 'Projects', 'Work')).toBe(true);
		expect(settings.hiddenPaths).toEqual(['Work', 'Work/Private.md']);
		expect(settings.folders).toEqual({
			'': { orderedPrefix: ['Work'] },
			Work: { orderedPrefix: ['Private.md'] },
			'Work/Current': { orderedPrefix: [] },
		});
	});

	it('moves a hidden prefix entry between folders without losing its position', () => {
		const settings = loadSettings({
			hiddenPaths: ['Projects/Current.md'],
			folders: {
				Projects: { orderedPrefix: ['Current.md', 'Later.md'] },
				Archive: { orderedPrefix: ['Existing.md'] },
			},
		});

		applyRename(settings, 'Projects/Current.md', 'Archive/Current.md');

		expect(settings.hiddenPaths).toEqual(['Archive/Current.md']);
		expect(settings.folders.Projects?.orderedPrefix).toEqual(['Later.md']);
		expect(settings.folders.Archive?.orderedPrefix).toEqual([
			'Existing.md',
			'Current.md',
		]);
	});
});

describe('applyDelete', () => {
	it('removes path settings, descendants, and the parent prefix entry', () => {
		const settings = loadSettings({
			hiddenPaths: ['Projects', 'Projects/Private.md', 'Keep.md'],
			folders: {
				'': { orderedPrefix: ['Projects', 'Keep.md'] },
				Projects: { orderedPrefix: ['Private.md'] },
				'Projects/Current': { orderedPrefix: [] },
			},
		});

		expect(applyDelete(settings, 'Projects')).toBe(true);
		expect(settings.hiddenPaths).toEqual(['Keep.md']);
		expect(settings.folders).toEqual({
			'': { orderedPrefix: ['Keep.md'] },
		});
	});

	it('reports when deletion does not change persisted settings', () => {
		const settings = loadSettings(undefined);

		expect(applyDelete(settings, 'Missing.md')).toBe(false);
	});
});
