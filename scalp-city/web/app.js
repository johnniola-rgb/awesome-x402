import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

const $ = (id) => document.getElementById(id);
const fmt$ = (v, sign = true) => {
  const s = v < 0 ? "−" : sign && v > 0 ? "+" : "";
  return `${s}$${Math.abs(Math.round(v)).toLocaleString()}`;
};
const setHTML = (el, html) => { if (el._html !== html) { el._html = html; el.innerHTML = html; } };
const cls = (v) => (v > 0 ? "up" : v < 0 ? "down" : "");
const ARROW = { call: "▲", put: "▼" };
const GREEN = new THREE.Color(0x3dffb0);
const RED = new THREE.Color(0xff2d6f);
const WHITE = new THREE.Color(0xffffff);
const dayLabel = (iso) => {
  const d = new Date(iso + "T12:00:00");
  return `${d.toLocaleDateString("en-US", { weekday: "short" })} ${d.getMonth() + 1}/${d.getDate()}`;
};

// ---------------------------------------------------------------- renderer
const host = $("scene");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
host.appendChild(renderer.domElement);

const labels = new CSS2DRenderer();
labels.setSize(innerWidth, innerHeight);
Object.assign(labels.domElement.style, { position: "absolute", top: 0, left: 0, pointerEvents: "none" });
host.appendChild(labels.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a10a0);
scene.fog = new THREE.Fog(0x1a10a0, 70, 190);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 500);
const homePos = () => (innerWidth / innerHeight < 1 ? new THREE.Vector3(0, 56, 98) : new THREE.Vector3(0, 34, 58));
const HOME = { pos: homePos(), target: new THREE.Vector3(0, 5, -4) };
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, labels.domElement);
labels.domElement.style.pointerEvents = "auto";
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 12;
controls.maxDistance = 140;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.55, 0.62);
composer.addPass(bloom);
composer.addPass(new OutputPass());

scene.add(new THREE.HemisphereLight(0x8fa0ff, 0x1a0a60, 1.4));
const key = new THREE.DirectionalLight(0xc9b8ff, 1.2);
key.position.set(20, 40, 30);
scene.add(key);

