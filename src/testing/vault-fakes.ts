import type { TAbstractFile, TFile, TFolder } from 'obsidian';

export class FakeVault {
	private readonly entries = new Map<string, TAbstractFile>();
	private readonly root: TFolder;

	constructor() {
		this.root = this.makeFolder('', null);
		this.entries.set('', this.root);
	}

	getRoot(): TFolder {
		return this.root;
	}

	getAbstractFileByPath(path: string): TAbstractFile | null {
		return this.entries.get(path) ?? null;
	}

	getFiles(): TFile[] {
		return [...this.entries.values()].filter(isFile);
	}

	createFolder(path: string): TFolder {
		let parent = this.root;
		let currentPath = '';
		for (const part of path.split('/').filter(Boolean)) {
			currentPath = currentPath === '' ? part : `${currentPath}/${part}`;
			const existing = this.entries.get(currentPath);
			if (existing !== undefined) {
				if (!isFolder(existing)) {
					throw new Error(`Path is a file: ${currentPath}`);
				}
				parent = existing;
				continue;
			}

			const folder = this.makeFolder(currentPath, parent);
			parent.children.push(folder);
			this.entries.set(currentPath, folder);
			parent = folder;
		}
		return parent;
	}

	createFile(
		path: string,
		content = '',
		createdAt = 0,
		modifiedAt = createdAt,
	): TFile {
		if (this.entries.has(path)) {
			throw new Error(`Path already exists: ${path}`);
		}

		const parentPath = parentOf(path);
		const parent = this.entries.get(parentPath);
		if (!isFolder(parent)) {
			throw new Error(`Folder does not exist: ${parentPath}`);
		}

		const name = nameOf(path);
		const extensionIndex = name.lastIndexOf('.');
		const file = {
			path,
			name,
			basename: extensionIndex > 0 ? name.slice(0, extensionIndex) : name,
			extension: extensionIndex > 0 ? name.slice(extensionIndex + 1) : '',
			parent,
			stat: {
				ctime: createdAt,
				mtime: modifiedAt,
				size: content.length,
			},
		} as TFile;
		parent.children.push(file);
		this.entries.set(path, file);
		return file;
	}

	private makeFolder(path: string, parent: TFolder | null): TFolder {
		return {
			path,
			name: nameOf(path),
			children: [],
			parent,
		} as unknown as TFolder;
	}
}

function isFile(item: TAbstractFile): item is TFile {
	return 'extension' in item;
}

function isFolder(item: TAbstractFile | undefined): item is TFolder {
	return item !== undefined && 'children' in item;
}

function parentOf(path: string): string {
	const separatorIndex = path.lastIndexOf('/');
	return separatorIndex < 0 ? '' : path.slice(0, separatorIndex);
}

function nameOf(path: string): string {
	const separatorIndex = path.lastIndexOf('/');
	return separatorIndex < 0 ? path : path.slice(separatorIndex + 1);
}
