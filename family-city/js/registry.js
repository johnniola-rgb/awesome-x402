// The building catalog. Everything the city can build is registered here.
//
// ADDING A NEW BUILDING
// --------------------
// 1. Board-style (a list of items with owners, dates, repeats, points):
//      add one makeListModule({...}) entry below. That is the whole job.
// 2. Custom UI (its own screens, its own API calls):
//      write js/modules/<name>.js exporting { id, label, icon, category, blurb,
//      defaultAgent, accent, height, actions, defaultProcess, summary(ctx),
//      brief(ctx), render(ctx) } and import it here.
//
// The context (ctx) each module receives is documented in js/context.js.

import weather from './modules/weather.js';
import meals from './modules/meals.js';
import calendar from './modules/calendar.js';
import brief from './modules/brief.js';
import hall from './modules/hall.js';
import { makeListModule } from './modules/list-kit.js';

const chores = makeListModule({
  id: 'chores',
  label: 'Chore Board',
  icon: '🧹',
  category: 'Household',
  blurb: 'Assign jobs, repeat them, and keep a running point score per person.',
  defaultAgent: 'Bristle',
  accent: '#7aa2ff',
  itemNoun: 'chore',
  fields: { points: true },
  defaultProcess: { mode: 'daily', at: '06:45', action: 'roll' },
  seeds: [
    { title: 'Dishes after dinner', repeat: 'daily', points: 5 },
    { title: 'Take the trash out', repeat: 'weekly', points: 10 },
    { title: 'Tidy bedrooms', repeat: 'weekly', points: 10 },
  ],
});

const grocery = makeListModule({
  id: 'grocery',
  label: 'Supply Depot',
  icon: '🧺',
  category: 'Household',
  blurb: 'The running shopping list. Meal Hall pushes recipe ingredients straight in.',
  defaultAgent: 'Rowan',
  accent: '#5eead4',
  itemNoun: 'item',
  fields: { qty: true, repeat: false, due: false },
  categories: ['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Household', 'Other'],
  defaultProcess: { mode: 'weekly', at: '09:00', action: 'digest' },
  seeds: [{ title: 'Milk', category: 'Dairy' }, { title: 'Eggs', category: 'Dairy' }],
});

const school = makeListModule({
  id: 'school',
  label: 'School Hall',
  icon: '🎒',
  category: 'Kids',
  blurb: 'Homework, permission slips, spirit days, and what has to be in the backpack.',
  defaultAgent: 'Quill',
  accent: '#ffd166',
  itemNoun: 'task',
  fields: { time: true },
  categories: ['Homework', 'Form to sign', 'Event', 'Supplies', 'Reading'],
  defaultProcess: { mode: 'daily', at: '06:50', action: 'digest' },
  seeds: [{ title: 'Reading log', repeat: 'weekdays', category: 'Reading' }],
});

const meds = makeListModule({
  id: 'meds',
  label: 'Medicine Cabinet',
  icon: '💊',
  category: 'Health',
  blurb: 'Doses, vitamins, refills — who takes what and when.',
  defaultAgent: 'Wren',
  accent: '#ff7a9c',
  itemNoun: 'dose',
  fields: { time: true, points: false },
  categories: ['Morning', 'Midday', 'Evening', 'As needed', 'Refill'],
  defaultProcess: { mode: 'daily', at: '07:30', action: 'digest' },
  seeds: [{ title: 'Vitamin D', repeat: 'daily', category: 'Morning', time: '08:00' }],
});

const bank = makeListModule({
  id: 'bank',
  label: 'Allowance Bank',
  icon: '🏦',
  category: 'Money',
  blurb: 'Allowance in, spending out, a running balance for each kid.',
  defaultAgent: 'Sterling',
  accent: '#4ade80',
  itemNoun: 'entry',
  mode: 'ledger',
  fields: { amount: true, repeat: false, points: false, detail: false },
  defaultProcess: { mode: 'weekly', at: '09:00', action: 'digest' },
});

const packing = makeListModule({
  id: 'packing',
  label: 'Trip Lodge',
  icon: '🧳',
  category: 'Travel',
  blurb: 'Packing lists per trip, per person — reusable every time you go.',
  defaultAgent: 'Juniper',
  accent: '#a78bfa',
  itemNoun: 'item',
  fields: { qty: true, repeat: false },
  categories: ['Clothes', 'Toiletries', 'Tech', 'Documents', 'Kids', 'Car'],
  defaultProcess: { mode: 'manual', action: 'digest' },
  seeds: [
    { title: 'Chargers', category: 'Tech' },
    { title: 'Toothbrushes', category: 'Toiletries' },
    { title: 'Snacks for the car', category: 'Car' },
  ],
});

const pets = makeListModule({
  id: 'pets',
  label: 'Pet Post',
  icon: '🐾',
  category: 'Household',
  blurb: 'Feeding, walks, litter, vet visits, and whose turn it is.',
  defaultAgent: 'Scout',
  accent: '#fb923c',
  itemNoun: 'task',
  fields: { time: true, points: true },
  defaultProcess: { mode: 'daily', at: '06:30', action: 'roll' },
  seeds: [
    { title: 'Morning feed', repeat: 'daily', time: '07:00', points: 3 },
    { title: 'Evening walk', repeat: 'daily', time: '18:30', points: 5 },
  ],
});

