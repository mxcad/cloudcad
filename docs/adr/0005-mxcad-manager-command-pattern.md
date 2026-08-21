# Deepen mxcadManager god module with Command pattern
**Status**: accepted

`mxcadManager/index.ts` (2970 lines, 88 imports) is a god module mixing command registration, file operations, navigation, collaboration exit, and module-level mutable state. Deepen it with a Command pattern: each command extracted behind a `Command` interface, registered via a `CommandRegistry`, callers and CAD engine cross the same seam.

**Considered Options**

1. **Full extraction at once** — extract all commands (Mx_Save, Mx_NewFile, openFile, exportFile, Mx_ExportPDF, Mx_ExportDWG, Mx_ExportDXF, Mx_SaveAsMxWeb, Mx_SaveToCloud, Mx_SaveAsToCloud) in one pass. Rejected: too risky — 2970 lines with implicit interdependencies makes it impossible to validate correctness mid-flight.

2. **Pilot-then-migrate with thin CommandContext (chosen)** — start with ExportPDF (lowest coupling), validate the pattern, then migrate remaining commands one by one. A fat `CommandContext` carries runtime dependencies (`saveDrawingToBlob`, current file info) so each command is testable without the CAD engine.

3. **Pilot with thin CommandContext** — commands import utilities directly. Rejected: forces tests to mock `MxCpp` through the import graph; the context seam would be useless.

4. **Stateful commands with Zustand store** — each command is a Zustand action. Rejected: commands execute imperatively on CAD engine callbacks, not on React renders — Zustand adds indirection without benefit.

**Decisions**

| Decision | Choice |
|----------|--------|
| Scope | Pilot ExportPDF → one-by-one migration |
| Interface | `Command { name, execute(ctx: CommandContext): Promise<Result> }` |
| Context | Fat — includes `saveDrawingToBlob` and file info |
| Registry | Plain module (`CommandRegistry`), not Zustand or React Context |
| Registration | `registerAllCommands()` in `cmd/index.ts`, batch-registers to both `CommandRegistry` and `MxFun.addCommand` |
| Module state | Per-command state → `CommandContext`; global state → Zustand (useCADEditorStore) |
| Duplicated functions | Extract shared helpers to `mxcadHelpers.ts` |
| Testing | Commands return `Result`, caller dispatches side effects (CustomEvent, download dialog) |

**Seam placement**: `CommandRegistry` is a plain module (no framework). The seam is at `registry.execute(name, ctx)` — tests inject a mock `saveDrawingToBlob` in `ctx`, verify the `Result` object, and assert nothing else. The CAD engine (`MxCpp`) is never called in unit tests.

**Consequences**

- `mxcadManager/index.ts` shrinks from 2970 lines to a thin assembly layer (~200 lines) that only registers commands and wires context.
- Each command is a standalone file in `cmd/` (100–300 lines, 5–15 imports), independently unit-testable.
- Module-level mutable state (`pendingImages`, `projectPermsCache`, `isLeavingPageRef`, etc.) is either migrated to `CommandContext` (per-command) or moved to `useCADEditorStore` (global).
- `mxcadManagerCore.ts`'s duplicate functions are eliminated by extracting `mxcadHelpers.ts`.
- New commands require no change to `index.ts` — just a new file + registration in `registerAllCommands()`.
- Contradicts no existing ADR. Complements ADR-0002's extraction pattern at the module level.
