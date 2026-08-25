import { describe, expect, it } from 'vitest';
import { formatCompatibilityReport } from './toolbar';

describe('formatCompatibilityReport', () => {
	it('lists unavailable capabilities', () => {
		expect(
			formatCompatibilityReport(
				{
					available: false,
					unavailableCapabilities: [
						'run core sorting',
						'scroll to items',
					],
					itemCount: 1,
					sortMode: 'alphabetical',
				},
				0,
			),
		).toBe(
			'File Explorer Tools: unavailable capabilities: run core sorting, scroll to items.',
		);
	});
});
