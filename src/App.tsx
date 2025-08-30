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
  const [tool, setTool] = useState<'brush' | 'eraser'>('brush');
  const [tileSet, setTileSet] = useState<TileSetName>('grassland');
  const [colorIndex, setColorIndex] = useState(0);
  const [grid, setGrid] = useState(true);
  const [board, setBoard] = useState<Map<string, { color: string }>>(new Map());
  const offsetRef = useRef({ x: 0, y: 0 });
  const scaleRef = useRef(1);
  const isPanningRef = useRef(false);
  const lastPanPosRef = useRef({ x: 0, y: 0 });
  const hoveredTileRef = useRef<{ i: number; j: number } | null>(null);

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

      board.forEach(({color}, key) => {
        const [iStr, jStr] = key.split(',');
        const i = parseInt(iStr, 10);
        const j = parseInt(jStr, 10);
        const pos = isoToScreen(i,j);
        ctx.fillStyle = color;
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
    const color = tileSets[tileSet][colorIndex % tileSets[tileSet].length];
    setBoard(prev => {
      const next = new Map(prev);
      next.set(key, { color });
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

  function exportJSON() {
    const obj: Record<string, string> = {};
    board.forEach((val,key) => { obj[key] = val.color; });
    const data = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(obj));
    const link = document.createElement('a');
    link.href = data;
    link.download = 'board.json';
    link.click();
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
    </div>
  );
}
