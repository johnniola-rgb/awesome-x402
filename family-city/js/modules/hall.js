// Meeting Hall — where the household is defined and every agent reports in.

import { el, clear, uid, fmtTime, relTime, download, isoDate } from '../util.js';
import * as ui from '../ui.js';
import { resetState, replaceState } from '../store.js';

const PALETTE = ['#46e0ff', '#b06bff', '#ffb347', '#4ade80', '#ff7a9c', '#7aa2ff', '#ffd166', '#5eead4'];

export default {
  id: 'hall',
  label: 'Meeting Hall',
  icon: '🏛️',
  category: 'Core',
  blurb: 'The household roster, city settings, the full activity feed, and backups.',
  defaultAgent: 'Ember',
  accent: '#8ab4ff',
  height: 1.6,
  unique: true,
  defaultProcess: { mode: 'daily', at: '06:30', action: 'standup' },

  actions: {
    standup: {
      label: 'Run every building',
      description: 'Fire each building’s default action once, in order.',
      async run(ctx) {
        const results = await ctx.runAll();
        const ok = results.filter((r) => r.ok).length;
        return `Standup done — ${ok}/${results.length} buildings reported in`;
      },
    },
    retro: {
      label: 'Weekly retro',
      description: 'Summarize the last seven days of agent activity.',
      async run(ctx) {
        const cutoff = Date.now() - 7 * 86400000;
        const week = ctx.state.activity.filter((a) => new Date(a.at).getTime() >= cutoff);
        const byBuilding = new Map();
        for (const a of week) byBuilding.set(a.buildingId, (byBuilding.get(a.buildingId) || 0) + 1);
        const top = [...byBuilding.entries()]
          .map(([id, n]) => [ctx.state.buildings.find((b) => b.id === id)?.name || 'Unknown', n])
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([name, n]) => `${name} (${n})`);
        return `${week.length} actions in 7 days${top.length ? ` · busiest: ${top.join(', ')}` : ''}`;
      },
    },
  },

  summary(ctx) {
    return { metric: String(ctx.state.buildings.length), line: `${ctx.state.household.members.length} people` };
  },

  brief() {
    return [];
  },

  render(ctx) {
    const host = el('div');
    const paint = () => {
      clear(host);
      host.appendChild(ui.tabs([
        { label: 'Household', render: () => householdView(ctx, paint) },
        { label: 'Activity', render: () => activityView(ctx, paint) },
        { label: 'City', render: () => cityView(ctx, paint) },
        { label: 'Backup', render: () => backupView(ctx) },
      ]));
    };
    paint();
    return host;
  },
};

function householdView(ctx, paint) {
  const wrap = el('div');
  const members = ctx.state.household.members;

  wrap.appendChild(ui.section('Who lives here', members.map((m) => el('div', { class: 'member-row' }, [
    el('input', {
      type: 'color', class: 'color-dot', value: m.color, 'aria-label': `${m.name} color`,
      onchange: (e) => ctx.update((s) => { s.household.members.find((x) => x.id === m.id).color = e.target.value; }),
    }),
    ui.input({
      value: m.name, 'aria-label': 'Name',
      onchange: (e) => ctx.update((s) => { s.household.members.find((x) => x.id === m.id).name = e.target.value || 'Someone'; }),
    }),
    ui.select([
      { value: 'adult', label: 'Adult' },
      { value: 'teen', label: 'Teen' },
      { value: 'child', label: 'Child' },
      { value: 'pet', label: 'Pet' },
      { value: 'other', label: 'Other' },
    ], {
      value: m.role, 'aria-label': 'Role',
      onchange: (e) => { ctx.update((s) => { s.household.members.find((x) => x.id === m.id).role = e.target.value; }); },
    }),
    ui.button('Remove', {
      icon: '🗑', 'aria-label': `Remove ${m.name}`,
      onclick: () => ui.confirmDialog(`Remove ${m.name} from the household?`, () => {
        ctx.update((s) => { s.household.members = s.household.members.filter((x) => x.id !== m.id); });
        paint();
      }),
    }),
  ]))));

  wrap.appendChild(ui.button('Add a person', {
    variant: 'primary',
    icon: '＋',
    onclick: () => {
      ctx.update((s) => {
        s.household.members.push({
          id: uid('m'),
          name: 'New person',
          color: PALETTE[s.household.members.length % PALETTE.length],
          role: 'child',
          tempPref: 0,
        });
      });
      paint();
    },
  }));

  return wrap;
}

