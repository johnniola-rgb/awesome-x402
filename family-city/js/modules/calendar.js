// Time Keep — the shared family calendar. Month grid, agenda, per-person
// colors, .ics import and export.

import { el, clear, uid, isoDate, parseDate, addDays, startOfWeek, startOfMonth, fmtDay, fmtTime, download } from '../util.js';
import * as ui from '../ui.js';
import { memberName, member as findMember } from '../store.js';

const CATEGORIES = ['Family', 'School', 'Work', 'Sports', 'Medical', 'Social', 'Meals', 'Travel', 'Other'];
const REPEATS = [
  { value: 'none', label: 'Does not repeat' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

function bag(ctx) {
  const d = ctx.data;
  if (!d.events) d.events = [];
  if (!d.view) d.view = { mode: 'month', cursor: isoDate(startOfMonth(new Date())), filterMember: '' };
  return d;
}

function blankEvent() {
  return {
    id: uid('e'), title: '', date: isoDate(), time: '', endTime: '', allDay: false,
    members: [], location: '', category: 'Family', notes: '', repeat: 'none', source: 'local',
  };
}

/** Expand repeats into concrete dates inside [start, end]. */
export function occurrences(event, start, end) {
  const first = parseDate(event.date);
  if (!first) return [];
  const out = [];
  if (event.repeat === 'none' || !event.repeat) {
    if (first >= start && first <= end) out.push(isoDate(first));
    return out;
  }
  let cursor = new Date(first);
  let guard = 0;
  while (cursor <= end && guard < 800) {
    guard += 1;
    if (cursor >= start) out.push(isoDate(cursor));
    if (event.repeat === 'weekly') cursor = addDays(cursor, 7);
    else if (event.repeat === 'biweekly') cursor = addDays(cursor, 14);
    else if (event.repeat === 'monthly') { const d = new Date(cursor); d.setMonth(d.getMonth() + 1); cursor = d; }
    else if (event.repeat === 'yearly') { const d = new Date(cursor); d.setFullYear(d.getFullYear() + 1); cursor = d; }
    else break;
  }
  return out;
}

export function eventsBetween(ctx, startDate, endDate) {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const filter = bag(ctx).view.filterMember;
  const rows = [];
  for (const event of bag(ctx).events) {
    if (filter && !(event.members || []).includes(filter)) continue;
    for (const date of occurrences(event, start, end)) rows.push({ ...event, date });
  }
  return rows.sort((a, b) => (a.date === b.date
    ? String(a.time || '00:00').localeCompare(String(b.time || '00:00'))
    : a.date.localeCompare(b.date)));
}

export function eventsOn(ctx, date) {
  return eventsBetween(ctx, date, date);
}

/* ---------- ICS ---------- */

export function parseICS(text) {
  const unfolded = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  const events = [];
  let current = null;
  let skippedRepeats = 0;
  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) { current = blankEvent(); current.source = 'ics'; continue; }
    if (line.startsWith('END:VEVENT')) {
      if (current && current.title) events.push(current);
      current = null;
      continue;
    }
    if (!current) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const rawKey = line.slice(0, idx);
    const value = line.slice(idx + 1).replace(/\\,/g, ',').replace(/\\n/g, '\n').replace(/\;/g, ';');
    const key = rawKey.split(';')[0].toUpperCase();
    if (key === 'SUMMARY') current.title = value;
    else if (key === 'LOCATION') current.location = value;
    else if (key === 'DESCRIPTION') current.notes = value.slice(0, 500);
    else if (key === 'DTSTART') {
      const parsed = parseICSDate(value, rawKey);
      current.date = parsed.date;
      current.time = parsed.time;
      current.allDay = parsed.allDay;
    } else if (key === 'DTEND') {
      current.endTime = parseICSDate(value, rawKey).time;
    } else if (key === 'RRULE') {
      skippedRepeats += 1;
      if (/FREQ=WEEKLY/.test(value)) current.repeat = 'weekly';
      else if (/FREQ=MONTHLY/.test(value)) current.repeat = 'monthly';
      else if (/FREQ=YEARLY/.test(value)) current.repeat = 'yearly';
    }
  }
  return { events, skippedRepeats };
}

