// Factory for the "board" style buildings — chores, groceries, meds, packing,
// maintenance, habits, notes, allowance. They all share one engine:
// items with an owner, a due date, an optional repeat, and optional points/amounts.
//
// To add a new board building, call makeListModule({...}) in registry.js.
// Nothing else needs to change.

import { el, clear, uid, isoDate, parseDate, addDays, fmtDay, round } from '../util.js';
import * as ui from '../ui.js';
import { memberName, member as findMember } from '../store.js';

export const REPEATS = [
  { value: 'none', label: 'One time' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Every week' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Every month' },
  { value: 'quarterly', label: 'Every 3 months' },
  { value: 'yearly', label: 'Every year' },
];

const REPEAT_DAYS = { daily: 1, weekdays: 1, weekly: 7, biweekly: 14, monthly: 30, quarterly: 91, yearly: 365 };

export function nextDue(item) {
  const base = parseDate(item.due) || new Date();
  if (item.repeat === 'monthly' || item.repeat === 'quarterly' || item.repeat === 'yearly') {
    const d = new Date(base);
    const months = item.repeat === 'monthly' ? 1 : item.repeat === 'quarterly' ? 3 : 12;
    d.setMonth(d.getMonth() + months);
    return isoDate(d);
  }
  let d = addDays(base, REPEAT_DAYS[item.repeat] || 1);
  if (item.repeat === 'weekdays') {
    while (d.getDay() === 0 || d.getDay() === 6) d = addDays(d, 1);
  }
  return isoDate(d);
}

function blankItem(cfg) {
  return {
    id: uid('i'),
    title: '',
    detail: '',
    assignee: '',
    due: cfg.fields.due ? isoDate() : '',
    time: '',
    repeat: 'none',
    points: cfg.fields.points ? 5 : 0,
    qty: cfg.fields.qty ? 1 : 0,
    amount: 0,
    category: cfg.categories ? cfg.categories[0] : '',
    done: false,
    doneAt: null,
    streak: 0,
    createdAt: new Date().toISOString(),
  };
}

export function makeListModule(cfg) {
  const config = {
    itemNoun: 'item',
    fields: {},
    seeds: [],
    filters: ['open', 'today', 'all', 'done'],
    mode: 'tasks', // tasks | ledger
    height: 1,
    ...cfg,
    fields: { assignee: true, due: true, repeat: true, detail: true, points: false, qty: false, amount: false, time: false, ...(cfg.fields || {}) },
  };

  function bag(ctx) {
    const data = ctx.data;
    if (!data.items) {
      data.items = (config.seeds || []).map((seed) => ({ ...blankItem(config), ...seed, id: uid('i') }));
    }
    if (!data.view) data.view = { filter: config.mode === 'ledger' ? 'all' : 'open', groupBy: 'none' };
    return data;
  }

  function openItems(ctx) {
    return bag(ctx).items.filter((i) => !i.done);
  }

  function dueToday(ctx) {
    const today = isoDate();
    return openItems(ctx).filter((i) => i.due && i.due <= today);
  }

  const actions = {
    roll: {
      label: 'Roll the board',
      description: 'Advance repeating items, surface anything overdue.',
      async run(ctx) {
        const today = isoDate();
        let advanced = 0;
        let overdue = 0;
        ctx.setData((d) => {
          for (const item of d.items || []) {
            if (item.done && item.repeat !== 'none') {
              item.due = nextDue(item);
              item.done = false;
              item.doneAt = null;
              advanced += 1;
            } else if (!item.done && item.due && item.due < today) {
              overdue += 1;
            }
          }
        });
        return `${advanced} rolled forward, ${overdue} overdue`;
      },
    },
    digest: {
      label: 'Post a digest',
      description: `Log what is due today for the ${config.itemNoun} board.`,
      async run(ctx) {
        const due = dueToday(ctx);
        if (!due.length) return `No ${config.itemNoun}s due today`;
        return `${due.length} due today: ${due.slice(0, 4).map((i) => i.title).join(', ')}`;
      },
    },
    clearDone: {
      label: 'Clear finished one-offs',
      description: 'Archive completed items that do not repeat.',
      async run(ctx) {
        let removed = 0;
        ctx.setData((d) => {
          const before = d.items.length;
          d.items = d.items.filter((i) => !(i.done && i.repeat === 'none'));
          removed = before - d.items.length;
        });
        return `${removed} cleared`;
      },
    },
    ...(config.actions || {}),
  };

  return {
    id: config.id,
    label: config.label,
    icon: config.icon,
    category: config.category || 'Household',
    blurb: config.blurb,
    defaultAgent: config.defaultAgent || 'Agent',
    accent: config.accent || '#7aa2ff',
    height: config.height,
    kind: 'board',
    actions,
    defaultProcess: config.defaultProcess || { mode: 'daily', at: '06:45', action: 'roll' },

    summary(ctx) {
      const data = bag(ctx);
      if (config.mode === 'ledger') {
        const total = data.items.reduce((sum, i) => sum + Number(i.amount || 0), 0);
        return { metric: money(total), line: `${data.items.length} entries` };
      }
      const open = openItems(ctx);
      const today = dueToday(ctx).length;
      return { metric: String(open.length), line: today ? `${today} due today` : `${open.length} open` };
    },

    brief(ctx) {
      if (config.mode === 'ledger') return [];
      return dueToday(ctx).slice(0, 5).map((i) => ({
        title: i.title,
        detail: [i.assignee ? memberName(i.assignee) : null, i.detail].filter(Boolean).join(' · '),
      }));
    },

    render(ctx) {
      const data = bag(ctx);
      const host = el('div', { class: 'board' });

      const paint = () => {
        clear(host);
        host.appendChild(renderControls(ctx, data, paint, config));
        host.appendChild(renderAdd(ctx, config, paint));
        if (config.mode === 'ledger') host.appendChild(renderLedger(ctx, data, paint, config));
        else host.appendChild(renderTasks(ctx, data, paint, config));
      };

      paint();
      return host;
    },
  };
}