// ---------------------------------------------------------------- textures
function windowTexture(lit = 0.35, hue = "#9fd4ff") {
  const c = document.createElement("canvas");
  c.width = 64; c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#0b0a2e";
  g.fillRect(0, 0, 64, 128);
  for (let y = 4; y < 128; y += 8) {
    for (let x = 4; x < 64; x += 8) {
      if (Math.random() < lit) {
        g.fillStyle = Math.random() < 0.15 ? "#ffd27a" : hue;
        g.fillRect(x, y, 4, 4);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// ---------------------------------------------------------------- ground + filler city
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.MeshStandardMaterial({ color: 0x2018c8, roughness: 0.9, metalness: 0.1 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);
const grid = new THREE.GridHelper(600, 150, 0x5a6bff, 0x3a3ae0);
grid.position.y = 0.02;
grid.material.transparent = true;
grid.material.opacity = 0.35;
scene.add(grid);

{
  const N = 700;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const tex = windowTexture(0.3);
  const mat = new THREE.MeshStandardMaterial({ color: 0x15124a, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, map: tex });
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const m = new THREE.Matrix4();
  let placed = 0;
  for (let i = 0; i < N * 3 && placed < N; i++) {
    const r = 34 + Math.random() * 110;
    const a = Math.random() * Math.PI * 2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r - 10;
    if (z > 0 && Math.abs(x) < 34 + z * 0.6) continue; // keep the camera's foreground clear
    const near = r < 60 && z > -20;
    const w = 1.5 + Math.random() * 3, h = 0.6 + Math.random() * (near ? 3 : 16), d = 1.5 + Math.random() * 3;
    m.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
    mesh.setMatrixAt(placed++, m);
  }
  mesh.count = placed;
  scene.add(mesh);
}

// background light pillars
for (const [x, z, c] of [[-60, -80, 0x45e6ff], [-30, -95, 0xff5fb0], [35, -90, 0x45e6ff], [70, -70, 0xff5fb0], [-85, -40, 0xff5fb0], [90, -30, 0x45e6ff]]) {
  const p = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 120, 8, 1, true),
    new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  p.position.set(x, 60, z);
  scene.add(p);
}

function sign(text, cls, pos) {
  const el = document.createElement("div");
  el.className = `sign ${cls}`;
  el.textContent = text;
  const o = new CSS2DObject(el);
  o.position.copy(pos);
  scene.add(o);
}
sign("Scalp City", "big", new THREE.Vector3(0, 26, -46));
sign("BUY THE DIP", "green", new THREE.Vector3(-22, 19, -34));
sign("VWAP", "cyan", new THREE.Vector3(26, 18, -30));
sign("1DTE", "pink", new THREE.Vector3(-34, 14, -18));

// ---------------------------------------------------------------- platform
const PLATFORM_R = 24;
{
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(PLATFORM_R, PLATFORM_R, 0.6, 96),
    new THREE.MeshStandardMaterial({ color: 0x1b1490, roughness: 0.6, metalness: 0.3 }));
  disc.position.y = 0.3;
  scene.add(disc);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xbfd8ff });
  const edge = new THREE.Mesh(new THREE.TorusGeometry(PLATFORM_R, 0.18, 8, 160), ringMat);
  edge.rotation.x = Math.PI / 2;
  edge.position.y = 0.62;
  scene.add(edge);
  for (const r of [PLATFORM_R * 0.62, PLATFORM_R * 0.3]) {
    const inner = new THREE.Mesh(new THREE.TorusGeometry(r, 0.06, 6, 128), new THREE.MeshBasicMaterial({ color: 0x6d7dff }));
    inner.rotation.x = Math.PI / 2;
    inner.position.y = 0.62;
    scene.add(inner);
  }
  // railing posts with lights
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.4, 0.12), new THREE.MeshBasicMaterial({ color: 0x0c0a30 }));
    post.position.set(Math.cos(a) * (PLATFORM_R + 1.2), 0.7, Math.sin(a) * (PLATFORM_R + 1.2));
    scene.add(post);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    bulb.position.set(post.position.x, 1.5, post.position.z);
    scene.add(bulb);
  }
}

// ---------------------------------------------------------------- vault
const VAULT_POS = new THREE.Vector3(0, 0.6, 9);
const vault = new THREE.Group();
vault.position.copy(VAULT_POS);
scene.add(vault);
const vaultDomeMat = new THREE.MeshStandardMaterial({ color: 0xf4e6c8, emissive: 0xffe2a8, emissiveIntensity: 0.05, roughness: 0.5 });
{
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.6, 0.5, 64), new THREE.MeshStandardMaterial({ color: 0x0b0a2a }));
  base.position.y = 0.25;
  vault.add(base);
  const baseRing = new THREE.Mesh(new THREE.TorusGeometry(5.4, 0.08, 6, 96), new THREE.MeshBasicMaterial({ color: 0x45e6ff }));
  baseRing.rotation.x = Math.PI / 2;
  baseRing.position.y = 0.5;
  vault.add(baseRing);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const drop = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8), new THREE.MeshBasicMaterial({ color: 0x45e6ff }));
    drop.position.set(Math.cos(a) * 4.6, 0.75, Math.sin(a) * 4.6);
    vault.add(drop);
  }
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 2.4, 48), new THREE.MeshStandardMaterial({ color: 0xd8c6a6, roughness: 0.6 }));
  drum.position.y = 1.7;
  vault.add(drum);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.3, 0.14), new THREE.MeshStandardMaterial({ color: 0x8a2a3a }));
    col.position.set(Math.cos(a) * 2.82, 1.7, Math.sin(a) * 2.82);
    col.rotation.y = -a;
    vault.add(col);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.9, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), vaultDomeMat);
  dome.position.y = 2.9;
  vault.add(dome);
}
const vaultEl = document.createElement("div");
vaultEl.className = "vlabel";
const vaultLabel = new CSS2DObject(vaultEl);
vaultLabel.position.set(0, 8.2, 0);
vault.add(vaultLabel);
vaultEl.addEventListener("pointerdown", (e) => { e.stopPropagation(); openRecap(true); });

