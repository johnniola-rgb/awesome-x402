// Meal Hall — the week's dinner plan, the takeout order roll-up, and the
// grocery hand-off. Recipes come from TheMealDB (no key required).

import { el, clear, uid, isoDate, parseDate, addDays, startOfWeek, fmtDay, fmtTime, debounce } from '../util.js';
import * as ui from '../ui.js';
import * as api from '../api.js';
import { memberName } from '../store.js';

const KINDS = [
  { value: 'cook', label: 'Cooking in', icon: '🍳' },
  { value: 'takeout', label: 'Takeout', icon: '🥡' },
  { value: 'out', label: 'Eating out', icon: '🍽️' },
  { value: 'leftovers', label: 'Leftovers', icon: '🥶' },
  { value: 'undecided', label: 'Undecided', icon: '❔' },
];

const FALLBACK_IDEAS = [
  'Sheet pan chicken + veg', 'Taco night', 'Pasta and salad', 'Breakfast for dinner',
  'Stir fry with rice', 'Soup and grilled cheese', 'Burger night', 'Curry and naan',
];

function bag(ctx) {
  const d = ctx.data;
  if (!d.plan) d.plan = {};
  if (!d.settings) d.settings = { dinnerTime: '18:00', orderBy: '17:15', favorites: [] };
  return d;
}

function weekDates(ctx) {
  const start = startOfWeek(new Date(), ctx.state.city.weekStartsOn ?? 1);
  return Array.from({ length: 7 }, (_, i) => isoDate(addDays(start, i)));
}

function nightFor(ctx, date) {
  const d = bag(ctx);
  if (!d.plan[date]) {
    d.plan[date] = {
      date, kind: 'undecided', title: '', cook: '', recipe: null,
      time: d.settings.dinnerTime, notes: '', status: 'planned', orders: {}, place: '',
    };
  }
  return d.plan[date];
}

function tonight(ctx) {
  return bag(ctx).plan[isoDate()] || null;
}

/* ---------- cross-building hand-offs ---------- */

function pushToGrocery(ctx, lines, source) {
  const depot = ctx.firstOfType('grocery');
  if (!depot) return 0;
  ctx.setDataOf(depot.id, (d) => {
    if (!d.items) d.items = [];
    for (const line of lines) {
      if (d.items.some((i) => i.title.toLowerCase() === line.title.toLowerCase() && !i.done)) continue;
      d.items.unshift({
        id: uid('i'), title: line.title, detail: line.detail || source, assignee: '', due: '',
        time: '', repeat: 'none', points: 0, qty: 1, amount: 0, category: '', done: false,
        doneAt: null, streak: 0, createdAt: new Date().toISOString(),
      });
    }
  });
  return lines.length;
}

function pushToCalendar(ctx, event) {
  const cal = ctx.firstOfType('calendar');
  if (!cal) return false;
  ctx.setDataOf(cal.id, (d) => {
    if (!d.events) d.events = [];
    d.events.push({ id: uid('e'), source: 'meals', ...event });
  });
  return true;
}

/* ---------- actions ---------- */

async function planWeek(ctx) {
  const dates = weekDates(ctx);
  const ideas = [...FALLBACK_IDEAS];
  let filled = 0;
  const suggestions = [];
  for (const date of dates) {
    const night = nightFor(ctx, date);
    if (night.kind !== 'undecided' || night.title) continue;
    suggestions.push(date);
  }
  for (const date of suggestions) {
    let pick = null;
    try {
      pick = await api.randomMeal();
    } catch { /* offline: fall back to the static idea list */ }
    ctx.setData((d) => {
      const night = d.plan[date];
      if (!night) return;
      night.kind = 'cook';
      night.title = pick ? pick.name : ideas[filled % ideas.length];
      night.recipe = pick ? { id: pick.id, name: pick.name, thumb: pick.thumb, ingredients: pick.ingredients, source: pick.source } : null;
    });
    filled += 1;
  }
  return filled ? `Filled ${filled} open night${filled === 1 ? '' : 's'}` : 'Every night already has a plan';
}