function money(n) {
  return `${n < 0 ? '-' : ''}$${Math.abs(round(n, 2)).toFixed(2)}`;
}

function renderControls(ctx, data, paint, config) {
  const filters = config.mode === 'ledger'
    ? [{ value: 'all', label: 'All' }]
    : [
      { value: 'open', label: 'Open' },
      { value: 'today', label: 'Due today' },
      { value: 'all', label: 'All' },
      { value: 'done', label: 'Done' },
    ];

  const bar = el('div', { class: 'board-controls' }, [
    el('div', { class: 'segmented' }, filters.map((f) => el('button', {
      class: `seg${data.view.filter === f.value ? ' on' : ''}`,
      type: 'button',
      text: f.label,
      onclick: () => { ctx.setData((d) => { d.view.filter = f.value; }); paint(); },
    }))),
    config.fields.assignee ? ui.button(data.view.groupBy === 'assignee' ? 'Grouped by person' : 'Group by person', {
      icon: '👥',
      onclick: () => {
        ctx.setData((d) => { d.view.groupBy = d.view.groupBy === 'assignee' ? 'none' : 'assignee'; });
        paint();
      },
    }) : null,
  ]);
  return bar;
}

function renderAdd(ctx, config, paint) {
  const draft = blankItem(config);
  const titleInput = ui.input({ placeholder: `Add a ${config.itemNoun}…`, 'aria-label': `New ${config.itemNoun}` });
  const members = ctx.state.household.members;

  const assignee = config.fields.assignee
    ? ui.select(ui.memberOptions(members), { 'aria-label': 'Assign to' })
    : null;
  const due = config.fields.due ? ui.input({ type: 'date', value: draft.due, 'aria-label': 'Due date' }) : null;
  const repeat = config.fields.repeat ? ui.select(REPEATS, { value: 'none', 'aria-label': 'Repeat' }) : null;
  const qty = config.fields.qty ? ui.input({ type: 'number', min: '1', value: '1', 'aria-label': 'Quantity', class: 'input tiny' }) : null;
  const points = config.fields.points ? ui.input({ type: 'number', min: '0', value: '5', 'aria-label': 'Points', class: 'input tiny' }) : null;
  const amount = config.fields.amount ? ui.input({ type: 'number', step: '0.01', value: '0', 'aria-label': 'Amount', class: 'input tiny' }) : null;
  const category = config.categories
    ? ui.select(config.categories.map((c) => ({ value: c, label: c })), { 'aria-label': 'Category' })
    : null;

  function submit() {
    const title = titleInput.value.trim();
    if (!title) { titleInput.focus(); return; }
    const item = {
      ...blankItem(config),
      title,
      assignee: assignee ? assignee.value : '',
      due: due ? due.value : '',
      repeat: repeat ? repeat.value : 'none',
      qty: qty ? Number(qty.value) : 0,
      points: points ? Number(points.value) : 0,
      amount: amount ? Number(amount.value) : 0,
      category: category ? category.value : '',
    };
    ctx.setData((d) => { d.items.unshift(item); });
    ctx.log(`added "${title}"`);
    titleInput.value = '';
    paint();
  }

  titleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });

  return el('form', { class: 'board-add', onsubmit: (e) => { e.preventDefault(); submit(); } }, [
    titleInput,
    category, assignee, due, repeat, qty, points, amount,
    ui.button('Add', { variant: 'primary', type: 'submit' }),
  ].filter(Boolean));
}

