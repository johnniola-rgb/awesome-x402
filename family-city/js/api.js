// Every source here is free and needs no API key, so the city works
// out of the box. Each call fails soft: modules render with whatever
// they have and show the error instead of blowing up.

const timeoutMs = 12000;

async function getJSON(url, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: opts.headers || {} });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- geocoding (Open-Meteo, no key) ---------- */

export async function geocode(query) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=en&format=json`;
  const data = await getJSON(url);
  return (data.results || []).map((r) => ({
    label: [r.name, r.admin1, r.country_code].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
    timezone: r.timezone,
  }));
}

/* ---------- weather (Open-Meteo, no key) ---------- */

export async function forecast({ lat, lon, timezone = 'auto' }) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    timezone,
    current: [
      'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
      'precipitation', 'weather_code', 'wind_speed_10m', 'is_day',
    ].join(','),
    hourly: [
      'temperature_2m', 'apparent_temperature', 'precipitation_probability',
      'weather_code', 'wind_speed_10m', 'uv_index',
    ].join(','),
    daily: [
      'weather_code', 'temperature_2m_max', 'temperature_2m_min',
      'apparent_temperature_max', 'apparent_temperature_min',
      'precipitation_probability_max', 'precipitation_sum',
      'wind_speed_10m_max', 'uv_index_max', 'sunrise', 'sunset',
    ].join(','),
    forecast_days: '7',
  });
  return getJSON(`https://api.open-meteo.com/v1/forecast?${params}`);
}

export async function airQuality({ lat, lon, timezone = 'auto' }) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    timezone,
    current: 'us_aqi,pm2_5,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen',
    forecast_days: '1',
  });
  return getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?${params}`);
}

/** US National Weather Service active alerts. Returns [] outside the US. */
export async function weatherAlerts({ lat, lon }) {
  try {
    const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`;
    const data = await getJSON(url, { headers: { Accept: 'application/geo+json' } });
    return (data.features || []).map((f) => ({
      id: f.id,
      event: f.properties.event,
      severity: f.properties.severity,
      headline: f.properties.headline,
      instruction: f.properties.instruction,
      ends: f.properties.ends || f.properties.expires,
    }));
  } catch {
    return [];
  }
}

/* ---------- recipes (TheMealDB v1 test key, no signup) ---------- */

const MEALDB = 'https://www.themealdb.com/api/json/v1/1';

export async function searchMeals(query) {
  const data = await getJSON(`${MEALDB}/search.php?s=${encodeURIComponent(query)}`);
  return (data.meals || []).map(normalizeMeal);
}

export async function randomMeal() {
  const data = await getJSON(`${MEALDB}/random.php`);
  return (data.meals || []).map(normalizeMeal)[0] || null;
}

export async function mealsByCategory(category) {
  const data = await getJSON(`${MEALDB}/filter.php?c=${encodeURIComponent(category)}`);
  return (data.meals || []).map((m) => ({ id: m.idMeal, name: m.strMeal, thumb: m.strMealThumb }));
}

export async function lookupMeal(id) {
  const data = await getJSON(`${MEALDB}/lookup.php?i=${encodeURIComponent(id)}`);
  return (data.meals || []).map(normalizeMeal)[0] || null;
}

function normalizeMeal(m) {
  const ingredients = [];
  for (let i = 1; i <= 20; i += 1) {
    const name = (m[`strIngredient${i}`] || '').trim();
    const measure = (m[`strMeasure${i}`] || '').trim();
    if (name) ingredients.push({ name, measure });
  }
  return {
    id: m.idMeal,
    name: m.strMeal,
    category: m.strCategory,
    area: m.strArea,
    thumb: m.strMealThumb,
    instructions: m.strInstructions,
    source: m.strSource || m.strYoutube || '',
    ingredients,
  };
}

/* ---------- WMO weather codes ---------- */

export const WMO = {
  0: { label: 'Clear', icon: '☀️' },
  1: { label: 'Mostly clear', icon: '🌤️' },
  2: { label: 'Partly cloudy', icon: '⛅' },
  3: { label: 'Overcast', icon: '☁️' },
  45: { label: 'Fog', icon: '🌫️' },
  48: { label: 'Rime fog', icon: '🌫️' },
  51: { label: 'Light drizzle', icon: '🌦️' },
  53: { label: 'Drizzle', icon: '🌦️' },
  55: { label: 'Heavy drizzle', icon: '🌧️' },
  56: { label: 'Freezing drizzle', icon: '🌧️' },
  57: { label: 'Freezing drizzle', icon: '🌧️' },
  61: { label: 'Light rain', icon: '🌦️' },
  63: { label: 'Rain', icon: '🌧️' },
  65: { label: 'Heavy rain', icon: '🌧️' },
  66: { label: 'Freezing rain', icon: '🧊' },
  67: { label: 'Freezing rain', icon: '🧊' },
  71: { label: 'Light snow', icon: '🌨️' },
  73: { label: 'Snow', icon: '❄️' },
  75: { label: 'Heavy snow', icon: '❄️' },
  77: { label: 'Snow grains', icon: '🌨️' },
  80: { label: 'Rain showers', icon: '🌦️' },
  81: { label: 'Rain showers', icon: '🌧️' },
  82: { label: 'Violent showers', icon: '⛈️' },
  85: { label: 'Snow showers', icon: '🌨️' },
  86: { label: 'Snow showers', icon: '❄️' },
  95: { label: 'Thunderstorm', icon: '⛈️' },
  96: { label: 'Storm with hail', icon: '⛈️' },
  99: { label: 'Storm with hail', icon: '⛈️' },
};

export function describeCode(code) {
  return WMO[code] || { label: 'Unknown', icon: '❓' };
}
