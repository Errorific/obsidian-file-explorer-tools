# File Explorer Tools design

## Overview

File Explorer Tools extends Obsidian's built-in file explorer with:

- Per-item hiding and a temporary reveal control
- Mixed file and folder sorting
- Per-folder sort overrides
- Pinned items with normally sorted remainders
- A temporary global-sort override
- On-demand location of the active file
- Collapsing folders outside the active file's path
- Soft compatibility with Folder Notes

The first release targets desktop Obsidian. Mobile support is required for the following release, so the design must not depend on keyboard modifiers, hover, or desktop-only APIs.

## Plugin identity

- Display name: `File Explorer Tools`
- Manifest ID: `file-explorer-tools`
- Command ID prefix: `file-explorer-tools:`
- Initial settings schema version: `1`

The manifest ID is stable after release. Local development plugin directories, including the test-vault symbolic link, must use the manifest ID.

## Technical constraints

Obsidian does not expose public APIs for:

- Filtering the built-in file explorer
- Replacing its comparator
- Reading or changing folder collapse state
- Adding custom ordering to its tree
- Rearranging explorer children

The plugin therefore needs a compatibility layer around undocumented explorer APIs and DOM structure. Building a separate explorer view would avoid those internals, but would not meet the product requirements.

The compatibility layer must:

- Patch only explorer instances or the explorer comparator where necessary
- Avoid patching global prototypes such as `Menu.prototype`
- Keep every internal API access in one module
- Detect required methods and fields before using them
- Preserve and chain functions patched by other plugins
- Restore all patches on unload
- Report compatibility failures clearly

### Failure behavior

Integration with undocumented explorer APIs must fail open:

- Never prevent the core file explorer from loading.
- Never leave the explorer partially patched after an initialization error.
- Retain Obsidian's native order when sorting integration is unavailable.
- Show items rather than risk making them inaccessible when hiding integration is unavailable.
- Disable only the unsupported feature and provide a concise notice or diagnostic message.
- Restore original explorer behavior on unload, including after partial initialization.

## Product requirements

### Hidden items

Hiding affects only the built-in file explorer. Files remain available through links, search, the quick switcher, and Obsidian APIs.

File and folder context menus provide **Hide** and **Unhide** actions. The initial version does not include a settings-page path editor or path patterns.

A file explorer toolbar toggle reveals all hidden items. Revealed items:

- Stay in their normal sorted positions
- Appear dimmed
- Have a visible hidden indicator

Reveal-hidden state resets when Obsidian restarts and is independent for each file explorer leaf.

Hiding a pinned item retains its stored position. A hidden folder and its descendants retain independent hidden states.

Locating or opening a hidden file temporarily reveals only the target and hidden ancestors needed to reach it. Temporary visibility ends when the workspace active file changes or the plugin unloads. Moving focus to another pane, or changing reveal-hidden mode, does not conceal the active file's path.

### Sorting

The default sort is name ascending with files and folders mixed.

The initial normal sort modes are:

- Name ascending and descending
- Modified time ascending and descending
- Created time ascending and descending

The existing core explorer sort menu selects the global sort mode.

Files and folders can be globally configured as either mixed or folders first. In time-based modes, folders are grouped first and always sorted by name ascending because Obsidian does not expose reliable folder timestamps.

A folder context menu can select a per-folder sort override or return the folder to **Use global**. Overrides are available for every folder, including the vault root.

### Pinned items

Each folder can define an ordered set of pinned children. Unpinned items continue to use the folder's effective normal sort.

For example:

```text
Projects
Areas
Resources
Archive
──────── normally sorted remainder ────────
Attachments.md
Daily
Templates
```

Only pinned items have stored positions. A postfix pin marks their state without changing the explorer row height.

Pin membership is managed through direct **Pin** and **Unpin** item context-menu actions when sorting integration is available. Dragging a pinned row over the top or bottom of a pinned sibling places it before or after that sibling. Dropping it on an unpinned sibling in the same parent unpins it. The center third of a folder row, cross-folder targets, blank explorer space, and multi-item drags retain Obsidian's native move behavior.

Commands move the uniquely selected pinned item, or the focused pinned item when the command palette clears explorer selection. They report why they cannot run when no unambiguous pinned target remains.

Pinned entries survive temporary hiding and temporary global sorting.

### Force-global sorting

A file explorer toolbar toggle temporarily ignores:

- Pinned-item ordering
- Per-folder sort overrides

It does not delete stored configuration. It resets when Obsidian restarts and is shared across all file explorer leaves.

