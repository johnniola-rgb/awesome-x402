(() => {
  "use strict";

  const STATE_NAMES = {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
    DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
    IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
    NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
    NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
    RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
    VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  };
  const LOAN_TYPES = ["FHA", "VA", "USDA", "Conventional", "Unknown"];
  const PAGE = 60;
  const FILTER_IDS = ["q", "state", "maxRate", "minYears", "minPrice", "maxPrice", "maxGap", "maxPay", "minBeds",
    "minBaths", "ptype", "listedWithin", "favOnly", "marketRate", "cash", "gapFinance", "secondRate", "sort"];

  const $ = (id) => document.getElementById(id);
  const el = Object.fromEntries(FILTER_IDS.map((id) => [id, $(id)]));
  const defaults = Object.fromEntries(FILTER_IDS.map((id) => [id, value(el[id])]));

  let listings = [];
  let loanFilter = new Set();
  let view = "cards";
  let shown = PAGE;
  let favorites = new Set(store("favorites", []));

  // ---------- helpers ----------
  function store(key, fallback, set) {
    try {
      if (set !== undefined) return localStorage.setItem("amf:" + key, JSON.stringify(set));
      const raw = localStorage.getItem("amf:" + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  }
  function value(input) { return input.type === "checkbox" ? input.checked : input.value; }
  function num(id) { const v = parseFloat(el[id].value); return Number.isFinite(v) ? v : null; }
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (v) => v == null || !Number.isFinite(v) ? "–" : "$" + Math.round(v).toLocaleString("en-US");
  const moneyK = (v) => v == null ? "–" : Math.abs(v) >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : Math.abs(v) >= 1e3 ? "$" + Math.round(v / 1e3) + "k" : money(v);
  const pct = (v) => v == null ? "–" : (+v).toFixed(3).replace(/0+$/, "").replace(/\.$/, "") + "%";
  function median(arr) {
    const a = arr.filter((x) => x != null && Number.isFinite(x)).sort((x, y) => x - y);
    if (!a.length) return null;
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function pmt(principal, ratePct, years) {
    if (!principal || principal <= 0) return 0;
    const n = Math.max(1, Math.round(years * 12));
    const r = ratePct / 1200;
    return r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
  }
  function daysAgo(iso) { return iso ? (Date.now() - new Date(iso + "T00:00:00").getTime()) / 864e5 : Infinity; }

  // ---------- financial model ----------
  // Compares assuming the loan vs. a new 30-yr loan at today's rate, with the buyer putting the same cash down.
  function analyze(l) {
    const market = num("marketRate") ?? 6.5;
    const secondRate = num("secondRate") ?? 9;
    const cash = num("cash");
    const gap = l.equity_gap ?? (l.price != null && l.loan_balance != null ? Math.max(0, l.price - l.loan_balance) : null);
    const assumedPI = l.monthly_pi ?? (l.loan_balance && l.interest_rate != null && l.remaining_term_years
      ? pmt(l.loan_balance, l.interest_rate, l.remaining_term_years) : null);
    const hoa = l.hoa_monthly || 0;
    if (gap == null || assumedPI == null || !l.price) {
      return { gap, assumedPI, hoa, cashDown: null, secondLoan: 0, secondPI: 0, assumeTotal: assumedPI != null ? assumedPI + hoa : null, newPI: null, savings: null };
    }
    const cashDown = cash == null ? gap : Math.min(cash, gap);
    const secondLoan = Math.max(0, gap - cashDown);
    const secondPI = pmt(secondLoan, secondRate, 20);
    const newPI = pmt(l.price - cashDown, market, 30);
    const assumeTotal = assumedPI + secondPI + hoa;
    return { gap, assumedPI, hoa, cashDown, secondLoan, secondPI, assumeTotal, newPI, savings: newPI + hoa - assumeTotal };
  }

  // ---------- filtering ----------
  function filtered() {
    const q = el.q.value.trim().toLowerCase();
    const terms = q ? q.split(/\s+/) : [];
    const state = el.state.value;
    const maxRate = num("maxRate");
    const minYears = num("minYears");
    const minPrice = num("minPrice"), maxPrice = num("maxPrice");
    const maxGap = num("maxGap"), maxPay = num("maxPay");
    const minBeds = num("minBeds"), minBaths = num("minBaths");
    const ptype = el.ptype.value;
    const within = num("listedWithin");
    const favOnly = el.favOnly.checked;
    const cash = num("cash");
    const strictCash = cash != null && !el.gapFinance.checked;

    const out = [];
    for (const l of listings) {
      if (state && l.state !== state) continue;
      if (loanFilter.size && !loanFilter.has(l.loan_type)) continue;
      if (maxRate != null && maxRate < 8 && (l.interest_rate == null || l.interest_rate > maxRate)) continue;
      if (minYears != null && (l.remaining_term_years ?? 0) < minYears) continue;
      if (minPrice != null && (l.price ?? 0) < minPrice) continue;
      if (maxPrice != null && (l.price ?? Infinity) > maxPrice) continue;
      if (minBeds != null && (l.beds ?? 0) < minBeds) continue;
      if (minBaths != null && (l.baths ?? 0) < minBaths) continue;
      if (ptype && l.property_type !== ptype) continue;
      if (within != null && daysAgo(l.listed_date) > within) continue;
      if (favOnly && !favorites.has(l.id)) continue;
      if (terms.length && !terms.every((t) => l._text.includes(t))) continue;
      const a = analyze(l);
      if (maxGap != null && (a.gap == null || a.gap > maxGap)) continue;
      if (strictCash && (a.gap == null || a.gap > cash)) continue;
      if (maxPay != null && (a.assumeTotal == null || a.assumeTotal > maxPay)) continue;
      out.push({ l, a });
    }
    const by = {
      savings: (x, y) => (y.a.savings ?? -Infinity) - (x.a.savings ?? -Infinity),
      rate: (x, y) => (x.l.interest_rate ?? 99) - (y.l.interest_rate ?? 99),
      gap: (x, y) => (x.a.gap ?? Infinity) - (y.a.gap ?? Infinity),
      payment: (x, y) => (x.a.assumeTotal ?? Infinity) - (y.a.assumeTotal ?? Infinity),
      priceAsc: (x, y) => (x.l.price ?? Infinity) - (y.l.price ?? Infinity),
      priceDesc: (x, y) => (y.l.price ?? 0) - (x.l.price ?? 0),
      newest: (x, y) => (y.l.listed_date || "").localeCompare(x.l.listed_date || ""),
    }[el.sort.value];
    return out.sort(by);
  }

  // ---------- rendering ----------
  function favButton(id) {
    const on = favorites.has(id);
    return `<button class="fav" data-fav="${esc(id)}" aria-pressed="${on}" aria-label="${on ? "Remove from" : "Add to"} saved homes" title="Save">${on ? "♥" : "♡"}</button>`;
  }
  function place(l) { return [l.city, [l.state, l.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "); }
  function savingsHtml(s) {
    if (s == null) return "–";
    return `<span class="${s >= 0 ? "save" : "neg"}">${s >= 0 ? "" : "−"}${money(Math.abs(s))}</span>`;
  }

  function cardHtml({ l, a }) {
    const facts = [l.beds && `${l.beds} bd`, l.baths && `${l.baths} ba`, l.sqft && `${l.sqft.toLocaleString()} sqft`, l.property_type].filter(Boolean).join(" · ");
    return `<article class="card" data-id="${esc(l.id)}" tabindex="0">
      <div class="card-head">
        <div><div class="price">${money(l.price)}</div><div class="addr">${esc(l.address)}<br>${esc(place(l))}</div></div>
        ${favButton(l.id)}
      </div>
      <div class="badges"><span class="badge ${esc(l.loan_type)}">${esc(l.loan_type)}</span>
        <span class="rate">${pct(l.interest_rate)} assumable</span>
        ${l.remaining_term_years ? `<span class="muted small">· ${Math.round(l.remaining_term_years)} yrs left</span>` : ""}</div>
      <div class="facts muted">${esc(facts)}</div>
      <div class="stats">
        <div class="stat"><span>Cash to assume</span><b>${moneyK(a.gap)}</b></div>
        <div class="stat"><span>Monthly</span><b>${money(a.assumeTotal)}</b></div>
        <div class="stat"><span>Saves / mo</span><b>${savingsHtml(a.savings)}</b></div>
      </div>
    </article>`;
  }

  function tableHtml(rows) {
    const head = ["", "Address", "State", "Price", "Loan", "Rate", "Balance", "Cash to assume", "Monthly", "Saves / mo", "Beds", "Baths", "Sqft", "Listed"];
    const numeric = new Set([3, 5, 6, 7, 8, 9, 10, 11, 12]);
    return `<div class="table-wrap"><table><thead><tr>${head.map((h, i) => `<th class="${numeric.has(i) ? "num" : ""}">${h}</th>`).join("")}</tr></thead><tbody>
      ${rows.map(({ l, a }) => `<tr data-id="${esc(l.id)}">
        <td>${favButton(l.id)}</td><td>${esc(l.address)}<div class="muted small">${esc(l.city)}</div></td><td>${esc(l.state)}</td>
        <td class="num">${money(l.price)}</td><td><span class="badge ${esc(l.loan_type)}">${esc(l.loan_type)}</span></td>
        <td class="num">${pct(l.interest_rate)}</td><td class="num">${money(l.loan_balance)}</td><td class="num">${money(a.gap)}</td>
        <td class="num">${money(a.assumeTotal)}</td><td class="num">${savingsHtml(a.savings)}</td>
        <td class="num">${l.beds ?? "–"}</td><td class="num">${l.baths ?? "–"}</td><td class="num">${l.sqft ? l.sqft.toLocaleString() : "–"}</td>
        <td>${esc(l.listed_date || "")}</td></tr>`).join("")}
    </tbody></table></div>`;
  }

  let current = [];
  function render() {
    current = filtered();
    const page = current.slice(0, shown);
    const results = $("results");
    results.className = view === "cards" ? "cards" : "";
    results.innerHTML = view === "cards" ? page.map(cardHtml).join("") : tableHtml(page);
    $("empty").hidden = current.length > 0 || !listings.length;
    $("more").hidden = current.length <= shown;
    $("resultCount").textContent = `${current.length.toLocaleString()} of ${listings.length.toLocaleString()} homes`;

    $("kCount").textContent = current.length.toLocaleString();
    $("kRate").textContent = pct(median(current.map((x) => x.l.interest_rate)));
    $("kGap").textContent = moneyK(median(current.map((x) => x.a.gap)));
    const s = median(current.map((x) => x.a.savings));
    $("kSave").innerHTML = s == null ? "–" : savingsHtml(s);
    $("maxRateOut").textContent = +el.maxRate.value >= 8 ? "Any" : pct(el.maxRate.value);
    renderLoanChips();
    syncUrl();
  }

  function renderLoanChips() {
    const counts = {};
    const state = el.state.value;
    for (const l of listings) if (!state || l.state === state) counts[l.loan_type] = (counts[l.loan_type] || 0) + 1;
    $("loanTypes").innerHTML = LOAN_TYPES.filter((t) => counts[t]).map((t) =>
      `<button class="chip" data-loan="${t}" aria-pressed="${loanFilter.has(t)}">${t}<span class="n">${counts[t]}</span></button>`).join("");
  }

  function populateOptions() {
    const stateCounts = {};
    const types = new Set();
    listings.forEach((l) => { if (l.state) stateCounts[l.state] = (stateCounts[l.state] || 0) + 1; if (l.property_type) types.add(l.property_type); });
    const keep = el.state.value;
    el.state.innerHTML = `<option value="">All states (${listings.length})</option>` + Object.keys(STATE_NAMES)
      .filter((c) => stateCounts[c]).map((c) => `<option value="${c}">${STATE_NAMES[c]} (${stateCounts[c]})</option>`).join("");
    el.state.value = keep;
    el.ptype.innerHTML = `<option value="">Any</option>` + [...types].sort().map((t) => `<option>${esc(t)}</option>`).join("");
  }

  function openDetail(id) {
    const l = listings.find((x) => x.id === id);
    if (!l) return;
    const a = analyze(l);
    const market = num("marketRate") ?? 6.5;
    const va = l.loan_type === "VA" ? `<div class="note"><b>VA loan:</b> anyone who qualifies with the servicer can assume it, but unless the buyer is an eligible veteran who substitutes entitlement, the seller's VA entitlement stays tied to this loan. Funding fee on assumption is typically 0.5% of the balance.</div>` : "";
    const fha = l.loan_type === "FHA" ? `<div class="note"><b>FHA loan:</b> buyer must be credit- and income-qualified by the servicer and occupy the home as a primary residence. Assumption fees are capped by HUD.</div>` : "";
    const usda = l.loan_type === "USDA" ? `<div class="note"><b>USDA loan:</b> buyer must meet USDA income limits and the property must remain in an eligible rural area.</div>` : "";
    const save = a.savings;
    $("detailBody").innerHTML = `
      <div class="d-head"><div>
          <div class="price">${money(l.price)}</div>
          <div>${esc(l.address)}</div><div class="muted">${esc(place(l))}</div>
          <div class="badges" style="margin-top:8px"><span class="badge ${esc(l.loan_type)}">${esc(l.loan_type)}</span><span class="rate">${pct(l.interest_rate)} assumable</span>
          ${l.source === "sample" ? '<span class="badge">Sample data</span>' : `<span class="muted small">via ${esc(l.source)}</span>`}</div>
        </div>
        <div>${favButton(l.id)}<button class="close" aria-label="Close" data-close>×</button></div></div>
      <div class="d-body">
        ${save != null ? `<div class="callout ${save < 0 ? "neg" : ""}">${save >= 0 ? `Assuming saves about ${money(save)}/mo (${money(save * 12)}/yr)` : `Assuming costs about ${money(-save)}/mo more`} vs. a new loan at ${pct(market)}</div>` : ""}
        <div class="compare">
          <div><h3>Assume the loan</h3>
            <div class="kv"><span>Loan balance</span><b>${money(l.loan_balance)}</b></div>
            <div class="kv"><span>Rate · years left</span><b>${pct(l.interest_rate)} · ${l.remaining_term_years ?? "–"}</b></div>
            <div class="kv"><span>Equity gap</span><b>${money(a.gap)}${l.equity_gap_pct != null ? ` (${l.equity_gap_pct}%)` : ""}</b></div>
            <div class="kv"><span>Your cash in</span><b>${money(a.cashDown)}</b></div>
            ${a.secondLoan ? `<div class="kv"><span>2nd loan ${money(a.secondLoan)} @ ${pct(num("secondRate"))}</span><b>${money(a.secondPI)}</b></div>` : ""}
            <div class="kv"><span>Assumed P&amp;I</span><b>${money(a.assumedPI)}</b></div>
            ${a.hoa ? `<div class="kv"><span>HOA</span><b>${money(a.hoa)}</b></div>` : ""}
            <div class="kv"><span><b>Monthly total</b></span><b>${money(a.assumeTotal)}</b></div>
          </div>
          <div><h3>New 30-yr loan at ${pct(market)}</h3>
            <div class="kv"><span>Loan amount</span><b>${a.cashDown != null ? money(l.price - a.cashDown) : "–"}</b></div>
            <div class="kv"><span>Same cash in</span><b>${money(a.cashDown)}</b></div>
            <div class="kv"><span>New P&amp;I</span><b>${money(a.newPI)}</b></div>
            ${a.hoa ? `<div class="kv"><span>HOA</span><b>${money(a.hoa)}</b></div>` : ""}
            <div class="kv"><span><b>Monthly total</b></span><b>${a.newPI != null ? money(a.newPI + a.hoa) : "–"}</b></div>
          </div>
        </div>
        ${va}${fha}${usda}
        <div class="facts">${[l.beds && `${l.beds} beds`, l.baths && `${l.baths} baths`, l.sqft && `${l.sqft.toLocaleString()} sqft`, l.year_built && `built ${l.year_built}`, l.property_type, l.listed_date && `listed ${l.listed_date}`].filter(Boolean).map(esc).join(" · ")}</div>
        ${l.description ? `<p class="muted">${esc(l.description)}</p>` : ""}
        ${l.url ? `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">View original listing ↗</a>` : ""}
        <p class="muted small">Excludes property tax, insurance and closing/assumption fees. Verify the loan terms with the servicer.</p>
      </div>`;
    $("detail").showModal();
  }

  function exportCsv() {
    const cols = ["address", "city", "state", "zip", "price", "loan_type", "interest_rate", "loan_balance", "remaining_term_years", "equity_gap", "monthly_pi", "hoa_monthly", "beds", "baths", "sqft", "property_type", "listed_date", "url"];
    const q = (v) => v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    const lines = [cols.concat("est_monthly_savings").join(",")].concat(
      current.map(({ l, a }) => cols.map((c) => q(l[c])).concat(q(a.savings == null ? null : Math.round(a.savings))).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "assumable-listings.csv" });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }

  // ---------- URL state ----------
  function syncUrl() {
    const p = new URLSearchParams();
    FILTER_IDS.forEach((id) => { const v = value(el[id]); if (v !== defaults[id]) p.set(id, v); });
    if (loanFilter.size) p.set("loan", [...loanFilter].join(","));
    if (view !== "cards") p.set("view", view);
    history.replaceState(null, "", p.toString() ? "?" + p : window.location.pathname);
  }
  function readUrl() {
    const p = new URLSearchParams(window.location.search);
    FILTER_IDS.forEach((id) => {
      if (!p.has(id)) return;
      if (el[id].type === "checkbox") el[id].checked = p.get(id) === "true"; else el[id].value = p.get(id);
    });
    loanFilter = new Set((p.get("loan") || "").split(",").filter(Boolean));
    setView(p.get("view") === "table" ? "table" : "cards", false);
  }
  function setView(v, rerender = true) {
    view = v;
    $("viewCards").classList.toggle("active", v === "cards");
    $("viewTable").classList.toggle("active", v === "table");
    $("viewCards").setAttribute("aria-pressed", v === "cards");
    $("viewTable").setAttribute("aria-pressed", v === "table");
    if (rerender) render();
  }

  // ---------- data ----------
  function load(data) {
    const rows = Array.isArray(data) ? data : data.listings || [];
    listings = rows.map((l) => ({
      ...l,
      loan_type: LOAN_TYPES.includes(l.loan_type) ? l.loan_type : "Unknown",
      _text: [l.address, l.city, l.state, STATE_NAMES[l.state], l.zip, l.property_type, l.loan_type, l.description].join(" ").toLowerCase(),
    }));
    const sources = [...new Set(listings.map((l) => l.source))];
    const when = data.generated_at ? new Date(data.generated_at).toLocaleString() : null;
    $("dataMeta").textContent = `${listings.length.toLocaleString()} listings · ${sources.join(", ") || "no sources"}${when ? " · updated " + when : ""}`;
    $("demoBanner").hidden = !(sources.length === 1 && sources[0] === "sample");
    $("loadError").hidden = true;
    populateOptions();
    readUrl();
    render();
  }

  // ---------- events ----------
  let debounce;
  const rerender = () => { shown = PAGE; clearTimeout(debounce); debounce = setTimeout(render, 120); };
  FILTER_IDS.forEach((id) => el[id].addEventListener(el[id].tagName === "SELECT" || el[id].type === "checkbox" ? "change" : "input", rerender));

  document.addEventListener("click", (e) => {
    const fav = e.target.closest("[data-fav]");
    if (fav) {
      e.stopPropagation();
      const id = fav.dataset.fav;
      favorites.has(id) ? favorites.delete(id) : favorites.add(id);
      store("favorites", null, [...favorites]);
      document.querySelectorAll(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => {
        const on = favorites.has(id);
        b.setAttribute("aria-pressed", on); b.textContent = on ? "♥" : "♡";
      });
      if (el.favOnly.checked) render();
      return;
    }
    const chip = e.target.closest("[data-loan]");
    if (chip) {
      const t = chip.dataset.loan;
      loanFilter.has(t) ? loanFilter.delete(t) : loanFilter.add(t);
      shown = PAGE; render(); return;
    }
    if (e.target.closest("[data-close]") || e.target === $("detail")) { $("detail").close(); return; }
    const item = e.target.closest("[data-id]");
    if (item && $("results").contains(item)) openDetail(item.dataset.id);
  });
  $("results").addEventListener("keydown", (e) => {
    const item = e.target.closest("[data-id]");
    if (item && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDetail(item.dataset.id); }
  });
  $("more").addEventListener("click", () => { shown += PAGE; render(); });
  $("viewCards").addEventListener("click", () => setView("cards"));
  $("viewTable").addEventListener("click", () => setView("table"));
  $("export").addEventListener("click", exportCsv);
  $("reset").addEventListener("click", () => {
    FILTER_IDS.forEach((id) => { if (el[id].type === "checkbox") el[id].checked = defaults[id]; else el[id].value = defaults[id]; });
    loanFilter.clear(); shown = PAGE; render();
  });
  $("toggleFilters").addEventListener("click", (e) => {
    const open = $("filters").classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", open);
  });
  $("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (file) load(JSON.parse(await file.text()));
  });

  fetch("data/listings.json", { cache: "no-store" })
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(load)
    .catch(() => { $("dataMeta").textContent = "No data loaded"; $("loadError").hidden = false; });
})();
