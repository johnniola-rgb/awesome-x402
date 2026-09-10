// Sky Watch — forecast, air quality, government alerts, and a what-to-wear
// call for each person in the household.

import { el, clear, isoDate, parseDate, fmtDay, fmtTime, cToF, round, debounce } from '../util.js';
import * as ui from '../ui.js';
import * as api from '../api.js';

const BANDS = [
  { max: -100, key: 'freezing', label: 'Freezing', base: 'Thermal base layer', mid: 'Fleece or heavy sweater', outer: 'Insulated parka', feet: 'Insulated boots + wool socks', extras: ['Hat', 'Gloves', 'Scarf'] },
  { max: 0, key: 'cold', label: 'Cold', base: 'Long sleeve', mid: 'Sweater', outer: 'Winter coat', feet: 'Boots', extras: ['Hat', 'Gloves'] },
  { max: 8, key: 'chilly', label: 'Chilly', base: 'Long sleeve', mid: 'Hoodie', outer: 'Warm jacket', feet: 'Sneakers + socks', extras: ['Light gloves'] },
  { max: 13, key: 'cool', label: 'Cool', base: 'Long sleeve', mid: 'Light sweater', outer: 'Jacket', feet: 'Sneakers', extras: [] },
  { max: 18, key: 'mild', label: 'Mild', base: 'T-shirt', mid: 'Light layer to peel off', outer: 'Windbreaker optional', feet: 'Sneakers', extras: [] },
  { max: 24, key: 'warm', label: 'Warm', base: 'T-shirt', mid: null, outer: null, feet: 'Sneakers or sandals', extras: [] },
  { max: 29, key: 'hot', label: 'Hot', base: 'Breathable tee or tank', mid: null, outer: null, feet: 'Sandals', extras: ['Water bottle'] },
  { max: 999, key: 'scorching', label: 'Scorching', base: 'Lightest breathable clothing', mid: null, outer: null, feet: 'Sandals', extras: ['Water bottle', 'Stay in shade midday'] },
];

function bandFor(tempC) {
  return BANDS.find((b) => tempC <= b.max) || BANDS[BANDS.length - 1];
}

/** The whole what-to-wear rule set lives here — tweak freely. */
export function outfitFor({ member, day, hourly }) {
  const pref = Number(member.tempPref || 0); // -2 runs hot … +2 runs cold
  const feels = (day.apparentMax + day.apparentMin) / 2 + pref * 1.5;
  const band = bandFor(feels);
  const notes = [];
  const extras = [...band.extras];

  if (day.precipProb >= 60) { extras.push('Rain jacket'); notes.push(`${day.precipProb}% chance of rain — send an umbrella.`); }
  else if (day.precipProb >= 30) { extras.push('Umbrella'); notes.push(`${day.precipProb}% chance of showers.`); }

  if ([71, 73, 75, 77, 85, 86].includes(day.code)) { extras.push('Snow boots', 'Waterproof gloves'); notes.push('Snow expected.'); }
  if ([95, 96, 99].includes(day.code)) notes.push('Thunderstorms — plan indoor recess.');
  if (day.wind >= 30) { extras.push('Windbreaker'); notes.push(`Windy at ${round(day.wind)} km/h.`); }
  if (day.uv >= 6) { extras.push('Sunscreen', 'Sunglasses'); notes.push(`UV index ${round(day.uv)} — sunscreen before school.`); }
  const swing = day.tempMax - day.tempMin;
  if (swing >= 11) notes.push(`${round(swing)}° swing today — layers that come off.`);
  if (hourly && hourly.length) {
    const evening = hourly.filter((h) => new Date(h.time).getHours() >= 17);
    if (evening.length && Math.min(...evening.map((h) => h.apparent)) < feels - 6) {
      notes.push('Evening drops off sharply — pack a jacket for after dinner.');
    }
  }

  return {
    band,
    feels,
    layers: [band.base, band.mid, band.outer].filter(Boolean),
    feet: band.feet,
    extras: [...new Set(extras)],
    notes,
  };
}

