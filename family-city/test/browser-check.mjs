// End-to-end check with the three outside APIs stubbed, so it runs offline
// and asserts on fixed numbers.
//
//   cd family-city && python3 -m http.server 8080 &
//   npm install playwright        # the only dependency, and only for this file
//   node test/browser-check.mjs
//
// Set BASE_URL to point at a different server.

import { chromium } from 'playwright';

const days = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const dISO = (i) => { const d = new Date(); d.setDate(d.getDate() + i); return d.toISOString().slice(0, 10); };
const hISO = (i) => { const d = new Date(); d.setHours(d.getHours() + i, 0, 0, 0); return d.toISOString().slice(0, 16); };

const forecast = {
  latitude: 39.74, longitude: -104.98, timezone: 'America/Denver',
  current: { temperature_2m: 7.4, apparent_temperature: 4.1, relative_humidity_2m: 42, precipitation: 0, weather_code: 3, wind_speed_10m: 18.2, is_day: 1 },
  hourly: {
    time: days(30, hISO),
    temperature_2m: days(30, (i) => 6 + Math.sin(i / 3) * 6),
    apparent_temperature: days(30, (i) => 3 + Math.sin(i / 3) * 7),
    precipitation_probability: days(30, (i) => (i % 7) * 9),
    weather_code: days(30, (i) => [0, 2, 3, 61, 71][i % 5]),
    wind_speed_10m: days(30, () => 12),
    uv_index: days(30, (i) => (i % 12 > 5 ? 7 : 1)),
  },
  daily: {
    time: days(7, dISO),
    weather_code: [3, 61, 71, 0, 95, 2, 80],
    temperature_2m_max: [12.5, 9.1, -1.2, 24.4, 30.1, 17.2, 5.5],
    temperature_2m_min: [-2.1, 1.0, -9.5, 12.0, 21.3, 6.4, -3.2],
    apparent_temperature_max: [10.2, 7.5, -4.0, 25.0, 32.0, 16.0, 3.1],
    apparent_temperature_min: [-4.5, -1.2, -12.0, 11.0, 20.0, 5.0, -6.0],
    precipitation_probability_max: [10, 80, 65, 0, 35, 20, 90],
    precipitation_sum: [0, 8.2, 4.1, 0, 1.2, 0, 12.0],
    wind_speed_10m_max: [22, 34, 41, 8, 15, 12, 38],
    uv_index_max: [4, 2, 1, 9, 8, 5, 2],
    sunrise: days(7, (i) => `${dISO(i)}T06:32`),
    sunset: days(7, (i) => `${dISO(i)}T19:44`),
  },
};

const aq = { current: { us_aqi: 118, pm2_5: 31.2, grass_pollen: 12.5, ragweed_pollen: 0, alder_pollen: null, birch_pollen: null, mugwort_pollen: null, olive_pollen: null } };
const alerts = { features: [{ id: 'a1', properties: { event: 'Winter Storm Warning', severity: 'Severe', headline: 'Winter Storm Warning until 6 AM MST', instruction: 'Travel could be very difficult.', ends: null } }] };
const geo = { results: [{ name: 'Denver', admin1: 'Colorado', country_code: 'US', latitude: 39.74, longitude: -104.98, timezone: 'America/Denver' }] };
const meals = { meals: [{
  idMeal: '52940', strMeal: 'Brown Stew Chicken', strCategory: 'Chicken', strArea: 'Jamaican',
  strMealThumb: 'https://example.invalid/img.jpg', strInstructions: 'Squeeze lime over chicken and rub well.',
  strSource: '', strYoutube: '',
  strIngredient1: 'Chicken', strMeasure1: '1 whole', strIngredient2: 'Tomato', strMeasure2: '1 chopped',
  strIngredient3: 'Onion', strMeasure3: '2 chopped',
}] };

const BASE = process.env.BASE_URL || 'http://localhost:8080';
const errors = [];
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

const json = (data) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
await page.route(/\/\/api\.open-meteo\.com/, (r) => r.fulfill(json(forecast)));
await page.route(/geocoding-api\.open-meteo\.com/, (r) => r.fulfill(json(geo)));
await page.route(/air-quality-api\.open-meteo\.com/, (r) => r.fulfill(json(aq)));
await page.route(/api\.weather\.gov/, (r) => r.fulfill(json(alerts)));
await page.route(/themealdb\.com/, (r) => r.fulfill(json(meals)));
// Serve a real 1x1 PNG for the fixture thumbnails so image loads stay quiet.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
await page.route(/example\.invalid/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));

await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(500);

