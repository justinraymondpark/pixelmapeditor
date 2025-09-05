## 0.2.8
- Fixed hover CPU spike issue:
  - Completely removed the continuous animation loop
  - No more requestAnimationFrame running 60 times per second
  - Canvas only redraws on actual events (hover change, paint, pan, zoom)
  - Reduced hover update rate from 60fps to 20fps (50ms throttle)
  - CPU usage should now be near 0% when idle

## 0.2.7
- Critical performance fix for painting/drawing operations:
  - Batched cell updates during mouse drag (no more state updates per pixel)
  - Pending changes are held in memory and only committed on mouse up
  - Canvas redraws from pending state without React re-renders
  - Eliminated 200% CPU usage spike during drawing
  - Drawing is now smooth and responsive even with complex brushes

## 0.2.6
- Major performance improvements to reduce CPU and memory usage:
  - Changed from continuous animation loop to on-demand rendering
  - Removed React state updates on mouse move (eliminated re-renders)
  - Added throttling for hover updates (16ms minimum interval)
  - Implemented cache size limit (500 tiles) to prevent memory leaks
  - Canvas now uses opaque context for better performance
  - Background fill instead of clearRect for faster redraws
- Canvas only redraws when content actually changes
- Mouse hover no longer triggers React re-renders

## 0.0.2
- Add hover highlight for tile under cursor
- Fix cursor-to-tile mapping using canvas bounding rect and rounding
- Clear hover preview on mouse leave

## 0.0.3
- Add 32x32 Tile Editor (Add/Edit) modal with brush/eraser and clear
- Render tile thumbnails in toolbar and allow selecting tiles to paint
- Draw tile bitmaps on isometric grid with pixel-perfect scaling
- Persist custom tiles per tileset in localStorage
- Export JSON now includes board cell refs to tiles and embedded tilesets

## 0.0.4
- Tile Editor: multi-tileset panel inside modal (switch sets, edit/add)
- Rich editor palette + color picker
- Cloud Save/Load via Netlify Functions + Blobs (by Project ID)

## 0.0.5
- Fix Netlify Blobs set options, add Node 18 runtime and esbuild bundler
- Better client error messages for Save/Load

## 0.0.6
- Convert Netlify functions to ESM imports/exports; bundle @netlify/blobs

## 0.0.7
- Initialize Netlify Blobs in functions via connectLambda(event) to fix MissingBlobsEnvironmentError

## 0.0.8
- Add list-projects function and Load Cloud modal with dropdown of saves
- Load now uses selection from modal (also fills Project ID)

## 0.1.0
- Add tiles sidebar with grid of tiles and group filter
- Add auto-tiling metadata (group + 4-dir mask) to tiles
- Editor supports setting group/mask; stored in localStorage/export
- UI toggle for future auto-tiling workflow (logic skeleton in place)
  - Add toolbar toggle to show/hide tiles sidebar

## 0.1.1
- Add variable tile sizes selector (8–64) for editor
- Add Generate Demo tiles button to quickly populate an auto-tiling set

## 0.1.2
- Add tileset import modal (file input, size, margin, spacing, group)
- Implement spritesheet slicing to populate current tileset

## 0.0.1
- Initial project setup with isometric grid, brush/eraser, export

## 0.1.3
- Fix white screen when switching to new/custom sets (init maps)
- Tiles sidebar Cols +/- controls mirrored in Auto-tiling Setup
- Auto-tiling Setup 3x3 cells scale with Zoom; no indentation
- Auto-tiling Setup tile picker mirrors sidebar batch rows/cols

## 0.1.4
- Move tileset selector and Add Set into sidebar header
- Remove redundant top-bar tile strip to reduce clutter

## 0.2.0
- Layers: add Layers panel (visible/lock/opacity/add/delete/reorder/rename)
- Tools now operate per active layer; Clear affects active layer only
- Fill tool (F) and Alt-eyedropper; B/E/F hotkeys added
- Sidebar header adds "None" button for solid-color painting
- Export/Import/LocalStorage updated to support layers (backwards compatible)

## 0.2.1
- Tile metadata: name/tags with localStorage; search box in sidebar
- Randomize brush toggle uses current filters to pick variants
- Status bar shows tool, active layer and tile coordinates

## 0.2.2
- Responsive UI: clamp() widths for sidebars; statusbar/toolbar measured heights
- Canvas auto-margins from live panel widths; sidebar header wraps
- Prevent overflow and overlap across common viewport sizes

## 0.2.3
- Stamp Library: save/use/delete stamps; persisted and exported
- Layer Properties: key/value per layer; persisted and exported

## 0.2.4
- Undo/Redo with Ctrl/Cmd+Z / Shift+Cmd+Z / Ctrl+Y; toolbar buttons
- Stamp transforms: Flip X/Y and rotate 0/90/180/270 while stamping