function temp(ctx, c) {
  if (c == null || Number.isNaN(c)) return '—';
  return ctx.state.city.units === 'imperial' ? `${Math.round(cToF(c))}°` : `${Math.round(c)}°`;
}

function normalize(raw) {
  const daily = raw.daily || {};
  const days = (daily.time || []).map((date, i) => ({
    date,
    code: daily.weather_code[i],
    tempMax: daily.temperature_2m_max[i],
    tempMin: daily.temperature_2m_min[i],
    apparentMax: daily.apparent_temperature_max[i],
    apparentMin: daily.apparent_temperature_min[i],
    precipProb: daily.precipitation_probability_max?.[i] ?? 0,
    precipSum: daily.precipitation_sum?.[i] ?? 0,
    wind: daily.wind_speed_10m_max?.[i] ?? 0,
    uv: daily.uv_index_max?.[i] ?? 0,
    sunrise: daily.sunrise?.[i],
    sunset: daily.sunset?.[i],
  }));
  const h = raw.hourly || {};
  const now = Date.now();
  const hourly = (h.time || []).map((time, i) => ({
    time,
    temp: h.temperature_2m[i],
    apparent: h.apparent_temperature[i],
    precipProb: h.precipitation_probability?.[i] ?? 0,
    code: h.weather_code[i],
    wind: h.wind_speed_10m?.[i] ?? 0,
    uv: h.uv_index?.[i] ?? 0,
  })).filter((x) => new Date(x.time).getTime() >= now - 3600000).slice(0, 24);

  return {
    current: raw.current ? {
      temp: raw.current.temperature_2m,
      apparent: raw.current.apparent_temperature,
      humidity: raw.current.relative_humidity_2m,
      code: raw.current.weather_code,
      wind: raw.current.wind_speed_10m,
      isDay: raw.current.is_day,
    } : null,
    days,
    hourly,
  };
}

async function refresh(ctx) {
  const loc = ctx.state.household.location;
  if (loc.lat == null || loc.lon == null) {
    // Not an error — a brand new city simply has nowhere to look at yet.
    return 'Waiting on a location — open Sky Watch and set one';
  }
  const [fc, aq, alerts] = await Promise.all([
    api.forecast(loc),
    api.airQuality(loc).catch(() => null),
    api.weatherAlerts(loc),
  ]);
  const snapshot = normalize(fc);
  snapshot.air = aq && aq.current ? {
    aqi: aq.current.us_aqi,
    pm25: aq.current.pm2_5,
    pollen: ['alder', 'birch', 'grass', 'mugwort', 'olive', 'ragweed']
      .map((k) => ({ k, v: aq.current[`${k}_pollen`] }))
      .filter((p) => p.v != null && p.v > 0),
  } : null;
  snapshot.alerts = alerts;
  snapshot.fetchedAt = new Date().toISOString();
  snapshot.place = loc.label;
  ctx.setData((d) => { d.snapshot = snapshot; });
  const today = snapshot.days[0];
  return `${api.describeCode(today.code).label}, high ${Math.round(cToF(today.tempMax))}°F`;
}