function visibleItems(data) {
  const today = isoDate();
  const { filter } = data.view;
  return data.items.filter((i) => {
    if (filter === 'open') return !i.done;
    if (filter === 'done') return i.done;
    if (filter === 'today') return !i.done && i.due && i.due <= today;
    return true;
  });
}

function renderTasks(ctx, data, paint, config) {
  const items = visibleItems(data);
  const wrap = el('div', { class: 'board-list' });

  if (config.fields.points) {
    const tally = new Map();
    for (const item of data.items.filter((i) => i.done)) {
      tally.set(item.assignee, (tally.get(item.assignee) || 0) + Number(item.points || 0));
    }
    const scores = ctx.state.household.members
      .map((m) => ({ m, points: tally.get(m.id) || 0 }))
      .sort((a, b) => b.points - a.points);
    if (scores.length) {
      wrap.appendChild(el('div', { class: 'score-strip' }, scores.map(({ m, points }) => el('div', { class: 'score' }, [
        ui.memberDot(m),
        el('span', { class: 'score-name', text: m.name }),
        el('strong', { text: `${points} pts` }),
      ]))));
    }
  }

  if (!items.length) {
    wrap.appendChild(ui.empty(`No ${config.itemNoun}s here. Add one above.`));
    return wrap;
  }

  const groups = data.view.groupBy === 'assignee'
    ? groupBy(items, (i) => i.assignee || '')
    : new Map([['', items]]);

  for (const [key, groupItems] of groups) {
    if (data.view.groupBy === 'assignee') {
      wrap.appendChild(el('h4', { class: 'group-head', text: key ? memberName(key) : 'Unassigned' }));
    }
    wrap.appendChild(el('ul', { class: 'list' }, groupItems.map((item) => renderTaskRow(ctx, item, paint, config))));
  }
  return wrap;
}

function renderTaskRow(ctx, item, paint, config) {
  const today = isoDate();
  const overdue = !item.done && item.due && item.due < today;
  const owner = findMember(item.assignee);

  const toggle = el('input', {
    type: 'checkbox',
    class: 'check',
    checked: item.done,
    'aria-label': `Mark ${item.title} done`,
    onchange: () => {
      ctx.setData((d) => {
        const target = d.items.find((i) => i.id === item.id);
        if (!target) return;
        target.done = !target.done;
        target.doneAt = target.done ? new Date().toISOString() : null;
        if (target.done && target.repeat !== 'none') target.streak = (target.streak || 0) + 1;
      });
      ctx.log(`${item.done ? 'reopened' : 'completed'} "${item.title}"`);
      paint();
    },
  });

  const meta = [];
  if (owner) meta.push(el('span', { class: 'meta-pill' }, [ui.memberDot(owner), owner.name]));
  if (item.due) meta.push(ui.chip(fmtDay(parseDate(item.due)), { tone: overdue ? 'danger' : 'neutral' }));
  if (item.repeat && item.repeat !== 'none') {
    meta.push(ui.chip(REPEATS.find((r) => r.value === item.repeat).label, { tone: 'info' }));
  }
  if (item.streak > 1) meta.push(ui.chip(`🔥 ${item.streak}`, { tone: 'warn' }));
  if (config.fields.qty && item.qty > 1) meta.push(ui.chip(`×${item.qty}`));
  if (config.fields.points && item.points) meta.push(ui.chip(`${item.points} pts`, { tone: 'ok' }));
  if (item.category) meta.push(ui.chip(item.category));

  return el('li', { class: `list-item${item.done ? ' done' : ''}` }, [
    toggle,
    el('div', { class: 'item-main' }, [
      el('div', { class: 'item-title', text: item.title }),
      item.detail ? el('div', { class: 'item-detail', text: item.detail }) : null,
      meta.length ? el('div', { class: 'item-meta' }, meta) : null,
    ]),
    el('div', { class: 'item-tools' }, [
      ui.button('Edit', {
        icon: '✎',
        'aria-label': `Edit ${item.title}`,
        onclick: () => editItem(ctx, item, paint, config),
      }),
      ui.button('Delete', {
        icon: '🗑',
        'aria-label': `Delete ${item.title}`,
        onclick: () => {
          ctx.setData((d) => { d.items = d.items.filter((i) => i.id !== item.id); });
          paint();
        },
      }),
    ]),
  ]);
}

