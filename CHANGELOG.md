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

## 0.0.1
- Initial project setup with isometric grid, brush/eraser, export

