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
  const hoverSpriteRef = useRef<PIXI.Graphics | null>(null);
  const tileCacheRef = useRef<Map<string, PIXI.Texture>>(new Map());
  const isDraggingRef = useRef(false);
  const pendingCellsRef = useRef<Map<string, BoardCell> | null>(null);
  const [hoveredTile, setHoveredTile] = useState<{ i: number; j: number } | null>(null);

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

    // Create PixiJS application
    const app = new PIXI.Application({
      width: window.innerWidth,
      height: window.innerHeight - 100, // Account for UI
      backgroundColor: 0xf5f5f5,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true
    });

    mountRef.current.appendChild(app.view as HTMLCanvasElement);
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
      if (!app) return;
      app.renderer.resize(window.innerWidth, window.innerHeight - 100);
      viewport.x = app.screen.width / 2;
      viewport.y = app.screen.height / 2;
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
        const layer = layers[activeLayerIndex];
        if (layer && !layer.locked) {
          pendingCellsRef.current = new Map(layer.cells);
          paintAt(i, j);
        }
      } else if (e.button === 2) { // Right click - erase
        isDraggingRef.current = true;
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
        if (e.buttons & 1) {
          paintAt(i, j);
        } else if (e.buttons & 2) {
          eraseAt(i, j);
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
      
      // Trigger re-render
      updateLayerSprites();
    };

    const eraseAt = (i: number, j: number) => {
      if (!pendingCellsRef.current) return;
      const key = `${i},${j}`;
      pendingCellsRef.current.delete(key);
      updateLayerSprites();
    };

    app.stage.on('pointerdown', handlePointerDown);
    app.stage.on('pointermove', handlePointerMove);
    app.stage.on('pointerup', handlePointerUp);
    app.stage.on('pointerupoutside', handlePointerUp);
    app.view.addEventListener?.('wheel', handleWheel);

    return () => {
      window.removeEventListener('resize', handleResize);
      app.view.removeEventListener?.('wheel', handleWheel);
      app.destroy(true, { children: true, texture: true, baseTexture: true });
      if (mountRef.current?.contains(app.view as HTMLCanvasElement)) {
        mountRef.current.removeChild(app.view as HTMLCanvasElement);
      }
    };
  }, []); // Only run once on mount

  // Update layer sprites when cells change
  const updateLayerSprites = useCallback(() => {
    if (!viewportRef.current) return;
    
    // Clear existing layer containers
    layerContainersRef.current.forEach(container => {
      container.destroy({ children: true });
    });
    layerContainersRef.current = [];
    
    // Create sprites for each layer
    layers.forEach((layer, layerIdx) => {
      if (!layer.visible) return;
      
      const container = new PIXI.Container();
      container.alpha = layer.opacity;
      
      // Use pending cells for active layer during drag
      const cells = (layerIdx === activeLayerIndex && pendingCellsRef.current) 
        ? pendingCellsRef.current 
        : layer.cells;
      
      cells.forEach((cell, key) => {
        const [iStr, jStr] = key.split(',');
        const i = parseInt(iStr, 10);
        const j = parseInt(jStr, 10);
        const pos = isoToScreen(i, j);
        
        if (cell.tileSet !== undefined && cell.tileIndex !== undefined) {
          const texture = getTextureForTile(cell.tileSet, cell.tileIndex);
          if (texture) {
            const sprite = new PIXI.Sprite(texture);
            sprite.anchor.set(0.5, 0.5);
            sprite.x = pos.x;
            sprite.y = pos.y;
            
            // Scale to fit isometric tile
            const scaleX = tileW / texture.width;
            const scaleY = tileH / texture.height;
            sprite.scale.set(scaleX, scaleY);
            
            container.addChild(sprite);
          }
        } else if (cell.color) {
          const graphics = new PIXI.Graphics();
          graphics.beginFill(parseInt(cell.color.replace('#', '0x')));
          graphics.moveTo(pos.x, pos.y - tileH/2);
          graphics.lineTo(pos.x + tileW/2, pos.y);
          graphics.lineTo(pos.x, pos.y + tileH/2);
          graphics.lineTo(pos.x - tileW/2, pos.y);
          graphics.closePath();
          graphics.endFill();
          container.addChild(graphics);
        }
      });
      
      viewportRef.current?.addChildAt(container, 1 + layerIdx); // After grid
      layerContainersRef.current.push(container);
    });
  }, [layers, activeLayerIndex, pendingCellsRef.current]);

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

  // Update layers when they change
  useEffect(() => {
    updateLayerSprites();
  }, [layers, updateLayerSprites]);

  return <div ref={mountRef} style={{ width: '100%', height: 'calc(100vh - 100px)' }} />;
}