Changing the core sort mode while force-global sorting is active updates the global mode and leaves force-global sorting enabled. Disabling the toggle restores prefixes and folder overrides around the selected global mode.

### Locate current file

The toolbar locate button has two-stage behavior.

When the active file is not selected and visible in that explorer, the first click:

1. Expands its ancestor path
2. Temporarily reveals hidden ancestors and the target if needed
3. Scrolls the file into view
4. Selects the file

When the active file is already selected and visible, the next click collapses every expanded folder outside the file's ancestor path.

Scrolling the file off-screen means the next click reveals it again rather than collapsing folders.

Commands are also registered for:

- Toggle hidden items
- Locate current file
- Collapse to current path
- Toggle force-global sorting

These commands provide hotkey support and a path toward mobile use.

### Folder Notes compatibility

Folder Notes is a soft integration, not a required dependency.

The plugin must:

- Preserve Folder Notes DOM behavior and CSS classes
- Sort underlying vault and explorer items rather than only rendered DOM elements
- Avoid assuming folder notes always use `Folder/Folder.md`
- Use a narrow adapter to read Folder Notes settings when it is enabled
- Respect configured storage modes and naming conventions

When the active file is a folder note, collapsing to the current path collapses folders outside the associated folder's path while preserving the current expansion state of the associated folder's entire subtree.

If Folder Notes is unavailable or its settings cannot be understood, the file receives ordinary note behavior.

### Toolbar

The file explorer toolbar contains three plugin controls:

1. Reveal hidden items
2. Locate current file
3. Force global sorting

Commands remain available separately, including an explicit collapse command.

### Accessibility

- Move-pinned-item commands must remain available in the command palette and support user-assigned hotkeys.
- Move commands must report when there is no unambiguous selected or focused pinned item, or when the item cannot move farther.
- Toolbar toggles must expose pressed state and meaningful tooltips.
- Hidden state must not be conveyed through opacity alone.
- Reordering and locating items must preserve useful keyboard focus.

## Architecture

```text
src/
  main.ts
  settings.ts

  commands/
    register.ts

  explorer/
    adapter.ts
    adapter-types.ts
    controller.ts
    leaf-state.ts
    toolbar.ts

  hiding/
    hidden-items.ts
    hidden-items.test.ts

  sorting/
    comparator.ts
    comparator.test.ts
    order.ts
    order.test.ts
    pinned-items.ts

  navigation/
    locate-current-file.ts
    collapse-to-path.ts
    path-state.test.ts

  integrations/
    folder-notes.ts
    folder-notes.test.ts

  ui/
    settings-tab.ts
    icons.ts

  testing/
    explorer-fakes.ts
    vault-fakes.ts
```

The exact file boundaries may change as implementation reveals natural module boundaries. `main.ts` must remain focused on plugin lifecycle.

### Plugin lifecycle

`main.ts` is responsible for:

- Loading settings
- Constructing the explorer controller
- Registering commands and menus
- Attaching to existing and subsequently created explorer leaves
- Disposing resources on unload

Feature logic belongs in focused modules.

### Explorer adapter

The explorer adapter is the only module allowed to access undocumented explorer structures. It is responsible for:

- Obtaining file explorer leaves
- Reading tree items by path
- Invoking the original explorer sorting method
- Applying the custom comparator
- Expanding and collapsing folders
- Scrolling to and selecting items
- Adding view toolbar actions
- Detecting explorer rerenders
- Exposing capabilities rather than private fields to feature code

Feature modules must not contain explorer DOM selectors or access fields such as `fileItems` directly.

### Sorting engine

The sorting engine is a pure, testable comparator.

When force-global sorting is disabled, comparison proceeds as follows:

1. Compare pinned-item positions.
2. Place pinned items before ordinary items.
3. Apply the effective normal sort mode:
   - The folder override, if configured
   - Otherwise the global core sort mode
4. Apply global type grouping.
5. Use path or name as a deterministic final tie-breaker.

When force-global sorting is enabled, pinned-item positions and folder overrides are skipped.

The explorer's original sorted list may provide core-compatible metadata ordering, but the plugin must not implement sorting by merely rearranging rendered DOM nodes. The comparator must act on underlying explorer child items.

### Leaf state

Session-only state is keyed by explorer leaf:

```ts
interface ExplorerLeafState {
	showHidden: boolean;
	temporaryVisiblePaths: Set<string>;
}
```

Force-global sorting remains controller-level session state because it is shared across leaves.

### Folder Notes adapter

Folder Notes integration is feature-detected behind a narrow interface:

```ts
interface FolderNoteIntegration {
	getAssociatedFolderPath(file: TFile): string | null;
}
```

