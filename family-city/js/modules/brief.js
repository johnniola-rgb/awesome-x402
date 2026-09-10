// Morning Brief — one page that pulls a line from every other building.
// Nothing is stored here; it reads the city and composes.

import { el, clear, isoDate, fmtDay, fmtTime, relTime, download } from '../util.js';
import * as ui from '../ui.js';

function collect(ctx) {
  return ctx.collectBriefs().filter((row) => row.items && row.items.length);
}

function overnight(ctx, hours = 14) {
  const cutoff = Date.now() - hours * 3600000;
  return ctx.state.activity.filter((a) => new Date(a.at).getTime() >= cutoff);
}

function briefText(ctx) {
  const lines = [`${ctx.state.city.name} — Morning Brief`, fmtDay(new Date(), { weekday: 'long', month: 'long', day: 'numeric' }), ''];
  for (const row of collect(ctx)) {
    lines.push(`${row.module.icon} ${row.building.name}`);
    for (const item of row.items) lines.push(`  • ${item.title}${item.detail ? ` — ${item.detail}` : ''}`);
    lines.push('');
  }
  const work = overnight(ctx);
  if (work.length) {
    lines.push('While you slept:');
    for (const a of work.slice(0, 12)) lines.push(`  ${fmtTime(a.at)} ${a.message}`);
  }
  return lines.join('\n');
}

export default {
  id: 'brief',
  label: 'Morning Brief',
  icon: '📰',
  category: 'Daily',
  blurb: 'One page that assembles a line from every other building in the city.',
  defaultAgent: 'Dawn',
  accent: '#4ade80',
  height: 1.45,
  defaultProcess: { mode: 'daily', at: '07:00', action: 'compose' },

  actions: {
    compose: {
      label: 'Compose the brief',
      description: 'Assemble every building’s headline into one entry.',
      async run(ctx) {
        const rows = collect(ctx);
        const total = rows.reduce((n, r) => n + r.items.length, 0);
        ctx.setData((d) => { d.lastBrief = { at: new Date().toISOString(), text: briefText(ctx) }; });
        return `Brief ready — ${total} lines from ${rows.length} buildings`;
      },
    },
  },

  summary(ctx) {
    const rows = collect(ctx);
    return { metric: '📰', line: rows.length ? `${rows.length} buildings reporting` : 'nothing to report' };
  },

  brief() {
    return [];
  },

  render(ctx) {
    const host = el('div');

    const paint = () => {
      clear(host);
      const rows = collect(ctx);
      const work = overnight(ctx);

      host.appendChild(el('div', { class: 'brief-head' }, [
        el('div', { class: 'brief-kicker', text: ctx.state.city.name.toUpperCase() }),
        el('h2', { class: 'brief-title', text: 'Morning Brief' }),
        el('p', { class: 'brief-sub', text: `${fmtDay(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })} · while you slept, the crew kept working` }),
      ]));

      host.appendChild(el('div', { class: 'brief-stats' }, ctx.buildings
        .filter((b) => b.type !== 'brief' && b.type !== 'hall')
        .slice(0, 4)
        .map((b) => {
          const s = ctx.summaryOf(b);
          return ui.stat(b.name, s.metric, s.line);
        })));

      host.appendChild(ui.section('While you slept', work.length
        ? el('ul', { class: 'timeline' }, work.slice(0, 14).map((a) => el('li', {}, [
          el('span', { class: 'tl-time', text: fmtTime(a.at) }),
          el('span', { class: `tl-dot ${a.level}` }),
          el('span', { class: 'tl-text', text: a.message }),
        ])))
        : ui.empty('No agent activity in the last 14 hours. Give a building a schedule and it will fill this in.')));

      for (const row of rows) {
        host.appendChild(ui.section(`${row.module.icon} ${row.building.name}`,
          el('ul', { class: 'brief-list' }, row.items.map((item) => el('li', {}, [
            el('strong', { text: item.title }),
            item.detail ? el('span', { class: 'muted', text: ` — ${item.detail}` }) : null,
          ])))));
      }

      host.appendChild(el('div', { class: 'row' }, [
        ui.button('Rebuild', { icon: '↻', variant: 'primary', onclick: async () => { await ctx.run('compose'); paint(); } }),
        ui.button('Copy as text', {
          icon: '📋',
          onclick: async () => {
            try { await navigator.clipboard.writeText(briefText(ctx)); ui.toast('Brief copied.'); }
            catch { ui.toast('Copy failed.', 'warn'); }
          },
        }),
        ui.button('Download', { icon: '⬇', onclick: () => download(`brief-${isoDate()}.txt`, briefText(ctx), 'text/plain') }),
        ui.button('Print', { icon: '🖨', onclick: () => window.print() }),
      ]));

      if (ctx.data.lastBrief) {
        host.appendChild(el('p', { class: 'muted small', text: `Last composed ${relTime(ctx.data.lastBrief.at)}.` }));
      }
    };

    paint();
    return host;
  },
};
