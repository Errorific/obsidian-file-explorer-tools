# File Explorer Tools

File Explorer Tools extends Obsidian's built-in file explorer with persistent hiding, flexible sorting, pinned items, and commands for quickly navigating large vaults.

The plugin works directly with Obsidian's file explorer, so your existing layout and workflows remain intact. Files hidden by the plugin are hidden only in the file explorer and remain available through links, search, the quick switcher, and other Obsidian features.

> [!CAUTION]
> This project is completely AI slop and only developed with my usage in mind. It's tested and I daily drive it, but I've never read the code and don't intend to.

## Features

- Hide individual files and folders, with a temporary reveal control
- Pin files and folders to the top of their parent folder
- Sort files and folders together or keep folders first
- Apply different sort modes to individual folders
- Temporarily ignore pins and folder-specific sorting
- Locate the active file and collapse unrelated folders
- Navigate folder notes correctly when the Folder Notes plugin is enabled
- Assign hotkeys to all navigation and pinned-item movement commands

## Installation

Install File Explorer Tools from its [latest GitHub release](https://github.com/Errorific/obsidian-file-explorer-tools/releases/latest):

1. Download `main.js`, `manifest.json`, and `styles.css` from the release assets.
2. Create this folder inside your vault:

   ```text
   <Vault>/.obsidian/plugins/file-explorer-tools/
   ```

3. Copy the downloaded files into that folder.
4. Reload Obsidian.
5. Open **Settings → Community plugins** and enable **File Explorer Tools**.

File Explorer Tools currently supports desktop Obsidian only.

## Usage

### Hide files and folders

Right-click a file or folder in the file explorer and select **Hide**. To restore it permanently, reveal hidden items, right-click the item, and select **Unhide**.

Select **Toggle hidden items** in the file explorer toolbar to temporarily show everything hidden in that explorer. Revealed items stay in their normal sorted positions and appear dimmed with a hidden indicator. This temporary reveal state resets when Obsidian restarts.

Hiding a folder affects its appearance in the file explorer. It does not delete the folder or prevent its contents from being opened elsewhere in Obsidian. When you open or locate a hidden file, the plugin temporarily reveals that file and any hidden ancestors needed to reach it.

### Choose the global sort order

Use Obsidian's existing file explorer sort control to choose the global order:

- Name (A to Z)
- Name (Z to A)
- Modified (newest)
- Modified (oldest)
- Created (newest)
- Created (oldest)

By default, folders appear before files. Enable **Settings → File Explorer Tools → Mix files and folders** to combine them when sorting by name.

Folders remain grouped before files in modified-time and created-time modes because Obsidian does not provide reliable timestamps for folders. Within that group, folders are sorted by name.

### Set a folder-specific sort order

Right-click a folder, select **Sort folder**, and choose a sort mode. That choice applies only to the folder's immediate children.

Select **Use global** to remove the override and return the folder to the global sort order. Folder-specific sorting is also available for the vault root by right-clicking the vault's root folder.

### Pin items

Right-click a file or folder and select **Pin**. Pinned items appear at the top of their parent folder, ahead of the normally sorted remainder. Their order and pin state persist across Obsidian restarts.

To manage pinned items:

- Drag a pinned item above or below another pinned item in the same folder to reorder it.
- Drag a pinned item onto an unpinned sibling in the same folder to unpin it.
- Right-click a pinned item and select **Unpin**.
- Use **Move pinned item up** or **Move pinned item down** from the command palette. These commands act on the selected or focused pinned item and can be assigned hotkeys.

Other drag targets retain Obsidian's normal move behavior, including moves between folders.

### Temporarily use global sorting

Select **Toggle force global sorting** in the file explorer toolbar to temporarily ignore pinned-item ordering and all folder-specific sort modes. Select it again to restore them.

This mode does not delete any saved configuration and resets when Obsidian restarts. You can change Obsidian's global sort order while the mode is active. Pin indicators remain visible, but pinned-item reordering is unavailable until force-global sorting is disabled.

### Locate the current file

Select **Locate current file** in the file explorer toolbar to:

1. Reveal the active file and any hidden ancestors temporarily.
2. Expand its folder path.
3. Scroll it into view.
4. Select it in the file explorer.

If the active file is already selected and visible, selecting **Locate current file** again collapses expanded folders outside its path. If the file has been scrolled out of view, the action locates it again instead.

Use the separate **Collapse to current path** command when you want to collapse unrelated folders immediately.

## Commands

Open the command palette to run these commands or assign them hotkeys under **Settings → Hotkeys**:

- **File Explorer Tools: Toggle hidden items**
- **File Explorer Tools: Locate current file**
- **File Explorer Tools: Collapse to current path**
- **File Explorer Tools: Toggle force global sorting**
- **File Explorer Tools: Move pinned item up**
- **File Explorer Tools: Move pinned item down**

## Folder Notes compatibility

[Folder Notes](https://github.com/LostPaul/obsidian-folder-notes) is supported when it stores notes inside their folders or beside their folders using the `{{folder_name}}` naming marker. Fixed folder-note names are also supported for notes stored inside folders.

When the active file is a recognized folder note, locate and collapse actions use its associated folder. Collapsing to the current path preserves the associated folder's expanded subtree.

Folder Notes is optional. Unsupported or unrecognized Folder Notes configurations fall back to ordinary file behavior.

## Compatibility

File Explorer Tools integrates with parts of Obsidian's built-in file explorer that are not available through the public plugin API. The plugin checks the required capabilities at runtime and leaves Obsidian's native explorer behavior intact when an integration is unavailable.

The current version has been manually verified with:

- Obsidian 1.13.7
- Folder Notes 1.8.26

Do not enable File Explorer Tools and another plugin that replaces file explorer sorting or hiding at the same time. In particular, File Explorer Tools is not compatible with Flexplorer because both plugins control the same explorer behavior.

## Development

This repository uses the Node.js and npm versions pinned in `mise.toml`.

```sh
mise install
npm ci
```

Run the development build in watch mode:

```sh
npm run dev
```

Run the automated checks:

```sh
npm test
npm run lint
npm run build
```

### Release process

1. Create a branch from the latest `main`.
2. Update the version without creating a tag:

   ```sh
   npm version <version> --no-git-tag-version
   ```

3. Run the automated checks, commit the version files, and merge the pull request.
4. Tag the merged commit on `main` with the exact version from `manifest.json`, without a `v` prefix:

   ```sh
   git tag -a <version> -m "Release <version>"
   git push origin <version>
   ```

5. Wait for the release workflow to build the plugin and create a draft GitHub release.
6. Verify that `main.js`, `manifest.json`, and `styles.css` are attached, then publish the draft.

Build provenance is generated when the repository is public. Private repositories skip that step and still create the draft release.

## License

File Explorer Tools is released under the [0BSD License](LICENSE).