The rest of the plugin does not know how Folder Notes stores or identifies its notes.

## Persisted data

Paths are vault-relative and migrated during rename events.

```ts
interface FileExplorerToolsSettings {
	schemaVersion: 1;
	mixFilesAndFolders: boolean;
	hiddenPaths: string[];
	folders: Record<string, FolderConfiguration>;
}

interface FolderConfiguration {
	sortMode?: SortMode;
	orderedPrefix: string[];
}
```

`orderedPrefix` stores child names under the parent folder rather than absolute paths. Vault siblings cannot share a name, and parent-folder renames therefore do not require rewriting prefix entries.

Obsidian's core explorer remains the source of truth for the global sort mode. The plugin persists only its folder-grouping preference, hidden paths, pinned items, and per-folder overrides.

Settings are validated and normalized after `loadData()`:

- Migrations run according to `schemaVersion` and are tested independently.
- Unknown fields are safely ignored or preserved when needed for forward compatibility.
- Invalid paths and prefix entries are removed during reconciliation with the vault.
- Duplicate prefix entries are deduplicated while preserving their first occurrence.
- Malformed values fall back to defaults without preventing plugin load.

### Vault event handling

On rename:

- Move matching hidden path entries
- Move folder configuration keys
- Update the renamed child in its parent's prefix
- Update descendant configuration keys when a folder moves

On delete:

- Remove matching hidden entries
- Remove matching folder configuration and descendant entries
- Remove the child from its parent's prefix

On create:

- Leave the item in the normally sorted remainder

## Implementation plan

### Phase 1: Project foundation

Status: Implemented in PR #5.

- Rename template metadata and classes
- Add Vitest using the daily-note-navigator tooling pattern
- Split sample code into focused modules
- Add settings persistence and migration scaffolding
- Establish pure vault and explorer fakes

### Phase 2: Explorer compatibility probe

Status: Implemented and manually verified against Obsidian 1.13.7.

Before building features, create a minimal adapter and verify it against the test vault:

- Attach actions to the explorer toolbar
- Enumerate tree items
- Observe rerenders
- Read the active core sort mode
- Call the original sorting operation
- Expand, collapse, select, and scroll to a path

This phase must fail clearly if the installed Obsidian version has incompatible internals.

The Obsidian 1.13.7 probe found that the file explorer extends `View` rather than `ItemView`, so it does not expose `addAction()`. Toolbar actions use the explorer's guarded `headerDom.addNavButton()` capability.

#### Verified Obsidian 1.13.7 internals

The compatibility probe established the following implementation details. They remain undocumented assumptions and must be accessed only through the explorer adapter:

- Explorer items are stored in `view.fileItems`, keyed by vault-relative path.
- The current core sort mode is stored in `view.sortOrder` using `alphabetical`, `alphabeticalReverse`, `byModifiedTime`, `byModifiedTimeReverse`, `byCreatedTime`, or `byCreatedTimeReverse`.
- `view.sort()` performs the native sorting operation.
- `view.getSortedFolderItems(folder)` orders underlying explorer children rather than only rearranging rendered DOM elements.
- Folder items expose their state through `collapsed` and change it through `setCollapsed(collapsed, persist)`.
- Selection uses `tree.clearSelectedDoms()`, `tree.selectItem(item)`, and `tree.setFocusedItem(item, scroll)`.
- Virtualized scrolling uses `tree.infinityScroll.scrollIntoView(item, padding)`.
- Explorer content renders beneath `view.navFileContainerEl`, whose subtree mutations reveal rerenders.
- Explorer toolbar controls are registered through `view.headerDom.addNavButton()`.

### Phase 3: Sorting engine

Status: Implemented and manually verified against Obsidian 1.13.7.

- Implement and comprehensively test pure comparators
- Add mixed and folders-first behavior
- Add per-folder overrides
- Implement pinned-item persistence
- Implement force-global session mode
- Wire core sort menu state into the plugin's global mode

### Phase 4: Hiding

Status: Implemented and manually verified against Obsidian 1.13.7. Multiple explorer leaves could not be manually tested because Obsidian does not expose a supported way to open more than one built-in file explorer leaf.

- Add context-menu actions
- Apply hidden state to explorer items
- Add per-leaf reveal mode
- Add dimmed display and hidden marker
- Handle rerenders, creation, deletion, and rename
- Add temporary path visibility for locate behavior

### Phase 5: Navigation

Status: Implemented and manually verified against Obsidian 1.13.7.