// ---------------------------------------------------------------- towers
const SLOTS = [[-15, 0, -1], [-8, 0, -8], [0, 0, -11], [8, 0, -8], [15, 0, -1], [-19, 0, 7], [19, 0, 7]];
const towers = new Map();
const pickables = [];

const beamMaterial = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uColor: { value: new THREE.Color(0x3dffb0) }, uAlpha: { value: 0 }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform vec3 uColor; uniform float uAlpha; uniform float uTime; varying vec2 vUv;
    void main(){ float fade = pow(1.0 - vUv.y, 1.4); float pulse = 0.75 + 0.25*sin(uTime*6.0 - vUv.y*30.0);
      gl_FragColor = vec4(uColor * (1.2 + pulse), uAlpha * fade * pulse); }`,
});

function makeTower(w, i) {
  const [x, , z] = SLOTS[i % SLOTS.length];
  const g = new THREE.Group();
  g.position.set(x, 0.6, z);
  scene.add(g);

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.3, 0.6, 48), new THREE.MeshStandardMaterial({ color: 0x0d0b33 }));
  pedestal.position.y = 0.3;
  g.add(pedestal);
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(3.15, 0.07, 6, 80), new THREE.MeshBasicMaterial({ color: 0x8fa8ff }));
  padRing.rotation.x = Math.PI / 2;
  padRing.position.y = 0.62;
  g.add(padRing);

  const tex = windowTexture(0.55);
  const tiers = [[3.0, 4.5], [2.3, 3.6], [1.6, 3.0], [1.0, 2.2]];
  let y = 0.6;
  const height = 5 + (i % 3) * 1.6;
  for (const [s, hBase] of tiers) {
    const h = hBase * (height / 8);
    const t = tex.clone();
    t.repeat.set(s / 2, h / 3);
    t.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({ color: 0x1a1660, map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 1.1 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(s, h, s), mat);
    box.position.y = y + h / 2;
    box.userData.worker = w.id;
    g.add(box);
    pickables.push(box);
    y += h;
  }
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  antenna.position.y = y + 1.1;
  g.add(antenna);
  const topY = y + 2.2;

  const orb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2 }));
  orb.position.y = topY;
  g.add(orb);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.05, 8, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 }));
  halo.position.y = topY;
  halo.rotation.x = Math.PI / 2.4;
  g.add(halo);

  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 70, 24, 1, true), beamMaterial());
  beam.position.y = topY + 35;
  g.add(beam);
  const beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 70, 12, 1, true), beamMaterial());
  beamCore.position.y = topY + 35;
  g.add(beamCore);

  const shock = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 96), new THREE.MeshBasicMaterial({ color: 0x3dffb0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  shock.rotation.x = -Math.PI / 2;
  shock.position.y = 1;
  g.add(shock);

  const link = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(x, topY + 0.6, z), VAULT_POS.clone().add(new THREE.Vector3(0, 5.8, 0))]),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 }),
  );
  scene.add(link);

  const el = document.createElement("div");
  el.className = "tlabel";
  el.addEventListener("pointerdown", (e) => { e.stopPropagation(); select(w.id); });
  const label = new CSS2DObject(el);
  label.position.y = topY + 2.4;
  g.add(label);

  const t = { id: w.id, group: g, orb, halo, beam, beamCore, shock, el, link, topY,
    alpha: 0, targetAlpha: 0, color: GREEN.clone(), targetColor: GREEN.clone(), flash: 0, shockT: -1, data: w };
  towers.set(w.id, t);
  return t;
}

function towerStatus(w) {
  const c = w.charge;
  if (w.state === "in_trade" && w.position) {
    const p = w.position;
    return [`in ${ARROW[p.side]} ${p.side.toUpperCase()} ×${p.qty} ${fmt$(p.pnl)}`, p.side];
  }
  if (w.state === "clocked_out") return ["clocked out ✓", "call"];
  if (w.state === "benched") return ["benched — max loss", "put"];
  if (w.state === "cooldown") return ["cooling down", ""];
  if (w.state === "closed") return ["done for the day", ""];
  if (w.state === "warming") return ["warming up", ""];
  if (c && c.blocked) return [`chop — skipping ${c.label}`, ""];
  if (c && c.pct > 0) return [`charging ${ARROW[c.side]} ${c.side.toUpperCase()} ${Math.round(c.pct * 100)}%`, c.side];
  return ["watching", ""];
}

function updateTower(t, w) {
  t.data = w;
  const [status, side] = towerStatus(w);
  setHTML(t.el, `<div class="n">${w.name}</div><div class="s ${side}">${status}</div><div class="e">earned <span class="${cls(w.earned)}">${fmt$(w.earned)}</span></div>`);
  t.el.classList.toggle("selected", selected === w.id);

  const c = w.charge;
  if (w.state === "in_trade" && w.position) {
    t.targetAlpha = 0.65;
    t.targetColor.copy(w.position.side === "call" ? GREEN : RED);
  } else if (c && !c.blocked && c.pct > 0 && ["charging", "watching"].includes(w.state)) {
    t.targetAlpha = 0.12 + 0.75 * c.pct;
    t.targetColor.copy(c.side === "call" ? GREEN : RED);
  } else {
    t.targetAlpha = 0;
  }
  const inTrade = w.state === "in_trade";
  t.orb.material.opacity = inTrade ? 1 : 0.2;
  t.orb.material.color.copy(inTrade ? (w.position.side === "call" ? GREEN : RED) : WHITE);
  t.link.material.opacity = inTrade ? 0.7 : 0.22;
  const dim = ["clocked_out", "benched", "closed"].includes(w.state);
  t.halo.material.opacity = dim ? 0.15 : 0.6;
}

function floatText(t, text, win) {
  const el = document.createElement("div");
  el.className = `float ${win ? "win" : "loss"}`;
  el.textContent = text;
  const o = new CSS2DObject(el);
  o.position.set(0, t.topY + 5, 0);
  t.group.add(o);
  setTimeout(() => { t.group.remove(o); el.remove(); }, 3300);
}

function toast(text, color) {
  const el = document.createElement("div");
  el.className = "toast";
  el.style.color = color;
  el.textContent = text;
  $("toasts").appendChild(el);
  setTimeout(() => el.remove(), 4100);
}

// ---------------------------------------------------------------- selection + camera
let selected = null;
let camTween = null;

function flyTo(pos, target) {
  camTween = { fromP: camera.position.clone(), toP: pos, fromT: controls.target.clone(), toT: target, t: 0 };
}

function select(id) {
  selected = id;
  const t = towers.get(id);
  if (!t) return;
  // look at a point right of the tower so it sits clear of the side panel
  const p = t.group.position;
  const shift = innerWidth > 720 ? 7 : 0;
  flyTo(new THREE.Vector3(p.x * 0.6, 22, p.z + 32), new THREE.Vector3(p.x + shift, 6, p.z));
  $("panel").classList.remove("hidden");
  chartFor = null;
  renderPanel();
  loadChart(true);
}

function deselect() {
  selected = null;
  $("panel").classList.add("hidden");
  flyTo(HOME.pos.clone(), HOME.target.clone());
  for (const t of towers.values()) t.el.classList.remove("selected");
}
$("panel-close").addEventListener("click", deselect);
addEventListener("keydown", (e) => { if (e.key === "Escape") { $("recap").classList.add("hidden"); deselect(); } });

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downAt = null;
labels.domElement.addEventListener("pointerdown", (e) => { downAt = [e.clientX, e.clientY]; });
labels.domElement.addEventListener("pointerup", (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects([...pickables, vault], true)[0];
  if (!hit) return;
  if (hit.object.userData.worker) select(hit.object.userData.worker);
  else openRecap(true);
});

// ---------------------------------------------------------------- chart
let chart = null, candles = null, lines = {}, chartFor = null;
const etTime = (t) => new Date(t * 1000).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });

function ensureChart() {
  if (chart || !window.LightweightCharts) return;
  const LC = window.LightweightCharts;
  chart = LC.createChart($("chart"), {
    layout: { background: { color: "#07061f" }, textColor: "#9aa3d9", fontFamily: "JetBrains Mono" },
    grid: { vertLines: { color: "rgba(90,100,255,.08)" }, horzLines: { color: "rgba(90,100,255,.08)" } },
    timeScale: { timeVisible: true, secondsVisible: false, borderColor: "#2a2a6a", tickMarkFormatter: etTime },
    rightPriceScale: { borderColor: "#2a2a6a" },
    crosshair: { mode: 0 },
    localization: { timeFormatter: etTime },
  });
  candles = chart.addCandlestickSeries({ upColor: "#3dffb0", downColor: "#ff3d7f", wickUpColor: "#3dffb0", wickDownColor: "#ff3d7f", borderVisible: false });
  const mk = (color, style = 0) => chart.addLineSeries({ color, lineWidth: 1.5, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
  lines = { vwap: mk("#ffd84a"), ema9: mk("#45e6ff"), ema21: mk("#b37bff"), ema50: mk("#ff9a3d"), orbH: mk("#ffffff", 2), orbL: mk("#ffffff", 2) };
  new ResizeObserver(() => chart.applyOptions({ width: $("chart").clientWidth, height: $("chart").clientHeight })).observe($("chart"));
}

let chartBusy = false;
async function loadChart(fit = false) {
  if (!selected || chartBusy) return;
  chartBusy = true;
  try {
    const res = await fetch(`/api/chart/${selected}`);
    if (!res.ok) return;
    const d = await res.json();
    ensureChart();
    if (!chart) return;
    candles.setData(d.bars.map((b) => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c })));
    for (const [k, s] of Object.entries(lines)) {
      s.setData(d.series.filter((p) => p[k] != null).map((p) => ({ time: p.t, value: p[k] })));
    }
    const markers = [];
    const toT = (iso) => Math.floor(new Date(iso).getTime() / 1000);
    for (const tr of d.trades) {
      markers.push({ time: toT(tr.entry_ts), position: tr.side === "call" ? "belowBar" : "aboveBar", color: tr.side === "call" ? "#3dffb0" : "#ff3d7f", shape: tr.side === "call" ? "arrowUp" : "arrowDown", text: `${tr.side === "call" ? "C" : "P"}` });
      markers.push({ time: toT(tr.exit_ts), position: "aboveBar", color: tr.pnl >= 0 ? "#3dffb0" : "#ff3d7f", shape: "circle", text: fmt$(tr.pnl) });
    }
    if (d.position) markers.push({ time: d.position.t, position: d.position.side === "call" ? "belowBar" : "aboveBar", color: "#ffd84a", shape: d.position.side === "call" ? "arrowUp" : "arrowDown", text: "open" });
    markers.sort((a, b) => a.time - b.time);
    candles.setMarkers(markers);
    if (fit || chartFor !== selected) chart.timeScale().fitContent();
    chartFor = selected;
  } finally {
    chartBusy = false;
  }
}

// ---------------------------------------------------------------- panels
let state = null;

function renderPanel() {
  if (!selected || !state) return;
  const w = state.workers.find((x) => x.id === selected);
  if (!w) return;
  $("p-name").textContent = w.name;
  const chg = w.change_pct == null ? "" : ` <span class="${cls(w.change_pct)}">${w.change_pct >= 0 ? "+" : ""}${w.change_pct.toFixed(2)}%</span>`;
  setHTML($("p-sub"), `${w.symbol} ${w.price ? w.price.toFixed(2) : "—"}${chg} · ${state.clock || "--:--"} ET · ${w.trades_n} trades · triggers: ${w.triggers.join(", ").toUpperCase()}`);
  $("p-state").textContent = w.state.replace("_", " ");
  $("p-state").className = `pill ${w.state}`;

  const c = w.charge;
  const bar = $("s-bar");
  if (c) {
    $("s-line").textContent = `${c.label} cross ${ARROW[c.side]} ${c.side.toUpperCase()} · ${c.atr_away.toFixed(2)} ATR away${c.blocked ? ` · skipped: ${c.blocked}` : ""}`;
    bar.style.width = `${Math.max(3, c.pct * 100)}%`;
    bar.className = `charge-bar ${c.blocked ? "blocked" : c.side}`;
    $("s-pct").textContent = `${Math.round(c.pct * 100)}% CHARGED`;
  } else {
    $("s-line").textContent = w.state === "warming" ? "warming up indicators…" : "no setup in range";
    bar.style.width = "0%";
    $("s-pct").textContent = "0% CHARGED";
  }
  const p = w.position;
  setHTML($("s-pos"), p
    ? `IN ${ARROW[p.side]} ${p.contract} ×${p.qty} @ ${p.entry.toFixed(2)} → ${p.mark.toFixed(2)} · <span class="${cls(p.pnl)}">${fmt$(p.pnl)}</span>${p.trailing ? " · trailing" : ""} · since ${p.since} (${p.trigger})`
    : "");
  setHTML($("thoughts"), w.thoughts.map((t) => `<li><span class="t">${t.ts}</span><span class="${t.kind}">${t.text}</span></li>`).join("") || `<li><span class="t">—</span><span>quiet so far</span></li>`);

  $("e-date").textContent = state.date ? dayLabel(state.date).toUpperCase() : "—";
  $("e-total").textContent = fmt$(w.earned);
  $("e-total").className = `big ${cls(w.earned)}`;
  $("e-sub").textContent = `${w.trades_n} trades · ${w.wins} wins${w.win_rate != null ? ` · ${w.win_rate}% win rate` : ""}${w.unrealized ? ` · open ${fmt$(w.unrealized)}` : ""}`;
  setHTML($("trades"), w.trades.map((t) => {
    const time = new Date(t.entry_ts).toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false });
    return `<li><span class="t">${time}</span><span>${ARROW[t.side]} ${t.qty} ${t.symbol}</span><span class="t">${t.reason}</span><span class="${cls(t.pnl)}" style="margin-left:auto">${fmt$(t.pnl)}</span></li>`;
  }).join("") || `<li><span class="t">no trades yet</span></li>`);
}

function renderHud(s) {
  $("mode-badge").textContent = { sim: "SIMULATION", replay: "ALPACA REPLAY", paper: "ALPACA PAPER" }[s.mode] || s.mode;
  $("mode-badge").className = `badge ${s.mode === "paper" ? "paper" : ""}`;
  const m = $("market");
  if (s.market === "open" && s.to_close_min != null) {
    const h = Math.floor(s.to_close_min / 60), mm = s.to_close_min % 60;
    m.textContent = `MARKET OPEN · ${s.clock} ET · ${h}h ${mm}m to close`;
    m.className = "badge market open";
  } else {
    m.textContent = s.clock ? `MARKET CLOSED · last bar ${s.clock} ET` : "MARKET CLOSED";
    m.className = "badge market";
  }
  const sl = $("status-line");
  sl.textContent = s.error ? `engine error: ${s.error}` : s.status !== "running" ? s.status : `${s.feed} → ${s.broker}`;
  sl.className = `status-line ${s.error ? "error" : ""}`;

  const v = s.vault;
  setHTML(vaultEl, `<div class="vt">THE VAULT · ${s.date ? dayLabel(s.date).toUpperCase() : "—"}</div><div class="vv ${cls(v.total)}">${fmt$(v.total)}</div><div>${v.on_shift} workers on shift · tap for payout</div>`);
  vaultDomeMat.emissiveIntensity = 0.04 + Math.min(0.35, Math.max(0, v.total) / 8000);

  setHTML($("lb-list"), s.leaderboard.map((id, i) => {
    const w = s.workers.find((x) => x.id === id);
    return `<li data-id="${id}"><span><span class="rank">${i + 1}.</span>${w.name}</span><span class="${cls(w.earned)}">${fmt$(w.earned)}</span></li>`;
  }).join(""));

  const days = [...s.history];
  if (s.date && !s.recap) days.push({ date: s.date, total: v.total, live: true });
  setHTML($("calendar"), days.map((d) => `<div class="day ${d.live ? "today" : ""}">${dayLabel(d.date)}<b class="${cls(d.total)}">${fmt$(d.total)}</b></div>`).join(""));
  if ($("calendar")._len !== days.length) { $("calendar")._len = days.length; $("calendar").scrollLeft = 1e6; }

  const tape = s.tape.map((e) => e.type === "fire"
    ? `<span>${e.ts} ${e.name} ${ARROW[e.side]} bought ${e.qty} ${e.contract} @ ${e.price.toFixed(2)}</span>`
    : `<span>${e.ts} ${e.name} ${e.reason} <b class="${cls(e.pnl)}">${fmt$(e.pnl)}</b></span>`).join("");
  setHTML($("tape-inner"), tape || "<span>waiting for the first signal…</span>");
}
$("lb-list").addEventListener("pointerdown", (e) => { const li = e.target.closest("li"); if (li) select(li.dataset.id); });

let recapShownFor = null;
function openRecap(force = false) {
  if (!state) return;
  const r = state.recap || {
    date: state.date, total: state.vault.total, trades: state.vault.trades,
    wins: state.workers.reduce((a, w) => a + w.wins, 0),
    workers: state.workers.map((w) => ({ id: w.id, name: w.name, pnl: w.earned })),
    top: (() => { const w = state.workers.find((x) => x.id === state.leaderboard[0]); return w && { name: w.name, pnl: w.earned }; })(),
    live: true,
  };
  if (!r.date) return;
  if (!force && recapShownFor === r.date) return;
  recapShownFor = r.date;
  $("r-date").textContent = `${dayLabel(r.date).toUpperCase()}${r.live ? " · SO FAR" : " · SESSION CLOSED"}`;
  $("r-total").textContent = fmt$(r.total);
  $("r-total").className = `r-total ${cls(r.total)}`;
  $("r-sub").textContent = `${r.workers.length} workers · ${r.trades} trades · ${r.wins} wins`;
  const max = Math.max(1, ...r.workers.map((w) => Math.abs(w.pnl)));
  $("r-bars").innerHTML = r.workers.map((w) => `<div class="r-bar ${w.pnl < 0 ? "neg" : ""}"><span class="${cls(w.pnl)}">${fmt$(w.pnl)}</span><i style="height:${Math.max(3, (Math.abs(w.pnl) / max) * 100)}px"></i><span>${w.name}</span></div>`).join("");
  $("r-top").textContent = r.top ? `⭐ TOP WORKER ${r.top.name} ${fmt$(r.top.pnl)}` : "";
  $("recap").classList.remove("hidden");
}
$("r-close").addEventListener("click", () => $("recap").classList.add("hidden"));
$("recap").addEventListener("click", (e) => { if (e.target.id === "recap") $("recap").classList.add("hidden"); });

// ---------------------------------------------------------------- state handling
function onState(s) {
  const firstDay = state && state.date !== s.date;
  state = s;
  s.workers.forEach((w, i) => {
    const t = towers.get(w.id) || makeTower(w, i);
    updateTower(t, w);
  });
  for (const ev of s.events) {
    const t = towers.get(ev.worker);
    if (ev.type === "fire" && t) {
      t.flash = 1;
      t.shockT = 0;
      t.shock.material.color.copy(ev.side === "call" ? GREEN : RED);
      toast(`${ev.name} FIRE ${ARROW[ev.side]} ${ev.side.toUpperCase()} ×${ev.qty} @ ${ev.price.toFixed(2)}`, ev.side === "call" ? "#3dffb0" : "#ff3d7f");
    } else if (ev.type === "exit" && t) {
      const win = ev.pnl >= 0;
      floatText(t, `${win ? "🔒 PROFIT LOCKED" : "⛔ " + ev.reason.toUpperCase()} ${fmt$(ev.pnl)}`, win);
      if (ev.clocked_out) toast(`${ev.name} hit the daily goal · clocking out`, "#ffd84a");
      if (ev.benched) toast(`${ev.name} hit max loss · benched`, "#ff3d7f");
    } else if (ev.type === "day_end") {
      setTimeout(() => openRecap(), 600);
    }
  }
  if (firstDay) $("recap").classList.add("hidden");
  renderHud(s);
  renderPanel();
  if (selected) loadChart();
}

function connect() {
  const ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  ws.onmessage = (m) => onState(JSON.parse(m.data));
  ws.onclose = () => {
    $("market").textContent = "disconnected · retrying…";
    setTimeout(connect, 2000);
  };
}
connect();

// ---------------------------------------------------------------- animate
const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;
  for (const t of towers.values()) {
    t.alpha += (t.targetAlpha - t.alpha) * Math.min(1, dt * 4);
    t.color.lerp(t.targetColor, Math.min(1, dt * 5));
    t.flash = Math.max(0, t.flash - dt * 1.2);
    const col = t.color.clone().lerp(WHITE, t.flash * 0.7);
    for (const b of [t.beam, t.beamCore]) {
      b.material.uniforms.uColor.value.copy(col);
      b.material.uniforms.uTime.value = time;
    }
    t.beam.material.uniforms.uAlpha.value = Math.min(1, t.alpha * 0.55 + t.flash);
    t.beamCore.material.uniforms.uAlpha.value = Math.min(1, t.alpha + t.flash);
    t.beam.scale.x = t.beam.scale.z = 1 + t.flash * 1.5;
    t.halo.rotation.z += dt * (0.4 + t.alpha * 3);
    t.halo.material.color.copy(t.alpha > 0.05 ? t.color : WHITE);
    if (t.shockT >= 0) {
      t.shockT += dt;
      const k = t.shockT / 1.4;
      t.shock.scale.setScalar(1 + k * 9);
      t.shock.material.opacity = Math.max(0, 0.9 * (1 - k));
      if (k >= 1) { t.shockT = -1; t.shock.material.opacity = 0; }
    }
    if (t.data && t.data.state === "in_trade") t.orb.scale.setScalar(1 + 0.15 * Math.sin(time * 6));
    else t.orb.scale.setScalar(1);
  }
  if (camTween) {
    camTween.t = Math.min(1, camTween.t + dt / 1.1);
    const e = 1 - Math.pow(1 - camTween.t, 3);
    camera.position.lerpVectors(camTween.fromP, camTween.toP, e);
    controls.target.lerpVectors(camTween.fromT, camTween.toT, e);
    if (camTween.t >= 1) camTween = null;
  }
  controls.update();
  composer.render();
  labels.render(scene, camera);
}
frame();

addEventListener("resize", () => {
  HOME.pos = homePos();
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  labels.setSize(innerWidth, innerHeight);
});
