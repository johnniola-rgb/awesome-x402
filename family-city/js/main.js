// App shell: the rail, the ticker, the map, the panel, and the wiring.

import { el, clear, relTime } from './util.js';
import * as ui from './ui.js';
import {
  getState, subscribe, update, getBuilding, building as makeBuilding,
  findFreeTile, occupiedTiles, CITY_COLS, CITY_ROWS,
} from './store.js';
import { getModule, listModules, CATEGORY_ORDER, defaultAction } from './registry.js';
import { setRerender, setSelect, summaryOf, runAll } from './engine.js';
import { startScheduler, describeProcess } from './scheduler.js';
import { createCity } from './city.js';
import { renderPanel } from './panel.js';

const dom = {
  ticker: document.getElementById('ticker'),
  cityName: document.getElementById('cityName'),
  cityTag: document.getElementById('cityTagline'),
  rail: document.getElementById('rail'),
  map: document.getElementById('map'),
  panel: document.getElementById('panel'),
};

let selectedId = null;
let placeType = null;

const city = createCity({
  host: dom.map,
  onSelect: (id) => select(id),
  onPlaceTile: (tile) => placeBuilding(tile),
});

function select(id) {
  selectedId = id;
  placeType = null;
  renderAll();
  if (id) dom.panel.scrollTop = 0;
}

function closePanel() {
  selectedId = null;
  renderAll();
}

setRerender(() => renderAll());
setSelect((id) => select(id));

/* ---------- chrome ---------- */

function renderTicker(state) {
  clear(dom.ticker);
  for (const b of state.buildings) {
    const mod = getModule(b.type);
    const s = summaryOf(b);
    dom.ticker.appendChild(el('button', {
      class: `tick ${b.process.lastStatus || 'idle'}${b.id === selectedId ? ' on' : ''}`,
      type: 'button',
      style: { '--accent': b.accent || mod.accent },
      onclick: () => select(b.id),
    }, [
      el('span', { class: 'tick-dot' }),
      el('span', { class: 'tick-name', text: b.agent }),
      el('span', { class: 'tick-line', text: s.line }),
    ]));
  }
}

function renderRail(state) {
  clear(dom.rail);
  dom.rail.appendChild(el('div', { class: 'rail-head' }, [
    el('span', { text: 'WORKSPACES' }),
    ui.button('Run all', {
      icon: '⚡',
      'aria-label': 'Run every building now',
      onclick: async () => {
        ui.toast('Running every building…');
        await runAll();
        renderAll();
      },
    }),
  ]));

  const groups = new Map();
  for (const b of state.buildings) {
    const mod = getModule(b.type);
    if (!groups.has(mod.category)) groups.set(mod.category, []);
    groups.get(mod.category).push(b);
  }
  const ordered = [...groups.entries()].sort((a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]));

  for (const [category, items] of ordered) {
    dom.rail.appendChild(el('h3', { class: 'rail-cat', text: category }));
    for (const b of items) {
      const mod = getModule(b.type);
      const s = summaryOf(b);
      dom.rail.appendChild(el('button', {
        class: `rail-item${b.id === selectedId ? ' on' : ''}`,
        type: 'button',
        style: { '--accent': b.accent || mod.accent },
        onclick: () => select(b.id),
      }, [
        el('span', { class: 'rail-icon', text: mod.icon }),
        el('span', { class: 'rail-text' }, [
          el('span', { class: 'rail-name', text: b.name }),
          el('span', { class: 'rail-sub', text: describeProcess(b.process) }),
        ]),
        el('span', { class: 'rail-metric', text: s.metric }),
      ]));
    }
  }

  dom.rail.appendChild(ui.button('Add a building', {
    variant: 'primary',
    icon: '＋',
    class: 'btn btn-primary rail-add',
    onclick: openCatalog,
  }));
}

/* ---------- add a building ---------- */