export default {
  id: 'weather',
  label: 'Weather & Wardrobe',
  icon: '🌤️',
  category: 'Daily',
  blurb: 'Forecast, air quality, government alerts, and a what-to-wear call per person.',
  defaultAgent: 'Nimbus',
  accent: '#46e0ff',
  height: 1.15,
  defaultProcess: { mode: 'daily', at: '06:00', action: 'refresh' },

  actions: {
    refresh: { label: 'Pull the forecast', description: 'Fetch weather, air quality and alerts.', run: refresh },
    outfitCall: {
      label: 'Post the outfit call',
      description: 'Write today’s what-to-wear line into the activity feed.',
      async run(ctx) {
        const snap = ctx.data.snapshot;
        if (!snap) await refresh(ctx);
        const s = ctx.data.snapshot;
        const day = s.days[0];
        const lines = ctx.state.household.members.map((m) => {
          const fit = outfitFor({ member: m, day, hourly: s.hourly });
          return `${m.name}: ${fit.layers.join(' + ')}${fit.extras.length ? ` (${fit.extras.join(', ')})` : ''}`;
        });
        return lines.join(' | ');
      },
    },
  },

  summary(ctx) {
    const snap = ctx.data.snapshot;
    if (!snap) return { metric: '—', line: 'No forecast yet' };
    const day = snap.days[0];
    return {
      metric: `${api.describeCode(day.code).icon} ${temp(ctx, day.tempMax)}`,
      line: `${api.describeCode(day.code).label} · low ${temp(ctx, day.tempMin)}`,
    };
  },

  brief(ctx) {
    const snap = ctx.data.snapshot;
    if (!snap) return [{ title: 'Forecast not pulled yet', detail: 'Run Sky Watch to fill this in.' }];
    const day = snap.days[0];
    const out = [{
      title: `${api.describeCode(day.code).icon} ${api.describeCode(day.code).label}, ${temp(ctx, day.tempMin)} → ${temp(ctx, day.tempMax)}`,
      detail: `${day.precipProb}% rain · wind ${round(day.wind)} km/h · UV ${round(day.uv)}`,
    }];
    for (const m of ctx.state.household.members) {
      const fit = outfitFor({ member: m, day, hourly: snap.hourly });
      out.push({ title: `${m.name} wears`, detail: `${fit.layers.join(' + ')}${fit.extras.length ? ` · ${fit.extras.join(', ')}` : ''}` });
    }
    for (const a of (snap.alerts || []).slice(0, 2)) out.push({ title: `⚠️ ${a.event}`, detail: a.headline || '' });
    return out;
  },

  render(ctx) {
    const host = el('div');
    let strip = null;
    const goToLocation = () => strip && strip.selectTab(3);
    const paint = () => {
      clear(host);
      strip = ui.tabs([
        { label: 'Today', render: () => todayView(ctx, paint, goToLocation) },
        { label: 'What to wear', render: () => wardrobeView(ctx) },
        { label: '7 days', render: () => weekView(ctx) },
        { label: 'Location', render: () => locationView(ctx, paint) },
      ]);
      host.appendChild(strip);
    };
    paint();
    return host;
  },
};

function needsLocation(ctx) {
  const loc = ctx.state.household.location;
  return loc.lat == null || loc.lon == null;
}

