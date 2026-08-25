import type { ExplorerCompatibilityReport } from './adapter-types';

export function formatCompatibilityReport(
	report: ExplorerCompatibilityReport,
	renderCount: number,
): string {
	if (!report.available) {
		return `File Explorer Tools: unavailable capabilities: ${report.unavailableCapabilities.join(', ')}.`;
	}

	return `File Explorer Tools: compatibility check passed. ${report.itemCount} items, ${renderCount} renders observed, sort mode ${report.sortMode}.`;
}
