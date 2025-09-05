import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as PIXI from 'pixi.js';

const tileW = 64;
const tileH = 32;

type BoardCell = { color?: string; tileSet?: string; tileIndex?: number };
type Layer = { 
  id: string; 
  name: string; 
  visible: boolean; 
  locked: boolean; 
  opacity: number; 
  cells: Map<string, BoardCell>; 
  props?: Record<string, string> 
};

interface PixiAppProps {
  layers: Layer[];
  grid: boolean;
  tool: 'brush' | 'eraser' | 'fill' | 'stamp';
  tileSet: string;
  selectedTileIndex: number | null;
  colorIndex: number;
  paletteBySet: Record<string, string[]>;
  tilesBySet: Record<string, any[]>;
  activeLayerIndex: number;
  onCellsUpdate: (layerIndex: number, cells: Map<string, BoardCell>) => void;
  stamp: { set: string; w: number; h: number; tiles: number[] } | null;
  autoTiling: boolean;
  autoGroup: string;
}

export default function PixiApp({
  layers,
  grid,
  tool,
  tileSet,
  selectedTileIndex,
  colorIndex,
  paletteBySet,
  tilesBySet,
  activeLayerIndex,
  onCellsUpdate,
  stamp,
  autoTiling,
  autoGroup
}: PixiAppProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const viewportRef = useRef<PIXI.Container | null>(null);
  const gridContainerRef = useRef<PIXI.Container | null>(null);
  const layerContainersRef = useRef<PIXI.Container[]>([]);
  const layerSpriteMapsRef = useRef<Map<string, PIXI.DisplayObject>[]>([]);
  const hoverSpriteRef = useRef<PIXI.Graphics | null>(null);
  const tileCacheRef = useRef<Map<string, PIXI.Texture>>(new Map());
  const isDraggingRef = useRef(false);
  const pendingCellsRef = useRef<Map<string, BoardCell> | null>(null);
  const [hoveredTile, setHoveredTile] = useState<{ i: number; j: number } | null>(null);
  const lastDragKeyRef = useRef<string | null>(null);
  const initializedRef = useRef(false);

  // Convert isometric coordinates
  const isoToScreen = (i: number, j: number) => {
    const x = (i - j) * (tileW / 2);
    const y = (i + j) * (tileH / 2);
    return { x, y };
  };

  const screenToIso = (x: number, y: number) => {
    const fi = (y / (tileH/2) + x / (tileW/2)) / 2;
    const fj = (y / (tileH/2) - x / (tileW/2)) / 2;
    return { i: Math.round(fi), j: Math.round(fj) };
  };

  // Get or create texture for a tile
  const getTextureForTile = (tileSetName: string, tileIndex: number): PIXI.Texture | null => {
    const tile = (tilesBySet[tileSetName] || [])[tileIndex];
    if (!tile) return null;
    
    const key = `${tileSetName}:${tileIndex}`;
    let texture = tileCacheRef.current.get(key);
    
    if (!texture) {
      // Create canvas for tile
      const canvas = document.createElement('canvas');
      canvas.width = tile.size;
      canvas.height = tile.size;
      const ctx = canvas.getContext('2d')!;
      
      // Render pixels to canvas
      const imageData = ctx.createImageData(tile.size, tile.size);
      for (let y = 0; y < tile.size; y++) {
        for (let x = 0; x < tile.size; x++) {
          const idx = y * tile.size + x;
          const base = idx * 4;
          const color = tile.pixels[idx];
          if (!color) {
            imageData.data[base + 3] = 0;
          } else {
            const hex = color.replace('#','');
            const bigint = parseInt(hex.length === 3 ? hex.split('').map((c: string)=>c+c).join('') : hex, 16);
            imageData.data[base + 0] = (bigint >> 16) & 255;
            imageData.data[base + 1] = (bigint >> 8) & 255;
            imageData.data[base + 2] = bigint & 255;
            imageData.data[base + 3] = 255;
          }
        }
      }
      ctx.putImageData(imageData, 0, 0);
      
      texture = PIXI.Texture.from(canvas);
      tileCacheRef.current.set(key, texture);
    }
    
    return texture;
  };

  // Initialize PixiJS
  useEffect(() => {
    if (!mountRef.current) return;

    // Create PixiJS application with async init for v8
    const initApp = async () => {
      const app = new PIXI.Application();
      
      await app.init({
        width: window.innerWidth,
        height: window.innerHeight - 100, // Account for UI
        backgroundColor: 0xf5f5f5,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true
      });

      if (!mountRef.current) return; // component unmounted
      mountRef.current.appendChild(app.canvas);
      appRef.current = app;

    // Create main viewport container
    const viewport = new PIXI.Container();
    viewport.x = app.screen.width / 2;
    viewport.y = app.screen.height / 2;
    app.stage.addChild(viewport);
    viewportRef.current = viewport;

    // Create grid container
    const gridContainer = new PIXI.Container();
    viewport.addChild(gridContainer);
    gridContainerRef.current = gridContainer;

    // Create hover sprite
    const hoverSprite = new PIXI.Graphics();
    viewport.addChild(hoverSprite);
    hoverSpriteRef.current = hoverSprite;

    // Handle resize
    const handleResize = () => {
      if (!appRef.current) return;
      appRef.current.renderer.resize(window.innerWidth, window.innerHeight - 100);
      viewportRef.current!.x = appRef.current.screen.width / 2;
      viewportRef.current!.y = appRef.current.screen.height / 2;
    };
    window.addEventListener('resize', handleResize);

    // Mouse interactions
    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;

    let isPanning = false;
    let lastPanPos = { x: 0, y: 0 };

    const handlePointerDown = (e: PIXI.FederatedPointerEvent) => {
      const localPos = viewport.toLocal(e.global);
      const { i, j } = screenToIso(localPos.x, localPos.y);
      
      if (e.button === 1) { // Middle mouse - pan
        isPanning = true;
        lastPanPos = { x: e.global.x, y: e.global.y };
      } else if (e.button === 0) { // Left click - paint
        isDraggingRef.current = true;
        lastDragKeyRef.current = null;
        const layer = layers[activeLayerIndex];
        if (layer && !layer.locked) {
          pendingCellsRef.current = new Map(layer.cells);
          paintAt(i, j);
        }
      } else if (e.button === 2) { // Right click - erase
        isDraggingRef.current = true;
        lastDragKeyRef.current = null;
        const layer = layers[activeLayerIndex];
        if (layer && !layer.locked) {
          pendingCellsRef.current = new Map(layer.cells);
          eraseAt(i, j);
        }
      }
    };

    const handlePointerMove = (e: PIXI.FederatedPointerEvent) => {
      const localPos = viewport.toLocal(e.global);
      const { i, j } = screenToIso(localPos.x, localPos.y);
      
      if (isPanning) {
        const dx = e.global.x - lastPanPos.x;
        const dy = e.global.y - lastPanPos.y;
        viewport.x += dx;
        viewport.y += dy;
        lastPanPos = { x: e.global.x, y: e.global.y };
      } else if (isDraggingRef.current && pendingCellsRef.current) {
        const key = `${i},${j}`;
        if (lastDragKeyRef.current !== key) {
          lastDragKeyRef.current = key;
          if (e.buttons & 1) {
            paintAt(i, j);
          } else if (e.buttons & 2) {
            eraseAt(i, j);
          }
        }
      }
      
      setHoveredTile({ i, j });
    };

    const handlePointerUp = () => {
      isPanning = false;
      
      // Commit pending changes
      if (isDraggingRef.current && pendingCellsRef.current) {
        onCellsUpdate(activeLayerIndex, pendingCellsRef.current);
        pendingCellsRef.current = null;
      }
      isDraggingRef.current = false;
      lastDragKeyRef.current = null;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY / 500;
      const newScale = Math.min(4, Math.max(0.25, viewport.scale.x * (1 + delta)));
      viewport.scale.set(newScale, newScale);
    };

    const paintAt = (i: number, j: number) => {
      if (!pendingCellsRef.current) return;
      const key = `${i},${j}`;
      
      if (selectedTileIndex !== null) {
        pendingCellsRef.current.set(key, { tileSet, tileIndex: selectedTileIndex });
      } else {
        const pal = paletteBySet[tileSet] || ['#ffffff'];
        const color = pal[colorIndex % pal.length];
        pendingCellsRef.current.set(key, { color });
      }
      
      // Apply only this cell to the scene
      upsertCellDisplay(activeLayerIndex, i, j, pendingCellsRef.current.get(key)!);
    };

    const eraseAt = (i: number, j: number) => {
      if (!pendingCellsRef.current) return;
      const key = `${i},${j}`;
      pendingCellsRef.current.delete(key);
      removeCellDisplay(activeLayerIndex, i, j);
    };

    app.stage.on('pointerdown', handlePointerDown);
    app.stage.on('pointermove', handlePointerMove);
    app.stage.on('pointerup', handlePointerUp);
    app.stage.on('pointerupoutside', handlePointerUp);
    app.canvas.addEventListener?.('wheel', handleWheel);

    // Mark ready and build initial scene
    initializedRef.current = true;
    rebuildAllLayersFromState();
    };

    initApp();

    // Cleanup function
    return () => {
      const cleanup = async () => {
        if (appRef.current) {
          window.removeEventListener('resize', handleResize);
          appRef.current.canvas.removeEventListener?.('wheel', handleWheel);
          appRef.current.destroy(true, { children: true, texture: true, baseTexture: true });
          if (mountRef.current?.contains(appRef.current.canvas)) {
            mountRef.current.removeChild(appRef.current.canvas);
          }
          appRef.current = null;
        }
      };
      cleanup();
    };
  }, []); // Only run once on mount

  // Ensure containers & sprite maps exist and reflect layer props
  const ensureLayerContainers = useCallback(() => {
    if (!viewportRef.current) return;
    if (!initializedRef.current) return;
    // Grow arrays as needed
    for (let idx = 0; idx < layers.length; idx++) {
      if (!layerContainersRef.current[idx]) {
        const container = new PIXI.Container();
        viewportRef.current.addChild(container);
        layerContainersRef.current[idx] = container;
      }
      if (!layerSpriteMapsRef.current[idx]) {
        layerSpriteMapsRef.current[idx] = new Map();
      }
      // Apply layer props
      const layer = layers[idx];
      const container = layerContainersRef.current[idx];
      container.alpha = layer.opacity;
      container.visible = layer.visible;
      // Ensure order: grid (0), then layers in order
      if (viewportRef.current.getChildIndex(container) !== 1 + idx) {
        viewportRef.current.addChildAt(container, 1 + idx);
      }
    }
    // Remove extra containers/maps if layers shrank
    for (let idx = layers.length; idx < layerContainersRef.current.length; idx++) {
      const c = layerContainersRef.current[idx];
      if (c) c.destroy({ children: true });
    }
    layerContainersRef.current.length = layers.length;
    layerSpriteMapsRef.current.length = layers.length;
  }, [layers]);

  // Create display object for a cell
  const createDisplayForCell = (i: number, j: number, cell: BoardCell): PIXI.DisplayObject | null => {
    const pos = isoToScreen(i, j);
    if (cell.tileSet !== undefined && cell.tileIndex !== undefined) {
      const texture = getTextureForTile(cell.tileSet, cell.tileIndex);
      if (!texture) return null;
      const sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5, 0.5);
      sprite.x = pos.x;
      sprite.y = pos.y;
      const scaleX = tileW / texture.width;
      const scaleY = tileH / texture.height;
      sprite.scale.set(scaleX, scaleY);
      return sprite;
    }
    if (cell.color) {
      const graphics = new PIXI.Graphics();
      const color = parseInt(cell.color.replace('#', '0x'));
      graphics.beginFill(color);
      graphics.moveTo(pos.x, pos.y - tileH/2);
      graphics.lineTo(pos.x + tileW/2, pos.y);
      graphics.lineTo(pos.x, pos.y + tileH/2);
      graphics.lineTo(pos.x - tileW/2, pos.y);
      graphics.closePath();
      graphics.endFill();
      return graphics;
    }
    return null;
  };

  // Upsert a single cell's display object
  const upsertCellDisplay = (layerIdx: number, i: number, j: number, cell: BoardCell) => {
    ensureLayerContainers();
    const key = `${i},${j}`;
    const map = layerSpriteMapsRef.current[layerIdx];
    const container = layerContainersRef.current[layerIdx];
    if (!map || !container) return;
    // Remove old if exists
    const old = map.get(key);
    if (old) {
      old.destroy();
      container.removeChild(old);
      map.delete(key);
    }
    const display = createDisplayForCell(i, j, cell);
    if (display) {
      container.addChild(display);
      map.set(key, display);
    }
  };

  // Remove a single cell's display object
  const removeCellDisplay = (layerIdx: number, i: number, j: number) => {
    ensureLayerContainers();
    const key = `${i},${j}`;
    const map = layerSpriteMapsRef.current[layerIdx];
    const container = layerContainersRef.current[layerIdx];
    if (!map || !container) return;
    const old = map.get(key);
    if (old) {
      old.destroy();
      container.removeChild(old);
      map.delete(key);
    }
  };

  // Full rebuild only when layers array changes (not on every paint)
  const rebuildAllLayersFromState = useCallback(() => {
    ensureLayerContainers();
    if (!initializedRef.current) return;
    for (let idx = 0; idx < layers.length; idx++) {
      const container = layerContainersRef.current[idx];
      const map = layerSpriteMapsRef.current[idx];
      if (!container || !map) continue;
      // Clear existing
      if ((container as any).removeChildren) container.removeChildren();
      map.forEach(d => d?.destroy?.());
      map.clear();
      const cells = layers[idx].cells;
      cells.forEach((cell, key) => {
        const [iStr, jStr] = key.split(',');
        const i = parseInt(iStr, 10);
        const j = parseInt(jStr, 10);
        const display = createDisplayForCell(i, j, cell);
        if (display) {
          container.addChild(display);
          map.set(key, display);
        }
      });
    }
  }, [layers, ensureLayerContainers]);

  // Update grid
  useEffect(() => {
    if (!gridContainerRef.current) return;
    
    gridContainerRef.current.removeChildren();
    
    if (grid) {
      const graphics = new PIXI.Graphics();
      graphics.lineStyle(1, 0x000000, 0.1);
      
      const range = 50;
      for (let i = -range; i <= range; i++) {
        for (let j = -range; j <= range; j++) {
          const pos = isoToScreen(i, j);
          graphics.moveTo(pos.x, pos.y - tileH/2);
          graphics.lineTo(pos.x + tileW/2, pos.y);
          graphics.lineTo(pos.x, pos.y + tileH/2);
          graphics.lineTo(pos.x - tileW/2, pos.y);
          graphics.closePath();
        }
      }
      
      gridContainerRef.current.addChild(graphics);
    }
  }, [grid]);

  // Update hover
  useEffect(() => {
    if (!hoverSpriteRef.current || !hoveredTile) return;
    
    hoverSpriteRef.current.clear();
    
    const { i, j } = hoveredTile;
    const pos = isoToScreen(i, j);
    
    hoverSpriteRef.current.lineStyle(2, 0xffffff, 0.9);
    hoverSpriteRef.current.beginFill(0xffffff, 0.15);
    hoverSpriteRef.current.moveTo(pos.x, pos.y - tileH/2);
    hoverSpriteRef.current.lineTo(pos.x + tileW/2, pos.y);
    hoverSpriteRef.current.lineTo(pos.x, pos.y + tileH/2);
    hoverSpriteRef.current.lineTo(pos.x - tileW/2, pos.y);
    hoverSpriteRef.current.closePath();
    hoverSpriteRef.current.endFill();
  }, [hoveredTile]);

  // Rebuild all layers whenever layers array changes (structure changes)
  useEffect(() => {
    rebuildAllLayersFromState();
  }, [layers, rebuildAllLayersFromState]);

  return <div ref={mountRef} style={{ width: '100%', height: 'calc(100vh - 100px)' }} />;
}