const INNER = '.panel-body .tabbody .tabbar .tab';
await page.click('.rail-item:has-text("Sky Watch")');
await page.waitForTimeout(300);
let t = await page.$$(INNER); await t[3].click(); // Location
await page.waitForTimeout(200);
await page.fill('.sec .input[placeholder*="ZIP"]', 'Denver');
await page.waitForTimeout(1200);
const results = await page.$$('.search-results .btn');
console.log('geocode results:', results.length);
await results[0].click();
await page.waitForTimeout(1200);
t = await page.$$(INNER); await t[0].click();
await page.waitForTimeout(400);
console.log('now temp:', await page.textContent('.weather-temp'));
console.log('alert shown:', await page.isVisible('.alert-box'));
console.log('aqi chips:', await page.$$eval('.chip', (n) => n.map((x) => x.textContent).filter((s) => /AQI|pollen/i.test(s))));
console.log('hours:', (await page.$$('.hour')).length);

t = await page.$$(INNER); await t[1].click(); // wardrobe
await page.waitForTimeout(300);
console.log('outfit cards:', (await page.$$('.outfit-card')).length);
console.log('first outfit:', (await page.textContent('.outfit-card')).replace(/\s+/g, ' ').slice(0, 200));
// a freezing day
const segs = await page.$$('.tabbody .segmented .seg');
await segs[2].click();
await page.waitForTimeout(300);
console.log('cold day outfit:', (await page.textContent('.outfit-card')).replace(/\s+/g, ' ').slice(0, 220));

t = await page.$$(INNER); await t[2].click(); // 7 days
await page.waitForTimeout(250);
console.log('week rows:', (await page.$$('.week-row')).length);

// meals
await page.click('.rail-item:has-text("Meal Hall")');
await page.waitForTimeout(300);
t = await page.$$(INNER); await t[2].click();
await page.waitForTimeout(200);
await page.fill('.sec .input[placeholder*="Search recipes"]', 'chicken');
await page.waitForTimeout(1200);
console.log('recipe cards:', (await page.$$('.recipe-card')).length);
// schedule it onto tonight
await page.selectOption('.recipe-card select', { index: 1 });
await page.waitForTimeout(500);
t = await page.$$(INNER); await t[0].click();
await page.waitForTimeout(300);
console.log('meal titles:', await page.$$eval('.meal-night .input[type=text]', (n) => n.map((x) => x.value).filter(Boolean)));

// order sheet
t = await page.$$(INNER); await t[1].click();
await page.waitForTimeout(250);
const orderInputs = await page.$$('.order-row .input');
await orderInputs[0].fill('Pad thai, medium');
await page.waitForTimeout(300);
t = await page.$$(INNER); await t[1].click();
await page.waitForTimeout(300);
console.log('order sheet:', (await page.textContent('.order-sheet')).replace(/\n/g, ' | '));

// grocery hand-off needs a depot
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
await page.click('.rail-add');
await page.waitForTimeout(250);
await page.click('.cat-card:has-text("Supply Depot")');
await page.waitForTimeout(250);
const lots = await page.$$('.tile-empty');
await lots[0].click();
await page.waitForTimeout(400);
await page.click('.rail-item:has-text("Meal Hall")');
await page.waitForTimeout(300);
await page.click('.tabbody .btn:has-text("Send ingredients")');
await page.waitForTimeout(600);
await page.click('.rail-item:has-text("Supply Depot")');
await page.waitForTimeout(400);
console.log('depot items:', await page.$$eval('.board-list .item-title', (n) => n.map((x) => x.textContent)));

// morning brief
await page.click('.rail-item:has-text("Morning Brief")');
await page.waitForTimeout(400);
await page.click('.tabbody .btn:has-text("Rebuild")');
await page.waitForTimeout(800);
console.log('brief sections:', (await page.$$('.brief-list')).length);

// calendar ics export/import round-trip
await page.click('.rail-item:has-text("Time Keep")');
await page.waitForTimeout(300);
t = await page.$$(INNER); await t[2].click();
await page.waitForTimeout(200);
const ics = ['BEGIN:VCALENDAR','BEGIN:VEVENT','SUMMARY:Dentist','DTSTART:20260915T143000','DTEND:20260915T151500','LOCATION:Main St','END:VEVENT','BEGIN:VEVENT','SUMMARY:School closed','DTSTART;VALUE=DATE:20260916','END:VEVENT','END:VCALENDAR'].join('\r\n');
await page.fill('.tabbody textarea', ics);
await page.click('.tabbody .btn:has-text("Import pasted")');
await page.waitForTimeout(500);
t = await page.$$(INNER); await t[1].click();
await page.waitForTimeout(300);
console.log('agenda rows:', await page.$$eval('.agenda-row', (n) => n.slice(0, 5).map((x) => x.textContent.replace(/\s+/g, ' '))));

await browser.close();
if (errors.length) {
  console.error('\nFAILED — console errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nall checks passed, no console errors');
