import React, { useEffect, useRef, useState } from 'react';

const tileW = 64;
const tileH = 32;

const builtinPalettes = {
  grassland: ['#6abe30','#378b29','#2f7a24','#23671b'],
  desert: ['#e0c08f','#d0a060','#c09048','#b08038'],
  swamp: ['#4f704d','#42633f','#365432','#2a4626'],
  cyberpunk: ['#00ffff','#ff00ff','#ffff00','#00aaff']
} as const;

type TileSetName = string;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  type BoardCell = { color?: string; tileSet?: TileSetName; tileIndex?: number };
  type Layer = { id: string; name: string; visible: boolean; locked: boolean; opacity: number; cells: Map<string, BoardCell> };
  const [tool, setTool] = useState<'brush' | 'eraser' | 'fill'>('brush');
  const [sets, setSets] = useState<string[]>(['grassland','desert','swamp','cyberpunk']);
  const [tileSet, setTileSet] = useState<TileSetName>('grassland');
  const [colorIndex, setColorIndex] = useState(0);
  const [grid, setGrid] = useState(true);
  const [layers, setLayers] = useState<Layer[]>([
    { id: `layer-${Date.now()}`, name: 'Layer 1', visible: true, locked: false, opacity: 1, cells: new Map() }
  ]);
  const [activeLayerIndex, setActiveLayerIndex] = useState(0);
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const isPanningRef = useRef(false);
  const lastPanPosRef = useRef({ x: 0, y: 0 });
  const hoveredTileRef = useRef<{ i: number; j: number } | null>(null);
  const [projectId, setProjectId] = useState('');
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [availableProjectIds, setAvailableProjectIds] = useState<string[]>([]);
  const [selectedLoadId, setSelectedLoadId] = useState<string>('');

  // Auto-tiling and tiles sidebar
  const [autoTiling, setAutoTiling] = useState(false);
  const [autoGroup, setAutoGroup] = useState<string>('');
  const [tilesSidebarOpen, setTilesSidebarOpen] = useState(true);
  const [tilesSidebarGroupFilter, setTilesSidebarGroupFilter] = useState<string>('');

  // Import tileset modal
  const [importOpen, setImportOpen] = useState(false);
  const [importTileSize, setImportTileSize] = useState<number>(32);
  const [importMargin, setImportMargin] = useState<number>(0);
  const [importSpacing, setImportSpacing] = useState<number>(0);
  const [importGroup, setImportGroup] = useState<string>('');
  const importFileRef = useRef<File | null>(null);
  // Auto-tiling setup modal
  const [autoConfigOpen, setAutoConfigOpen] = useState(false);
  const [autoConfigGroup, setAutoConfigGroup] = useState('ground');
  // Rules: set -> group -> mask -> [tileIndex]
  const [autoRulesBySet, setAutoRulesBySet] = useState<Record<string, Record<string, Record<number, number[]>>>>({});
  // 3x3 template: role -> tileIndex
  const [autoTemplateBySet, setAutoTemplateBySet] = useState<Record<string, Record<string, Record<string, number>>>>({});
  const [autoTemplateActiveRole, setAutoTemplateActiveRole] = useState<string>('center');
  // Import batch metadata (column count)
  const [batchMetaBySet, setBatchMetaBySet] = useState<Record<string, Record<string, { cols: number }>>>({});
  // Stamp selection (multi-tile brush)
  const [stamp, setStamp] = useState<{ set: TileSetName; w: number; h: number; tiles: number[] } | null>(null);
  const stampSelectingRef = useRef<{ active: boolean; batchId: string | null; start: number; cols: number } | null>(null);
  const [stampSel, setStampSel] = useState<{ batchId: string | null; indices: number[] }>({ batchId: null, indices: [] });
  // Tileset zoom (thumbnail size in px)
  const [tileThumb, setTileThumb] = useState<number>(16);
  const [tilesPerRow, setTilesPerRow] = useState<number>(25);
  const [tileSearch, setTileSearch] = useState<string>('');
  const [randomizeBrush, setRandomizeBrush] = useState<boolean>(false);
  const [hoverIJ, setHoverIJ] = useState<{ i: number; j: number } | null>(null);

  // Tile bitmaps per tileset
  type TileBitmap = { id: string; size: number; pixels: (string | null)[]; autoGroup?: string; autoMask?: number; spacer?: boolean; batchId?: string; indexWithinBatch?: number; name?: string; tags?: string[] };
  const emptyTilesBySet = (): Record<TileSetName, TileBitmap[]> => ({
    grassland: [],
    desert: [],
    swamp: [],
    cyberpunk: []
  });
  const [tilesBySet, setTilesBySet] = useState<Record<TileSetName, TileBitmap[]>>(emptyTilesBySet());
  const [paletteBySet, setPaletteBySet] = useState<Record<string, string[]>>({
    grassland: [...builtinPalettes.grassland],
    desert: [...builtinPalettes.desert],
    swamp: [...builtinPalettes.swamp],
    cyberpunk: [...builtinPalettes.cyberpunk]
  });
  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);
  const offscreenCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // Pixel editor state
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'add' | 'edit'>('add');
  const [editorActiveSet, setEditorActiveSet] = useState<TileSetName>('grassland');
  const editorCanvasRef = useRef<HTMLCanvasElement>(null);
  const editorDrawingRef = useRef(false);
  const editorToolRef = useRef<'brush' | 'eraser'>('brush');
  const [editorTileSize, setEditorTileSize] = useState<number>(16);
  const [editorPixels, setEditorPixels] = useState<(string | null)[]>(Array(16 * 16).fill(null));
  const [editorWorkingIndex, setEditorWorkingIndex] = useState<number | null>(null);
  const [editorAutoGroupName, setEditorAutoGroupName] = useState<string>('');
  const [editorMask, setEditorMask] = useState<number>(0);

  const editorPalette: string[] = [
    '#000000','#222222','#444444','#666666','#888888','#aaaaaa','#cccccc','#ffffff',
    '#ff0000','#ff7f7f','#990000','#7f0000','#ff6600','#ffbb99','#cc5200','#663300',
    '#ffff00','#ffff99','#cccc00','#999900','#00ff00','#99ff99','#009900','#006600',
    '#00ffff','#99ffff','#00cccc','#009999','#0000ff','#9999ff','#000099','#000066',
    '#ff00ff','#ff99ff','#cc00cc','#990099','#ff1493','#ffa07a','#ffd700','#8a2be2',
    '#00fa9a','#7fffd4','#20b2aa','#ff8c00','#b8860b','#cd5c5c','#2e8b57','#708090'
  ];
  const [editorColor, setEditorColor] = useState<string>('#000000');

  // Local storage hydration for tiles and layers (with auto-tiling metadata)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('pixelmapeditor.tiles');
      if (raw) {
        const parsed: Record<string, { size: number; pixels: (string | null)[]; autoGroup?: string; autoMask?: number; name?: string; tags?: string[] }[]> = JSON.parse(raw);
        const rebuilt = emptyTilesBySet();
        (Object.keys(rebuilt) as TileSetName[]).forEach(setName => {
          const arr = parsed[setName] || [];
          rebuilt[setName] = arr.map((t, idx) => ({ id: `${setName}-${Date.now()}-${idx}`, size: t.size, pixels: t.pixels, autoGroup: t.autoGroup, autoMask: t.autoMask, name: t.name, tags: Array.isArray(t.tags) ? t.tags : undefined }));
        });
        setTilesBySet(rebuilt);
        setEditorActiveSet('grassland');
      }
      const rawSets = localStorage.getItem('pixelmapeditor.sets');
      if (rawSets) {
        const parsed = JSON.parse(rawSets);
        if (Array.isArray(parsed.sets)) setSets(parsed.sets);
        if (parsed.palettes && typeof parsed.palettes === 'object') setPaletteBySet(parsed.palettes);
      }
      const rawLayers = localStorage.getItem('pixelmapeditor.layers');
      if (rawLayers) {
        const parsed = JSON.parse(rawLayers);
        if (Array.isArray(parsed)) {
          const rebuilt: Layer[] = parsed.map((l: any) => ({
            id: String(l.id || `layer-${Math.random()}`),
            name: String(l.name || 'Layer'),
            visible: !!l.visible,
            locked: !!l.locked,
            opacity: Number.isFinite(l.opacity) ? Number(l.opacity) : 1,
            cells: new Map<string, BoardCell>(Object.entries(l.cells || {}))
          }));
          if (rebuilt.length > 0) setLayers(rebuilt);
        } else if (parsed && typeof parsed === 'object' && parsed.board) {
          // backward compat: single board -> one layer
          const m = new Map<string, BoardCell>();
          Object.keys(parsed.board).forEach(k => {
            m.set(k, parsed.board[k]);
          });
          setLayers([{ id: `layer-${Date.now()}`, name: 'Layer 1', visible: true, locked: false, opacity: 1, cells: m }]);
        }
      }
      const rawRules = localStorage.getItem('pixelmapeditor.autorules');
      if (rawRules) {
        const parsed = JSON.parse(rawRules);
        if (parsed && typeof parsed === 'object') setAutoRulesBySet(parsed);
      }
      const rawTpl = localStorage.getItem('pixelmapeditor.autotemplate');
      if (rawTpl) {
        const parsed = JSON.parse(rawTpl);
        if (parsed && typeof parsed === 'object') setAutoTemplateBySet(parsed);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    const toStore: Record<string, { size: number; pixels: (string | null)[]; autoGroup?: string; autoMask?: number; name?: string; tags?: string[] }[]> = {};
    (Object.keys(tilesBySet) as TileSetName[]).forEach(setName => {
      toStore[setName] = tilesBySet[setName].map(t => ({ size: t.size, pixels: t.pixels, autoGroup: t.autoGroup, autoMask: t.autoMask, name: t.name, tags: t.tags }));
    });
    try { localStorage.setItem('pixelmapeditor.tiles', JSON.stringify(toStore)); } catch {}
  }, [tilesBySet]);

  useEffect(() => {
    try {
      const layersOut = layers.map(l => ({ id: l.id, name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity, cells: Object.fromEntries(l.cells.entries()) }));
      localStorage.setItem('pixelmapeditor.layers', JSON.stringify(layersOut));
    } catch {}
  }, [layers]);

  useEffect(() => {
    try { localStorage.setItem('pixelmapeditor.sets', JSON.stringify({ sets, palettes: paletteBySet })); } catch {}
  }, [sets, paletteBySet]);

  useEffect(() => {
    try { localStorage.setItem('pixelmapeditor.autorules', JSON.stringify(autoRulesBySet)); } catch {}
  }, [autoRulesBySet]);
  useEffect(() => {
    try { localStorage.setItem('pixelmapeditor.autotemplate', JSON.stringify(autoTemplateBySet)); } catch {}
  }, [autoTemplateBySet]);

  // Ensure state maps always contain all declared sets to avoid undefined access
  useEffect(() => {
    setTilesBySet(prev => {
      const next = { ...prev } as Record<TileSetName, TileBitmap[]>;
      let changed = false;
      sets.forEach(name => {
        if (!next[name]) { next[name] = []; changed = true; }
      });
      return changed ? next : prev;
    });
    setPaletteBySet(prev => {
      const next = { ...prev } as Record<string, string[]>;
      let changed = false;
      sets.forEach(name => {
        if (!next[name]) { next[name] = [...builtinPalettes.grassland]; changed = true; }
      });
      return changed ? next : prev;
    });
  }, [sets]);

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

      // Draw visible layers in order with opacity
      layers.forEach(layer => {
        if (!layer.visible) return;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
        layer.cells.forEach((cell, key) => {
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
        ctx.restore();
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
  }, [layers, grid]);

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

  function rgbToHex(r: number, g: number, b: number): string {
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function generateDemoTiles(size: number) {
    const base = (paletteBySet[tileSet] && paletteBySet[tileSet][0]) || builtinPalettes.grassland[0] || '#6abe30';
    const { r: br, g: bg, b: bb } = hexToRgb(base);
    const line = '#000000';
    const { r: lr, g: lg, b: lb } = hexToRgb(line);
    const border = Math.max(1, Math.floor(size / 16));
    const makeTile = (mask: number): TileBitmap => {
      const pixels = new Array<string | null>(size * size).fill(rgbToHex(br, bg, bb));
      // draw edges per mask
      const drawH = (yStart: number) => {
        for (let y = yStart; y < yStart + border; y++) {
          if (y < 0 || y >= size) continue;
          for (let x = 0; x < size; x++) pixels[y * size + x] = rgbToHex(lr, lg, lb);
        }
      };
      const drawV = (xStart: number) => {
        for (let x = xStart; x < xStart + border; x++) {
          if (x < 0 || x >= size) continue;
          for (let y = 0; y < size; y++) pixels[y * size + x] = rgbToHex(lr, lg, lb);
        }
      };
      // N=1, E=2, S=4, W=8
      if (mask & 1) drawH(0);
      if (mask & 2) drawV(size - border);
      if (mask & 4) drawH(size - border);
      if (mask & 8) drawV(0);
      return { id: `${tileSet}-demo-${size}-${mask}-${Date.now()}`, size, pixels, autoGroup: 'ground', autoMask: mask, name: `demo-${mask}`, tags: ['demo','auto'] };
    };
    const newTiles: TileBitmap[] = [];
    for (let m = 0; m < 16; m++) newTiles.push(makeTile(m));
    setTilesBySet(prev => {
      const copy = { ...prev } as Record<TileSetName, TileBitmap[]>;
      copy[tileSet] = [...copy[tileSet], ...newTiles];
      return copy;
    });
  }

  // --- Auto-tiling helpers ---
  function getGroupMapForSet(tileSetName: TileSetName, groupName: string): Map<number, number> {
    const m = new Map<number, number>();
    tilesBySet[tileSetName].forEach((t, idx) => {
      if (t.autoGroup === groupName && typeof t.autoMask === 'number') m.set(t.autoMask, idx);
    });
    return m;
  }

  function getTileMeta(tileSetName: TileSetName, tileIndex?: number) {
    if (tileIndex === undefined || tileIndex === null) return null;
    return tilesBySet[tileSetName][tileIndex] || null;
  }

  function getBoardCell(map: Map<string, BoardCell>, i: number, j: number): BoardCell | undefined {
    return map.get(`${i},${j}`);
  }

  function isRuleMember(setName: TileSetName, groupName: string, tileIndex: number | undefined): boolean {
    if (tileIndex === undefined) return false;
    const rules = autoRulesBySet[setName]?.[groupName];
    if (!rules) return false;
    for (const m in rules) {
      const arr = rules[m as any];
      if (arr && arr.includes(tileIndex)) return true;
    }
    return false;
  }

  function isGroupCell(cell: BoardCell | undefined, groupName: string, setName: TileSetName): boolean {
    if (!cell || cell.tileSet !== setName || cell.tileIndex === undefined) return false;
    const meta = getTileMeta(setName, cell.tileIndex);
    if (meta && meta.autoGroup === groupName) return true;
    // Also treat any tile that is part of the group's assigned rule set as belonging to the group
    return isRuleMember(setName, groupName, cell.tileIndex);
  }

  function computeMaskFor(map: Map<string, BoardCell>, i: number, j: number, groupName: string, setName: TileSetName): number {
    const north = isGroupCell(getBoardCell(map, i - 1, j), groupName, setName) ? 1 : 0;
    const east = isGroupCell(getBoardCell(map, i, j + 1), groupName, setName) ? 1 : 0;
    const south = isGroupCell(getBoardCell(map, i + 1, j), groupName, setName) ? 1 : 0;
    const west = isGroupCell(getBoardCell(map, i, j - 1), groupName, setName) ? 1 : 0;
    return (north) | (east << 1) | (south << 2) | (west << 3);
  }

  function applyAutotileAt(next: Map<string, BoardCell>, i: number, j: number, setName: TileSetName, groupName: string) {
    const mask = computeMaskFor(next, i, j, groupName, setName);
    const options = autoRulesBySet[setName]?.[groupName]?.[mask];
    if (options && options.length > 0) {
      const pick = options[Math.floor(Math.random() * options.length)];
      next.set(`${i},${j}`, { tileSet: setName, tileIndex: pick });
      return;
    }
    const groupMap = getGroupMapForSet(setName, groupName);
    let tIdx = groupMap.get(mask);
    if (tIdx === undefined) tIdx = groupMap.get(0);
    if (tIdx === undefined) return;
    next.set(`${i},${j}`, { tileSet: setName, tileIndex: tIdx });
  }

  function updateAutotileForCell(next: Map<string, BoardCell>, i: number, j: number) {
    const cell = getBoardCell(next, i, j);
    if (!cell || cell.tileSet === undefined || cell.tileIndex === undefined) return;
    const meta = getTileMeta(cell.tileSet, cell.tileIndex);
    const groupName = meta?.autoGroup || autoGroup;
    if (!groupName) return;
    const mask = computeMaskFor(next, i, j, groupName, cell.tileSet);
    const options = autoRulesBySet[cell.tileSet]?.[groupName]?.[mask];
    if (options && options.length > 0) {
      const pick = options[Math.floor(Math.random() * options.length)];
      next.set(`${i},${j}`, { tileSet: cell.tileSet, tileIndex: pick });
      return;
    }
    const groupMap = getGroupMapForSet(cell.tileSet, groupName);
    let tIdx = groupMap.get(mask);
    if (tIdx === undefined) tIdx = groupMap.get(0);
    if (tIdx === undefined) return;
    next.set(`${i},${j}`, { tileSet: cell.tileSet, tileIndex: tIdx });
  }

  function roleToMasks(role: string): number[] {
    switch (role) {
      case 'center': return [15];
      case 'top': return [14];
      case 'bottom': return [11];
      case 'left': return [7];
      case 'right': return [13];
      case 'top-left': return [6];
      case 'top-right': return [12];
      case 'bottom-left': return [3];
      case 'bottom-right': return [9];
      default: return [];
    }
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

  function getActiveLayer(): Layer {
    return layers[Math.max(0, Math.min(layers.length - 1, activeLayerIndex))];
  }

  function setActiveLayerCells(updater: (prev: Map<string, BoardCell>) => Map<string, BoardCell>) {
    setLayers(prev => {
      const idx = Math.max(0, Math.min(prev.length - 1, activeLayerIndex));
      const layer = prev[idx];
      if (!layer || layer.locked) return prev;
      const nextLayer: Layer = { ...layer, cells: updater(layer.cells) };
      const next = [...prev];
      next[idx] = nextLayer;
      return next;
    });
  }

  function sampleAt(i: number, j: number) {
    const layer = getActiveLayer();
    const cell = layer.cells.get(`${i},${j}`);
    if (cell && cell.tileSet !== undefined && cell.tileIndex !== undefined) {
      setTileSet(cell.tileSet);
      setSelectedTileIndex(cell.tileIndex);
    } else if (cell && cell.color) {
      setSelectedTileIndex(null);
      const pal = paletteBySet[tileSet] || builtinPalettes.grassland;
      const ix = pal.indexOf(cell.color);
      if (ix >= 0) setColorIndex(ix);
    } else {
      setSelectedTileIndex(null);
    }
  }

  function cellsEqual(a?: BoardCell, b?: BoardCell): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    if (a.tileSet !== undefined || b.tileSet !== undefined) {
      return a.tileSet === b.tileSet && a.tileIndex === b.tileIndex;
    }
    return a.color === b.color;
  }

  function floodFill(i: number, j: number, replacement: BoardCell) {
    setActiveLayerCells(prev => {
      const map = new Map(prev);
      const key = `${i},${j}`;
      const target = map.get(key);
      if (cellsEqual(target, replacement)) return prev;
      const q: Array<[number, number]> = [[i, j]];
      const visited = new Set<string>();
      const shouldFill = (ci: number, cj: number) => cellsEqual(map.get(`${ci},${cj}`), target);
      while (q.length) {
        const [ci, cj] = q.shift()!;
        const ck = `${ci},${cj}`;
        if (visited.has(ck)) continue;
        visited.add(ck);
        if (!shouldFill(ci, cj)) continue;
        map.set(ck, { ...replacement });
        q.push([ci - 1, cj]);
        q.push([ci + 1, cj]);
        q.push([ci, cj - 1]);
        q.push([ci, cj + 1]);
      }
      return map;
    });
  }

  function drawTileBitmapAt(ctx: CanvasRenderingContext2D, tileSetName: TileSetName, tileIndex: number, x: number, y: number) {
    const off = getOffscreenForTile(tileSetName, tileIndex);
    if (!off) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.imageSmoothingEnabled = false;
    const S = off.width;
    // Affine map from square [0,S]x[0,S] to isometric diamond of size tileW x tileH centered at (0,0)
    const a =  (tileW / (2 * S));  // x contribution from source x
    const b =  (tileH / (2 * S));  // y contribution from source x
    const c = -(tileW / (2 * S));  // x contribution from source y
    const d =  (tileH / (2 * S));  // y contribution from source y
    const e = - (a + c) * (S / 2); // center origin horizontally (will be 0)
    const f = - (b + d) * (S / 2); // center origin vertically (-tileH/2)
    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(off, 0, 0, S, S);
    ctx.restore();
  }

  function handleMouseDown(e: React.MouseEvent) {
    const button = e.button;
    if (button === 1) {
      isPanningRef.current = true;
      lastPanPosRef.current = { x: e.clientX, y: e.clientY };
    } else {
      const { i, j } = screenToIso(e.clientX, e.clientY);
      if (e.altKey) { sampleAt(i, j); return; }
      if (button === 2) {
        erase(i,j);
      } else {
        if (tool === 'brush') paint(i,j);
        else if (tool === 'fill') fillAt(i,j);
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
      else if (tool === 'fill') { /* no-op on drag */ }
      else erase(i,j);
    } else if (e.buttons & 2) {
      const { i, j } = screenToIso(e.clientX, e.clientY);
      erase(i,j);
    }
    // Update hover preview for all mouse moves
    const { i, j } = screenToIso(e.clientX, e.clientY);
    hoveredTileRef.current = { i, j };
    setHoverIJ({ i, j });
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
    setHoverIJ(null);
  }

  function paint(i: number, j: number) {
    const key = `${i},${j}`;
    setActiveLayerCells(prev => {
      const next = new Map(prev);
      if (stamp && tool === 'brush') {
        // multi-tile stamp placement
        let idx = 0;
        for (let dy = 0; dy < stamp.h; dy++) {
          for (let dx = 0; dx < stamp.w; dx++, idx++) {
            const tIdx = stamp.tiles[idx];
            const kk = `${i+dy},${j+dx}`;
            next.set(kk, { tileSet: stamp.set, tileIndex: tIdx });
          }
        }
      } else if (autoTiling && autoGroup) {
        // if current cell is already part of a different group, clear it first to avoid mixed masks
        const existing = next.get(key);
        if (existing && existing.tileSet === tileSet && existing.tileIndex !== undefined) {
          const inThisGroup = isGroupCell(existing, autoGroup, tileSet) || isRuleMember(tileSet, autoGroup, existing.tileIndex);
          if (!inThisGroup) next.delete(key);
        }
        // place autotile and update neighbors
        applyAutotileAt(next, i, j, tileSet, autoGroup);
        const neighbors = [ [i-1,j], [i,j+1], [i+1,j], [i,j-1] ] as Array<[number,number]>;
        neighbors.forEach(([ni, nj]) => updateAutotileForCell(next, ni, nj));
      } else if (selectedTileIndex !== null) {
        if (randomizeBrush) {
          // pick among visible filtered tiles from current tileset
          const needle = tileSearch.trim().toLowerCase();
          const candidates: number[] = [];
          tilesBySet[tileSet].forEach((t, idx) => {
            if (t.spacer) return;
            if (tilesSidebarGroupFilter && t.autoGroup !== tilesSidebarGroupFilter) return;
            if (needle) {
              const n = (t.name || '').toLowerCase();
              const tags = (t.tags || []).join(' ').toLowerCase();
              if (n.indexOf(needle) === -1 && tags.indexOf(needle) === -1) return;
            }
            candidates.push(idx);
          });
          const pick = candidates.length ? candidates[Math.floor(Math.random()*candidates.length)] : selectedTileIndex;
          next.set(key, { tileSet, tileIndex: pick });
        } else {
          next.set(key, { tileSet, tileIndex: selectedTileIndex });
        }
      } else {
        const pal = paletteBySet[tileSet] || builtinPalettes.grassland;
        const color = pal[colorIndex % pal.length];
        next.set(key, { color });
      }
      return next;
    });
  }

  function erase(i: number, j: number) {
    const key = `${i},${j}`;
    setActiveLayerCells(prev => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }

  function fillAt(i: number, j: number) {
    if (selectedTileIndex !== null) floodFill(i, j, { tileSet, tileIndex: selectedTileIndex });
    else {
      const pal = paletteBySet[tileSet] || builtinPalettes.grassland;
      const color = pal[colorIndex % pal.length];
      floodFill(i, j, { color });
    }
  }

  function openEditor(mode: 'add' | 'edit') {
    setEditorMode(mode);
    if (mode === 'edit' && selectedTileIndex !== null) {
      const tile = tilesBySet[tileSet][selectedTileIndex];
      if (tile) {
        setEditorTileSize(tile.size);
        setEditorPixels([...tile.pixels]);
        setEditorWorkingIndex(selectedTileIndex);
        setEditorAutoGroupName(tile.autoGroup || '');
        setEditorMask(tile.autoMask ?? 0);
      }
    } else {
      setEditorPixels(Array(editorTileSize * editorTileSize).fill(null));
      setEditorWorkingIndex(null);
      setEditorAutoGroupName('');
      setEditorMask(0);
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
      const newTile: TileBitmap = { id: `${targetSet}-${Date.now()}`, size: editorTileSize, pixels: [...editorPixels], autoGroup: editorAutoGroupName || undefined, autoMask: Number.isFinite(editorMask) ? editorMask : undefined };
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
        arr[idx] = { ...existing, pixels: [...editorPixels], autoGroup: editorAutoGroupName || undefined, autoMask: Number.isFinite(editorMask) ? editorMask : existing.autoMask };
        copy[editorActiveSet] = arr;
        return copy;
      });
      invalidateTileCache(editorActiveSet, idx);
    }
    setEditorOpen(false);
  }

  function getExportPayload() {
    const layersExport = layers.map(l => {
      const cells: Record<string, any> = {};
      l.cells.forEach((val, key) => {
        if (val.tileSet !== undefined && val.tileIndex !== undefined) {
          cells[key] = { type: 'tile', tileSet: val.tileSet, tileIndex: val.tileIndex };
        } else if (val.color) {
          cells[key] = { type: 'color', color: val.color };
        }
      });
      return { id: l.id, name: l.name, visible: l.visible, locked: l.locked, opacity: l.opacity, cells };
    });
    const tilesExport: Record<string, { size: number; pixels: (string | null)[]; autoGroup?: string; autoMask?: number }[]> = {};
    (Object.keys(tilesBySet) as TileSetName[]).forEach(setName => {
      tilesExport[setName] = tilesBySet[setName].map(t => ({ size: t.size, pixels: t.pixels, autoGroup: t.autoGroup, autoMask: t.autoMask }));
    });
    return { layers: layersExport, tiles: tilesExport };
  }

  function importPayload(payload: any) {
    try {
      const tilesIn = payload.tiles || {};
      const rebuilt = emptyTilesBySet();
      (Object.keys(rebuilt) as TileSetName[]).forEach(setName => {
        const arr = tilesIn[setName] || [];
        rebuilt[setName] = arr.map((t: any, idx: number) => ({ id: `${setName}-${Date.now()}-${idx}`, size: t.size, pixels: t.pixels, autoGroup: t.autoGroup, autoMask: t.autoMask }));
      });
      setTilesBySet(rebuilt);
      if (Array.isArray(payload.layers)) {
        const rebuiltLayers: Layer[] = payload.layers.map((l: any) => {
          const map = new Map<string, BoardCell>();
          const cellsIn = l.cells || {};
          Object.keys(cellsIn).forEach(key => {
            const cell = cellsIn[key]; if (!cell) return;
            if (cell.type === 'tile' && cell.tileSet) map.set(key, { tileSet: cell.tileSet, tileIndex: cell.tileIndex });
            else if (cell.type === 'color' && cell.color) map.set(key, { color: cell.color });
          });
          return { id: String(l.id || `layer-${Math.random()}`), name: String(l.name || 'Layer'), visible: !!l.visible, locked: !!l.locked, opacity: Number.isFinite(l.opacity) ? Number(l.opacity) : 1, cells: map };
        });
        if (rebuiltLayers.length > 0) setLayers(rebuiltLayers);
      } else {
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
        setLayers([{ id: `layer-${Date.now()}`, name: 'Layer 1', visible: true, locked: false, opacity: 1, cells: map }]);
      }
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
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Save failed: ${res.status} ${res.statusText} ${txt}`);
      }
      alert('Saved to cloud.');
    } catch (err) {
      console.error(err);
      alert('Save failed. See console for details.');
    }
  }

  async function loadFromCloud() {
    const id = projectId.trim();
    if (!id) return alert('Enter a Project ID');
    try {
      const res = await fetch('/.netlify/functions/load-project?id=' + encodeURIComponent(id));
      if (res.status === 404) { alert('Not found'); return; }
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Load failed: ${res.status} ${res.statusText} ${txt}`);
      }
      const payload = await res.json();
      importPayload(payload);
      alert('Loaded from cloud.');
    } catch (err) {
      console.error(err);
      alert('Load failed. See console for details.');
    }
  }

  async function openLoadModal() {
    try {
      const res = await fetch('/.netlify/functions/list-projects');
      if (!res.ok) throw new Error(await res.text());
      const { ids } = await res.json();
      setAvailableProjectIds(ids || []);
      setSelectedLoadId(ids && ids[0] ? ids[0] : '');
      setLoadModalOpen(true);
    } catch (e) {
      console.error(e);
      alert('Failed to fetch cloud saves.');
    }
  }

  async function confirmLoadSelected() {
    if (!selectedLoadId) { alert('Select a Project ID'); return; }
    setProjectId(selectedLoadId);
    setLoadModalOpen(false);
    await loadFromCloud();
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

  // Hotkeys
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (e.key === 'b' || e.key === 'B') setTool('brush');
      else if (e.key === 'e' || e.key === 'E') setTool('eraser');
      else if (e.key === 'f' || e.key === 'F') setTool('fill');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ---- Tileset import helpers ----
  function openImportModal() { setImportOpen(true); }
  function closeImportModal() { setImportOpen(false); importFileRef.current = null; }

  function fileToImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read error'));
      reader.onload = () => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('image error'));
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function imageDataToPixels(imageData: ImageData): (string | null)[] {
    const out = new Array<string | null>(imageData.width * imageData.height);
    const d = imageData.data;
    for (let i = 0, p = 0; i < out.length; i++, p += 4) {
      const a = d[p + 3];
      if (a === 0) { out[i] = null; } else {
        out[i] = rgbToHex(d[p], d[p+1], d[p+2]);
      }
    }
    return out;
  }

  async function doImportTileset() {
    const file = importFileRef.current;
    if (!file) { alert('Choose an image'); return; }
    try {
      const img = await fileToImage(file);
      const S = importTileSize;
      const margin = importMargin;
      const spacing = importSpacing;
      const canvas = document.createElement('canvas');
      canvas.width = S; canvas.height = S;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const newTiles: TileBitmap[] = [];
      const batchId = `batch-${Date.now()}`;
      // spacer tile to visually separate previous tiles
      newTiles.push({ id: `${tileSet}-spacer-${batchId}`, size: S, pixels: new Array<string | null>(S*S).fill(null), spacer: true, batchId });
      // compute columns in the source spritesheet
      const cols = Math.max(1, Math.floor((img.width - margin * 2 + spacing) / (S + spacing)));
      setBatchMetaBySet(prev => ({ ...prev, [tileSet]: { ...(prev[tileSet] || {}), [batchId]: { cols } } }));
      for (let sy = margin; sy + S <= img.height - margin + 0.0001; sy += S + spacing) {
        for (let sx = margin; sx + S <= img.width - margin + 0.0001; sx += S + spacing) {
          ctx.clearRect(0,0,S,S);
          ctx.drawImage(img, sx, sy, S, S, 0, 0, S, S);
          const idata = ctx.getImageData(0,0,S,S);
          const pixels = imageDataToPixels(idata);
          newTiles.push({ id: `${tileSet}-import-${Date.now()}-${sx}-${sy}`, size: S, pixels, autoGroup: importGroup || undefined, batchId });
        }
      }
      if (newTiles.length === 0) { alert('No tiles sliced. Check size/margin/spacing.'); return; }
      setTilesBySet(prev => {
        const copy = { ...prev } as Record<TileSetName, TileBitmap[]>;
        copy[tileSet] = [...copy[tileSet], ...newTiles];
        return copy;
      });
      closeImportModal();
    } catch (e) {
      console.error(e);
      alert('Import failed.');
    }
  }

  return (
    <div>
      <div className="toolbar">
        <button className={tool === 'brush' ? 'active' : ''} onClick={() => setTool('brush')}>Brush (B)</button>
        <button className={tool === 'eraser' ? 'active' : ''} onClick={() => setTool('eraser')}>Eraser (E)</button>
        <button className={tool === 'fill' ? 'active' : ''} onClick={() => setTool('fill')}>Fill (F)</button>
        {/* moved tileset select & Add Set into sidebar header */}
        <button className={autoTiling ? 'active' : ''} onClick={() => setAutoTiling(a => !a)}>Auto</button>
        <select value={autoGroup} onChange={e => setAutoGroup(e.target.value)} disabled={!autoTiling}>
          {([''] as string[]).concat(Array.from(new Set(tilesBySet[tileSet].map(t => t.autoGroup).filter(Boolean)) as any)).map((g, idx) => (
            <option key={idx} value={g as string}>{g ? g : 'No group'}</option>
          ))}
        </select>
        <button onClick={() => setTilesSidebarOpen(o => !o)}>{tilesSidebarOpen ? 'Hide Tiles' : 'Show Tiles'}</button>
        <select value={editorTileSize} onChange={e => { const s = parseInt(e.target.value, 10); setEditorTileSize(s); setEditorPixels(Array(s * s).fill(null)); }}>
          {[8,16,24,32,48,64].map(s => <option key={s} value={s}>{s}x{s}</option>)}
        </select>
        <button onClick={() => generateDemoTiles(editorTileSize)}>Generate Demo</button>
        <button onClick={() => openEditor('add')}>Add Tile</button>
        <button onClick={() => openEditor('edit')} disabled={selectedTileIndex === null}>Edit Tile</button>
        <button onClick={() => setAutoConfigOpen(true)}>Auto-tiling Setup</button>
        <button onClick={openImportModal}>Import Tileset</button>
        <div className="palette">
          {(paletteBySet[tileSet] || builtinPalettes.grassland).map((color, idx) => (
            <div
              key={idx}
              style={{ background: color }}
              className={colorIndex === idx ? 'active' : ''}
              onClick={() => setColorIndex(idx)}
            />
          ))}
        </div>
        {/* removed redundant top-bar tiles strip */}
        <div className="cloud">
          <input type="text" placeholder="Project ID" value={projectId} onChange={e => setProjectId(e.target.value)} />
          <button onClick={saveToCloud}>Save Cloud</button>
          <button onClick={openLoadModal}>Load Cloud</button>
        </div>
        <button onClick={() => setGrid(g => !g)}>{grid ? 'Hide Grid' : 'Show Grid'}</button>
        <button onClick={() => setActiveLayerCells(() => new Map())}>Clear Layer</button>
        <button onClick={exportJSON}>Export JSON</button>
        <button onClick={exportPNG}>Export PNG</button>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100vw', height: '100vh', display:'block', cursor: tool === 'eraser' ? 'crosshair' : 'pointer', marginLeft: 260, marginRight: tilesSidebarOpen ? 420 : 0 }}
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
              <div className="editor-autotile">
                <input type="text" placeholder="Auto group" value={editorAutoGroupName} onChange={e => setEditorAutoGroupName(e.target.value)} />
                <div className="mask-toggle">
                  <label><input type="checkbox" checked={!!(editorMask & 1)} onChange={e => setEditorMask(m => e.target.checked ? (m | 1) : (m & ~1))} />N</label>
                  <label><input type="checkbox" checked={!!(editorMask & 2)} onChange={e => setEditorMask(m => e.target.checked ? (m | 2) : (m & ~2))} />E</label>
                  <label><input type="checkbox" checked={!!(editorMask & 4)} onChange={e => setEditorMask(m => e.target.checked ? (m | 4) : (m & ~4))} />S</label>
                  <label><input type="checkbox" checked={!!(editorMask & 8)} onChange={e => setEditorMask(m => e.target.checked ? (m | 8) : (m & ~8))} />W</label>
                </div>
              </div>
              <div style={{ flex: 1 }} />
              <button onClick={closeEditor}>Cancel</button>
              <button onClick={saveEditor}>Save</button>
            </div>
            <div className="modal-body">
              <div className="sets-panel">
                {sets.map(setName => (
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
                      onClick={() => { setEditorMode('edit'); setEditorWorkingIndex(idx); const tt = tilesBySet[editorActiveSet][idx]; setEditorPixels([...tt.pixels]); setEditorAutoGroupName(tt.autoGroup || ''); setEditorMask(tt.autoMask ?? 0); }}
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

      {tilesSidebarOpen && (
        <div className="tiles-sidebar">
          <div className="tiles-sidebar-header">
            <select value={tileSet} onChange={e => { setTileSet(e.target.value as TileSetName); setColorIndex(0); }}>
              {sets.map(ts => (
                <option key={ts} value={ts}>{ts}</option>
              ))}
            </select>
            <button onClick={() => {
              const name = prompt('New tileset name?');
              if (!name) return;
              if (sets.includes(name)) { alert('Name exists'); return; }
              setSets(prev => [...prev, name]);
              setTilesBySet(prev => ({ ...prev, [name]: [] }));
              setPaletteBySet(prev => ({ ...prev, [name]: [...builtinPalettes.grassland] }));
              setTileSet(name);
            }}>Add Set</button>
            <button onClick={() => setSelectedTileIndex(null)} title="Use solid color" className={selectedTileIndex === null ? 'active' : ''}>None</button>
            <input type="text" placeholder="Search tiles (name/tags)" value={tileSearch} onChange={e => setTileSearch(e.target.value)} style={{ width: 120 }} />
            <label style={{ display:'inline-flex', alignItems:'center', gap:4 }} title="Randomize among visible tiles">
              <input type="checkbox" checked={randomizeBrush} onChange={e => setRandomizeBrush(e.target.checked)} /> Rand
            </label>
            <select value={tilesSidebarGroupFilter} onChange={e => setTilesSidebarGroupFilter(e.target.value)}>
              <option value="">All groups</option>
              {Array.from(new Set(tilesBySet[tileSet].map(t => t.autoGroup).filter(Boolean)) as any).map((g: string) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <div style={{ flex: 1 }} />
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12 }}>Zoom</span>
              <input type="range" min={12} max={48} step={2} value={tileThumb} onChange={e => setTileThumb(parseInt(e.target.value,10))} />
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 12 }}>Cols</span>
              <input type="number" min={8} max={64} value={tilesPerRow} onChange={e => setTilesPerRow(Math.max(8, Math.min(64, parseInt(e.target.value,10)||25)))} style={{ width: 56 }} />
              <button onClick={() => setTilesPerRow(v => Math.max(8, v-1))}>−</button>
              <button onClick={() => setTilesPerRow(v => Math.min(64, v+1))}>+</button>
            </label>
          </div>
          <div className="tiles-grid"
            onMouseDown={(e) => {
              const target = e.target as HTMLElement;
              const batchId = target.getAttribute('data-batch');
              const idxAttr = target.getAttribute('data-idx');
              if (!batchId || idxAttr === null) { stampSelectingRef.current = null; return; }
              stampSelectingRef.current = { active: true, batchId, start: Number(idxAttr), cols: batchMetaBySet[tileSet]?.[batchId]?.cols || 999 };
              setStampSel({ batchId, indices: [Number(idxAttr)] });
            }}
            onMouseUp={() => {
              const s = stampSelectingRef.current;
              if (!s || !s.active) return;
              const { batchId, start, cols } = s;
              const list = stampSel.indices.sort((a,b)=>a-b);
              const min = list[0]; const max = list[list.length-1];
              const w = (max % cols) - (min % cols) + 1;
              const h = Math.floor(max/cols) - Math.floor(min/cols) + 1;
              setStamp({ set: tileSet, w, h, tiles: list });
              stampSelectingRef.current = null;
            }}
            onMouseMove={(e) => {
              const s = stampSelectingRef.current; if (!s || !s.active) return;
              const target = e.target as HTMLElement; const idxAttr = target.getAttribute('data-idx'); const batchId = target.getAttribute('data-batch');
              if (!idxAttr || batchId !== s.batchId) return;
              const a = s.start; const b = Number(idxAttr); const cols = s.cols;
              const min = Math.min(a,b); const max = Math.max(a,b);
              const minRow = Math.floor(min/cols); const maxRow = Math.floor(max/cols);
              const minCol = min % cols; const maxCol = max % cols;
              const indices: number[] = [];
              for (let r=minRow; r<=maxRow; r++) for (let c=minCol; c<=maxCol; c++) indices.push(r*cols+c);
              setStampSel({ batchId: s.batchId, indices });
            }}
          >
            {(() => {
              // render batches in their own grids with the exact column count from the source sheet
              const rows: JSX.Element[] = [];
              let currentBatch: string | null = null;
              let colCount = 7;
              let colIndex = 0;
              let currentRow: JSX.Element[] = [];
              const flushRow = () => {
                if (!currentRow.length || !currentBatch) return;
                rows.push(<div key={`row-${rows.length}-${currentBatch}-${Math.random()}`} className="tiles-row" style={{ gridTemplateColumns: `repeat(${Math.max(colCount, tilesPerRow)}, ${tileThumb}px)` }}>{currentRow}</div>);
                currentRow = []; colIndex = 0;
              };
              const needle = tileSearch.trim().toLowerCase();
              tilesBySet[tileSet].forEach((t, idx) => {
                if (t.spacer) { flushRow(); rows.push(<div key={`sp-${rows.length}`} style={{ height: 8 }} />); currentBatch = null; return; }
                if (needle) {
                  const n = (t.name || '').toLowerCase();
                  const tags = (t.tags || []).join(' ').toLowerCase();
                  if (n.indexOf(needle) === -1 && tags.indexOf(needle) === -1) { colIndex = (colIndex + 1) % (batchMetaBySet[tileSet]?.[(t.batchId||'default')]?.cols || 12); return; }
                }
                const batchId = t.batchId || 'default';
                if (batchId !== currentBatch) { flushRow(); currentBatch = batchId; colCount = batchMetaBySet[tileSet]?.[batchId]?.cols || 12; }
                const isSel = selectedTileIndex === idx;
                const inDragSel = (stampSel.batchId === batchId) && stampSel.indices.includes(colIndex);
                currentRow.push(
                  <div key={t.id} data-batch={batchId} data-idx={colIndex} style={{ width: tileThumb, height: tileThumb, outline: isSel ? '2px solid #e67e22' : (inDragSel ? '2px solid #2c3e50' : 'none'), background: '#fff' }} onClick={() => setSelectedTileIndex(idx)}>
                    <canvas width={t.size} height={t.size} style={{ width: tileThumb, height: tileThumb, imageRendering: 'pixelated' }} ref={(el) => { if (el) renderPixelsToCanvas(el, t.pixels, t.size); }} />
                  </div>
                );
                colIndex = (colIndex + 1) % colCount;
              });
              flushRow();
              return rows;
            })()}
          </div>
        </div>
      )}

      {/* Layers panel */}
      <div className="layers-panel">
        <div className="layers-header">
          <div>Layers</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => {
            setLayers(prev => [...prev, { id: `layer-${Date.now()}`, name: `Layer ${prev.length+1}`, visible: true, locked: false, opacity: 1, cells: new Map() }]);
            setActiveLayerIndex(layers.length);
          }}>+ Layer</button>
        </div>
        <div className="layers-list">
          {layers.map((l, idx) => (
            <div key={l.id} className={`layer-item ${idx === activeLayerIndex ? 'active' : ''}`} onClick={() => setActiveLayerIndex(idx)}>
              <input type="checkbox" checked={l.visible} onChange={e => setLayers(prev => { const n=[...prev]; n[idx] = { ...n[idx], visible: e.target.checked }; return n; })} title="Visible" />
              <input type="checkbox" checked={l.locked} onChange={e => setLayers(prev => { const n=[...prev]; n[idx] = { ...n[idx], locked: e.target.checked }; return n; })} title="Lock" />
              <span style={{ flex: 1 }}>{l.name}</span>
              <input type="range" min={0} max={1} step={0.05} value={l.opacity} onChange={e => setLayers(prev => { const n=[...prev]; n[idx] = { ...n[idx], opacity: parseFloat(e.target.value) }; return n; })} title="Opacity" />
              <button onClick={(ev) => { ev.stopPropagation(); const name = prompt('Layer name?', l.name); if (name) setLayers(prev => { const n=[...prev]; n[idx] = { ...n[idx], name }; return n; }); }}>Rename</button>
              <button onClick={(ev) => { ev.stopPropagation(); if (idx>0) setLayers(prev => { const n=[...prev]; const t=n[idx]; n[idx]=n[idx-1]; n[idx-1]=t; return n; }); }}>↑</button>
              <button onClick={(ev) => { ev.stopPropagation(); if (idx<layers.length-1) setLayers(prev => { const n=[...prev]; const t=n[idx]; n[idx]=n[idx+1]; n[idx+1]=t; return n; }); }}>↓</button>
              <button onClick={(ev) => { ev.stopPropagation(); if (layers.length<=1) return; setLayers(prev => { const n=[...prev]; n.splice(idx,1); return n; }); setActiveLayerIndex(a => Math.max(0, Math.min(a, layers.length-2))); }}>🗑</button>
            </div>
          ))}
        </div>
      </div>

      {loadModalOpen && (
        <div className="modal-backdrop" onClick={() => setLoadModalOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">Load from Cloud</div>
            <div className="modal-tools">
              <select value={selectedLoadId} onChange={e => setSelectedLoadId(e.target.value)}>
                <option value="" disabled>Select a Project ID</option>
                {availableProjectIds.map(id => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
              <div style={{ flex: 1 }} />
              <button onClick={() => setLoadModalOpen(false)}>Cancel</button>
              <button onClick={confirmLoadSelected} disabled={!selectedLoadId}>Load</button>
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div className="modal-backdrop" onClick={closeImportModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">Import Tileset</div>
            <div className="modal-tools" style={{ gap: '0.75rem', flexWrap: 'wrap' as const }}>
              <input type="file" accept="image/*" onChange={e => { importFileRef.current = e.target.files && e.target.files[0] ? e.target.files[0] : null; }} />
              <label>Size
                <select value={importTileSize} onChange={e => setImportTileSize(parseInt(e.target.value,10))}>
                  {[8,16,24,32,48,64].map(s => <option key={s} value={s}>{s}x{s}</option>)}
                </select>
              </label>
              <label>Margin <input type="number" min={0} value={importMargin} onChange={e => setImportMargin(parseInt(e.target.value,10)||0)} /></label>
              <label>Spacing <input type="number" min={0} value={importSpacing} onChange={e => setImportSpacing(parseInt(e.target.value,10)||0)} /></label>
              <label>Group <input type="text" placeholder="optional auto group" value={importGroup} onChange={e => setImportGroup(e.target.value)} /></label>
              <div style={{ flex: 1 }} />
              <button onClick={closeImportModal}>Cancel</button>
              <button onClick={doImportTileset}>Slice & Import</button>
            </div>
          </div>
        </div>
      )}

      {autoConfigOpen && (
        <div className="modal-backdrop" onClick={() => setAutoConfigOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">Auto-tiling Setup – {tileSet}</div>
            <div className="modal-tools" style={{ gap: '0.75rem', flexWrap: 'wrap' as const }}>
              <label>Group
                <input type="text" value={autoConfigGroup} onChange={e => setAutoConfigGroup(e.target.value)} />
              </label>
              <div style={{ flex: 1 }} />
              <button onClick={() => setAutoConfigOpen(false)}>Close</button>
            </div>
            <div className="modal-canvas" style={{ display: 'block' }}>
              <div style={{ padding: '1rem' }}>
                <div style={{ marginBottom: 8, fontWeight: 600, display:'flex', alignItems:'center', gap:8 }}>
                  <span>3x3 Template</span>
                  <div style={{ marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:6 }}>
                    <span style={{ fontSize:12 }}>Zoom</span>
                    <input type="range" min={12} max={48} step={2} value={tileThumb} onChange={e => setTileThumb(parseInt(e.target.value,10))} />
                    <span style={{ fontSize:12 }}>Cols</span>
                    <input type="number" min={8} max={64} value={tilesPerRow} onChange={e => setTilesPerRow(Math.max(8, Math.min(64, parseInt(e.target.value,10)||25)))} style={{ width: 56 }} />
                    <button onClick={() => setTilesPerRow(v => Math.max(8, v-1))}>−</button>
                    <button onClick={() => setTilesPerRow(v => Math.min(64, v+1))}>+</button>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(3, ${tileThumb*2}px)`, gap: 6, justifyContent: 'center' }}>
                  {['top-left','top','top-right','left','center','right','bottom-left','bottom','bottom-right'].map((role) => (
                    <div key={role} style={{ border: autoTemplateActiveRole === role ? '2px solid #e67e22' : '1px solid #bdc3c7', width: tileThumb*2, height: tileThumb*2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }} onClick={() => setAutoTemplateActiveRole(role)}>
                      {(autoTemplateBySet[tileSet]?.[autoConfigGroup]?.[role] !== undefined) ? (
                        <canvas
                          width={editorTileSize}
                          height={editorTileSize}
                          style={{ width: tileThumb*2-6, height: tileThumb*2-6, imageRendering: 'pixelated' }}
                          ref={(el)=>{ const tIdx = autoTemplateBySet[tileSet][autoConfigGroup][role]!; if (el) { const t = tilesBySet[tileSet]?.[tIdx]; if (t) renderPixelsToCanvas(el, t.pixels, t.size); } }}
                        />
                      ) : (
                        <span style={{ fontSize: 10 }}>{role}</span>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 12, fontSize: 12, textAlign: 'center' }}>Pick a cell, then click a tile below to assign it.</div>
                <div style={{ marginTop: 10 }}>
                  {(() => {
                    const rows: JSX.Element[] = [];
                    let currentBatch: string | null = null;
                    let colCount = 7;
                    let colIndex = 0;
                    let currentRow: JSX.Element[] = [];
                    const flushRow = () => {
                      if (!currentRow.length || !currentBatch) return;
                      rows.push(<div key={`cfg-row-${rows.length}-${currentBatch}-${Math.random()}`} className="tiles-row" style={{ gridTemplateColumns: `repeat(${Math.max(colCount, tilesPerRow)}, ${tileThumb}px)` }}>{currentRow}</div>);
                      currentRow = []; colIndex = 0;
                    };
                    tilesBySet[tileSet]?.forEach((t, idx) => {
                      if (t.spacer) { flushRow(); rows.push(<div key={`cfg-sp-${rows.length}`} style={{ height: 8 }} />); currentBatch = null; return; }
                      const batchId = t.batchId || 'default';
                      if (batchId !== currentBatch) { flushRow(); currentBatch = batchId; colCount = batchMetaBySet[tileSet]?.[batchId]?.cols || 12; }
                      currentRow.push(
                        <div key={`cfg-${t.id}`} style={{ width: tileThumb, height: tileThumb, background: '#fff' }} onClick={() => {
                          setAutoTemplateBySet(prev => {
                            const next = { ...prev } as Record<string, Record<string, Record<string, number>>>;
                            if (!next[tileSet]) next[tileSet] = {};
                            if (!next[tileSet][autoConfigGroup]) next[tileSet][autoConfigGroup] = {} as Record<string, number>;
                            next[tileSet][autoConfigGroup][autoTemplateActiveRole] = idx;
                            return next;
                          });
                          const masks = roleToMasks(autoTemplateActiveRole);
                          if (masks.length) {
                            setAutoRulesBySet(prev => {
                              const n = { ...prev } as Record<string, Record<string, Record<number, number[]>>>;
                              if (!n[tileSet]) n[tileSet] = {};
                              if (!n[tileSet][autoConfigGroup]) n[tileSet][autoConfigGroup] = {} as Record<number, number[]>;
                              masks.forEach(m => { n[tileSet][autoConfigGroup][m] = [idx]; });
                              return n;
                            });
                          }
                        }}>
                          <canvas width={t.size} height={t.size} style={{ width: tileThumb, height: tileThumb, imageRendering: 'pixelated' }} ref={(el) => { if (el) { renderPixelsToCanvas(el, t.pixels, t.size); } }} />
                        </div>
                      );
                      colIndex = (colIndex + 1) % colCount;
                    });
                    flushRow();
                    return rows;
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status bar */}
      <div className="statusbar">
        <div>Tool: {tool}</div>
        <div>Layer: {layers[activeLayerIndex]?.name || '-'}</div>
        <div>Coords: {hoveredTileRef.current ? `${hoveredTileRef.current.i},${hoveredTileRef.current.j}` : '-'}</div>
      </div>
    </div>
  );
}
