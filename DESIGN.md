# File Explorer Tools design

## Overview

File Explorer Tools extends Obsidian's built-in file explorer with:

- Per-item hiding and a temporary reveal control
- Mixed file and folder sorting
- Per-folder sort overrides
- Ordered prefixes with normally sorted remainders
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

Hiding an ordered-prefix item retains its stored position. A hidden folder and its descendants retain independent hidden states.

Locating a hidden file temporarily reveals only the target and hidden ancestors needed to reach it. Temporary visibility ends when the workspace active file changes, reveal-hidden mode changes for that explorer leaf, or the plugin unloads. Moving focus to another pane without changing the active file does not conceal the located path.

### Sorting

The default sort is name ascending with files and folders mixed.

The initial normal sort modes are:

- Name ascending and descending
- Modified time ascending and descending
- Created time ascending and descending

The existing core explorer sort menu selects the global sort mode.

Files and folders can be globally configured as either mixed or folders first. In time-based modes, folders are grouped first and always sorted by name ascending because Obsidian does not expose reliable folder timestamps.

A folder context menu can select a per-folder sort override or return the folder to **Use global**. Overrides are available for every folder, including the vault root.

### Ordered prefixes

Each folder can define an ordered prefix. Items not in the prefix continue to use the folder's effective normal sort.

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

Only prefix items have stored positions.

Prefix membership is managed through item context menus. Prefix items are rearranged using a dedicated drag handle. Dragging elsewhere retains Obsidian's native move behavior. The handle must also be suitable as a touch target for later mobile support.

Prefix entries survive temporary hiding and temporary global sorting.

### Force-global sorting

A file explorer toolbar toggle temporarily ignores:

- Ordered prefixes
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

- Reorder handles must be keyboard-focusable and expose accessible labels identifying their items.
- Context menus must provide move-up and move-down actions as non-drag alternatives for ordered-prefix items.
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
    prefix-controller.ts

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

1. Compare ordered-prefix positions.
2. Place items with prefix positions before ordinary items.
3. Apply the effective normal sort mode:
   - The folder override, if configured
   - Otherwise the global core sort mode
4. Apply global type grouping.
5. Use path or name as a deterministic final tie-breaker.

When force-global sorting is enabled, ordered-prefix positions and folder overrides are skipped.

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
	getAssociatedFolder(file: TFile): TFolder | null;
}
```

The rest of the plugin does not know how Folder Notes stores or identifies its notes.

## Persisted data

Paths are vault-relative and migrated during rename events.

```ts
interface FileExplorerToolsSettings {
	schemaVersion: 1;
	groupFoldersFirst: boolean;
	hiddenPaths: string[];
	folders: Record<string, FolderConfiguration>;
}

interface FolderConfiguration {
	sortMode?: SortMode;
	orderedPrefix: string[];
}
```

`orderedPrefix` stores child names under the parent folder rather than absolute paths. Vault siblings cannot share a name, and parent-folder renames therefore do not require rewriting prefix entries.

Obsidian's core explorer remains the source of truth for the global sort mode. The plugin persists only its folder-grouping preference, hidden paths, ordered prefixes, and per-folder overrides.

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

- Implement and comprehensively test pure comparators
- Add mixed and folders-first behavior
- Add per-folder overrides
- Implement ordered-prefix persistence
- Implement force-global session mode
- Wire core sort menu state into the plugin's global mode

### Phase 4: Hiding

- Add context-menu actions
- Apply hidden state to explorer items
- Add per-leaf reveal mode
- Add dimmed display and hidden marker
- Handle rerenders, creation, deletion, and rename
- Add temporary path visibility for locate behavior

### Phase 5: Navigation

- Implement locate-current-file
- Detect visible and selected state
- Implement the second-click rule
- Collapse unrelated folders
- Add explicit commands
- Verify behavior with multiple explorer leaves

### Phase 6: Folder Notes integration

- Read Folder Notes settings through a guarded adapter
- Support its naming and storage modes
- Preserve its DOM classes and patches
- Implement associated-subtree preservation
- Test enabled, disabled, and incompatible-plugin cases

### Phase 7: Ordered-prefix interaction

- Add context-menu prefix controls
- Render dedicated drag handles
- Reorder only within a single parent
- Preserve native drag-to-move behavior
- Keep the interaction touch-compatible for the later mobile milestone

### Phase 8: Desktop hardening

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
- Ordered-prefix precedence
- Deterministic tie-breaking
- Force-global behavior
- Settings migration on file and folder rename
- Settings cleanup on deletion
- Hidden path handling
- Temporary visibility rules
- Collapse path calculation
- Folder Notes path mapping

Explorer adapter tests should use narrow fakes matching the undocumented structures the adapter expects. Manual tests in the linked vault are still required for DOM behavior, toolbar placement, explorer rerenders, native drag and drop, and compatibility with Folder Notes.

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

Toolbar layout and drag behavior differ on mobile.

Mitigations:

- Expose all actions as commands
- Use a dedicated reorder handle
- Avoid modifier-key interactions
- Avoid hover-dependent controls
- Test explicitly on iOS and Android during the mobile milestone

## Delivery scope

The first daily-use milestone includes all desktop features described in this document:

- Hiding and temporary reveal
- Mixed sorting
- Global and per-folder sort modes
- Ordered prefixes
- Force-global sorting
- Locate and collapse behavior
- Commands and toolbar controls
- Settings persistence
- Folder Notes compatibility
- Automated tests and manual test-vault verification

Mobile support follows in the second version, without requiring a redesign of persisted data or core interactions.