const maintenance = makeListModule({
  id: 'maintenance',
  label: 'Maintenance Yard',
  icon: '🔧',
  category: 'Household',
  blurb: 'Filters, smoke alarms, gutters, oil changes — the slow-burning list.',
  defaultAgent: 'Flint',
  accent: '#94a3b8',
  itemNoun: 'job',
  fields: { points: false },
  categories: ['Home', 'Car', 'Yard', 'Seasonal', 'Appliance'],
  defaultProcess: { mode: 'weekly', at: '08:00', action: 'roll' },
  seeds: [
    { title: 'Change HVAC filter', repeat: 'quarterly', category: 'Home' },
    { title: 'Test smoke alarms', repeat: 'monthly', category: 'Home' },
  ],
});

const notes = makeListModule({
  id: 'notes',
  label: 'Message Board',
  icon: '📌',
  category: 'Core',
  blurb: 'The fridge door — notes, reminders, and anything without a home yet.',
  defaultAgent: 'Echo',
  accent: '#fbbf24',
  itemNoun: 'note',
  fields: { repeat: false, points: false },
  defaultProcess: { mode: 'manual', action: 'digest' },
});

const habits = makeListModule({
  id: 'habits',
  label: 'Habit Track',
  icon: '🎯',
  category: 'Health',
  blurb: 'Daily streaks — reading, water, steps, practice, screens off.',
  defaultAgent: 'Kestrel',
  accent: '#22d3ee',
  itemNoun: 'habit',
  fields: { points: true },
  defaultProcess: { mode: 'daily', at: '05:30', action: 'roll' },
  seeds: [
    { title: '20 minutes reading', repeat: 'daily', points: 5 },
    { title: 'Instrument practice', repeat: 'weekdays', points: 5 },
  ],
});

const contacts = makeListModule({
  id: 'contacts',
  label: 'Emergency Post',
  icon: '🚨',
  category: 'Core',
  blurb: 'Sitter instructions, doctor numbers, allergies, the neighbor with the spare key.',
  defaultAgent: 'Cobalt',
  accent: '#f87171',
  itemNoun: 'contact',
  fields: { due: false, repeat: false, points: false },
  categories: ['Medical', 'School', 'Neighbor', 'Family', 'Utility', 'Insurance'],
  defaultProcess: { mode: 'manual', action: 'digest' },
  seeds: [{ title: 'Pediatrician', detail: 'Phone + after-hours line', category: 'Medical' }],
});

const garden = makeListModule({
  id: 'garden',
  label: 'Garden Plot',
  icon: '🌱',
  category: 'Household',
  blurb: 'Watering, feeding, planting windows, and what is in the ground.',
  defaultAgent: 'Fern',
  accent: '#84cc16',
  itemNoun: 'task',
  fields: { points: false },
  defaultProcess: { mode: 'daily', at: '07:15', action: 'roll' },
  seeds: [{ title: 'Water the beds', repeat: 'daily' }],
});

const watchlist = makeListModule({
  id: 'watchlist',
  label: 'Watch & Read',
  icon: '🎬',
  category: 'Fun',
  blurb: 'Family movie night queue, library holds, books each kid is working through.',
  defaultAgent: 'Reel',
  accent: '#c084fc',
  itemNoun: 'pick',
  fields: { due: false, repeat: false, points: false },
  categories: ['Movie', 'Show', 'Book', 'Game', 'Outing'],
  defaultProcess: { mode: 'manual', action: 'digest' },
});

const wishlist = makeListModule({
  id: 'wishlist',
  label: 'Wish List',
  icon: '🎁',
  category: 'Money',
  blurb: 'Birthdays, holidays, and the thing a kid has been saving toward.',
  defaultAgent: 'Tinsel',
  accent: '#f472b6',
  itemNoun: 'wish',
  fields: { amount: true, repeat: false, points: false },
  categories: ['Birthday', 'Holiday', 'Saving for', 'Someday'],
  defaultProcess: { mode: 'manual', action: 'digest' },
});

const blank = makeListModule({
  id: 'custom',
  label: 'Blank Lot',
  icon: '🧱',
  category: 'Core',
  blurb: 'An empty building you can name and point at anything. Start here, split it later.',
  defaultAgent: 'Ash',
  accent: '#64748b',
  itemNoun: 'item',
  fields: { points: true, qty: true, time: true },
  defaultProcess: { mode: 'manual', action: 'digest' },
});

export const MODULES = Object.fromEntries([
  hall, weather, meals, calendar, brief,
  chores, grocery, school, meds, bank, packing, pets,
  maintenance, habits, garden, watchlist, wishlist, contacts, notes, blank,
].map((m) => [m.id, m]));

export const CATEGORY_ORDER = ['Core', 'Daily', 'Household', 'Kids', 'Health', 'Money', 'Travel', 'Fun'];

export function getModule(type) {
  return MODULES[type] || MODULES.custom;
}

export function listModules() {
  return Object.values(MODULES).sort((a, b) => {
    const ca = CATEGORY_ORDER.indexOf(a.category);
    const cb = CATEGORY_ORDER.indexOf(b.category);
    return ca === cb ? a.label.localeCompare(b.label) : ca - cb;
  });
}

export function actionList(type) {
  const mod = getModule(type);
  return Object.entries(mod.actions || {}).map(([id, a]) => ({ id, ...a }));
}

export function defaultAction(type) {
  const mod = getModule(type);
  return mod.defaultProcess?.action || Object.keys(mod.actions || {})[0] || null;
}
