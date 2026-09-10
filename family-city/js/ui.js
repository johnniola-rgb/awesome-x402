// Shared widgets so every building panel looks like it belongs to the same city.

import { el, clear, frag } from './util.js';

export function section(title, children, actions = null) {
  return el('section', { class: 'sec' }, [
    el('header', { class: 'sec-head' }, [
      el('h3', { class: 'sec-title', text: title }),
      actions ? el('div', { class: 'sec-actions' }, actions) : null,
    ]),
    el('div', { class: 'sec-body' }, children),
  ]);
}

export function field(label, control, hint) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'field-label', text: label }),
    control,
    hint ? el('span', { class: 'field-hint', text: hint }) : null,
  ]);
}

export function input(props = {}) {
  return el('input', { class: 'input', type: 'text', ...props });
}

export function textarea(props = {}) {
  return el('textarea', { class: 'input textarea', rows: 3, ...props });
}

export function select(options, props = {}) {
  const node = el('select', { class: 'input select', ...props });
  for (const opt of options) {
    const o = el('option', { value: opt.value, text: opt.label });
    if (opt.value === props.value) o.selected = true;
    node.appendChild(o);
  }
  if (props.value != null) node.value = props.value;
  return node;
}

export function button(label, props = {}) {
  const { variant = 'ghost', icon, ...rest } = props;
  return el('button', { class: `btn btn-${variant}`, type: 'button', ...rest }, [
    icon ? el('span', { class: 'btn-icon', text: icon }) : null,
    el('span', { text: label }),
  ]);
}

export function chip(label, props = {}) {
  const { tone = 'neutral', ...rest } = props;
  return el('span', { class: `chip chip-${tone}`, ...rest }, [label]);
}

export function stat(label, value, sub) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat-value', text: value }),
    el('div', { class: 'stat-label', text: label }),
    sub ? el('div', { class: 'stat-sub', text: sub }) : null,
  ]);
}

export function empty(message, action) {
  return el('div', { class: 'empty' }, [el('p', { text: message }), action]);
}

export function row(children, props = {}) {
  return el('div', { class: `row ${props.class || ''}`.trim() }, children);
}

export function grid(children, props = {}) {
  return el('div', { class: `grid ${props.class || ''}`.trim() }, children);
}

export function spinner(text = 'Working…') {
  return el('div', { class: 'loading' }, [el('span', { class: 'spin' }), el('span', { text })]);
}

export function errorBox(message) {
  return el('div', { class: 'errbox', text: message });
}

/* ---------- toast ---------- */

let toastHost = null;

export function toast(message, tone = 'ok') {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host' });
    document.body.appendChild(toastHost);
  }
  const node = el('div', { class: `toast toast-${tone}`, text: message });
  toastHost.appendChild(node);
  setTimeout(() => node.classList.add('out'), 2600);
  setTimeout(() => node.remove(), 3100);
}

/* ---------- modal ---------- */

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const host = document.getElementById('modal');
  clear(host);
  const close = () => {
    host.hidden = true;
    clear(host);
    document.removeEventListener('keydown', onKey);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  const card = el('div', { class: `modal-card${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, [
    el('header', { class: 'modal-head' }, [
      el('h2', { text: title }),
      button('Close', { icon: '✕', variant: 'ghost', onclick: close, 'aria-label': 'Close dialog' }),
    ]),
    el('div', { class: 'modal-body' }, body),
    actions.length ? el('footer', { class: 'modal-foot' }, actions) : null,
  ]);

  host.appendChild(el('div', { class: 'modal-scrim', onclick: close }));
  host.appendChild(card);
  host.hidden = false;
  const focusable = card.querySelector('input, select, textarea, button');
  if (focusable) setTimeout(() => focusable.focus(), 30);
  return { close, card };
}

export function confirmDialog(message, onYes, { title = 'Are you sure?', yesLabel = 'Yes, do it' } = {}) {
  const dlg = modal({
    title,
    body: el('p', { class: 'muted', text: message }),
    actions: [
      button('Cancel', { onclick: () => dlg.close() }),
      button(yesLabel, { variant: 'danger', onclick: () => { dlg.close(); onYes(); } }),
    ],
  });
  return dlg;
}

export function tabs(items, initial = 0, onChange = null) {
  const host = el('div', { class: 'tabs' });
  const bar = el('div', { class: 'tabbar', role: 'tablist' });
  const body = el('div', { class: 'tabbody' });
  let active = Math.max(0, Math.min(items.length - 1, initial));

  function paint() {
    clear(bar);
    items.forEach((item, i) => {
      bar.appendChild(el('button', {
        class: `tab${i === active ? ' on' : ''}`,
        type: 'button',
        role: 'tab',
        'aria-selected': i === active ? 'true' : 'false',
        text: item.label,
        onclick: () => { active = i; if (onChange) onChange(i); paint(); },
      }));
    });
    clear(body);
    body.appendChild(items[active].render());
  }

  paint();
  host.appendChild(bar);
  host.appendChild(body);
  host.selectTab = (index) => {
    active = Math.max(0, Math.min(items.length - 1, index));
    if (onChange) onChange(active);
    paint();
  };
  return host;
}

export function list(items, renderItem, emptyMessage = 'Nothing here yet.') {
  if (!items.length) return empty(emptyMessage);
  return el('ul', { class: 'list' }, items.map((item, i) => el('li', { class: 'list-item' }, renderItem(item, i))));
}

export function memberDot(member) {
  return el('span', { class: 'member-dot', style: { background: member ? member.color : '#5b6a95' }, title: member ? member.name : 'Unassigned' });
}

export function memberOptions(members, { includeNone = true, noneLabel = 'Unassigned' } = {}) {
  const opts = members.map((m) => ({ value: m.id, label: m.name }));
  return includeNone ? [{ value: '', label: noneLabel }, ...opts] : opts;
}

export function fragment(children) {
  return frag(children);
}
