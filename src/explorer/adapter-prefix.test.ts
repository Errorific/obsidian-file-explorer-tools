import { describe, expect, it, vi } from 'vitest';
import { createExplorerAdapter } from './adapter';

class FakeClassList {
	private readonly names = new Set<string>();

	add(...names: string[]): void {
		for (const name of names) {
			this.names.add(name);
		}
	}

	contains(name: string): boolean {
		return this.names.has(name);
	}

	remove(...names: string[]): void {
		for (const name of names) {
			this.names.delete(name);
		}
	}

	toggle(name: string, enabled?: boolean): boolean {
		const next = enabled ?? !this.names.has(name);
		if (next) {
			this.names.add(name);
		} else {
			this.names.delete(name);
		}
		return next;
	}
}

class FakeDocument {
	activeElement: FakeElement | null = null;
	readonly defaultView = {
		requestAnimationFrame: (callback: FrameRequestCallback) => {
			callback(0);
			return 1;
		},
	};

	createElement(tagName: string): FakeElement {
		return new FakeElement(this, tagName);
	}
}

class FakeElement {
	readonly attributes = new Map<string, string>();
	readonly children: FakeElement[] = [];
	readonly classList = new FakeClassList();
	readonly listeners = new Map<string, Set<(event: FakePointerEvent) => void>>();
	readonly nodeType = 1;
	draggable = true;
	parentElement: FakeElement | null = null;
	parentNode: FakeElement | null = null;
	tabIndex = -1;
	type = '';
	private bounds = {
		bottom: 0,
		height: 0,
		left: 0,
		right: 0,
		top: 0,
		width: 0,
	};

	constructor(
		readonly ownerDocument: FakeDocument,
		readonly tagName: string,
	) {}

	addEventListener(
		type: string,
		callback: (event: FakePointerEvent) => void,
	): void {
		const callbacks = this.listeners.get(type) ?? new Set();
		callbacks.add(callback);
		this.listeners.set(type, callbacks);
	}

	appendChild(child: FakeElement): FakeElement {
		return this.insertBefore(child, null);
	}

	contains(candidate: unknown): boolean {
		return (
			candidate === this ||
			this.children.some((child) => child.contains(candidate))
		);
	}

	dispatch(type: string, event: FakePointerEvent): void {
		for (const callback of this.listeners.get(type) ?? []) {
			callback(event);
		}
	}

	focus(): void {
		this.ownerDocument.activeElement = this;
	}

	getAttribute(name: string): string | null {
		return this.attributes.get(name) ?? null;
	}

	getBoundingClientRect() {
		return this.bounds;
	}

	insertBefore(child: FakeElement, reference: FakeElement | null): FakeElement {
		child.remove();
		const index = reference === null ? -1 : this.children.indexOf(reference);
		if (index < 0) {
			this.children.push(child);
		} else {
			this.children.splice(index, 0, child);
		}
		child.parentElement = this;
		child.parentNode = this;
		return child;
	}

	querySelector(selector: string): FakeElement | null {
		const classNames = [...selector.matchAll(/\.([a-z0-9-]+)/g)].map(
			([, name]) => name,
		);
		for (const child of this.children) {
			if (classNames.some((name) => child.classList.contains(name ?? ''))) {
				return child;
			}
			const descendant = child.querySelector(selector);
			if (descendant !== null) {
				return descendant;
			}
		}
		return null;
	}

	releasePointerCapture(): void {}

	remove(): void {
		if (this.parentElement === null) {
			return;
		}
		const index = this.parentElement.children.indexOf(this);
		if (index >= 0) {
			this.parentElement.children.splice(index, 1);
		}
		this.parentElement = null;
		this.parentNode = null;
	}

	removeAttribute(name: string): void {
		this.attributes.delete(name);
	}

	removeEventListener(
		type: string,
		callback: (event: FakePointerEvent) => void,
	): void {
		this.listeners.get(type)?.delete(callback);
	}

	setAttribute(name: string, value: string): void {
		this.attributes.set(name, value);
	}

	setBounds(top: number, bottom: number): void {
		this.bounds = {
			bottom,
			height: bottom - top,
			left: 0,
			right: 300,
			top,
			width: 300,
		};
	}

	setPointerCapture(): void {}
}

interface FakePointerEvent {
	button: number;
	clientX: number;
	clientY: number;
	isPrimary: boolean;
	pointerId: number;
	preventDefault: ReturnType<typeof vi.fn>;
	stopPropagation: ReturnType<typeof vi.fn>;
}

function createPointerEvent(
	clientY: number,
	overrides: Partial<FakePointerEvent> = {},
): FakePointerEvent {
	return {
		button: 0,
		clientX: 20,
		clientY,
		isPrimary: true,
		pointerId: 1,
		preventDefault: vi.fn(),
		stopPropagation: vi.fn(),
		...overrides,
	};
}

function createRow(document: FakeDocument, top: number, bottom: number) {
	const row = document.createElement('div');
	row.classList.add('nav-file-title');
	row.setBounds(top, bottom);
	const content = document.createElement('div');
	content.classList.add('nav-file-title-content');
	row.appendChild(content);
	return { content, row };
}