async function orderCheck(ctx) {
  const night = tonight(ctx);
  if (!night) return 'No plan for tonight yet';
  if (night.kind === 'takeout' && night.status !== 'ordered') {
    const picked = Object.keys(night.orders || {}).length;
    return `Takeout tonight (${night.place || 'place TBD'}) — not ordered yet, ${picked}/${ctx.state.household.members.length} picks in. Order by ${fmtTime(bag(ctx).settings.orderBy)}.`;
  }
  if (night.kind === 'undecided') return 'Tonight is still undecided — pick something.';
  return `Tonight: ${night.title || KINDS.find((k) => k.value === night.kind).label}`;
}

async function groceryRun(ctx) {
  const dates = weekDates(ctx);
  const lines = [];
  for (const date of dates) {
    const night = bag(ctx).plan[date];
    if (!night || !night.recipe) continue;
    for (const ing of night.recipe.ingredients || []) {
      lines.push({ title: ing.name, detail: `${ing.measure} · ${night.recipe.name}` });
    }
  }
  if (!lines.length) return 'No recipes attached this week';
  const sent = pushToGrocery(ctx, lines, 'Meal Hall');
  return sent ? `Sent ${sent} ingredients to the Supply Depot` : 'No Supply Depot building — add one to receive ingredients';
}

export default {
  id: 'meals',
  label: 'Meal Hall',
  icon: '🍲',
  category: 'Daily',
  blurb: 'Dinner plan for the week, takeout order roll-up, recipe search, grocery hand-off.',
  defaultAgent: 'Sage',
  accent: '#ffb347',
  height: 1.3,
  defaultProcess: { mode: 'daily', at: '15:30', action: 'orderCheck' },

  actions: {
    orderCheck: { label: 'Check tonight’s dinner', description: 'Nudge if tonight is unplanned or unordered.', run: orderCheck },
    planWeek: { label: 'Fill the empty nights', description: 'Suggest a meal for every undecided night this week.', run: planWeek },
    groceryRun: { label: 'Send ingredients to groceries', description: 'Push this week’s recipe ingredients to the Supply Depot.', run: groceryRun },
  },

  summary(ctx) {
    const night = tonight(ctx);
    if (!night || night.kind === 'undecided') return { metric: '❔', line: 'Tonight unplanned' };
    const kind = KINDS.find((k) => k.value === night.kind);
    return { metric: kind.icon, line: night.title || kind.label };
  },

  brief(ctx) {
    const night = tonight(ctx);
    if (!night) return [{ title: 'Dinner', detail: 'Nothing planned for tonight.' }];
    const kind = KINDS.find((k) => k.value === night.kind);
    const bits = [kind.label];
    if (night.cook) bits.push(`${memberName(night.cook)} cooks`);
    if (night.time) bits.push(fmtTime(night.time));
    if (night.kind === 'takeout' && night.status !== 'ordered') bits.push('NOT ORDERED YET');
    return [{ title: `${kind.icon} ${night.title || 'Dinner'}`, detail: bits.join(' · ') }];
  },

  render(ctx) {
    const host = el('div');
    const paint = () => {
      clear(host);
      host.appendChild(ui.tabs([
        { label: 'This week', render: () => weekView(ctx, paint) },
        { label: 'Order sheet', render: () => orderView(ctx, paint) },
        { label: 'Recipes', render: () => recipeView(ctx, paint) },
        { label: 'Settings', render: () => settingsView(ctx, paint) },
      ]));
    };
    paint();
    return host;
  },
};