function activityView(ctx, paint) {
  const wrap = el('div');
  const feed = ctx.state.activity;
  wrap.appendChild(ui.section('Everything the agents have done', feed.length
    ? el('ul', { class: 'timeline' }, feed.slice(0, 80).map((a) => {
      const b = ctx.state.buildings.find((x) => x.id === a.buildingId);
      return el('li', {}, [
        el('span', { class: 'tl-time', text: fmtTime(a.at) }),
        el('span', { class: `tl-dot ${a.level}` }),
        el('span', { class: 'tl-text' }, [
          b ? el('strong', { text: `${b.name}: ` }) : null,
          a.message,
          el('span', { class: 'muted small', text: ` · ${relTime(a.at)}` }),
        ]),
      ]);
    }))
    : ui.empty('No activity yet.'), [
    ui.button('Clear feed', {
      onclick: () => ui.confirmDialog('Clear the whole activity feed?', () => {
        ctx.update((s) => { s.activity = []; });
        paint();
      }),
    }),
  ]));
  return wrap;
}

function cityView(ctx, paint) {
  return el('div', {}, [
    ui.section('City', [
      ui.field('Name', ui.input({
        value: ctx.state.city.name,
        onchange: (e) => ctx.update((s) => { s.city.name = e.target.value || 'Home Base'; }),
      })),
      ui.field('Tagline', ui.input({
        value: ctx.state.city.tagline,
        onchange: (e) => ctx.update((s) => { s.city.tagline = e.target.value; }),
      })),
      ui.field('Week starts on', ui.select([
        { value: '0', label: 'Sunday' },
        { value: '1', label: 'Monday' },
      ], {
        value: String(ctx.state.city.weekStartsOn ?? 1),
        onchange: (e) => { ctx.update((s) => { s.city.weekStartsOn = Number(e.target.value); }); ctx.rerender(); },
      })),
      ui.field('Temperature units', ui.select([
        { value: 'imperial', label: 'Fahrenheit' },
        { value: 'metric', label: 'Celsius' },
      ], {
        value: ctx.state.city.units,
        onchange: (e) => { ctx.update((s) => { s.city.units = e.target.value; }); ctx.rerender(); },
      })),
    ]),
    ui.section('Buildings', el('ul', { class: 'list' }, ctx.state.buildings.map((b) => el('li', { class: 'list-item' }, [
      el('span', { class: 'item-main' }, [
        el('div', { class: 'item-title', text: `${b.name}` }),
        el('div', { class: 'item-meta' }, [
          ui.chip(b.agent, { tone: 'info' }),
          ui.chip(b.process.enabled ? processLabel(b.process) : 'paused', { tone: b.process.enabled ? 'ok' : 'neutral' }),
          b.process.lastRun ? ui.chip(`ran ${relTime(b.process.lastRun)}`) : null,
        ].filter(Boolean)),
      ]),
      ui.button('Open', { onclick: () => ctx.select(b.id) }),
    ])))),
  ]);
}

function processLabel(p) {
  if (p.mode === 'manual') return 'manual';
  if (p.mode === 'interval') return `every ${p.everyMinutes}m`;
  if (p.mode === 'daily') return `daily ${fmtTime(p.at)}`;
  if (p.mode === 'weekdays') return `weekdays ${fmtTime(p.at)}`;
  if (p.mode === 'weekly') return `weekly ${fmtTime(p.at)}`;
  return p.mode;
}

function backupView(ctx) {
  const file = el('input', { type: 'file', accept: 'application/json', class: 'input' });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (!f) return;
    try {
      const parsed = JSON.parse(await f.text());
      ui.confirmDialog('Replace the current city with this file?', () => {
        replaceState(parsed);
        ui.toast('City restored.');
      });
    } catch (err) {
      ui.toast(`Could not read that file: ${err.message}`, 'warn');
    }
  });

  return el('div', {}, [
    ui.section('Export', [
      el('p', { class: 'muted small', text: 'Everything lives in this browser. Export regularly if it matters.' }),
      ui.button('Download city JSON', {
        icon: '⬇',
        variant: 'primary',
        onclick: () => download(`family-city-${isoDate()}.json`, JSON.stringify(ctx.state, null, 2)),
      }),
    ]),
    ui.section('Import', [file]),
    ui.section('Danger zone', [
      ui.button('Reset the whole city', {
        variant: 'danger',
        onclick: () => ui.confirmDialog('This wipes every building, event, and list. There is no undo.', () => {
          resetState();
          ui.toast('City reset.');
        }, { yesLabel: 'Yes, wipe it' }),
      }),
    ]),
  ]);
}