function todayView(ctx, paint, goToLocation) {
  const wrap = el('div');
  if (needsLocation(ctx)) {
    return ui.empty('Set your location to start pulling forecasts.', ui.button('Set location', { variant: 'primary', onclick: goToLocation }));
  }
  const snap = ctx.data.snapshot;
  if (!snap) {
    return ui.empty('No forecast pulled yet.', ui.button('Pull the forecast', {
      variant: 'primary',
      onclick: async () => { await ctx.run('refresh'); paint(); },
    }));
  }
  const day = snap.days[0];
  const cur = snap.current;
  const desc = api.describeCode(cur ? cur.code : day.code);

  wrap.appendChild(el('div', { class: 'weather-now' }, [
    el('div', { class: 'weather-icon', text: desc.icon }),
    el('div', {}, [
      el('div', { class: 'weather-temp', text: temp(ctx, cur ? cur.temp : day.tempMax) }),
      el('div', { class: 'weather-desc', text: `${desc.label} · feels ${temp(ctx, cur ? cur.apparent : day.apparentMax)}` }),
      el('div', { class: 'muted small', text: `${snap.place} · updated ${fmtTime(snap.fetchedAt)}` }),
    ]),
    el('div', { class: 'weather-stats' }, [
      ui.stat('High', temp(ctx, day.tempMax)),
      ui.stat('Low', temp(ctx, day.tempMin)),
      ui.stat('Rain', `${day.precipProb}%`),
      ui.stat('UV', String(round(day.uv))),
    ]),
  ]));

  for (const alert of snap.alerts || []) {
    wrap.appendChild(el('div', { class: 'alert-box' }, [
      el('strong', { text: `⚠️ ${alert.event}` }),
      el('p', { text: alert.headline || '' }),
      alert.instruction ? el('p', { class: 'small muted', text: alert.instruction.slice(0, 240) }) : null,
    ]));
  }

  if (snap.air) {
    const aqi = snap.air.aqi;
    const tone = aqi == null ? 'neutral' : aqi < 51 ? 'ok' : aqi < 101 ? 'warn' : 'danger';
    wrap.appendChild(ui.section('Air', [
      el('div', { class: 'row' }, [
        ui.chip(`AQI ${aqi != null ? Math.round(aqi) : 'n/a'}`, { tone }),
        ui.chip(`PM2.5 ${snap.air.pm25 != null ? round(snap.air.pm25, 1) : 'n/a'}`),
        ...snap.air.pollen.map((p) => ui.chip(`${p.k} pollen ${round(p.v)}`, { tone: 'warn' })),
      ]),
    ]));
  }

  wrap.appendChild(ui.section('Next 24 hours', [
    el('div', { class: 'hour-strip' }, snap.hourly.map((h) => el('div', { class: 'hour' }, [
      el('div', { class: 'hour-time', text: fmtTime(h.time) }),
      el('div', { class: 'hour-icon', text: api.describeCode(h.code).icon }),
      el('div', { class: 'hour-temp', text: temp(ctx, h.temp) }),
      el('div', { class: 'hour-rain', text: h.precipProb ? `${h.precipProb}%` : '' }),
    ]))),
  ], [ui.button('Refresh', { icon: '↻', onclick: async () => { await ctx.run('refresh'); paint(); } })]));

  return wrap;
}

function wardrobeView(ctx) {
  const host = el('div');
  const paint = () => { clear(host); host.appendChild(wardrobeBody(ctx, paint)); };
  paint();
  return host;
}

function wardrobeBody(ctx, repaint) {
  const snap = ctx.data.snapshot;
  if (!snap) return ui.empty('Pull a forecast first.');
  const wrap = el('div');
  const dayIndex = ctx.data.wardrobeDay || 0;
  const day = snap.days[dayIndex] || snap.days[0];

  wrap.appendChild(el('div', { class: 'segmented' }, snap.days.slice(0, 4).map((d, i) => el('button', {
    class: `seg${i === dayIndex ? ' on' : ''}`,
    type: 'button',
    text: i === 0 ? 'Today' : fmtDay(parseDate(d.date), { weekday: 'short' }),
    onclick: () => { ctx.setData((data) => { data.wardrobeDay = i; }); repaint(); },
  }))));

  for (const m of ctx.state.household.members) {
    const fit = outfitFor({ member: m, day, hourly: dayIndex === 0 ? snap.hourly : null });
    wrap.appendChild(el('div', { class: 'outfit-card', style: { '--accent': m.color } }, [
      el('header', { class: 'outfit-head' }, [
        ui.memberDot(m),
        el('strong', { text: m.name }),
        ui.chip(fit.band.label, { tone: 'info' }),
        el('span', { class: 'muted small', text: `feels ${temp(ctx, fit.feels)}` }),
      ]),
      el('div', { class: 'outfit-layers' }, fit.layers.map((l, i) => el('div', { class: 'layer' }, [
        el('span', { class: 'layer-n', text: String(i + 1) }),
        el('span', { text: l }),
      ]))),
      el('div', { class: 'row' }, [ui.chip(`👟 ${fit.feet}`), ...fit.extras.map((e) => ui.chip(e, { tone: 'warn' }))]),
      fit.notes.length ? el('ul', { class: 'note-list' }, fit.notes.map((n) => el('li', { text: n }))) : null,
    ]));
  }

  wrap.appendChild(ui.section('Runs hot / runs cold', ctx.state.household.members.map((m) => ui.field(
    m.name,
    ui.select([
      { value: '-2', label: 'Runs very warm' },
      { value: '-1', label: 'Runs warm' },
      { value: '0', label: 'Average' },
      { value: '1', label: 'Runs cold' },
      { value: '2', label: 'Runs very cold' },
    ], {
      value: String(m.tempPref || 0),
      onchange: (e) => {
        ctx.update((s) => {
          const target = s.household.members.find((x) => x.id === m.id);
          if (target) target.tempPref = Number(e.target.value);
        });
        repaint();
      },
    }),
  ))));

  return wrap;
}

