// Timing only. Every building carries a process; this decides when it is due
// and fires it. Catch-up is deliberate: open the app at 9am and the 6am
// process still runs, which is what fills "while you slept".

import { getState } from './store.js';
import { runAction } from './engine.js';
import { minutesOfDay } from './util.js';

const TICK_MS = 30000;
let timer = null;

export const MODES = [
  { value: 'manual', label: 'Only when I press run' },
  { value: 'interval', label: 'Every N minutes' },
  { value: 'daily', label: 'Every day at…' },
  { value: 'weekdays', label: 'Weekdays at…' },
  { value: 'weekly', label: 'Once a week at…' },
];

export function describeProcess(process) {
  if (!process.enabled) return 'paused';
  switch (process.mode) {
    case 'interval': return `every ${process.everyMinutes} min`;
    case 'daily': return `daily ${process.at}`;
    case 'weekdays': return `weekdays ${process.at}`;
    case 'weekly': return `${dayName(process.weekday)} ${process.at}`;
    default: return 'manual';
  }
}

function dayName(index) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index] || 'Mon';
}

/** The most recent moment this process should have fired, or null. */
export function lastScheduledBefore(process, now = new Date()) {
  if (!process.enabled || process.mode === 'manual') return null;
  if (process.mode === 'interval') {
    return new Date(now.getTime() - (process.everyMinutes || 60) * 60000);
  }
  const target = new Date(now);
  const mins = minutesOfDay(process.at || '07:00');
  target.setHours(Math.floor(mins / 60), mins % 60, 0, 0);

  if (process.mode === 'daily') {
    if (target > now) target.setDate(target.getDate() - 1);
    return target;
  }
  if (process.mode === 'weekdays') {
    let d = new Date(target);
    if (d > now) d.setDate(d.getDate() - 1);
    let guard = 0;
    while ((d.getDay() === 0 || d.getDay() === 6) && guard < 10) { d.setDate(d.getDate() - 1); guard += 1; }
    return d;
  }
  if (process.mode === 'weekly') {
    const want = Number(process.weekday ?? 1);
    const d = new Date(target);
    let guard = 0;
    while ((d.getDay() !== want || d > now) && guard < 10) { d.setDate(d.getDate() - 1); guard += 1; }
    return d;
  }
  return null;
}

export function nextRunAt(process, now = new Date()) {
  if (!process.enabled || process.mode === 'manual') return null;
  if (process.mode === 'interval') {
    const base = process.lastRun ? new Date(process.lastRun) : now;
    return new Date(base.getTime() + (process.everyMinutes || 60) * 60000);
  }
  const mins = minutesOfDay(process.at || '07:00');
  const d = new Date(now);
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 1);
  if (process.mode === 'weekdays') {
    let guard = 0;
    while ((d.getDay() === 0 || d.getDay() === 6) && guard < 10) { d.setDate(d.getDate() + 1); guard += 1; }
  }
  if (process.mode === 'weekly') {
    const want = Number(process.weekday ?? 1);
    let guard = 0;
    while (d.getDay() !== want && guard < 10) { d.setDate(d.getDate() + 1); guard += 1; }
  }
  return d;
}

export function isDue(building, now = new Date()) {
  const p = building.process;
  if (!p.enabled || p.mode === 'manual') return false;
  const due = lastScheduledBefore(p, now);
  if (!due) return false;
  if (!p.lastRun) return true;
  return new Date(p.lastRun) < due;
}

async function tick() {
  const state = getState();
  const now = new Date();
  for (const building of [...state.buildings]) {
    if (!isDue(building, now)) continue;
    // eslint-disable-next-line no-await-in-loop -- agents run one at a time on purpose
    await runAction(building.id, building.process.action);
  }
}

export function startScheduler() {
  if (timer) return;
  tick();
  timer = setInterval(tick, TICK_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}

export function stopScheduler() {
  clearInterval(timer);
  timer = null;
}