function openCatalog() {
  const state = getState();
  const existing = new Set(state.buildings.map((b) => b.type));
  const groups = new Map();
  for (const mod of listModules()) {
    if (mod.unique && existing.has(mod.id)) continue;
    if (!groups.has(mod.category)) groups.set(mod.category, []);
    groups.get(mod.category).push(mod);
  }

  const body = el('div', {});
  body.appendChild(el('p', { class: 'muted', text: 'Pick what the building does. You name it and set its schedule next.' }));
  for (const [category, mods] of groups) {
    body.appendChild(el('h4', { class: 'cat-head', text: category }));
    body.appendChild(el('div', { class: 'catalog' }, mods.map((mod) => el('button', {
      class: 'cat-card',
      type: 'button',
      style: { '--accent': mod.accent },
      onclick: () => { dlg.close(); startPlacing(mod.id); },
    }, [
      el('span', { class: 'cat-icon', text: mod.icon }),
      el('span', { class: 'cat-body' }, [
        el('strong', { text: mod.label }),
        el('span', { class: 'cat-blurb', text: mod.blurb }),
      ]),
    ]))));
  }

  const dlg = ui.modal({ title: 'Add a building', body, wide: true });
}

function startPlacing(type) {
  const free = findFreeTile();
  if (!free) {
    ui.toast('Every lot is taken. Demolish something first.', 'warn');
    return;
  }
  placeType = type;
  selectedId = null;
  renderAll();
  ui.toast('Pick a lot on the map.');
}

function placeBuilding(tile) {
  if (!placeType) return;
  const mod = getModule(placeType);
  const taken = occupiedTiles();
  if (taken.has(`${tile.x},${tile.y}`)) return;

  const created = makeBuilding(placeType, {
    tile,
    name: mod.label,
    agent: mod.defaultAgent,
    accent: mod.accent,
  });
  created.process = {
    ...created.process,
    ...(mod.defaultProcess || {}),
    action: mod.defaultProcess?.action || defaultAction(placeType),
  };

  update((s) => { s.buildings.push(created); }, 'build');
  placeType = null;
  select(created.id);
  ui.toast(`${created.name} built. Set its name and schedule in the panel.`);
}

function deleteBuilding(id) {
  update((s) => {
    s.buildings = s.buildings.filter((b) => b.id !== id);
    delete s.data[id];
  }, 'demolish');
  selectedId = null;
  renderAll();
}

/* ---------- first boot ---------- */

// Seeded buildings arrive with no job assigned. Give each one the schedule its
// module recommends, so a fresh city actually does something overnight.
function hydrateProcesses() {
  update((s) => {
    for (const b of s.buildings) {
      if (b.process.action) continue;
      const mod = getModule(b.type);
      Object.assign(b.process, mod.defaultProcess || {}, {
        action: mod.defaultProcess?.action || defaultAction(b.type),
      });
    }
  }, 'hydrate');
}

/* ---------- render ---------- */

function renderAll() {
  const state = getState();
  dom.cityName.textContent = state.city.name;
  dom.cityTag.textContent = state.city.tagline;
  renderTicker(state);
  renderRail(state);
  city.render(state, { selectedId, placeType });
  document.body.classList.toggle('placing', Boolean(placeType));
  const building = selectedId ? getBuilding(selectedId) : null;
  document.body.classList.toggle('panel-open', Boolean(building));
  renderPanel(dom.panel, building, {
    onClose: closePanel,
    onDelete: deleteBuilding,
    rerender: renderAll,
  });
}

function renderChrome() {
  const state = getState();
  dom.cityName.textContent = state.city.name;
  dom.cityTag.textContent = state.city.tagline;
  renderTicker(state);
  renderRail(state);
  city.render(state, { selectedId, placeType });
}

subscribe((state, reason) => {
  if (reason === 'replace') { selectedId = null; renderAll(); return; }
  renderChrome();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (placeType) { placeType = null; renderAll(); return; }
  if (selectedId && document.getElementById('modal').hidden) closePanel();
});

document.getElementById('zoomIn').addEventListener('click', () => city.zoomIn());
document.getElementById('zoomOut').addEventListener('click', () => city.zoomOut());
document.getElementById('recenter').addEventListener('click', () => city.center());
document.getElementById('addBuilding').addEventListener('click', openCatalog);

window.addEventListener('resize', () => city.render(getState(), { selectedId, placeType }));

hydrateProcesses();
renderAll();
startScheduler();

// Handy in the console while building new modules.
window.familyCity = { getState, renderAll, listModules, CITY_COLS, CITY_ROWS, relTime };
