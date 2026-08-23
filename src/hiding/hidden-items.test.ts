import { describe, expect, it } from 'vitest';
import { loadSettings } from '../settings';
import { isHidden, pathsToReveal, setHidden } from './hidden-items';

describe('hidden items', () => {
	it('adds and removes paths idempotently', () => {
		const settings = loadSettings({ hiddenPaths: [] });
		expect(setHidden(settings, 'Projects', true)).toBe(true);
		expect(setHidden(settings, 'Projects', true)).toBe(false);
		expect(isHidden(settings, 'Projects')).toBe(true);
		expect(setHidden(settings, 'Projects', false)).toBe(true);
		expect(setHidden(settings, 'Projects', false)).toBe(false);
	});

	it('returns hidden ancestors and target in path order', () => {
		const settings = loadSettings({
			hiddenPaths: ['Projects', 'Projects/Private', 'Projects/Private/Note.md'],
		});
		expect(pathsToReveal('Projects/Private/Note.md', settings)).toEqual([
			'Projects',
			'Projects/Private',
			'Projects/Private/Note.md',
		]);
	});
});