function parseICSDate(value, rawKey) {
  const isDate = /VALUE=DATE(?!-)/i.test(rawKey) || /^\d{8}$/.test(value);
  const y = value.slice(0, 4);
  const m = value.slice(4, 6);
  const d = value.slice(6, 8);
  if (isDate) return { date: `${y}-${m}-${d}`, time: '', allDay: true };
  const hh = value.slice(9, 11);
  const mm = value.slice(11, 13);
  if (value.endsWith('Z')) {
    const utc = new Date(Date.UTC(+y, +m - 1, +d, +hh, +mm));
    return { date: isoDate(utc), time: `${String(utc.getHours()).padStart(2, '0')}:${String(utc.getMinutes()).padStart(2, '0')}`, allDay: false };
  }
  return { date: `${y}-${m}-${d}`, time: `${hh}:${mm}`, allDay: false };
}

function toICS(ctx) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${ctx.state.city.name}//Family City//EN`];
  for (const e of bag(ctx).events) {
    const dt = e.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${e.id}@family-city`, `DTSTAMP:${stamp}`);
    if (e.allDay || !e.time) lines.push(`DTSTART;VALUE=DATE:${dt}`);
    else lines.push(`DTSTART:${dt}T${e.time.replace(':', '')}00`);
    if (e.endTime) lines.push(`DTEND:${dt}T${e.endTime.replace(':', '')}00`);
    lines.push(`SUMMARY:${escapeICS(e.title)}`);
    if (e.location) lines.push(`LOCATION:${escapeICS(e.location)}`);
    const who = (e.members || []).map(memberName).join(', ');
    if (who || e.notes) lines.push(`DESCRIPTION:${escapeICS([who, e.notes].filter(Boolean).join(' — '))}`);
    if (e.repeat === 'weekly') lines.push('RRULE:FREQ=WEEKLY');
    if (e.repeat === 'biweekly') lines.push('RRULE:FREQ=WEEKLY;INTERVAL=2');
    if (e.repeat === 'monthly') lines.push('RRULE:FREQ=MONTHLY');
    if (e.repeat === 'yearly') lines.push('RRULE:FREQ=YEARLY');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function escapeICS(str) {
  return String(str).replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
}

export default {
  id: 'calendar',
  label: 'Family Calendar',
  icon: '📅',
  category: 'Daily',
  blurb: 'Shared schedule with per-person colors, repeats, and .ics import/export.',
  defaultAgent: 'Marlow',
  accent: '#b06bff',
  height: 1.2,
  defaultProcess: { mode: 'daily', at: '06:15', action: 'agenda' },

  actions: {
    agenda: {
      label: 'Read out today',
      description: 'Summarize today’s events into the activity feed.',
      async run(ctx) {
        const today = eventsOn(ctx, isoDate());
        if (!today.length) return 'Nothing on the calendar today';
        return `${today.length} today: ${today.map((e) => `${e.time ? fmtTime(e.time) + ' ' : ''}${e.title}`).join(', ')}`;
      },
    },
    weekAhead: {
      label: 'Look a week out',
      description: 'Count what is coming in the next 7 days.',
      async run(ctx) {
        const rows = eventsBetween(ctx, isoDate(), isoDate(addDays(new Date(), 7)));
        const busiest = new Map();
        for (const r of rows) busiest.set(r.date, (busiest.get(r.date) || 0) + 1);
        const peak = [...busiest.entries()].sort((a, b) => b[1] - a[1])[0];
        return `${rows.length} events in 7 days${peak ? ` · busiest ${fmtDay(parseDate(peak[0]))} (${peak[1]})` : ''}`;
      },
    },
    conflicts: {
      label: 'Find overlaps',
      description: 'Flag events that collide for the same person.',
      async run(ctx) {
        const rows = eventsBetween(ctx, isoDate(), isoDate(addDays(new Date(), 14))).filter((e) => e.time);
        const clashes = [];
        for (let i = 0; i < rows.length; i += 1) {
          for (let j = i + 1; j < rows.length; j += 1) {
            if (rows[i].date !== rows[j].date || rows[i].time !== rows[j].time) continue;
            const shared = (rows[i].members || []).filter((m) => (rows[j].members || []).includes(m));
            if (shared.length) clashes.push(`${memberName(shared[0])}: ${rows[i].title} vs ${rows[j].title} on ${rows[i].date}`);
          }
        }
        return clashes.length ? `${clashes.length} overlap(s): ${clashes.slice(0, 3).join('; ')}` : 'No overlaps in the next 2 weeks';
      },
    },
  },

  summary(ctx) {
    const today = eventsOn(ctx, isoDate());
    const next = today.find((e) => e.time && e.time >= new Date().toTimeString().slice(0, 5));
    return {
      metric: String(today.length),
      line: next ? `${fmtTime(next.time)} ${next.title}` : today.length ? 'all done today' : 'clear today',
    };
  },

  brief(ctx) {
    const today = eventsOn(ctx, isoDate());
    if (!today.length) return [{ title: 'Calendar', detail: 'Nothing scheduled today.' }];
    return today.slice(0, 6).map((e) => ({
      title: `${e.allDay || !e.time ? 'All day' : fmtTime(e.time)} · ${e.title}`,
      detail: [(e.members || []).map(memberName).join(', '), e.location].filter(Boolean).join(' · '),
    }));
  },

  render(ctx) {
    const host = el('div');
    const paint = () => {
      clear(host);
      host.appendChild(ui.tabs([
        { label: 'Month', render: () => monthView(ctx, paint) },
        { label: 'Agenda', render: () => agendaView(ctx, paint) },
        { label: 'Import / export', render: () => ioView(ctx, paint) },
      ]));
    };
    paint();
    return host;
  },
};

function toolbar(ctx, paint, extra = []) {
  return el('div', { class: 'board-controls' }, [
    ui.button('New event', { variant: 'primary', icon: '＋', onclick: () => editEvent(ctx, blankEvent(), paint, true) }),
    ui.select(ui.memberOptions(ctx.state.household.members, { noneLabel: 'Everyone' }), {
      value: bag(ctx).view.filterMember,
      'aria-label': 'Filter by person',
      onchange: (e) => { ctx.setData((d) => { d.view.filterMember = e.target.value; }); paint(); },
    }),
    ...extra,
  ]);
}

function monthView(ctx, paint) {
  const data = bag(ctx);
  const cursor = parseDate(data.view.cursor) || startOfMonth(new Date());
  const monthStart = startOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, ctx.state.city.weekStartsOn ?? 1);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = isoDate();

  const shift = (delta) => {
    const d = new Date(monthStart);
    d.setMonth(d.getMonth() + delta);
    ctx.setData((x) => { x.view.cursor = isoDate(d); });
    paint();
  };

  const wrap = el('div');
  wrap.appendChild(toolbar(ctx, paint, [
    ui.button('‹', { 'aria-label': 'Previous month', onclick: () => shift(-1) }),
    el('strong', { class: 'month-label', text: fmtDay(monthStart, { month: 'long', year: 'numeric' }) }),
    ui.button('›', { 'aria-label': 'Next month', onclick: () => shift(1) }),
    ui.button('Today', { onclick: () => { ctx.setData((x) => { x.view.cursor = isoDate(startOfMonth(new Date())); }); paint(); } }),
  ]));

  const weekdayNames = Array.from({ length: 7 }, (_, i) => fmtDay(addDays(gridStart, i), { weekday: 'short' }));
  wrap.appendChild(el('div', { class: 'cal-grid cal-head' }, weekdayNames.map((n) => el('div', { class: 'cal-dow', text: n }))));

  wrap.appendChild(el('div', { class: 'cal-grid' }, days.map((day) => {
    const date = isoDate(day);
    const inMonth = day.getMonth() === monthStart.getMonth();
    const rows = eventsOn(ctx, date);
    return el('div', {
      class: `cal-cell${inMonth ? '' : ' dim'}${date === today ? ' today' : ''}`,
      tabindex: '0',
      role: 'button',
      'aria-label': `${fmtDay(day)}, ${rows.length} events`,
      onclick: () => editEvent(ctx, { ...blankEvent(), date }, paint, true),
      onkeydown: (e) => { if (e.key === 'Enter') editEvent(ctx, { ...blankEvent(), date }, paint, true); },
    }, [
      el('div', { class: 'cal-num', text: String(day.getDate()) }),
      el('div', { class: 'cal-events' }, rows.slice(0, 3).map((ev) => el('button', {
        class: 'cal-event',
        type: 'button',
        style: { '--ev': colorFor(ev) },
        onclick: (e) => { e.stopPropagation(); editEvent(ctx, ev, paint, false); },
      }, [`${ev.time ? fmtTime(ev.time) + ' ' : ''}${ev.title}`]))),
      rows.length > 3 ? el('div', { class: 'cal-more', text: `+${rows.length - 3} more` }) : null,
    ]);
  })));

  return wrap;
}

function colorFor(event) {
  const first = (event.members || [])[0];
  const m = first ? findMember(first) : null;
  return m ? m.color : '#7aa2ff';
}

function agendaView(ctx, paint) {
  const wrap = el('div');
  wrap.appendChild(toolbar(ctx, paint));
  const start = isoDate();
  const end = isoDate(addDays(new Date(), 21));
  const rows = eventsBetween(ctx, start, end);
  if (!rows.length) { wrap.appendChild(ui.empty('Nothing in the next three weeks.')); return wrap; }

  let lastDate = null;
  const listHost = el('div', { class: 'agenda' });
  for (const ev of rows) {
    if (ev.date !== lastDate) {
      lastDate = ev.date;
      listHost.appendChild(el('h4', {
        class: 'agenda-day',
        text: ev.date === isoDate() ? `Today · ${fmtDay(parseDate(ev.date))}` : fmtDay(parseDate(ev.date), { weekday: 'long', month: 'short', day: 'numeric' }),
      }));
    }
    listHost.appendChild(el('button', {
      class: 'agenda-row',
      type: 'button',
      style: { '--ev': colorFor(ev) },
      onclick: () => editEvent(ctx, ev, paint, false),
    }, [
      el('span', { class: 'agenda-time', text: ev.allDay || !ev.time ? 'All day' : fmtTime(ev.time) }),
      el('span', { class: 'agenda-title', text: ev.title }),
      el('span', { class: 'agenda-meta', text: [(ev.members || []).map(memberName).join(', '), ev.location].filter(Boolean).join(' · ') }),
    ]));
  }
  wrap.appendChild(listHost);
  return wrap;
}

function editEvent(ctx, event, paint, isNew) {
  const title = ui.input({ value: event.title, placeholder: 'Soccer practice' });
  const date = ui.input({ type: 'date', value: event.date });
  const time = ui.input({ type: 'time', value: event.time });
  const endTime = ui.input({ type: 'time', value: event.endTime });
  const allDay = el('input', { type: 'checkbox', class: 'check', checked: event.allDay });
  const location = ui.input({ value: event.location, placeholder: 'Where' });
  const notes = ui.textarea({ value: event.notes });
  const category = ui.select(CATEGORIES.map((c) => ({ value: c, label: c })), { value: event.category });
  const repeat = ui.select(REPEATS, { value: event.repeat });
  const who = el('div', { class: 'who-picker' }, ctx.state.household.members.map((m) => {
    const on = (event.members || []).includes(m.id);
    return el('button', {
      class: `who${on ? ' on' : ''}`,
      type: 'button',
      style: { '--accent': m.color },
      'aria-pressed': on ? 'true' : 'false',
      onclick: (e) => {
        const btn = e.currentTarget;
        const nowOn = !btn.classList.contains('on');
        btn.classList.toggle('on', nowOn);
        btn.setAttribute('aria-pressed', nowOn ? 'true' : 'false');
      },
      dataset: { id: m.id },
    }, [m.name]);
  }));

  const dlg = ui.modal({
    title: isNew ? 'New event' : 'Edit event',
    body: el('div', { class: 'form-grid' }, [
      ui.field('Title', title),
      ui.field('Who', who),
      ui.field('Date', date),
      ui.field('All day', allDay),
      ui.field('Start', time),
      ui.field('End', endTime),
      ui.field('Where', location),
      ui.field('Category', category),
      ui.field('Repeat', repeat),
      ui.field('Notes', notes),
    ]),
    actions: [
      !isNew ? ui.button('Delete', {
        variant: 'danger',
        onclick: () => {
          ctx.setData((d) => { d.events = d.events.filter((e) => e.id !== event.id); });
          dlg.close();
          paint();
        },
      }) : null,
      ui.button('Cancel', { onclick: () => dlg.close() }),
      ui.button('Save', {
        variant: 'primary',
        onclick: () => {
          if (!title.value.trim()) { title.focus(); return; }
          const members = [...who.querySelectorAll('.who.on')].map((b) => b.dataset.id);
          const next = {
            ...event,
            title: title.value.trim(),
            date: date.value || isoDate(),
            time: allDay.checked ? '' : time.value,
            endTime: allDay.checked ? '' : endTime.value,
            allDay: allDay.checked,
            location: location.value,
            notes: notes.value,
            category: category.value,
            repeat: repeat.value,
            members,
          };
          ctx.setData((d) => {
            const idx = d.events.findIndex((e) => e.id === event.id);
            if (idx >= 0) d.events[idx] = next;
            else d.events.push(next);
          });
          ctx.log(`${isNew ? 'added' : 'updated'} "${next.title}"`);
          dlg.close();
          paint();
        },
      }),
    ].filter(Boolean),
  });
}

function ioView(ctx, paint) {
  const paste = ui.textarea({ rows: 6, placeholder: 'Paste .ics contents here…' });
  const file = el('input', { type: 'file', accept: '.ics,text/calendar', class: 'input' });

  const ingest = (text) => {
    const { events, skippedRepeats } = parseICS(text);
    if (!events.length) { ui.toast('No events found in that file.', 'warn'); return; }
    ctx.setData((d) => {
      for (const e of events) {
        if (d.events.some((x) => x.title === e.title && x.date === e.date && x.time === e.time)) continue;
        d.events.push(e);
      }
    });
    ctx.log(`imported ${events.length} events from .ics`);
    ui.toast(`Imported ${events.length} events${skippedRepeats ? ` (${skippedRepeats} repeat rules simplified)` : ''}.`);
    paint();
  };

  file.addEventListener('change', async () => {
    const f = file.files[0];
    if (f) ingest(await f.text());
  });

  return el('div', {}, [
    ui.section('Import a calendar file', [
      el('p', { class: 'muted small', text: 'Export an .ics from Google Calendar, Apple Calendar, or a school portal, then drop it in. Repeat rules are simplified to weekly/monthly/yearly.' }),
      file,
      paste,
      ui.button('Import pasted text', { variant: 'primary', onclick: () => ingest(paste.value) }),
    ]),
    ui.section('Export', [
      ui.button('Download family.ics', {
        icon: '⬇',
        onclick: () => download('family.ics', toICS(ctx), 'text/calendar'),
      }),
    ]),
    ui.section('Housekeeping', [
      ui.button('Remove imported events', {
        variant: 'danger',
        onclick: () => ui.confirmDialog('Delete every event that came from an .ics import?', () => {
          ctx.setData((d) => { d.events = d.events.filter((e) => e.source !== 'ics'); });
          paint();
        }),
      }),
    ]),
  ]);
}