function weekView(ctx, paint) {
  const wrap = el('div');
  const dates = weekDates(ctx);
  const today = isoDate();

  wrap.appendChild(el('div', { class: 'row' }, [
    ui.button('Fill empty nights', { icon: '✨', onclick: async () => { await ctx.run('planWeek'); paint(); } }),
    ui.button('Send ingredients to groceries', { icon: '🧺', onclick: async () => { await ctx.run('groceryRun'); paint(); } }),
  ]));

  wrap.appendChild(el('div', { class: 'meal-week' }, dates.map((date) => {
    const night = nightFor(ctx, date);
    const kind = KINDS.find((k) => k.value === night.kind);
    const isToday = date === today;
    return el('div', { class: `meal-night${isToday ? ' today' : ''}` }, [
      el('header', { class: 'meal-head' }, [
        el('strong', { text: isToday ? 'Tonight' : fmtDay(parseDate(date), { weekday: 'long' }) }),
        el('span', { class: 'muted small', text: fmtDay(parseDate(date), { month: 'short', day: 'numeric' }) }),
      ]),
      el('div', { class: 'meal-kind' }, KINDS.map((k) => el('button', {
        class: `pill${k.value === night.kind ? ' on' : ''}`,
        type: 'button',
        title: k.label,
        text: k.icon,
        'aria-label': `${k.label} on ${date}`,
        onclick: () => { ctx.setData((d) => { d.plan[date].kind = k.value; }); paint(); },
      }))),
      ui.input({
        value: night.title,
        placeholder: night.kind === 'takeout' ? 'What are we ordering?' : 'What’s for dinner?',
        'aria-label': `Meal for ${date}`,
        onchange: (e) => ctx.setData((d) => { d.plan[date].title = e.target.value; }),
      }),
      el('div', { class: 'row small-gap' }, [
        ui.select(ui.memberOptions(ctx.state.household.members, { noneLabel: 'Who cooks?' }), {
          value: night.cook,
          'aria-label': `Cook for ${date}`,
          onchange: (e) => ctx.setData((d) => { d.plan[date].cook = e.target.value; }),
        }),
        ui.input({
          type: 'time', value: night.time, class: 'input tiny', 'aria-label': `Dinner time ${date}`,
          onchange: (e) => ctx.setData((d) => { d.plan[date].time = e.target.value; }),
        }),
      ]),
      night.recipe ? el('div', { class: 'recipe-chip' }, [
        night.recipe.thumb ? el('img', { src: `${night.recipe.thumb}/preview`, alt: '', loading: 'lazy' }) : null,
        el('span', { text: night.recipe.name }),
        ui.button('Remove', { icon: '✕', 'aria-label': 'Remove recipe', onclick: () => { ctx.setData((d) => { d.plan[date].recipe = null; }); paint(); } }),
      ]) : null,
      night.kind === 'takeout' ? el('div', { class: 'row small-gap' }, [
        ui.input({
          value: night.place, placeholder: 'Restaurant', class: 'input tiny', 'aria-label': 'Restaurant',
          onchange: (e) => ctx.setData((d) => { d.plan[date].place = e.target.value; }),
        }),
        ui.chip(night.status === 'ordered' ? 'Ordered' : 'Not ordered', { tone: night.status === 'ordered' ? 'ok' : 'warn' }),
      ]) : null,
      el('div', { class: 'row small-gap' }, [
        ui.button('Add to calendar', {
          icon: '📅',
          onclick: () => {
            const ok = pushToCalendar(ctx, {
              title: `Dinner: ${night.title || KINDS.find((k) => k.value === night.kind).label}`,
              date, time: night.time, endTime: '', allDay: false,
              members: night.cook ? [night.cook] : [], location: night.place || '', category: 'Meals', notes: night.notes,
            });
            ui.toast(ok ? 'Added to the family calendar.' : 'No calendar building found.', ok ? 'ok' : 'warn');
          },
        }),
      ]),
    ]);
  })));

  return wrap;
}

