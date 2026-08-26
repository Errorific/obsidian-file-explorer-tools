import { describe, expect, it, vi } from 'vitest';
import { createExplorerAdapter } from './adapter';
import type { PinnedReorderRequest } from './adapter-types';

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
	createElement(tagName: string): FakeElement {
		return new FakeElement(this, tagName);
	}
}

type FakeEventCallback = (event: FakeDragEvent) => void;

class FakeElement {
	readonly attributes = new Map<string, string>();
	readonly children: FakeElement[] = [];
	readonly classList = new FakeClassList();
	readonly listeners = new Map<string, Set<FakeEventCallback>>();
	readonly nodeType = 1;
	draggable = true;
	parentElement: FakeElement | null = null;
	parentNode: FakeElement | null = null;
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
		callback: FakeEventCallback,
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

	dispatch(type: string, event: FakeDragEvent): void {
		for (const callback of this.listeners.get(type) ?? []) {
			callback(event);
		}
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
		callback: FakeEventCallback,
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
}

interface FakeDragEvent {
	clientY: number;
	dataTransfer: { dropEffect: string } | null;
	preventDefault: ReturnType<typeof vi.fn>;
	relatedTarget: FakeElement | null;
	stopPropagation: ReturnType<typeof vi.fn>;
	target: FakeElement;
}

function createDragEvent(
	target: FakeElement,
	clientY: number,
	relatedTarget: FakeElement | null = null,
): FakeDragEvent {
	return {
		clientY,
		dataTransfer: { dropEffect: 'none' },
		preventDefault: vi.fn(),
		relatedTarget,
		stopPropagation: vi.fn(),
		target,
	};
}

function createRow(
	document: FakeDocument,
	top: number,
	bottom: number,
	folder = false,
) {
	const row = document.createElement('div');
	row.classList.add(folder ? 'nav-folder-title' : 'nav-file-title');
	row.setBounds(top, bottom);
	const content = document.createElement('div');
	content.classList.add(
		folder ? 'nav-folder-title-content' : 'nav-file-title-content',
	);
	row.appendChild(content);
	return { content, row };
}

function createView() {
	const document = new FakeDocument();
	const container = document.createElement('div');
	const source = createRow(document, 0, 30);
	const pinnedTarget = createRow(document, 30, 60);
	const ordinaryTarget = createRow(document, 60, 90);
	const folderTarget = createRow(document, 90, 120, true);
	const otherParentTarget = createRow(document, 120, 150);
	for (const item of [
		source,
		pinnedTarget,
		ordinaryTarget,
		folderTarget,
		otherParentTarget,
	]) {
		container.appendChild(item.row);
	}
	const selected = new Set<unknown>();
	const view = {
		fileItems: {
			'Projects/First.md': {
				el: source.row,
				file: { path: 'Projects/First.md' },
			},
			'Projects/Second.md': {
				el: pinnedTarget.row,
				file: { path: 'Projects/Second.md' },
			},
			'Projects/Ordinary.md': {
				el: ordinaryTarget.row,
				file: { path: 'Projects/Ordinary.md' },
			},
			'Projects/Destination': {
				collapsed: true,
				file: { path: 'Projects/Destination' },
				setCollapsed: vi.fn(),
				titleEl: folderTarget.row,
			},
			'Archive/Other.md': {
				el: otherParentTarget.row,
				file: { path: 'Archive/Other.md' },
			},
		},
		navFileContainerEl: container,
		sortOrder: 'alphabetical',
		tree: { selectedDoms: selected },
	};
	return {
		container,
		folderTarget,
		otherParentTarget,
		ordinaryTarget,
		pinnedTarget,
		selected,
		source,
		view,
	};
}

function findIndicator(row: FakeElement): FakeElement | null {
	return (
		row.children.find((child) =>
			child.classList.contains('file-explorer-tools-pin-indicator'),
		) ?? null
	);
}

function installPinnedItems(
	view: ReturnType<typeof createView>['view'],
	overrides: {
		isInteractionEnabled?: () => boolean;
		onReorder?: (
			request: PinnedReorderRequest,
		) => boolean | Promise<boolean>;
		onUnpin?: (path: string) => boolean | Promise<boolean>;
	} = {},
) {
	const adapter = createExplorerAdapter(view);
	const onReorder =
		overrides.onReorder ??
		vi.fn<(request: PinnedReorderRequest) => Promise<boolean>>(
			async () => true,
		);
	const onUnpin =
		overrides.onUnpin ??
		vi.fn<(path: string) => Promise<boolean>>(async () => true);
	const dispose = adapter.installPinnedItems({
		isInteractionEnabled: overrides.isInteractionEnabled ?? (() => true),
		isPinned: (path) =>
			path === 'Projects/First.md' || path === 'Projects/Second.md',
		onReorder,
		onUnpin,
	});
	return { adapter, dispose, onReorder, onUnpin };
}

describe('explorer pinned item interactions', () => {
	it('renders postfix status indicators idempotently and removes them on disposal', () => {
		const { pinnedTarget, source, view } = createView();
		const { adapter, dispose } = installPinnedItems(view);

		const indicator = findIndicator(source.row);
		expect(indicator).not.toBeNull();
		expect(indicator?.getAttribute('aria-hidden')).toBe('true');
		expect(source.row.children.at(-1)).toBe(indicator);
		expect(findIndicator(pinnedTarget.row)).not.toBeNull();

		adapter.refreshPinnedItems();
		expect(
			source.row.children.filter((child) =>
				child.classList.contains('file-explorer-tools-pin-indicator'),
			),
		).toHaveLength(1);

		dispose?.();
		expect(findIndicator(source.row)).toBeNull();
		expect(findIndicator(pinnedTarget.row)).toBeNull();
		expect(source.row.getAttribute('data-file-explorer-tools-pinned')).toBeNull();
	});

	it('removes partially installed listeners when attachment fails', () => {
		const { container, view } = createView();
		const addEventListener = container.addEventListener.bind(container);
		container.addEventListener = (type, callback) => {
			if (type === 'dragover') {
				throw new Error('incompatible event target');
			}
			addEventListener(type, callback);
		};
		const adapter = createExplorerAdapter(view);

		expect(
			adapter.installPinnedItems({
				isInteractionEnabled: () => true,
				isPinned: () => true,
				onReorder: vi.fn(() => true),
				onUnpin: vi.fn(() => true),
			}),
		).toBeNull();
		expect(container.listeners.get('dragstart')?.size).toBe(0);
		expect(adapter.getCompatibilityReport().unavailableCapabilities).toContain(
			'add pinned item interactions',
		);
	});

	it('removes partially installed indicators when attachment fails', () => {
		const { pinnedTarget, source, view } = createView();
		pinnedTarget.row.insertBefore = () => {
			throw new Error('incompatible explorer row');
		};
		const adapter = createExplorerAdapter(view);

		expect(
			adapter.installPinnedItems({
				isInteractionEnabled: () => true,
				isPinned: (path) => path.startsWith('Projects/'),
				onReorder: vi.fn(() => true),
				onUnpin: vi.fn(() => true),
			}),
		).toBeNull();
		expect(findIndicator(source.row)).toBeNull();
		expect(adapter.getCompatibilityReport().unavailableCapabilities).toContain(
			'add pinned item interactions',
		);
	});

	it('reports interaction capability failures without affecting other features', () => {
		const adapter = createExplorerAdapter({
			fileItems: {},
			navFileContainerEl: { nodeType: 1 },
		});

		expect(
			adapter.installPinnedItems({
				isInteractionEnabled: () => true,
				isPinned: () => true,
				onReorder: vi.fn(() => true),
				onUnpin: vi.fn(() => true),
			}),
		).toBeNull();
		expect(adapter.getCompatibilityReport().unavailableCapabilities).toContain(
			'add pinned item interactions',
		);
	});

	it.each([
		{ clientY: 32, position: 'before' },
		{ clientY: 58, position: 'after' },
	] as const)('reorders pinned siblings $position', async ({ clientY, position }) => {
		const { container, pinnedTarget, source, view } = createView();
		const { onReorder, onUnpin } = installPinnedItems(view);
		container.dispatch('dragstart', createDragEvent(source.content, 15));
		const dragOver = createDragEvent(pinnedTarget.content, clientY);
		container.dispatch('dragover', dragOver);
		expect(dragOver.preventDefault).toHaveBeenCalledOnce();
		expect(dragOver.stopPropagation).toHaveBeenCalledOnce();

		container.dispatch('drop', createDragEvent(pinnedTarget.content, clientY));
		await vi.waitFor(() => {
			expect(onReorder).toHaveBeenCalledWith({
				position,
				sourcePath: 'Projects/First.md',
				targetPath: 'Projects/Second.md',
			});
		});
		expect(onUnpin).not.toHaveBeenCalled();
	});

	it('unpins when dropped on an ordinary same-parent item', async () => {
		const { container, ordinaryTarget, source, view } = createView();
		const { onReorder, onUnpin } = installPinnedItems(view);
		container.dispatch('dragstart', createDragEvent(source.content, 15));
		const dragOver = createDragEvent(ordinaryTarget.content, 75);
		container.dispatch('dragover', dragOver);
		expect(dragOver.preventDefault).toHaveBeenCalledOnce();
		expect(
			ordinaryTarget.row.classList.contains(
				'file-explorer-tools-pin-drop-unpin',
			),
		).toBe(true);
		expect(
			source.row.classList.contains(
				'file-explorer-tools-pinned-will-unpin',
			),
		).toBe(true);

		container.dispatch('drop', createDragEvent(ordinaryTarget.content, 75));
		await vi.waitFor(() => {
			expect(onUnpin).toHaveBeenCalledWith('Projects/First.md');
		});
		expect(onReorder).not.toHaveBeenCalled();
	});

	it('clears drop indicators when the pointer leaves the explorer', () => {
		const { container, pinnedTarget, source, view } = createView();
		installPinnedItems(view);
		container.dispatch('dragstart', createDragEvent(source.content, 15));
		container.dispatch(
			'dragover',
			createDragEvent(pinnedTarget.content, 32),
		);
		expect(
			pinnedTarget.row.classList.contains(
				'file-explorer-tools-pin-drop-before',
			),
		).toBe(true);

		const outside = new FakeElement(source.row.ownerDocument, 'div');
		container.dispatch('dragleave', createDragEvent(container, 0, outside));

		expect(
			pinnedTarget.row.classList.contains(
				'file-explorer-tools-pin-drop-before',
			),
		).toBe(false);
	});

	it('preserves native folder-center drops', async () => {
		const { container, folderTarget, source, view } = createView();
		const { onReorder, onUnpin } = installPinnedItems(view);
		container.dispatch('dragstart', createDragEvent(source.content, 15));
		const dragOver = createDragEvent(folderTarget.content, 105);
		container.dispatch('dragover', dragOver);
		const drop = createDragEvent(folderTarget.content, 105);
		container.dispatch('drop', drop);
		await Promise.resolve();

		expect(dragOver.preventDefault).not.toHaveBeenCalled();
		expect(dragOver.stopPropagation).not.toHaveBeenCalled();
		expect(drop.preventDefault).not.toHaveBeenCalled();
		expect(drop.stopPropagation).not.toHaveBeenCalled();
		expect(onReorder).not.toHaveBeenCalled();
		expect(onUnpin).not.toHaveBeenCalled();
	});

	it('preserves native cross-parent and blank-space drops', async () => {
		const { container, otherParentTarget, source, view } = createView();
		const { onReorder, onUnpin } = installPinnedItems(view);

		for (const target of [otherParentTarget.content, container]) {
			container.dispatch('dragstart', createDragEvent(source.content, 15));
			const dragOver = createDragEvent(target, 135);
			container.dispatch('dragover', dragOver);
			const drop = createDragEvent(target, 135);
			container.dispatch('drop', drop);
			expect(dragOver.preventDefault).not.toHaveBeenCalled();
			expect(drop.preventDefault).not.toHaveBeenCalled();
		}
		await Promise.resolve();
		expect(onReorder).not.toHaveBeenCalled();
		expect(onUnpin).not.toHaveBeenCalled();
	});

	it('leaves ordinary source drags untouched', async () => {
		const { container, ordinaryTarget, pinnedTarget, view } = createView();
		const { onReorder, onUnpin } = installPinnedItems(view);
		container.dispatch(
			'dragstart',
			createDragEvent(ordinaryTarget.content, 75),
		);
		const dragOver = createDragEvent(pinnedTarget.content, 32);
		container.dispatch('dragover', dragOver);
		const drop = createDragEvent(pinnedTarget.content, 32);
		container.dispatch('drop', drop);
		await Promise.resolve();

		expect(dragOver.preventDefault).not.toHaveBeenCalled();
		expect(drop.preventDefault).not.toHaveBeenCalled();
		expect(onReorder).not.toHaveBeenCalled();
		expect(onUnpin).not.toHaveBeenCalled();
	});

	it('keeps status indicators but disables custom drops during forced sorting', async () => {
		const { container, pinnedTarget, source, view } = createView();
		const { onReorder, onUnpin } = installPinnedItems(view, {
			isInteractionEnabled: () => false,
		});
		expect(findIndicator(source.row)).not.toBeNull();

		container.dispatch('dragstart', createDragEvent(source.content, 15));
		const drop = createDragEvent(pinnedTarget.content, 32);
		container.dispatch('drop', drop);
		await Promise.resolve();

		expect(drop.preventDefault).not.toHaveBeenCalled();
		expect(onReorder).not.toHaveBeenCalled();
		expect(onUnpin).not.toHaveBeenCalled();
	});

	it('reads multi-selection state when the drag starts', async () => {
		const { container, pinnedTarget, selected, source, view } = createView();
		const { onReorder, onUnpin } = installPinnedItems(view);
		selected.add(view.fileItems['Projects/First.md']);
		selected.add(view.fileItems['Projects/Second.md']);

		container.dispatch('dragstart', createDragEvent(source.content, 15));
		const nativeDrop = createDragEvent(pinnedTarget.content, 32);
		container.dispatch('drop', nativeDrop);
		await Promise.resolve();

		expect(nativeDrop.preventDefault).not.toHaveBeenCalled();
		expect(onReorder).not.toHaveBeenCalled();
		expect(onUnpin).not.toHaveBeenCalled();

		selected.clear();
		container.dispatch('dragstart', createDragEvent(source.content, 15));
		const reorderDrop = createDragEvent(pinnedTarget.content, 32);
		container.dispatch('drop', reorderDrop);
		await vi.waitFor(() => {
			expect(onReorder).toHaveBeenCalledOnce();
		});
		expect(reorderDrop.preventDefault).toHaveBeenCalledOnce();
	});

	it('does not alter native row drag listeners', () => {
		const { source, view } = createView();
		const nativeDragStart = vi.fn();
		source.row.addEventListener('dragstart', nativeDragStart);

		installPinnedItems(view);

		expect(source.row.draggable).toBe(true);
		expect(source.row.listeners.get('dragstart')).toContain(nativeDragStart);
	});
});
