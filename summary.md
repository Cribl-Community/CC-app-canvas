# Plan: Manual Build Button + Error Panel in Editor

## Goal
Replace the live-on-every-keystroke rebuild with an explicit **Build** button in the editor
toolbar. Build errors appear in a dedicated panel below the Monaco editor instead of
overlaying the preview iframe.

---

## How it works today
- `handleFileChange` in `App.tsx` calls `setPreviewTrigger(t => t + 1)` on every keystroke
- `PreviewPanel` watches `trigger`, runs `bundleFiles()` on every change, and shows errors
  inside the preview pane

---

## Proposed changes

### 1 · `App.tsx`
- Remove `setPreviewTrigger(t => t + 1)` from `handleFileChange` so typing no longer auto-builds
- Add `buildError` state (`string`)
- Pass `onBuild` (increments `previewTrigger`) and `buildError` down to `EditorPanel`
- Add `onBuildResult` prop handler to receive build outcome from `PreviewPanel` and update `buildError`

### 2 · `src/components/Preview/PreviewPanel.tsx`
- Add `onBuildResult?: (error: string) => void` prop
- After `bundleFiles()` resolves, call `onBuildResult('')` on success or `onBuildResult(errorMsg)` on failure
- Keep the inline preview-error overlay for runtime errors, but remove the static build-error
  panel from the preview pane (errors now live in the editor pane)

### 3 · `src/components/Editor/EditorPanel.tsx`
- Add `onBuild: () => void` and `buildError: string` props
- Add a **▶ Build** button to the editor tab-bar toolbar
- Below the Monaco editor, render a collapsible `<pre>` error panel when `buildError` is non-empty
  (styled like the existing preview-error — dark background, red text)
- Show a green checkmark / "Built" badge briefly after a successful build (clears after 3 s)

### 4 · `src/App.css`
- Add styles for `.editor-error-panel` (below the editor, dark bg, monospace, scrollable)
- Add styles for `.build-btn` (slightly more prominent than a regular icon button)

---

## Task list
1. Update `App.tsx` — remove auto-trigger, add `buildError` state, wire props
2. Update `PreviewPanel.tsx` — add `onBuildResult` callback
3. Update `EditorPanel.tsx` — add Build button + error panel
4. Update `App.css` — add error panel and build button styles
