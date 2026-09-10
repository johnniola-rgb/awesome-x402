// Single source of truth. Everything lives in localStorage under one key,
// so the whole city is one portable JSON blob (see Hall > Export).

import { uid, isoDate } from './util.js';

const KEY = 'familyCity.v1';
const listeners = new Set();

export const CITY_COLS = 6;
export const CITY_ROWS = 5;

function seedState() {
  const members = [
    { id: uid('m'), name: 'Parent 1', color: '#46e0ff', role: 'adult', tempPref: 0 },
    { id: uid('m'), name: 'Parent 2', color: '#b06bff', role: 'adult', tempPref: 0 },
    { id: uid('m'), name: 'Kid 1', color: '#ffb347', role: 'child', tempPref: 1 },
  ];
  return {
    version: 1,
    city: {
      name: 'Home Base',
      tagline: 'the household runs itself',
      units: 'imperial',
      weekStartsOn: 1,
      createdAt: new Date().toISOString(),
    },
    household: {
      members,
      location: { label: 'Set your location', lat: null, lon: null, timezone: 'auto' },
    },
    buildings: [
      building('hall', { tile: { x: 2, y: 2 }, name: 'Meeting Hall', agent: 'Ember' }),
      building('weather', { tile: { x: 1, y: 1 }, name: 'Sky Watch', agent: 'Nimbus' }),
      building('meals', { tile: { x: 3, y: 1 }, name: 'Meal Hall', agent: 'Sage' }),
      building('calendar', { tile: { x: 1, y: 3 }, name: 'Time Keep', agent: 'Marlow' }),
      building('brief', { tile: { x: 3, y: 3 }, name: 'Morning Brief', agent: 'Dawn' }),
    ],
    data: {},
    activity: [],
    ui: { selected: null },
  };
}

export function building(type, patch = {}) {
  return {
    id: uid('b'),
    type,
    name: patch.name || type,
    agent: patch.agent || 'Agent',
    tile: patch.tile || { x: 0, y: 0 },
    accent: patch.accent || null,
    notes: '',
    process: {
      enabled: true,
      mode: 'manual', // manual | interval | daily | weekdays | weekly
      action: null,
      everyMinutes: 60,
      at: '07:00',
      weekday: 1,
      lastRun: null,
      lastStatus: 'idle', // idle | ok | error | running
      lastMessage: '',
    },
    ...patch,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (err) {
    console.warn('Could not read saved city, starting fresh.', err);
    return seedState();
  }
}

function migrate(state) {
  const base = seedState();
  const merged = { ...base, ...state };
  merged.city = { ...base.city, ...(state.city || {}) };
  merged.household = { ...base.household, ...(state.household || {}) };
  merged.household.location = { ...base.household.location, ...((state.household || {}).location || {}) };
  merged.data = state.data || {};
  merged.activity = state.activity || [];
  merged.ui = { ...base.ui, ...(state.ui || {}) };
  merged.buildings = (state.buildings || base.buildings).map((b) => ({
    ...building(b.type),
    ...b,
    process: { ...building(b.type).process, ...(b.process || {}) },
  }));
  return merged;
}

let state = load();
let saveTimer = null;

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Save failed (storage full?)', err);
    }
  }, 120);
}

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify(reason = 'update') {
  for (const fn of listeners) fn(state, reason);
}

/** Mutate state in place, persist, and re-render. */
export function update(mutator, reason = 'update') {
  const result = mutator(state);
  persist();
  notify(reason);
  return result;
}

export function replaceState(next) {
  state = migrate(next);
  persist();
  notify('replace');
}

export function resetState() {
  state = seedState();
  persist();
  notify('replace');
}

/* ---------- convenience selectors ---------- */

export function getBuilding(id) {
  return state.buildings.find((b) => b.id === id) || null;
}

export function buildingsOfType(type) {
  return state.buildings.filter((b) => b.type === type);
}

export function firstOfType(type) {
  return state.buildings.find((b) => b.type === type) || null;
}

export function member(id) {
  return state.household.members.find((m) => m.id === id) || null;
}

export function memberName(id) {
  const m = member(id);
  return m ? m.name : 'Unassigned';
}

/** Per-building data bag. Each module owns its own slice. */
export function getData(buildingId, fallback = {}) {
  if (!state.data[buildingId]) state.data[buildingId] = JSON.parse(JSON.stringify(fallback));
  return state.data[buildingId];
}

export function setData(buildingId, mutator, reason = 'data') {
  return update((s) => {
    if (!s.data[buildingId]) s.data[buildingId] = {};
    const out = mutator(s.data[buildingId]);
    return out;
  }, reason);
}

export function log(buildingId, message, level = 'info') {
  update((s) => {
    s.activity.unshift({
      id: uid('a'),
      buildingId,
      message,
      level,
      at: new Date().toISOString(),
      day: isoDate(),
    });
    s.activity = s.activity.slice(0, 300);
  }, 'activity');
}

export function occupiedTiles() {
  return new Set(state.buildings.map((b) => `${b.tile.x},${b.tile.y}`));
}

export function findFreeTile() {
  const taken = occupiedTiles();
  for (let y = 0; y < CITY_ROWS; y += 1) {
    for (let x = 0; x < CITY_COLS; x += 1) {
      if (!taken.has(`${x},${y}`)) return { x, y };
    }
  }
  return null;
}