- Implement locate-current-file
- Detect visible and selected state
- Implement the second-click rule
- Collapse unrelated folders
- Add explicit commands
- Verify behavior with multiple explorer leaves

### Phase 6: Folder Notes integration

Status: Implemented and manually verified with Folder Notes 1.8.26.

The guarded integration reads the enabled `folder-notes` plugin's `folderNoteName` and `storageLocation` settings. It supports current `insideFolder` and `parentFolder` storage modes, fixed inside-folder names, and names containing one `{{folder_name}}` marker. Associations are accepted only when the derived folder exists. Unsupported or malformed settings fall back to ordinary note behavior. Folder Notes explorer items may expose `selfEl` or `titleEl` rather than `el`; the explorer adapter supports all three fields.

- Read Folder Notes settings through a guarded adapter
- Support its naming and storage modes
- Preserve its DOM classes and patches
- Implement associated-subtree preservation
- Test enabled, disabled, and incompatible-plugin cases

### Phase 7: Pinned-item interaction

Status: Implemented and manually verified against Obsidian 1.13.7 with Folder Notes 1.8.26.

Pinned items use a compact postfix status marker and direct **Pin** or **Unpin** context-menu actions. Desktop reordering uses the explorer row's native drag source. Capture-phase handlers intercept only same-parent reorder and unpin zones, while folder-center, cross-folder, and blank-space drops continue to Obsidian's native move handlers. A folder's after-position and indicator sit below its expanded subtree, and custom before/after zones suppress Obsidian's native hover expansion. Force-global sorting keeps pin markers visible but disables custom drops and move commands.

- Add direct Pin and Unpin context-menu controls
- Render postfix pin status markers without changing row dimensions
- Reorder pinned siblings through top and bottom drop zones
- Unpin through same-parent ordinary-item drops
- Preserve native drag-to-move behavior for folder and cross-parent targets
- Add move-up and move-down commands for keyboard access
- Add touch dragging during the mobile milestone without changing persisted data

### Phase 8: Desktop hardening

Status: In progress. Automated hardening is complete; the manual Obsidian verification pass remains.

- Test vault create, delete, rename, and cross-folder moves
- Test plugin reload and unload for leaked patches or listeners
- Test multiple explorer leaves
- Test alongside Folder Notes
- Test hidden prefix entries
- Test core sort changes during forced mode
- Run build, lint, tests, and manual Obsidian checks with pristine output

## Testing strategy

Pure functionality should be tested without an Obsidian runtime wherever possible. Tests should cover:

- Every comparator mode and direction
- Mixed and folders-first behavior
- Pinned-item precedence
- Deterministic tie-breaking
- Force-global behavior
- Settings migration on file and folder rename
- Settings cleanup on deletion
- Hidden path handling
- Temporary visibility rules
- Collapse path calculation
- Folder Notes path mapping

Explorer adapter tests should use narrow fakes matching the undocumented structures the adapter expects. Manual tests in the linked vault are still required for DOM behavior, toolbar placement, explorer rerenders, native drag and drop, and compatibility with Folder Notes.

Obsidian 1.13.7 exposes the core file explorer as a singleton through its user interface. Multi-leaf controller behavior is covered with adapter tests, but cannot be reproduced through a supported manual layout. Toolbar actions target the explorer leaf that owns the control, while commands operate on every attached explorer leaf.

Test output must be clean. Expected errors from compatibility tests must be captured and asserted.

## Phase completion criteria

Every implementation phase must meet these criteria before it is considered complete:

- Build, lint, and tests pass with clean output.
- New pure behavior has comprehensive unit tests.
- Undocumented explorer API assumptions remain confined to the adapter.
- No generated artifacts are committed.
- Plugin unload leaves no listeners, observers, DOM elements, or patches behind.
- Relevant behavior is manually verified in the linked test vault.
- This document is updated if implementation discoveries change an agreed contract.
- The phase ends in a reviewable commit or pull request.

## Research notes