function editItem(ctx, item, paint, config) {
  const members = ctx.state.household.members;
  const title = ui.input({ value: item.title });
  const detail = ui.textarea({ value: item.detail });
  const assignee = ui.select(ui.memberOptions(members), { value: item.assignee });
  const due = ui.input({ type: 'date', value: item.due });
  const time = ui.input({ type: 'time', value: item.time });
  const repeat = ui.select(REPEATS, { value: item.repeat });
  const points = ui.input({ type: 'number', value: String(item.points || 0), min: '0' });
  const qty = ui.input({ type: 'number', value: String(item.qty || 1), min: '1' });

  const dlg = ui.modal({
    title: `Edit ${config.itemNoun}`,
    body: el('div', { class: 'form-grid' }, [
      ui.field('Title', title),
      config.fields.detail ? ui.field('Details', detail) : null,
      config.fields.assignee ? ui.field('Owner', assignee) : null,
      config.fields.due ? ui.field('Due', due) : null,
      config.fields.time ? ui.field('Time', time) : null,
      config.fields.repeat ? ui.field('Repeat', repeat) : null,
      config.fields.points ? ui.field('Points', points) : null,
      config.fields.qty ? ui.field('Quantity', qty) : null,
    ].filter(Boolean)),
    actions: [
      ui.button('Cancel', { onclick: () => dlg.close() }),
      ui.button('Save', {
        variant: 'primary',
        onclick: () => {
          ctx.setData((d) => {
            const target = d.items.find((i) => i.id === item.id);
            if (!target) return;
            Object.assign(target, {
              title: title.value.trim() || target.title,
              detail: detail.value,
              assignee: assignee.value,
              due: due.value,
              time: time.value,
              repeat: repeat.value,
              points: Number(points.value) || 0,
              qty: Number(qty.value) || 1,
            });
          });
          dlg.close();
          paint();
        },
      }),
    ],
  });
}

function renderLedger(ctx, data, paint, config) {
  const wrap = el('div', { class: 'board-list' });
  const balances = new Map();
  for (const entry of data.items) {
    balances.set(entry.assignee, (balances.get(entry.assignee) || 0) + Number(entry.amount || 0));
  }
  wrap.appendChild(el('div', { class: 'score-strip' }, ctx.state.household.members.map((m) => el('div', { class: 'score' }, [
    ui.memberDot(m),
    el('span', { class: 'score-name', text: m.name }),
    el('strong', { text: money(balances.get(m.id) || 0) }),
  ]))));

  wrap.appendChild(ui.list(data.items, (entry) => [
    el('div', { class: 'item-main' }, [
      el('div', { class: 'item-title', text: entry.title }),
      el('div', { class: 'item-meta' }, [
        entry.assignee ? ui.chip(memberName(entry.assignee)) : null,
        entry.due ? ui.chip(fmtDay(parseDate(entry.due))) : null,
        ui.chip(money(entry.amount), { tone: Number(entry.amount) < 0 ? 'danger' : 'ok' }),
      ].filter(Boolean)),
    ]),
    ui.button('Delete', {
      icon: '🗑',
      'aria-label': `Delete ${entry.title}`,
      onclick: () => { ctx.setData((d) => { d.items = d.items.filter((i) => i.id !== entry.id); }); paint(); },
    }),
  ], 'No entries yet.'));
  return wrap;
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}