function weekView(ctx) {
  const snap = ctx.data.snapshot;
  if (!snap) return ui.empty('Pull a forecast first.');
  return el('div', { class: 'week-list' }, snap.days.map((d, i) => el('div', { class: 'week-row' }, [
    el('div', { class: 'week-day', text: i === 0 ? 'Today' : fmtDay(parseDate(d.date)) }),
    el('div', { class: 'week-icon', text: api.describeCode(d.code).icon }),
    el('div', { class: 'week-desc', text: api.describeCode(d.code).label }),
    el('div', { class: 'week-rain', text: d.precipProb ? `💧${d.precipProb}%` : '' }),
    el('div', { class: 'week-temps' }, [
      el('strong', { text: temp(ctx, d.tempMax) }),
      el('span', { class: 'muted', text: temp(ctx, d.tempMin) }),
    ]),
  ])));
}

function locationView(ctx, paint) {
  const wrap = el('div');
  const loc = ctx.state.household.location;
  const results = el('div', { class: 'search-results' });
  const search = ui.input({ placeholder: 'City, ZIP, or town name…', value: '' });

  const doSearch = debounce(async () => {
    const q = search.value.trim();
    if (q.length < 2) { clear(results); return; }
    clear(results);
    results.appendChild(ui.spinner('Searching…'));
    try {
      const found = await api.geocode(q);
      clear(results);
      if (!found.length) { results.appendChild(ui.empty('No matches.')); return; }
      for (const r of found) {
        results.appendChild(ui.button(r.label, {
          onclick: async () => {
            ctx.update((s) => { s.household.location = { label: r.label, lat: r.lat, lon: r.lon, timezone: r.timezone || 'auto' }; });
            await ctx.run('refresh');
            paint();
          },
        }));
      }
    } catch (err) {
      clear(results);
      results.appendChild(ui.errorBox(`Lookup failed: ${err.message}`));
    }
  }, 400);

  search.addEventListener('input', doSearch);

  wrap.appendChild(ui.section('Current location', [
    el('p', { class: 'muted', text: loc.lat == null ? 'Not set.' : `${loc.label} (${round(loc.lat, 3)}, ${round(loc.lon, 3)})` }),
    ui.button('Use my device location', {
      icon: '📍',
      onclick: () => {
        if (!navigator.geolocation) { ui.toast('This browser has no geolocation.', 'warn'); return; }
        navigator.geolocation.getCurrentPosition(async (pos) => {
          ctx.update((s) => {
            s.household.location = {
              label: `${round(pos.coords.latitude, 2)}, ${round(pos.coords.longitude, 2)}`,
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              timezone: 'auto',
            };
          });
          await ctx.run('refresh');
          paint();
        }, () => ui.toast('Location permission denied.', 'warn'));
      },
    }),
  ]));

  wrap.appendChild(ui.section('Search for a place', [ui.field('Place', search), results]));

  wrap.appendChild(ui.section('Units', [
    ui.select([{ value: 'imperial', label: 'Fahrenheit' }, { value: 'metric', label: 'Celsius' }], {
      value: ctx.state.city.units,
      onchange: (e) => { ctx.update((s) => { s.city.units = e.target.value; }); paint(); },
    }),
  ]));

  return wrap;
}