function createView() {
	const document = new FakeDocument();
	const container = document.createElement('div');
	const source = createRow(document, 0, 40);
	const target = createRow(document, 40, 80);
	const otherParent = createRow(document, 80, 120);
	container.appendChild(source.row);
	container.appendChild(target.row);
	container.appendChild(otherParent.row);
	const view = {
		fileItems: {
			'Archive/Other.md': {
				file: { path: 'Archive/Other.md' },
				titleEl: otherParent.row,
			},
			'Projects/First.md': {
				el: source.row,
				file: { path: 'Projects/First.md' },
			},
			'Projects/Second.md': {
				el: target.row,
				file: { path: 'Projects/Second.md' },
			},
		},
		navFileContainerEl: container,
		sortOrder: 'alphabetical',
	};
	return { container, document, otherParent, source, target, view };
}

function findHandle(row: FakeElement): FakeElement | null {
	return row.children.find((child) =>
		child.classList.contains('file-explorer-tools-prefix-handle'),
	) ?? null;
}

describe('explorer ordered-prefix handles', () => {
	it('renders accessible handles only for ordered items and reconciles idempotently', () => {
		const { otherParent, source, target, view } = createView();
		const adapter = createExplorerAdapter(view);

		const dispose = adapter.installPrefixHandles({
			isOrdered: (path) => path !== 'Archive/Other.md',
			onReorder: vi.fn(() => true),
		});

		const sourceHandle = findHandle(source.row);
		expect(sourceHandle).not.toBeNull();
		expect(sourceHandle?.getAttribute('aria-label')).toBe('Reorder First.md');
		expect(sourceHandle?.tabIndex).toBe(0);
		expect(sourceHandle?.type).toBe('button');
		expect(sourceHandle?.draggable).toBe(false);
		expect(findHandle(target.row)).not.toBeNull();
		expect(findHandle(otherParent.row)).toBeNull();

		adapter.refreshPrefixHandles();
		expect(
			source.row.children.filter((child) =>
				child.classList.contains('file-explorer-tools-prefix-handle'),
			),
		).toHaveLength(1);

		dispose?.();
		expect(findHandle(source.row)).toBeNull();
		expect(findHandle(target.row)).toBeNull();
	});

	it('removes partially installed handles when attachment fails', () => {
		const { source, target, view } = createView();
		target.row.insertBefore = () => {
			throw new Error('incompatible explorer row');
		};
		const adapter = createExplorerAdapter(view);

		expect(
			adapter.installPrefixHandles({
				isOrdered: (path) => path.startsWith('Projects/'),
				onReorder: vi.fn(() => true),
			}),
		).toBeNull();
		expect(findHandle(source.row)).toBeNull();
		expect(adapter.getCompatibilityReport().unavailableCapabilities).toContain(
			'add ordered-prefix handles',
		);
	});

	it('reports handle capability failures without affecting other interactions', () => {
		const adapter = createExplorerAdapter({
			fileItems: {},
			navFileContainerEl: { nodeType: 1 },
		});

		expect(
			adapter.installPrefixHandles({
				isOrdered: () => true,
				onReorder: vi.fn(() => true),
			}),
		).toBeNull();
		expect(adapter.getCompatibilityReport().unavailableCapabilities).toContain(
			'add ordered-prefix handles',
		);
	});

	it.each([
		{ clientY: 45, position: 'before' },
		{ clientY: 75, position: 'after' },
	] as const)('reports $position drops within one parent', async ({ clientY, position }) => {
		const { document, source, target, view } = createView();
		const adapter = createExplorerAdapter(view);
		const onReorder = vi.fn(async () => true);
		adapter.installPrefixHandles({ isOrdered: () => true, onReorder });
		const handle = findHandle(source.row);
		expect(handle).not.toBeNull();

		handle?.dispatch('pointerdown', createPointerEvent(20));
		handle?.dispatch('pointermove', createPointerEvent(clientY));
		handle?.dispatch('pointerup', createPointerEvent(clientY));
		await vi.waitFor(() => {
			expect(onReorder).toHaveBeenCalledWith({
				position,
				sourcePath: 'Projects/First.md',
				targetPath: 'Projects/Second.md',
			});
		});
		expect(document.activeElement).toBe(handle);
		expect(target.row.classList.contains('file-explorer-tools-prefix-drop-before')).toBe(false);
		expect(target.row.classList.contains('file-explorer-tools-prefix-drop-after')).toBe(false);
	});

	it('ignores cross-parent drops and movement below the drag threshold', async () => {
		const { otherParent, source, view } = createView();
		const adapter = createExplorerAdapter(view);
		const onReorder = vi.fn(async () => true);
		adapter.installPrefixHandles({ isOrdered: () => true, onReorder });
		const handle = findHandle(source.row);

		handle?.dispatch('pointerdown', createPointerEvent(20));
		handle?.dispatch('pointermove', createPointerEvent(22));
		handle?.dispatch('pointerup', createPointerEvent(22));
		handle?.dispatch('pointerdown', createPointerEvent(20));
		handle?.dispatch('pointermove', createPointerEvent(100));
		handle?.dispatch('pointerup', createPointerEvent(100));
		await Promise.resolve();

		expect(otherParent.row.classList.contains('file-explorer-tools-prefix-drop-before')).toBe(false);
		expect(onReorder).not.toHaveBeenCalled();
	});

	it('does not alter native row dragging outside the dedicated handle', () => {
		const { source, view } = createView();
		const nativePointerDown = vi.fn();
		source.row.addEventListener('pointerdown', nativePointerDown);
		const adapter = createExplorerAdapter(view);

		adapter.installPrefixHandles({
			isOrdered: (path) => path === 'Projects/First.md',
			onReorder: vi.fn(() => true),
		});

		expect(source.row.draggable).toBe(true);
		expect(source.row.listeners.get('pointerdown')).toContain(nativePointerDown);
	});
});
