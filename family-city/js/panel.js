// The slide-over for one building: its module UI, its process, its settings.

import { el, clear, relTime, fmtDay, fmtTime } from './util.js';
import * as ui from './ui.js';
import { getModule, actionList } from './registry.js';
import { createContext, runAction } from './engine.js';
import { MODES, describeProcess, nextRunAt } from './scheduler.js';
import { update, CITY_COLS, CITY_ROWS, occupiedTiles } from './store.js';

// Kept across re-renders so renaming a building (which repaints the panel)
// leaves you looking at the tab you were already on.
let openTabFor = { id: null, index: 0 };

export function renderPanel(host, building, { onClose, onDelete, rerender }) {
  clear(host);
  if (!building) { host.hidden = true; return; }
  host.hidden = false;

  if (openTabFor.id !== building.id) openTabFor = { id: building.id, index: 0 };
  const mod = getModule(building.type);
  const ctx = createContext(building);
  const accent = building.accent || mod.accent;
  host.style.setProperty('--accent', accent);

  host.appendChild(el('header', { class: 'panel-head' }, [
    el('div', { class: 'panel-icon', text: mod.icon }),
    el('div', { class: 'panel-titles' }, [
      el('h2', { text: building.name }),
      el('p', { class: 'panel-sub' }, [
        el('span', { class: `dot ${building.process.lastStatus}` }),
        `${building.agent} · ${describeProcess(building.process)}`,
      ]),
    ]),
    ui.button('Run now', {
      variant: 'primary',
      icon: '▶',
      onclick: async () => {
        const res = await runAction(building.id, building.process.action);
        ui.toast(res.message, res.ok ? 'ok' : 'warn');
        rerender();
      },
    }),
    ui.button('Close', { icon: '✕', 'aria-label': 'Close panel', onclick: onClose }),
  ]));

  const body = el('div', { class: 'panel-body' });
  host.appendChild(body);

  body.appendChild(ui.tabs([
    { label: mod.label, render: () => safeRender(mod, ctx) },
    { label: 'Process', render: () => processView(building, mod, rerender) },
    { label: 'Building', render: () => settingsView(building, mod, { rerender, onDelete }) },
  ], openTabFor.index, (index) => { openTabFor.index = index; }));
}

function safeRender(mod, ctx) {
  try {
    return mod.render(ctx);
  } catch (err) {
    console.error(err);
    return ui.errorBox(`This building could not render: ${err.message}`);
  }
}

/* ---------- process ---------- */

