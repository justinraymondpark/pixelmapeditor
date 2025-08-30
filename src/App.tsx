import React, { useEffect, useRef, useState } from 'react';

const tileW = 64;
const tileH = 32;

const tileSets = {
  grassland: ['#6abe30','#378b29','#2f7a24','#23671b'],
  desert: ['#e0c08f','#d0a060','#c09048','#b08038'],
  swamp: ['#4f704d','#42633f','#365432','#2a4626'],
  cyberpunk: ['#00ffff','#ff00ff','#ffff00','#00aaff']
} as const;

type TileSetName = keyof typeof tileSets;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  type BoardCell = { color?: string; tileSet?: TileSetName; tileIndex?: number };
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [tileSet, setTileSet] = useState<TileSetName>('grassland');
  const [colorIndex, setColorIndex] = useState(0);
  const [grid, setGrid] = useState(true);
  const [board, setBoard] = useState<Map<string, BoardCell>>(new Map());
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const isPanningRef = useRef(false);
  const lastPanPosRef = useRef({ x: 0, y: 0 });
  const hoveredTileRef = useRef<{ i: number; j: number } | null>(null);
  const [projectId, setProjectId] = useState('');

  // Tile bitmaps per tileset
  type TileBitmap = { id: string; size: number; pixels: (string | null)[] };
  const emptyTilesBySet = (): Record<TileSetName, TileBitmap[]> => ({
    grassland: [],
    desert: [],
    swamp: [],
    cyberpunk: []
  });
  const [tilesBySet, setTilesBySet] = useState<Record<TileSetName, TileBitmap[]>>(emptyTilesBySet());
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);
  const offscreenCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Pixel editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'add' | 'edit'>('add');
  const [editorActiveSet, setEditorActiveSet] = useState<TileSetName>('grassland');
  const editorCanvasRef = useRef<HTMLCanvasElement>(null);
  const editorDrawingRef = useRef(false);
  const editorToolRef = useRef<'brush' | 'eraser'>('brush');
  const editorTileSize = 32;
  const [editorPixels, setEditorPixels] = useState<(string | null)[]>(Array(editorTileSize * editorTileSize).fill(null));
  const [editorWorkingIndex, setEditorWorkingIndex] = useState<number | null>(null);
  const editorPalette: string[] = [
    '#000000','#222222','#444444','#666666','#888888','#aaaaaa','#cccccc','#ffffff',
    '#ff0000','#ff7f7f','#990000','#7f0000','#ff6600','#ffbb99','#cc5200','#663300',
    '#ffff00','#ffff99','#cccc00','#999900','#00ff00','#99ff99','#009900','#006600',
    '#00ffff','#99ffff','#00cccc','#009999','#0000ff','#9999ff','#000099','#000066',
    '#ff00ff','#ff99ff','#cc00cc','#990099','#ff1493','#ffa07a','#ffd700','#8a2be2',
    '#00fa9a','#7fffd4','#20b2aa','#ff8c00','#b8860b','#cd5c5c','#2e8b57','#708090'
  ];
  const [editorColor, setEditorColor] = useState<string>('#000000');

  // Local storage hydration for tiles
  useEffect(() => {
    try {
      const raw = localStorage.getItem('pixelmapeditor.tiles');
      if (raw) {
        const parsed: Record<string, { size: number; pixels: (string | null)[] }[]> = JSON.parse(raw);
        const rebuilt = emptyTilesBySet();
        (Object.keys(rebuilt) as TileSetName[]).forEach(setName => {
          const arr = parsed[setName] || [];
          rebuilt[setName] = arr.map((t, idx) => ({ id: `${setName}-${Date.now()}-${idx}`, size: t.size, pixels: t.pixels }));
        });
        setTilesBySet(rebuilt);
        setEditorActiveSet('grassland');
      }
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    const toStore: Record<string, { size: number; pixels: (string | null)[] }[]> = {};
    (Object.keys(tilesBySet) as TileSetName[]).forEach(setName => {
      toStore[setName] = tilesBySet[setName].map(t => ({ size: t.size, pixels: t.pixels }));
    });
    try { localStorage.setItem('pixelmapeditor.tiles', JSON.stringify(toStore)); } catch {}
  }, [tilesBySet]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animationId: number;

    function draw() {
      const width = canvas.width = canvas.clientWidth;
      const height = canvas.height = canvas.clientHeight;
      ctx.clearRect(0,0,width,height);

      ctx.save();
      ctx.translate(width / 2, height / 2);
      ctx.scale(scaleRef.current, scaleRef.current);
      ctx.translate(offsetRef.current.x, offsetRef.current.y);

      if (grid) {
        const range = 50;
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.lineWidth = 1 / scaleRef.current;
        for (let i = -range; i <= range; i++) {
          for (let j = -range; j <= range; j++) {
            const pos = isoToScreen(i,j);
            ctx.beginPath();
            ctx.moveTo(pos.x, pos.y - tileH/2);
            ctx.lineTo(pos.x + tileW/2, pos.y);
            ctx.lineTo(pos.x, pos.y + tileH/2);
            ctx.lineTo(pos.x - tileW/2, pos.y);
            ctx.closePath();
            ctx.stroke();
          }
        }
      }

      board.forEach((cell, key) => {
        const [iStr, jStr] = key.split(',');
        const i = parseInt(iStr, 10);
        const j = parseInt(jStr, 10);
        const pos = isoToScreen(i,j);
        if (cell.tileSet !== undefined && cell.tileIndex !== undefined) {
          drawTileBitmapAt(ctx, cell.tileSet, cell.tileIndex, pos.x, pos.y);
        } else if (cell.color) {
          ctx.fillStyle = cell.color;
          ctx.beginPath();
          ctx.moveTo(pos.x, pos.y - tileH/2);
          ctx.lineTo(pos.x + tileW/2, pos.y);
          ctx.lineTo(pos.x, pos.y + tileH/2);
          ctx.lineTo(pos.x - tileW/2, pos.y);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.2)';
          ctx.lineWidth = 1 / scaleRef.current;
          ctx.stroke();
        }
      });

      // Hover highlight
      if (hoveredTileRef.current) {
        const { i, j } = hoveredTileRef.current;
        const pos = isoToScreen(i, j);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y - tileH/2);
        ctx.lineTo(pos.x + tileW/2, pos.y);
        ctx.lineTo(pos.x, pos.y + tileH/2);
        ctx.lineTo(pos.x - tileW/2, pos.y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2 / scaleRef.current;
        ctx.stroke();
      }

      ctx.restore();
      animationId = requestAnimationFrame(draw);
    }

    animationId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationId);
  }, [board, grid]);

  function isoToScreen(i: number, j: number) {
    const x = (i - j) * (tileW / 2);
    const y = (i + j) * (tileH / 2);
    return { x, y };
  }

  function screenToIso(px: number, py: number) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const localX = px - rect.left;
    const localY = py - rect.top;
    const x = (localX - canvas.clientWidth/2) / scaleRef.current - offsetRef.current.x;
    const y = (localY - canvas.clientHeight/2) / scaleRef.current - offsetRef.current.y;
    const fi = (y / (tileH/2) + x / (tileW/2)) / 2;
    const fj = (y / (tileH/2) - x / (tileW/2)) / 2;
    const i = Math.round(fi);
    const j = Math.round(fj);
    return { i, j };
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace('#','');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return { r, g, b };
  }

  function renderPixelsToCanvas(canvas: HTMLCanvasElement, pixels: (string | null)[], size: number) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const imageData = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = y * size + x;
        const base = idx * 4;
        const color = pixels[idx];
        if (!color) {
          imageData.data[base + 0] = 0;
          imageData.data[base + 1] = 0;
          imageData.data[base + 2] = 0;
          imageData.data[base + 3] = 0;
        } else {
          const { r, g, b } = hexToRgb(color);
          imageData.data[base + 0] = r;
          imageData.data[base + 1] = g;
          imageData.data[base + 2] = b;
          imageData.data[base + 3] = 255;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function getOffscreenForTile(tileSetName: TileSetName, tileIndex: number): HTMLCanvasElement | null {
    const tile = tilesBySet[tileSetName][tileIndex];
    if (!tile) return null;
    const key = `${tileSetName}:${tileIndex}:${tile.size}`;
    const cache = offscreenCacheRef.current;
    let canv = cache.get(key);
    if (!canv) {
      canv = document.createElement('canvas');
      canv.width = tile.size;
      canv.height = tile.size;
      renderPixelsToCanvas(canv, tile.pixels, tile.size);
      cache.set(key, canv);
    }
    return canv;
  }

  function invalidateTileCache(tileSetName: TileSetName, tileIndex: number) {
    const keyPrefix = `${tileSetName}:${tileIndex}:`;
    const cache = offscreenCacheRef.current;
    Array.from(cache.keys()).forEach(k => { if (k.startsWith(keyPrefix)) cache.delete(k); });
  }

  function drawTileBitmapAt(ctx: CanvasRenderingContext2D, tileSetName: TileSetName, tileIndex: number, x: number, y: number) {
    const off = getOffscreenForTile(tileSetName, tileIndex);
    if (!off) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.imageSmoothingEnabled = false;
    const S = off.width;
    const sx = tileW / (S * Math.SQRT2);
    const sy = tileH / (S * Math.SQRT2);
    ctx.scale(sx, sy);
    ctx.drawImage(off, -S/2, -S/2, S, S);
    ctx.restore();
  }

  function handleMouseDown(e: React.MouseEvent) {
    const button = e.button;
    if (button === 1) {
      isPanningRef.current = true;
      lastPanPosRef.current = { x: e.clientX, y: e.clientY };
    } else {
      const { i, j } = screenToIso(e.clientX, e.clientY);
      if (button === 2) {
        erase(i,j);
      } else {
        if (tool === 'brush') paint(i,j);
        else erase(i,j);
      }
    }
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (isPanningRef.current) {
      const dx = e.clientX - lastPanPosRef.current.x;
      const dy = e.clientY - lastPanPosRef.current.y;
      lastPanPosRef.current = { x: e.clientX, y: e.clientY };
      offsetRef.current.x += dx / scaleRef.current;
      offsetRef.current.y += dy / scaleRef.current;
    } else if (e.buttons & 1) {
      const { i, j } = screenToIso(e.clientX, e.clientY);
      if (tool === 'brush') paint(i,j);
      else erase(i,j);
    } else if (e.buttons & 2) {
      const { i, j } = screenToIso(e.clientX, e.clientY);
      erase(i,j);
    }
    // Update hover preview for all mouse moves
    const { i, j } = screenToIso(e.clientX, e.clientY);
    hoveredTileRef.current = { i, j };
  }

  function handleMouseUp(e: React.MouseEvent) {
    if (e.button === 1) {
      isPanningRef.current = false;
    }
  }

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    const delta = -e.deltaY / 500;
    const newScale = Math.min(4, Math.max(0.25, scaleRef.current * (1 + delta)));
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const worldX = (px - canvas.clientWidth/2) / scaleRef.current - offsetRef.current.x;
    const worldY = (py - canvas.clientHeight/2) / scaleRef.current - offsetRef.current.y;
    scaleRef.current = newScale;
    offsetRef.current.x = ( (px - canvas.clientWidth/2) / newScale ) - worldX;
    offsetRef.current.y = ( (py - canvas.clientHeight/2) / newScale ) - worldY;
  }

  function handleMouseLeave() {
    hoveredTileRef.current = null;
  }

  function paint(i: number, j: number) {
    const key = `${i},${j}`;
    setBoard(prev => {
      const next = new Map(prev);
      if (selectedTileIndex !== null) {
        next.set(key, { tileSet, tileIndex: selectedTileIndex });
      } else {
        const color = tileSets[tileSet][colorIndex % tileSets[tileSet].length];
        next.set(key, { color });
      }
      return next;
    });
  }

  function erase(i: number, j: number) {
    const key = `${i},${j}`;
    setBoard(prev => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }

  function openEditor(mode: 'add' | 'edit') {
    setEditorMode(mode);
    if (mode === 'edit' && selectedTileIndex !== null) {
      const tile = tilesBySet[tileSet][selectedTileIndex];
      if (tile) {
        setEditorPixels([...tile.pixels]);
        setEditorWorkingIndex(selectedTileIndex);
      }
    } else {
      setEditorPixels(Array(editorTileSize * editorTileSize).fill(null));
      setEditorWorkingIndex(null);
    }
    setEditorOpen(true);
  }

  function closeEditor() {
    setEditorOpen(false);
  }

  function handleEditorCanvasDraw() {
    const canv = editorCanvasRef.current;
    if (!canv) return;
    renderPixelsToCanvas(canv, editorPixels, editorTileSize);
  }

  useEffect(() => { if (editorOpen) handleEditorCanvasDraw(); }, [editorOpen, editorPixels]);

  function editorSetPixelAt(x: number, y: number, color: string | null) {
    if (x < 0 || y < 0 || x >= editorTileSize || y >= editorTileSize) return;
    setEditorPixels(prev => {
      const next = [...prev];
      next[y * editorTileSize + x] = color;
      return next;
    });
  }

  function handleEditorMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    editorDrawingRef.current = true;
    const canv = editorCanvasRef.current!;
    const rect = canv.getBoundingClientRect();
    const scaleX = canv.clientWidth / canv.width;
    const scaleY = canv.clientHeight / canv.height;
    const px = Math.floor((e.clientX - rect.left) / scaleX);
    const py = Math.floor((e.clientY - rect.top) / scaleY);
    const color = editorToolRef.current === 'brush' ? editorColor : null;
    editorSetPixelAt(px, py, color);
  }

  function handleEditorMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!editorDrawingRef.current) return;
    const canv = editorCanvasRef.current!;
    const rect = canv.getBoundingClientRect();
    const scaleX = canv.clientWidth / canv.width;
    const scaleY = canv.clientHeight / canv.height;
    const px = Math.floor((e.clientX - rect.left) / scaleX);
    const py = Math.floor((e.clientY - rect.top) / scaleY);
    const color = editorToolRef.current === 'brush' ? editorColor : null;
    editorSetPixelAt(px, py, color);
  }

  function handleEditorMouseUp() {
    editorDrawingRef.current = false;
  }

  function saveEditor() {
    if (editorMode === 'add') {
      const targetSet = editorActiveSet;
      const newTile: TileBitmap = { id: `${targetSet}-${Date.now()}`, size: editorTileSize, pixels: [...editorPixels] };
      setTilesBySet(prev => {
        const copy = { ...prev } as Record<TileSetName, TileBitmap[]>;
        copy[targetSet] = [...copy[targetSet], newTile];
        return copy;
      });
      if (targetSet === tileSet) setSelectedTileIndex(tilesBySet[targetSet].length);
    } else if (editorMode === 'edit' && selectedTileIndex !== null) {
      const idx = selectedTileIndex;
      setTilesBySet(prev => {
        const copy = { ...prev } as Record<TileSetName, TileBitmap[]>;
        const arr = [...copy[editorActiveSet]];
        const existing = arr[idx];
        arr[idx] = { ...existing, pixels: [...editorPixels] };
        copy[editorActiveSet] = arr;
        return copy;
      });
      invalidateTileCache(editorActiveSet, idx);
    }
    setEditorOpen(false);
  }

  function getExportPayload() {
    const obj: Record<string, any> = {};
    board.forEach((val, key) => {
      if (val.tileSet !== undefined && val.tileIndex !== undefined) {
        obj[key] = { type: 'tile', tileSet: val.tileSet, tileIndex: val.tileIndex };
      } else if (val.color) {
        obj[key] = { type: 'color', color: val.color };
      }
    });
    const tilesExport: Record<string, { size: number; pixels: (string | null)[] }[]> = {};
    (Object.keys(tilesBySet) as TileSetName[]).forEach(setName => {
      tilesExport[setName] = tilesBySet[setName].map(t => ({ size: t.size, pixels: t.pixels }));
    });
    return { board: obj, tiles: tilesExport };
  }

  function importPayload(payload: any) {
    try {
      const tilesIn = payload.tiles || {};
      const rebuilt = emptyTilesBySet();
      (Object.keys(rebuilt) as TileSetName[]).forEach(setName => {
        const arr = tilesIn[setName] || [];
        rebuilt[setName] = arr.map((t: any, idx: number) => ({ id: `${setName}-${Date.now()}-${idx}`, size: t.size, pixels: t.pixels }));
      });
      setTilesBySet(rebuilt);
      const map = new Map<string, BoardCell>();
      const boardIn = payload.board || payload; // backward compat
      Object.keys(boardIn).forEach(key => {
        const cell = boardIn[key];
        if (!cell) return;
        if (cell.type === 'tile' && (['grassland','desert','swamp','cyberpunk'] as string[]).includes(cell.tileSet)) {
          map.set(key, { tileSet: cell.tileSet, tileIndex: cell.tileIndex });
        } else if (cell.type === 'color' && cell.color) {
          map.set(key, { color: cell.color });
        } else if (typeof cell === 'string') { // very old format
          map.set(key, { color: cell });
        }
      });
      setBoard(map);
      offscreenCacheRef.current.clear();
    } catch {}
  }

  function exportJSON() {
    const payload = getExportPayload();
    const data = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload));
    const link = document.createElement('a');
    link.href = data;
    link.download = 'board.json';
    link.click();
  }

  async function saveToCloud() {
    const id = projectId.trim();
    if (!id) return alert('Enter a Project ID');
    const payload = getExportPayload();
    try {
      const res = await fetch('/.netlify/functions/save-project', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, payload })
      });
      if (!res.ok) throw new Error(await res.text());
      alert('Saved to cloud.');
    } catch (err) {
      alert('Save failed.');
    }
  }

  async function loadFromCloud() {
    const id = projectId.trim();
    if (!id) return alert('Enter a Project ID');
    try {
      const res = await fetch('/.netlify/functions/load-project?id=' + encodeURIComponent(id));
      if (res.status === 404) { alert('Not found'); return; }
      if (!res.ok) throw new Error(await res.text());
      const payload = await res.json();
      importPayload(payload);
      alert('Loaded from cloud.');
    } catch (err) {
      alert('Load failed.');
    }
  }

  function exportPNG() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'board.png';
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleContextMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', handleContextMenu);
    return () => canvas.removeEventListener('contextmenu', handleContextMenu);
  }, []);

  return (
    <div>
      <div className="toolbar">
        <button className={tool === 'brush' ? 'active' : ''} onClick={() => setTool('brush')}>Brush</button>
        <button className={tool === 'eraser' ? 'active' : ''} onClick={() => setTool('eraser')}>Eraser</button>
        <select value={tileSet} onChange={e => { setTileSet(e.target.value as TileSetName); setColorIndex(0); }}>
          {Object.keys(tileSets).map(ts => (
            <option key={ts} value={ts}>{ts}</option>
          ))}
        </select>
        <button onClick={() => openEditor('add')}>Add Tile</button>
        <button onClick={() => openEditor('edit')} disabled={selectedTileIndex === null}>Edit Tile</button>
        <div className="palette">
          {tileSets[tileSet].map((color, idx) => (
            <div
              key={idx}
              style={{ background: color }}
              className={colorIndex === idx ? 'active' : ''}
              onClick={() => setColorIndex(idx)}
            />
          ))}
        </div>
        <div className="tilebar">
          <div
            className={`tile-thumb ${selectedTileIndex === null ? 'active' : ''}`}
            title="No tile (use solid color)"
            onClick={() => setSelectedTileIndex(null)}
          >
            ×
          </div>
          {tilesBySet[tileSet].map((t, idx) => (
            <canvas
              key={t.id}
              width={editorTileSize}
              height={editorTileSize}
              style={{ width: 24, height: 24, imageRendering: 'pixelated', border: selectedTileIndex === idx ? '2px solid #ecf0f1' : '1px solid #bdc3c7' }}
              ref={(el) => { if (el) { renderPixelsToCanvas(el, t.pixels, t.size); } }}
              onClick={() => setSelectedTileIndex(idx)}
            />
          ))}
        </div>
        <div className="cloud">
          <input type="text" placeholder="Project ID" value={projectId} onChange={e => setProjectId(e.target.value)} />
          <button onClick={saveToCloud}>Save Cloud</button>
          <button onClick={loadFromCloud}>Load Cloud</button>
        </div>
        <button onClick={() => setGrid(g => !g)}>{grid ? 'Hide Grid' : 'Show Grid'}</button>
        <button onClick={() => setBoard(new Map())}>Clear</button>
        <button onClick={exportJSON}>Export JSON</button>
        <button onClick={exportPNG}>Export PNG</button>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100vw', height: '100vh', display:'block', cursor: tool === 'eraser' ? 'crosshair' : 'pointer' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onWheel={handleWheel}
      />

      {editorOpen && (
        <div className="modal-backdrop" onClick={closeEditor}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">Tile Editor ({editorTileSize}×{editorTileSize})</div>
            <div className="modal-tools">
              <button className={editorToolRef.current === 'brush' ? 'active' : ''} onClick={() => { editorToolRef.current = 'brush'; }}>Brush</button>
              <button className={editorToolRef.current === 'eraser' ? 'active' : ''} onClick={() => { editorToolRef.current = 'eraser'; }}>Eraser</button>
              <button onClick={() => setEditorPixels(Array(editorTileSize * editorTileSize).fill(null))}>Clear</button>
              <div className="editor-palette">
                {editorPalette.map((c, idx) => (
                  <div key={idx} style={{ background: c }} className={editorColor === c ? 'active' : ''} onClick={() => setEditorColor(c)} />
                ))}
                <input type="color" value={editorColor} onChange={e => setEditorColor(e.target.value)} />
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={closeEditor}>Cancel</button>
              <button onClick={saveEditor}>Save</button>
            </div>
            <div className="modal-body">
              <div className="sets-panel">
                {(Object.keys(tileSets) as TileSetName[]).map(setName => (
                  <button key={setName} className={editorActiveSet === setName ? 'active' : ''} onClick={() => setEditorActiveSet(setName)}>{setName}</button>
                ))}
                <div className="sets-tiles">
                  {tilesBySet[editorActiveSet].map((t, idx) => (
                    <canvas
                      key={t.id}
                      width={editorTileSize}
                      height={editorTileSize}
                      style={{ width: 32, height: 32, imageRendering: 'pixelated', border: editorWorkingIndex === idx ? '2px solid #34495e' : '1px solid #bdc3c7' }}
                      ref={(el) => { if (el) { renderPixelsToCanvas(el, t.pixels, t.size); } }}
                      onClick={() => { setEditorMode('edit'); setEditorWorkingIndex(idx); setEditorPixels([...tilesBySet[editorActiveSet][idx].pixels]); }}
                    />
                  ))}
                </div>
              </div>
              <div className="modal-canvas">
                <canvas
                  ref={editorCanvasRef}
                  width={editorTileSize}
                  height={editorTileSize}
                  style={{ width: 512, height: 512, imageRendering: 'pixelated', background: '#fff' }}
                  onMouseDown={handleEditorMouseDown}
                  onMouseMove={handleEditorMouseMove}
                  onMouseUp={handleEditorMouseUp}
                  onMouseLeave={handleEditorMouseUp}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
