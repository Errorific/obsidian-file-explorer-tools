import type {
	ExplorerAdapter,
	ExplorerCompatibilityReport,
} from './adapter-types';

const PROBE_ACTION = {
	icon: 'wrench',
	title: 'Check file explorer compatibility',
} as const;

export function addCompatibilityAction(
	adapter: ExplorerAdapter,
	getRenderCount: () => number,
	showNotice: (message: string) => void,
): (() => void) | null {
	return adapter.addToolbarAction({
		...PROBE_ACTION,
		callback: () => {
			adapter.runOriginalSort();
			showNotice(
				formatCompatibilityReport(
					adapter.getCompatibilityReport(),
					getRenderCount(),
				),
			);
		},
	});
}

export function formatCompatibilityReport(
	report: ExplorerCompatibilityReport,
	renderCount: number,
): string {
	if (!report.available) {
		return `File Explorer Tools: unavailable capabilities: ${report.unavailableCapabilities.join(', ')}.`;
	}

	return `File Explorer Tools: compatibility check passed. ${report.itemCount} items, ${renderCount} renders observed, sort mode ${report.sortMode}.`;
}
