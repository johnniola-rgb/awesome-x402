// The agent engine: builds the context every module runs inside, executes
// actions, and rolls the results up for the ticker and the Morning Brief.

import {
  getState, update, getData, setData as writeData, log as writeLog,
  firstOfType, getBuilding,
} from './store.js';
import { getModule, defaultAction } from './registry.js';

let rerenderHook = () => {};
let selectHook = () => {};

export function setRerender(fn) { rerenderHook = fn; }
export function setSelect(fn) { selectHook = fn; }

/**
 * The object every module method receives.
 *
 *   ctx.building        this building's record (name, agent, tile, process)
 *   ctx.state           the whole city (read freely, write via ctx.update)
 *   ctx.data            this building's private data bag — persisted for you
 *   ctx.setData(fn)     mutate the data bag, save, re-render
 *   ctx.update(fn)      mutate anything else in the city
 *   ctx.log(msg)        write a line into the activity feed as this agent
 *   ctx.run(actionId)   run one of this building's own actions
 *   ctx.runAll()        run every building's default action
 *   ctx.rerender()      repaint the panel
 *   ctx.select(id)      open another building
 *   ctx.firstOfType()   find a sibling building by type — how buildings talk
 *   ctx.dataOf(id) / ctx.setDataOf(id, fn)   read/write a sibling's data
 *   ctx.summaryOf(b)    a sibling's one-line status
 *   ctx.collectBriefs() every building's brief lines
 */
export function createContext(building) {
  const state = getState();
  return {
    building,
    state,
    buildings: state.buildings,
    get data() { return getData(building.id); },
    setData(fn) { writeData(building.id, fn); },
    update(fn) { update(fn); },
    log(message, level = 'info') { writeLog(building.id, `${building.agent} ${message}`, level); },
    rerender() { rerenderHook(); },
    select(id) { selectHook(id); },
    run(actionId) { return runAction(building.id, actionId); },
    runAll() { return runAll(); },
    firstOfType,
    dataOf(id) { return getData(id); },
    setDataOf(id, fn) { writeData(id, fn); },
    summaryOf,
    collectBriefs,
  };
}

export async function runAction(buildingId, actionId, { silent = false } = {}) {
  const building = getBuilding(buildingId);
  if (!building) return { ok: false, message: 'Building not found' };
  const mod = getModule(building.type);
  const id = actionId || building.process.action || defaultAction(building.type);
  const action = (mod.actions || {})[id];
  if (!action) return { ok: false, message: `No action "${id}"` };

  update((s) => {
    const b = s.buildings.find((x) => x.id === buildingId);
    if (b) b.process.lastStatus = 'running';
  }, 'process');

  const ctx = createContext(building);
  try {
    const message = (await action.run(ctx)) || action.label;
    update((s) => {
      const b = s.buildings.find((x) => x.id === buildingId);
      if (!b) return;
      b.process.lastRun = new Date().toISOString();
      b.process.lastStatus = 'ok';
      b.process.lastMessage = message;
    }, 'process');
    if (!silent) writeLog(buildingId, `${building.agent}: ${message}`, 'info');
    return { ok: true, message, building };
  } catch (err) {
    const message = err.message || String(err);
    update((s) => {
      const b = s.buildings.find((x) => x.id === buildingId);
      if (!b) return;
      b.process.lastRun = new Date().toISOString();
      b.process.lastStatus = 'error';
      b.process.lastMessage = message;
    }, 'process');
    writeLog(buildingId, `${building.agent} hit a snag: ${message}`, 'error');
    return { ok: false, message, building };
  }
}

export async function runAll() {
  const state = getState();
  const results = [];
  for (const b of state.buildings) {
    if (b.type === 'hall') continue;
    const action = b.process.action || defaultAction(b.type);
    if (!action) continue;
    results.push(await runAction(b.id, action));
  }
  return results;
}

export function summaryOf(building) {
  const mod = getModule(building.type);
  if (!mod.summary) return { metric: '—', line: mod.blurb };
  try {
    return mod.summary(createContext(building));
  } catch (err) {
    return { metric: '!', line: err.message };
  }
}

export function collectBriefs() {
  const state = getState();
  const rows = [];
  for (const building of state.buildings) {
    const mod = getModule(building.type);
    if (!mod.brief) continue;
    try {
      const items = mod.brief(createContext(building)) || [];
      if (items.length) rows.push({ building, module: mod, items });
    } catch (err) {
      rows.push({ building, module: mod, items: [{ title: 'Could not report', detail: err.message }] });
    }
  }
  return rows;
}