function orderView(ctx, paint) {
  const wrap = el('div');
  const dates = weekDates(ctx);
  const today = isoDate();
  const selected = ctx.data.orderDate && dates.includes(ctx.data.orderDate) ? ctx.data.orderDate : today;
  const night = nightFor(ctx, selected);
  const settings = bag(ctx).settings;

  wrap.appendChild(el('div', { class: 'segmented' }, dates.map((d) => el('button', {
    class: `seg${d === selected ? ' on' : ''}`,
    type: 'button',
    text: d === today ? 'Today' : fmtDay(parseDate(d), { weekday: 'short' }),
    onclick: () => { ctx.setData((data) => { data.orderDate = d; }); paint(); },
  }))));

  wrap.appendChild(ui.section('Where from', [
    el('div', { class: 'row' }, [
      ui.input({
        value: night.place, placeholder: 'Restaurant or app',
        onchange: (e) => ctx.setData((d) => { d.plan[selected].place = e.target.value; }),
      }),
      ui.input({
        type: 'time', value: settings.orderBy, class: 'input tiny', 'aria-label': 'Order by',
        onchange: (e) => ctx.setData((d) => { d.settings.orderBy = e.target.value; }),
      }),
    ]),
    el('p', { class: 'muted small', text: `Order-by reminder fires from this building’s process. Currently ${fmtTime(settings.orderBy)}.` }),
  ]));

  wrap.appendChild(ui.section('Everyone’s pick', ctx.state.household.members.map((m) => {
    const order = (night.orders || {})[m.id] || { item: '', notes: '' };
    return el('div', { class: 'order-row' }, [
      ui.memberDot(m),
      el('span', { class: 'order-name', text: m.name }),
      ui.input({
        value: order.item, placeholder: 'Their order…', 'aria-label': `${m.name}'s order`,
        onchange: (e) => ctx.setData((d) => {
          const n = d.plan[selected];
          if (!n.orders) n.orders = {};
          n.orders[m.id] = { ...(n.orders[m.id] || {}), item: e.target.value };
        }),
      }),
      ui.input({
        value: order.notes, placeholder: 'No onions…', class: 'input tiny', 'aria-label': `${m.name}'s notes`,
        onchange: (e) => ctx.setData((d) => {
          const n = d.plan[selected];
          if (!n.orders) n.orders = {};
          n.orders[m.id] = { ...(n.orders[m.id] || {}), notes: e.target.value };
        }),
      }),
    ]);
  })));

  const sheet = orderSheetText(ctx, night);
  wrap.appendChild(ui.section('Order sheet', [
    el('pre', { class: 'order-sheet', text: sheet }),
    el('div', { class: 'row' }, [
      ui.button('Copy order', {
        icon: '📋',
        variant: 'primary',
        onclick: async () => {
          try { await navigator.clipboard.writeText(sheet); ui.toast('Order copied.'); }
          catch { ui.toast('Copy failed — select the text instead.', 'warn'); }
        },
      }),
      ui.button(night.status === 'ordered' ? 'Mark not ordered' : 'Mark as ordered', {
        icon: '✅',
        onclick: () => {
          ctx.setData((d) => {
            const n = d.plan[selected];
            n.status = n.status === 'ordered' ? 'planned' : 'ordered';
          });
          ctx.log(`${night.status === 'ordered' ? 'un-marked' : 'marked'} ${selected} dinner as ordered`);
          paint();
        },
      }),
    ]),
  ]));

  return wrap;
}

function orderSheetText(ctx, night) {
  const lines = [`${night.place || 'Dinner order'} — ${fmtDay(parseDate(night.date))}`];
  for (const m of ctx.state.household.members) {
    const o = (night.orders || {})[m.id];
    if (o && o.item) lines.push(`• ${m.name}: ${o.item}${o.notes ? ` (${o.notes})` : ''}`);
  }
  if (lines.length === 1) lines.push('(nobody has picked yet)');
  return lines.join('\n');
}

function recipeView(ctx, paint) {
  const wrap = el('div');
  const results = el('div', { class: 'recipe-grid' });
  const search = ui.input({ placeholder: 'Search recipes — "chicken", "pasta"…' });

  const run = debounce(async () => {
    const q = search.value.trim();
    if (q.length < 2) { clear(results); return; }
    clear(results);
    results.appendChild(ui.spinner('Searching TheMealDB…'));
    try {
      const meals = await api.searchMeals(q);
      clear(results);
      if (!meals.length) { results.appendChild(ui.empty('No recipes matched.')); return; }
      for (const meal of meals.slice(0, 12)) results.appendChild(recipeCard(ctx, meal, paint));
    } catch (err) {
      clear(results);
      results.appendChild(ui.errorBox(`Recipe search failed: ${err.message}`));
    }
  }, 450);

  search.addEventListener('input', run);

  wrap.appendChild(ui.section('Find a recipe', [search, el('div', { class: 'row' }, [
    ui.button('Surprise me', {
      icon: '🎲',
      onclick: async () => {
        clear(results);
        results.appendChild(ui.spinner('Rolling…'));
        try {
          const meal = await api.randomMeal();
          clear(results);
          if (meal) results.appendChild(recipeCard(ctx, meal, paint));
        } catch (err) { clear(results); results.appendChild(ui.errorBox(err.message)); }
      },
    }),
  ]), results]));

  const favs = bag(ctx).settings.favorites || [];
  wrap.appendChild(ui.section('Family favorites', favs.length
    ? el('div', { class: 'recipe-grid' }, favs.map((f) => recipeCard(ctx, f, paint, true)))
    : ui.empty('Star a recipe to keep it here.')));

  return wrap;
}

