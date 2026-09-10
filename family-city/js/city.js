// The isometric city. Pure SVG — every building is a tabbable button,
// so the map is usable with a keyboard as well as a mouse.

import { svg, clear } from './util.js';
import { CITY_COLS, CITY_ROWS } from './store.js';
import { getModule } from './registry.js';
import { summaryOf } from './engine.js';

const TILE_W = 178;
const TILE_H = 98;
const LIFT = 32; // pixel height of one "storey"

const view = { x: 0, y: 0, scale: 1, ready: false };

function project(x, y) {
  return { sx: (x - y) * (TILE_W / 2), sy: (x + y) * (TILE_H / 2) };
}

function shade(hex, amount) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const clampByte = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clampByte(((n >> 16) & 255) * amount);
  const g = clampByte(((n >> 8) & 255) * amount);
  const b = clampByte((n & 255) * amount);
  return `rgb(${r}, ${g}, ${b})`;
}

export function createCity({ host, onSelect, onPlaceTile }) {
  const root = svg('svg', {
    class: 'city-svg',
    xmlns: 'http://www.w3.org/2000/svg',
    role: 'application',
    'aria-label': 'City map',
  });
  const scene = svg('g', { class: 'scene' });
  root.appendChild(defs());
  root.appendChild(scene);
  host.appendChild(root);

  let mode = { placeType: null, selectedId: null };

  /* ---------- pan & zoom ---------- */
  let dragging = null;
  root.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.b-hit') || e.target.closest('.tile-empty')) return;
    dragging = { x: e.clientX, y: e.clientY, ox: view.x, oy: view.y };
    root.setPointerCapture(e.pointerId);
    root.classList.add('grabbing');
  });
  root.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    view.x = dragging.ox + (e.clientX - dragging.x);
    view.y = dragging.oy + (e.clientY - dragging.y);
    applyView();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = null;
    root.classList.remove('grabbing');
    try { root.releasePointerCapture(e.pointerId); } catch { /* pointer already gone */ }
  };
  root.addEventListener('pointerup', endDrag);
  root.addEventListener('pointercancel', endDrag);
  root.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    setScale(view.scale * factor);
  }, { passive: false });

  function setScale(next) {
    view.scale = Math.max(0.4, Math.min(2.2, next));
    applyView();
  }

  function applyView() {
    scene.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.scale})`);
  }

  function center() {
    const rect = host.getBoundingClientRect();
    const mid = project((CITY_COLS - 1) / 2, (CITY_ROWS - 1) / 2);
    view.x = rect.width / 2 - mid.sx * view.scale;
    view.y = rect.height / 2 - mid.sy * view.scale - 40;
    applyView();
  }

  /* ---------- render ---------- */
  function render(state, nextMode = {}) {
    mode = { ...mode, ...nextMode };
    clear(scene);

    const taken = new Map(state.buildings.map((b) => [`${b.tile.x},${b.tile.y}`, b]));
    const ground = svg('g', { class: 'ground' });
    for (let y = 0; y < CITY_ROWS; y += 1) {
      for (let x = 0; x < CITY_COLS; x += 1) {
        ground.appendChild(tile(x, y, taken.has(`${x},${y}`)));
      }
    }
    scene.appendChild(ground);

    const hall = state.buildings.find((b) => b.type === 'hall');
    if (hall) {
      const links = svg('g', { class: 'links' });
      const from = project(hall.tile.x, hall.tile.y);
      for (const b of state.buildings) {
        if (b === hall) continue;
        const to = project(b.tile.x, b.tile.y);
        links.appendChild(svg('path', {
          class: 'link',
          d: `M ${from.sx} ${from.sy - LIFT} Q ${(from.sx + to.sx) / 2} ${Math.min(from.sy, to.sy) - 120} ${to.sx} ${to.sy - LIFT}`,
        }));
      }
      scene.appendChild(links);
    }

    const sorted = [...state.buildings].sort((a, b) => (a.tile.x + a.tile.y) - (b.tile.x + b.tile.y));
    const structures = svg('g', { class: 'structures' });
    const labels = svg('g', { class: 'labels' });
    for (const b of sorted) {
      structures.appendChild(structure(b, b.id === mode.selectedId));
      labels.appendChild(label(b, b.id === mode.selectedId));
    }
    scene.appendChild(structures);
    scene.appendChild(labels);

    if (mode.placeType) {
      const overlay = svg('g', { class: 'place-overlay' });
      for (let y = 0; y < CITY_ROWS; y += 1) {
        for (let x = 0; x < CITY_COLS; x += 1) {
          if (taken.has(`${x},${y}`)) continue;
          overlay.appendChild(emptySlot(x, y));
        }
      }
      scene.appendChild(overlay);
    }

    if (!view.ready) { view.ready = true; center(); } else applyView();
  }

  function tile(x, y, occupied) {
    const { sx, sy } = project(x, y);
    return svg('polygon', {
      class: `tile${occupied ? ' filled' : ''}`,
      points: diamond(sx, sy),
    });
  }

  function emptySlot(x, y) {
    const { sx, sy } = project(x, y);
    const g = svg('g', {
      class: 'tile-empty',
      tabindex: '0',
      role: 'button',
      'aria-label': `Place building at ${x}, ${y}`,
      onclick: () => onPlaceTile({ x, y }),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPlaceTile({ x, y }); } },
    });
    g.appendChild(svg('polygon', { class: 'slot', points: diamond(sx, sy) }));
    g.appendChild(svg('text', { class: 'slot-plus', x: sx, y: sy + 8, 'text-anchor': 'middle' }, ['＋']));
    return g;
  }

  function diamond(sx, sy, inset = 6) {
    const w = TILE_W / 2 - inset;
    const h = TILE_H / 2 - inset / 2;
    return `${sx},${sy - h} ${sx + w},${sy} ${sx},${sy + h} ${sx - w},${sy}`;
  }

  function structure(b, selected) {
    const mod = getModule(b.type);
    const accent = b.accent || mod.accent || '#7aa2ff';
    const { sx, sy } = project(b.tile.x, b.tile.y);
    const h = LIFT * (mod.height || 1);
    const w = TILE_W / 2 - 40;
    const d = TILE_H / 2 - 22;

    const g = svg('g', {
      class: `b-hit${selected ? ' selected' : ''}`,
      tabindex: '0',
      role: 'button',
      'aria-label': `${b.name}, run by ${b.agent}`,
      onclick: () => onSelect(b.id),
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(b.id); } },
    });

    if (selected) {
      g.appendChild(svg('polygon', { class: 'b-ring', points: diamond(sx, sy, 0), style: `--accent:${accent}` }));
    }

    g.appendChild(svg('ellipse', { class: 'b-glow', cx: sx, cy: sy + 4, rx: w + 14, ry: d + 8, fill: accent, opacity: '0.16' }));
    // left face
    g.appendChild(svg('polygon', {
      class: 'face',
      points: `${sx - w},${sy} ${sx},${sy + d} ${sx},${sy + d - h} ${sx - w},${sy - h}`,
      fill: shade(accent, 0.34),
    }));
    // right face
    g.appendChild(svg('polygon', {
      class: 'face',
      points: `${sx + w},${sy} ${sx},${sy + d} ${sx},${sy + d - h} ${sx + w},${sy - h}`,
      fill: shade(accent, 0.5),
    }));
    // roof
    g.appendChild(svg('polygon', {
      class: 'face roof',
      points: `${sx},${sy - d - h} ${sx + w},${sy - h} ${sx},${sy + d - h} ${sx - w},${sy - h}`,
      fill: shade(accent, 0.78),
    }));
    // windows
    const rows = Math.max(1, Math.round((mod.height || 1) * 2));
    for (let r = 0; r < rows; r += 1) {
      const oy = sy - h + 16 + r * 22;
      if (oy > sy + d - 8) continue;
      g.appendChild(svg('polygon', {
        class: 'window',
        points: `${sx - w + 12},${oy + 6} ${sx - 12},${oy + 20} ${sx - 12},${oy + 8} ${sx - w + 12},${oy - 6}`,
        fill: accent,
        opacity: '0.75',
      }));
      g.appendChild(svg('polygon', {
        class: 'window',
        points: `${sx + 12},${oy + 20} ${sx + w - 12},${oy + 6} ${sx + w - 12},${oy - 6} ${sx + 12},${oy + 8}`,
        fill: accent,
        opacity: '0.45',
      }));
    }
    // roof icon
    g.appendChild(svg('text', {
      class: 'b-icon', x: sx, y: sy - h - 6, 'text-anchor': 'middle',
    }, [mod.icon]));

    return g;
  }

  function label(b, selected) {
    const mod = getModule(b.type);
    const accent = b.accent || mod.accent || '#7aa2ff';
    const { sx, sy } = project(b.tile.x, b.tile.y);
    const h = LIFT * (mod.height || 1);
    const top = sy - h - TILE_H / 2 - 18;
    const summary = summaryOf(b);
    const status = b.process.lastStatus || 'idle';

    // A dense city means labels will sometimes sit over other rooftops, so
    // each one gets its own plate rather than relying on a text halo.
    const name = b.name;
    const sub = `${b.agent} · ${summary.line}`;
    const width = Math.max(name.length * 7, sub.length * 5.4) + 18;
    const height = 34;

    // Lean the plate outward, away from the centre column.
    const side = sx < -1 ? -1 : sx > 1 ? 1 : (b.tile.x + b.tile.y) % 2 ? -1 : 1;
    const px = sx + side * 14 - (side < 0 ? width : 0);
    const py = top - 26 - height;

    const g = svg('g', { class: `b-label ${status}${selected ? ' selected' : ''}`, 'pointer-events': 'none' });
    g.appendChild(svg('line', { class: 'pin', x1: sx, y1: top, x2: sx, y2: top - 22, stroke: accent }));
    g.appendChild(svg('circle', { class: 'pin-dot', cx: sx, cy: top - 26, r: 4, fill: accent }));
    g.appendChild(svg('rect', {
      class: 'lab-plate', x: px, y: py, width, height, rx: 8, style: `--accent:${accent}`,
    }));
    g.appendChild(svg('rect', { class: 'lab-edge', x: px, y: py, width: 2.5, height, rx: 1.5, fill: accent }));
    g.appendChild(svg('text', { class: 'lab-name', x: px + 9, y: py + 15 }, [name]));
    g.appendChild(svg('text', { class: 'lab-sub', x: px + 9, y: py + 27 }, [sub]));
    return g;
  }

  function defs() {
    const d = svg('defs');
    const grad = svg('radialGradient', { id: 'cityGlow', cx: '50%', cy: '40%', r: '70%' });
    grad.appendChild(svg('stop', { offset: '0%', 'stop-color': '#2a49b8', 'stop-opacity': '0.55' }));
    grad.appendChild(svg('stop', { offset: '100%', 'stop-color': '#050826', 'stop-opacity': '0' }));
    d.appendChild(grad);
    return d;
  }

  return {
    render,
    center,
    zoomIn: () => setScale(view.scale * 1.15),
    zoomOut: () => setScale(view.scale * 0.87),
  };
}