function processView(building, mod, rerender) {
  const wrap = el('div');
  const p = building.process;
  const actions = actionList(building.type);

  const write = (patch) => update((s) => {
    const b = s.buildings.find((x) => x.id === building.id);
    if (b) Object.assign(b.process, patch);
  }, 'process');

  wrap.appendChild(ui.section('What this building does on its own', [
    el('p', { class: 'muted small', text: mod.blurb }),
    ui.field('Job', ui.select(
      actions.map((a) => ({ value: a.id, label: a.label })),
      {
        value: p.action || actions[0]?.id || '',
        onchange: (e) => { write({ action: e.target.value }); rerender(); },
      },
    ), (actions.find((a) => a.id === (p.action || actions[0]?.id)) || {}).description),
    ui.field('When', ui.select(MODES, {
      value: p.mode,
      onchange: (e) => { write({ mode: e.target.value }); rerender(); },
    })),
    p.mode === 'interval' ? ui.field('Every (minutes)', ui.input({
      type: 'number', min: '5', value: String(p.everyMinutes),
      onchange: (e) => write({ everyMinutes: Math.max(5, Number(e.target.value) || 60) }),
    })) : null,
    ['daily', 'weekdays', 'weekly'].includes(p.mode) ? ui.field('At', ui.input({
      type: 'time', value: p.at,
      onchange: (e) => { write({ at: e.target.value }); rerender(); },
    })) : null,
    p.mode === 'weekly' ? ui.field('Day', ui.select(
      ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
        .map((d, i) => ({ value: String(i), label: d })),
      { value: String(p.weekday ?? 1), onchange: (e) => { write({ weekday: Number(e.target.value) }); rerender(); } },
    )) : null,
    ui.field('Enabled', el('input', {
      type: 'checkbox', class: 'check', checked: p.enabled,
      onchange: (e) => { write({ enabled: e.target.checked }); rerender(); },
    })),
  ].filter(Boolean)));

  const next = nextRunAt(p);
  wrap.appendChild(ui.section('Status', [
    el('div', { class: 'row' }, [
      ui.chip(p.lastStatus || 'idle', { tone: p.lastStatus === 'error' ? 'danger' : p.lastStatus === 'ok' ? 'ok' : 'neutral' }),
      ui.chip(`last run ${relTime(p.lastRun)}`),
      next ? ui.chip(`next ${fmtDay(next, { weekday: 'short' })} ${fmtTime(next)}`, { tone: 'info' }) : ui.chip('manual only'),
    ]),
    p.lastMessage ? el('p', { class: 'last-message', text: p.lastMessage }) : null,
  ]));

  wrap.appendChild(ui.section('Everything this building can be told to do',
    el('ul', { class: 'list' }, actions.map((a) => el('li', { class: 'list-item' }, [
      el('div', { class: 'item-main' }, [
        el('div', { class: 'item-title', text: a.label }),
        a.description ? el('div', { class: 'item-detail', text: a.description }) : null,
      ]),
      ui.button('Run', {
        icon: '▶',
        onclick: async () => {
          const res = await runAction(building.id, a.id);
          ui.toast(res.message, res.ok ? 'ok' : 'warn');
          rerender();
        },
      }),
    ])))));

  return wrap;
}

/* ---------- building settings ---------- */

function settingsView(building, mod, { rerender, onDelete }) {
  const write = (patch) => update((s) => {
    const b = s.buildings.find((x) => x.id === building.id);
    if (b) Object.assign(b, patch);
  }, 'building');

  const taken = occupiedTiles();
  const tileOptions = [];
  for (let y = 0; y < CITY_ROWS; y += 1) {
    for (let x = 0; x < CITY_COLS; x += 1) {
      const key = `${x},${y}`;
      const mine = building.tile.x === x && building.tile.y === y;
      if (taken.has(key) && !mine) continue;
      tileOptions.push({ value: key, label: `Lot ${x + 1}-${y + 1}${mine ? ' (here)' : ''}` });
    }
  }

  return el('div', {}, [
    ui.section('Identity', [
      ui.field('Building name', ui.input({
        value: building.name,
        onchange: (e) => { write({ name: e.target.value || mod.label }); rerender(); },
      })),
      ui.field('Agent running it', ui.input({
        value: building.agent,
        onchange: (e) => { write({ agent: e.target.value || 'Agent' }); rerender(); },
      }), 'The name that signs its entries in the activity feed.'),
      ui.field('Accent colour', el('input', {
        type: 'color', class: 'color-dot', value: building.accent || mod.accent,
        onchange: (e) => { write({ accent: e.target.value }); rerender(); },
      })),
      ui.field('Notes', ui.textarea({
        value: building.notes,
        onchange: (e) => write({ notes: e.target.value }),
      })),
    ]),
    ui.section('Location', [
      ui.field('Lot', ui.select(tileOptions, {
        value: `${building.tile.x},${building.tile.y}`,
        onchange: (e) => {
          const [x, y] = e.target.value.split(',').map(Number);
          write({ tile: { x, y } });
          rerender();
        },
      })),
    ]),
    ui.section('Type', [
      el('p', { class: 'muted small', text: `${mod.icon} ${mod.label} — ${mod.blurb}` }),
    ]),
    ui.section('Remove', [
      ui.button('Demolish this building', {
        variant: 'danger',
        onclick: () => ui.confirmDialog(
          `Demolish ${building.name}? Its lists and data go with it.`,
          () => onDelete(building.id),
          { yesLabel: 'Demolish' },
        ),
      }),
    ]),
  ]);
}