function recipeCard(ctx, meal, paint, isFav = false) {
  const dates = weekDates(ctx);
  return el('article', { class: 'recipe-card' }, [
    meal.thumb ? el('img', { src: `${meal.thumb}/medium`, alt: '', loading: 'lazy' }) : null,
    el('div', { class: 'recipe-body' }, [
      el('h4', { text: meal.name }),
      el('p', { class: 'muted small', text: [meal.category, meal.area].filter(Boolean).join(' · ') }),
      el('div', { class: 'row small-gap' }, [
        ui.select([{ value: '', label: 'Put on a night…' }, ...dates.map((d) => ({
          value: d, label: d === isoDate() ? 'Tonight' : fmtDay(parseDate(d), { weekday: 'long' }),
        }))], {
          'aria-label': `Schedule ${meal.name}`,
          onchange: (e) => {
            const date = e.target.value;
            if (!date) return;
            ctx.setData((d) => {
              const night = d.plan[date] || nightFor(ctx, date);
              night.kind = 'cook';
              night.title = meal.name;
              night.recipe = { id: meal.id, name: meal.name, thumb: meal.thumb, ingredients: meal.ingredients, source: meal.source };
            });
            ui.toast(`${meal.name} scheduled.`);
            paint();
          },
        }),
        ui.button(isFav ? 'Unstar' : 'Star', {
          icon: isFav ? '★' : '☆',
          onclick: () => {
            ctx.setData((d) => {
              const list = d.settings.favorites || (d.settings.favorites = []);
              const idx = list.findIndex((f) => f.id === meal.id);
              if (idx >= 0) list.splice(idx, 1);
              else list.push({ id: meal.id, name: meal.name, thumb: meal.thumb, ingredients: meal.ingredients, category: meal.category, area: meal.area, source: meal.source });
            });
            paint();
          },
        }),
        ui.button('Ingredients → groceries', {
          icon: '🧺',
          onclick: () => {
            const sent = pushToGrocery(ctx, (meal.ingredients || []).map((i) => ({ title: i.name, detail: `${i.measure} · ${meal.name}` })), meal.name);
            ui.toast(sent ? `${sent} ingredients sent.` : 'No Supply Depot building found.', sent ? 'ok' : 'warn');
          },
        }),
      ]),
      meal.instructions ? el('details', {}, [
        el('summary', { text: 'Instructions' }),
        el('p', { class: 'small', text: meal.instructions.slice(0, 900) }),
      ]) : null,
    ]),
  ]);
}

function settingsView(ctx, paint) {
  const s = bag(ctx).settings;
  return el('div', {}, [
    ui.section('Defaults', [
      ui.field('Usual dinner time', ui.input({
        type: 'time', value: s.dinnerTime,
        onchange: (e) => { ctx.setData((d) => { d.settings.dinnerTime = e.target.value; }); },
      })),
      ui.field('Order-by time for takeout', ui.input({
        type: 'time', value: s.orderBy,
        onchange: (e) => { ctx.setData((d) => { d.settings.orderBy = e.target.value; }); },
      })),
    ]),
    ui.section('Housekeeping', [
      ui.button('Clear this week’s plan', {
        variant: 'danger',
        onclick: () => ui.confirmDialog('Clear every night this week?', () => {
          const dates = weekDates(ctx);
          ctx.setData((d) => { for (const date of dates) delete d.plan[date]; });
          paint();
        }),
      }),
    ]),
  ]);
}