- Phase 8 automated hardening added plugin lifecycle and vault-event wiring coverage, fixed initialization continuing after unload during an initial settings save, and added regression coverage for repeated explorer layout changes, per-leaf reveal state, hidden pinned-item moves, and core sort changes during force-global mode. Build, lint, and 151 tests pass with clean output. Manual Obsidian verification remains.
- Phase 8 manual vault-mutation verification covered creation, file and folder renames, cross-folder moves, deletion and path reuse, hidden pinned entries, nested folder overrides, persistence across reload, and cleanup of deleted configuration. All checks passed with clean console output.
- Phase 7 manual verification covered root and nested pinning, direct Pin and Unpin menus, postfix marker layout, command-palette movement and notices, force-global behavior, expanded and collapsed folder boundaries, native expansion suppression, drag-to-unpin, native folder moves with retained pin state, Folder Notes click behavior, and clean console output.
- Flexplorer 4.0.5 uses native desktop drag events, capture-phase drop handling, pointer proximity for sibling insertion, a center folder drop zone, and a postfix pin indicator. It prevents every drop and performs moves through `fileManager.renameFile()`. File Explorer Tools adopts the narrow event and drop-zone observations but intercepts only same-parent pin operations so Obsidian remains responsible for native folder and vault-root moves.
- Obsidian 1.13.7 exposes the built-in explorer as a singleton, so multi-leaf behavior is covered by adapter tests but not manual verification.
- Follow-up research found no supported user-interface action for opening a second built-in file explorer. Obsidian core requests `getLeavesOfType("file-explorer")` and uses the first result, creating a left-sidebar leaf with `setViewState({ type: "file-explorer" })` only when none exists. A plugin can attempt to assign the view type to another leaf, but coexistence and workspace persistence for multiple built-in explorers are undocumented and unverified.
- Folder Notes stores notes using `storageLocation: 'insideFolder'` or `storageLocation: 'parentFolder'` and derives names from `folderNoteName`, commonly `{{folder_name}}`. Its source retains a `vaultFolder` settings value that is absent from the current settings UI and cannot unambiguously associate nested folders, so the integration fails open for that value.
- Folder Notes supports fixed note names when notes are stored inside their associated folders. Parent-folder storage requires a `{{folder_name}}` marker to derive the adjacent folder.
- Folder Notes decorates explorer entries through `fileItems[path].selfEl` or `titleEl` and uses classes including `has-folder-note` and `is-folder-note`. File Explorer Tools preserves these classes by changing only its own classes.
- Manual Folder Notes verification covered adjacent and fixed-name inside-folder notes, temporary reveal of hidden associated folders, associated-subtree preservation, unrelated-folder collapse, click-to-open behavior, and clean console output.
- Folder Notes 1.8.26 does not reliably restore click-to-open behavior when it is disabled and re-enabled in an already-open vault. The issue begins when Folder Notes alone is toggled, persists after File Explorer Tools is disabled, and clears after restarting the vault.
- Manual verification covered hiding, reveal styling, rerenders, vault changes, persistence, Folder Notes adjacent notes, plugin reload/disable, and console cleanliness.
- Navigation verification covered hidden-path reveal, ancestor expansion, selection, centered scrolling, second-click collapse, off-screen relocalization, explicit collapse commands, Folder Notes subtree preservation, command-driven reveal mode, and toolbar cleanup across disable and re-enable.

## Risks and mitigations

### Obsidian internal API changes

The built-in explorer may change without a plugin API deprecation cycle.

Mitigations:

- One isolated adapter
- Runtime capability detection
- Narrow local interfaces
- Clear compatibility errors
- Manual testing against supported Obsidian versions

### Plugin patch conflicts

Folder Notes and other explorer plugins patch some of the same structures.

Mitigations:

- Chain existing functions rather than replacing them blindly
- Restore only this plugin's own patches
- Avoid global prototype patches
- Preserve classes owned by other plugins
- Document that Flexplorer must not be enabled simultaneously because both plugins own sorting and hiding

### Explorer virtualization

DOM absence does not prove that a file is hidden or a folder is collapsed.

Mitigations:

- Use the explorer model for sorting and state decisions
- Use DOM access only for presentation, visibility checks, interaction handles, and scrolling

### Core sort synchronization

The core sort menu has no documented event contract.

Mitigations:

- Validate the narrowest reliable observation or interception mechanism during the compatibility probe
- Keep core sort integration in the explorer adapter
- Avoid global menu interception

### Mobile toolbar and dragging

Toolbar layout and drag behavior differ on mobile. Desktop HTML drag events do not provide the required touch interaction.

Mitigations:

- Expose all actions as commands
- Keep pin state and ordering independent of the input implementation
- Avoid modifier-key interactions
- Avoid hover-dependent controls
- Add and test an explicit touch gesture on iOS and Android during the mobile milestone

## Delivery scope

The first daily-use milestone includes all desktop features described in this document:

- Hiding and temporary reveal
- Mixed sorting
- Global and per-folder sort modes
- Pinned items
- Force-global sorting
- Locate and collapse behavior
- Commands and toolbar controls
- Settings persistence
- Folder Notes compatibility
- Automated tests and manual test-vault verification

Mobile support follows in the second version, without requiring a redesign of persisted data or core interactions.
