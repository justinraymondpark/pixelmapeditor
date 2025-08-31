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

