export interface FakeExplorerItem {
	path: string;
	children: FakeExplorerItem[];
	collapsed: boolean;
	selected: boolean;
}

export class FakeExplorer {
	readonly items = new Map<string, FakeExplorerItem>();
	readonly scrolledPaths: string[] = [];

	constructor() {
		this.items.set('', {
			path: '',
			children: [],
			collapsed: false,
			selected: false,
		});
	}

	addItem(path: string): FakeExplorerItem {
		if (this.items.has(path)) {
			throw new Error(`Explorer item already exists: ${path}`);
		}

		const parentPath = parentOf(path);
		const parent = this.items.get(parentPath);
		if (parent === undefined) {
			throw new Error(`Explorer parent does not exist: ${parentPath}`);
		}

		const item: FakeExplorerItem = {
			path,
			children: [],
			collapsed: true,
			selected: false,
		};
		this.items.set(path, item);
		parent.children.push(item);
		return item;
	}

	expand(path: string): void {
		this.requireItem(path).collapsed = false;
	}

	collapse(path: string): void {
		this.requireItem(path).collapsed = true;
	}

	select(path: string): void {
		for (const item of this.items.values()) {
			item.selected = item.path === path;
		}
	}

	scrollTo(path: string): void {
		this.requireItem(path);
		this.scrolledPaths.push(path);
	}

	private requireItem(path: string): FakeExplorerItem {
		const item = this.items.get(path);
		if (item === undefined) {
			throw new Error(`Explorer item does not exist: ${path}`);
		}
		return item;
	}
}

function parentOf(path: string): string {
	const separatorIndex = path.lastIndexOf('/');
	return separatorIndex < 0 ? '' : path.slice(0, separatorIndex);
}
