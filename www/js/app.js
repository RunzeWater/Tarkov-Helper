import { t, setLang, getLang, ago } from "./i18n.js";
import * as api from "./api.js";
import { MAP_CONFIG } from "./maps-config.js";

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const fmtNum = (n) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));
const CUR = { RUB: "₽", USD: "$", EUR: "€" };
const money = (n, cur = "RUB") => (n == null || n === 0 ? "—" : cur === "RUB" ? `${fmtNum(n)} ₽` : `${CUR[cur] || ""}${fmtNum(n)}`);
const debounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };

/* ---------- persisted state ---------- */
const STORE_KEY = "tkh.v1";
const DEFAULTS = {
  lang: "zh", mode: "regular", level: 1, faction: "USEC",
  done: {}, objDone: {}, have: {},
  tab: "tasks",
  f: { q: "", trader: "", map: "", status: "available", kappa: false, lk: false },
  mapKey: "customs", mapScope: "available", mapExtracts: true, mapLayer: "sat", mapFloor: {},
  itemScope: "open", itemFir: false,
};
let S = structuredClone(DEFAULTS);
try {
  const raw = localStorage.getItem(STORE_KEY);
  if (raw) { const p = JSON.parse(raw); S = { ...S, ...p, f: { ...S.f, ...(p.f || {}) } }; }
} catch { /* storage blocked: defaults only */ }
const save = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch { /* ignore */ } };

/* ---------- game data ---------- */
const TRADER_ORDER = ["prapor", "therapist", "fence", "skier", "peacekeeper", "mechanic", "ragman", "jaeger", "ref", "lightkeeper", "btr-driver"];
const G = { tasks: [], maps: [], byId: new Map(), unlocks: new Map(), traders: [], fetchedAt: 0, stale: false, ready: false };

function indexData(data) {
  G.tasks = (data.tasks || []).filter(Boolean);
  G.maps = (data.maps || []).filter(Boolean);
  G.byId = new Map(G.tasks.map((x) => [x.id, x]));
  G.unlocks = new Map();
  const tr = new Map();
  for (const task of G.tasks) {
    tr.set(task.trader.normalizedName, task.trader);
    for (const r of task.taskRequirements || []) {
      if (!r?.task) continue;
      if (!G.unlocks.has(r.task.id)) G.unlocks.set(r.task.id, []);
      G.unlocks.get(r.task.id).push(task.id);
    }
  }
  G.traders = [...tr.values()].sort((a, b) => rank(a) - rank(b));
  function rank(x) { const i = TRADER_ORDER.indexOf(x.normalizedName); return i < 0 ? 99 : i; }
  G.tasks.sort((a, b) => rank(a.trader) - rank(b.trader) || (a.minPlayerLevel || 0) - (b.minPlayerLevel || 0) || a.name.localeCompare(b.name));
}

function factionOk(task) { return !task.factionName || task.factionName === "Any" || task.factionName === S.faction; }
function statusOf(task) {
  if (!factionOk(task)) return "na";
  if (S.done[task.id]) return "done";
  if ((task.minPlayerLevel || 0) > S.level) return "locked";
  for (const r of task.taskRequirements || []) {
    if (!r?.task || !G.byId.has(r.task.id)) continue;
    const st = r.status || [];
    if (st.includes("complete") && !st.includes("active") && !S.done[r.task.id]) return "locked";
    if (st.includes("active") && !S.done[r.task.id] && statusOf(G.byId.get(r.task.id)) !== "available") return "locked";
  }
  return "available";
}

function cfgKeyFor(norm) {
  if (!norm) return null;
  if (MAP_CONFIG[norm]) return norm;
  for (const [k, c] of Object.entries(MAP_CONFIG)) if (c.altMaps?.includes(norm)) return k;
  return null;
}
function mapNameFor(key) {
  const m = G.maps.find((x) => cfgKeyFor(x.normalizedName) === key);
  return m ? m.name : key;
}

/** Positions of an objective: [{key, x, z, outline?}] */
function objPoints(o) {
  const pts = [];
  for (const z of o.zones || []) {
    const key = cfgKeyFor(z?.map?.normalizedName);
    if (key && z.position) pts.push({ key, x: z.position.x, z: z.position.z, outline: z.outline });
  }
  for (const pl of o.possibleLocations || []) {
    const key = cfgKeyFor(pl?.map?.normalizedName);
    for (const p of pl?.positions || []) if (key && p) pts.push({ key, x: p.x, z: p.z });
  }
  return pts;
}
function taskMapNames(task) {
  const names = new Set();
  if (task.map) names.add(task.map.name);
  for (const o of task.objectives || []) for (const m of o?.maps || []) names.add(m.name);
  return [...names];
}
function taskOnMap(task, norm) {
  const k = cfgKeyFor(norm);
  const same = (n) => n === norm || (k && cfgKeyFor(n) === k);
  if (task.map && same(task.map.normalizedName)) return true;
  return (task.objectives || []).some((o) => (o?.maps || []).some((m) => same(m.normalizedName)));
}

/* ---------- shell ---------- */
const TABS = [
  ["tasks", "tabTasks", "M4 5h16M4 12h16M4 19h10"],
  ["map", "tabMap", "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14"],
  ["items", "tabItems", "M4 8l8-4 8 4-8 4-8-4zM4 8v8l8 4 8-4V8M12 12v8"],
  ["prices", "tabPrices", "M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.7 5 3.3 5 1.4 5 3.4-2.2 3.3-5 3.3-5-1.2-5-3.1"],
  ["settings", "tabSettings", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L15 3.5h-4l-.3 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L4.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 2.5h4l.3-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4z"],
];

function renderShell() {
  document.title = t("appName");
  $("#app").innerHTML = `
    <header class="top">
      <div class="brand"><span class="brand-mark" aria-hidden="true"></span><h1>${esc(t("appName"))}</h1></div>
      <div id="dataline" class="dataline"></div>
    </header>
    <main id="view" class="view"></main>
    <nav class="tabbar" aria-label="sections">
      ${TABS.map(([id, key, d]) => `<button class="tab" data-tab="${id}" aria-current="${S.tab === id}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg><span>${esc(t(key))}</span></button>`).join("")}
    </nav>
    <div id="sheet" class="sheet" hidden><div class="sheet-backdrop" data-act="close-sheet"></div><section class="sheet-panel" role="dialog" aria-modal="true"><div class="sheet-grip"></div><div id="sheet-body"></div></section></div>
    <div id="viewer" class="viewer" hidden><div id="viewer-map" class="viewer-map"></div><p id="viewer-cap" class="viewer-cap"></p>
      <button class="icon-btn viewer-close" data-act="viewer-close" aria-label="${esc(t("close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>`;
  renderDataline();
}
function renderDataline() {
  const el = $("#dataline");
  if (!el) return;
  if (!G.ready) { el.textContent = ""; return; }
  el.textContent = G.stale ? t("usingCache", { time: ago(G.fetchedAt) }) : t("updated", { time: ago(G.fetchedAt) });
  el.classList.toggle("warn", G.stale);
}
function setTab(tab) {
  S.tab = tab; save();
  document.querySelectorAll(".tab").forEach((b) => b.setAttribute("aria-current", String(b.dataset.tab === tab)));
  renderView();
}
let toastTimer;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

function renderView() {
  destroyMap();
  if (mapFs && S.tab !== "map") exitFullscreenUI();
  const v = $("#view");
  v.className = "view view-" + S.tab;
  if (!G.ready && S.tab !== "settings") { v.innerHTML = loadingHTML(); return; }
  ({ tasks: renderTasks, map: renderMap, items: renderItems, prices: renderPrices, settings: renderSettings })[S.tab]();
}
let loadError = null;
let loadProgress = null;
function progressText() { return loadProgress ? t("loadingProgress", { d: loadProgress[0], n: loadProgress[1] }) : ""; }
function loadingHTML() {
  if (loadError) return `<div class="state"><p>${esc(t("loadFail", { msg: loadError }))}</p><button class="btn" data-act="retry">${esc(t("retry"))}</button></div>`;
  return `<div class="state"><div class="spinner" aria-hidden="true"></div><p>${esc(t("loading"))}</p>
    <p id="load-progress" class="hint">${esc(progressText())}</p><p class="hint">${esc(t("loadingHint"))}</p></div>`;
}
const onProgress = (d, n) => { loadProgress = [d, n]; const p = $("#load-progress"); if (p) p.textContent = progressText(); };

function applyData(r) {
  api.useModel(r.data);
  indexData(r.data);
  G.fetchedAt = r.fetchedAt; G.stale = !!r.stale; G.ready = true;
}

async function loadData(force = false) {
  loadError = null;
  loadProgress = null;
  if (!G.ready) renderView();
  const lang = getLang(), mode = S.mode;
  try {
    const r = await api.loadGameData(lang, mode, { force, onProgress });
    if (lang !== getLang() || mode !== S.mode) return; // settings changed while loading
    applyData(r);
    if (force && r.stale) toast(t("loadFail", { msg: r.error?.message || "" }));
    if (r.fromCache && !r.stale && Date.now() - r.fetchedAt > api.MAX_AGE) backgroundRefresh();
  } catch (e) {
    if (lang !== getLang() || mode !== S.mode) return;
    if (G.ready) toast(t("loadFail", { msg: e.message || String(e) }));
    else loadError = e.message || String(e);
  }
  renderDataline();
  renderView();
}

// Show cached data right away, then quietly download fresh data.
let refreshing = false;
async function backgroundRefresh() {
  if (refreshing) return;
  refreshing = true;
  const lang = getLang(), mode = S.mode;
  try {
    const r = await api.loadGameData(lang, mode, { force: true });
    if (lang !== getLang() || mode !== S.mode || r.stale) return;
    applyData(r);
    renderDataline();
    // don't yank the map or an open detail panel out from under the user
    if (S.tab !== "map" && !sheetOpen) renderView();
  } catch { /* keep using the cached copy */ } finally {
    refreshing = false;
  }
}

/* ---------- tasks ---------- */
const STATUS_KEYS = [["available", "stAvailable"], ["locked", "stLocked"], ["done", "stDone"], ["all", "stAll"]];

function taskMatches(task, q) {
  if (!q) return true;
  const hay = [task.name, task.trader.name, ...(task.objectives || []).flatMap((o) => [o?.description, ...(o?.items || []).map((i) => i?.name), o?.questItem?.name])].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w));
}
function filteredTasks() {
  const f = S.f;
  return G.tasks.filter((task) => {
    const st = statusOf(task);
    if (st === "na") return false;
    if (f.status !== "all" && st !== f.status) return false;
    if (f.trader && task.trader.normalizedName !== f.trader) return false;
    if (f.map && !taskOnMap(task, f.map)) return false;
    if (f.kappa && !task.kappaRequired) return false;
    if (f.lk && !task.lightkeeperRequired) return false;
    return taskMatches(task, f.q);
  });
}
function renderTasks() {
  const f = S.f;
  const seenMap = new Set();
  const mapOpts = G.maps.filter((m) => { const k = cfgKeyFor(m.normalizedName) || m.normalizedName; if (seenMap.has(k)) return false; seenMap.add(k); return true; });
  $("#view").innerHTML = `
    <div class="filters">
      <label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4"/></svg>
        <input id="task-q" type="search" placeholder="${esc(t("search"))}" value="${esc(f.q)}" autocomplete="off"></label>
      <div class="seg" role="group">${STATUS_KEYS.map(([k, l]) => `<button data-act="status" data-v="${k}" aria-pressed="${f.status === k}">${esc(t(l))}</button>`).join("")}</div>
      <div class="row">
        <select id="task-trader" aria-label="${esc(t("trader"))}"><option value="">${esc(t("allTraders"))}</option>
          ${G.traders.map((x) => `<option value="${esc(x.normalizedName)}" ${f.trader === x.normalizedName ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select>
        <select id="task-map" aria-label="${esc(t("map"))}"><option value="">${esc(t("allMaps"))}</option>
          ${mapOpts.map((m) => `<option value="${esc(m.normalizedName)}" ${f.map === m.normalizedName ? "selected" : ""}>${esc(m.name)}</option>`).join("")}</select>
      </div>
      <div class="row chips">
        <button class="chip" data-act="kappa" aria-pressed="${f.kappa}">${esc(t("kappaOnly"))}</button>
        <button class="chip" data-act="lk" aria-pressed="${f.lk}">${esc(t("lkOnly"))}</button>
        <span id="task-count" class="count"></span>
      </div>
    </div>
    <ul id="task-list" class="list"></ul>`;
  renderTaskList();
  $("#task-q").addEventListener("input", debounce((e) => { S.f.q = e.target.value.trim(); save(); renderTaskList(); }, 200));
  $("#task-trader").addEventListener("change", (e) => { S.f.trader = e.target.value; save(); renderTaskList(); });
  $("#task-map").addEventListener("change", (e) => { S.f.map = e.target.value; save(); renderTaskList(); });
}
function objProgress(task) {
  const req = (task.objectives || []).filter((o) => o && !o.optional);
  return [req.filter((o) => S.objDone[o.id] || S.done[task.id]).length, req.length];
}
function renderTaskList() {
  const list = filteredTasks();
  $("#task-count").textContent = t("nTasks", { n: list.length });
  const ul = $("#task-list");
  if (!list.length) { ul.innerHTML = `<li class="empty">${esc(t("noTasks"))}</li>`; return; }
  ul.innerHTML = list.map((task) => {
    const st = statusOf(task);
    const [d, n] = objProgress(task);
    const maps = taskMapNames(task);
    return `<li class="task st-${st}">
      <button class="check" data-act="toggle-done" data-id="${task.id}" aria-pressed="${st === "done"}" aria-label="${esc(st === "done" ? t("markUndone") : t("markDone"))}"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
      <button class="task-main" data-act="open-task" data-id="${task.id}">
        <span class="task-name">${esc(task.name)}</span>
        <span class="task-meta"><b>${esc(task.trader.name)}</b>${maps.length ? ` · ${esc(maps.slice(0, 2).join(" / "))}${maps.length > 2 ? "…" : ""}` : ` · ${esc(t("anyMap"))}`}</span>
        <span class="task-tags">
          <span class="tag lv">LV ${task.minPlayerLevel || 1}</span>
          ${task.kappaRequired ? `<span class="tag k">${esc(t("kappa"))}</span>` : ""}
          ${task.lightkeeperRequired ? `<span class="tag lk">${esc(t("lightkeeper"))}</span>` : ""}
          ${n ? `<span class="tag prog">${d}/${n}</span>` : ""}
        </span>
      </button></li>`;
  }).join("");
}

function setDone(id, value) {
  const task = G.byId.get(id);
  if (!task) return;
  if (value) {
    S.done[id] = true;
    // Completing a quest implies its prerequisite chain is complete too.
    let added = 0;
    const walk = (tk) => {
      for (const r of tk.taskRequirements || []) {
        const p = r?.task && G.byId.get(r.task.id);
        if (p && (r.status || []).includes("complete") && !S.done[p.id] && factionOk(p)) { S.done[p.id] = true; added++; walk(p); }
      }
    };
    walk(task);
    toast(added ? `${t("doneToast", { name: task.name })} · ${t("alsoDone", { n: added })}` : t("doneToast", { name: task.name }));
  } else {
    delete S.done[id];
    toast(t("undoneToast", { name: task.name }));
  }
  save();
}

function itemChip(item, count, extra = "") {
  if (!item) return "";
  return `<button class="ichip" data-act="open-item" data-id="${esc(item.id)}">
    ${item.iconLink ? `<img src="${esc(item.iconLink)}" alt="" loading="lazy">` : ""}
    <span>${esc(item.shortName || item.name)}</span>${count ? `<b>×${count >= 1000 ? fmtNum(count) : count}</b>` : ""}${extra}</button>`;
}
function taskLink(id) {
  const x = G.byId.get(id);
  if (!x) return "";
  const st = statusOf(x);
  return `<button class="tlink st-${st}" data-act="open-task" data-id="${id}"><span class="dot"></span>${esc(x.name)}<small>${esc(x.trader.name)}</small></button>`;
}

function openTask(id) {
  const task = G.byId.get(id);
  if (!task) return;
  const st = statusOf(task);
  const prereqs = (task.taskRequirements || []).filter((r) => r?.task && G.byId.has(r.task.id));
  const unlocks = [...new Set(G.unlocks.get(id) || [])].filter((u) => factionOk(G.byId.get(u)));
  const trReq = (task.traderRequirements || []).filter((r) => r?.trader);
  const objs = (task.objectives || []).filter(Boolean);
  const rew = task.finishRewards || {};
  const html = `
    <div class="sheet-head">
      <div><p class="eyebrow">${esc(task.trader.name)}${task.map ? ` · ${esc(task.map.name)}` : ""}</p>
        <h2>${esc(task.name)}</h2></div>
      <button class="icon-btn" data-act="close-sheet" aria-label="${esc(t("close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </div>
    <div class="facts">
      <div><span>${esc(t("level"))}</span><b>${task.minPlayerLevel || 1}</b></div>
      <div><span>${esc(t("exp"))}</span><b>${fmtNum(task.experience)}</b></div>
      <div><span>${esc(t("tabTasks"))}</span><b class="st-text st-${st}">${esc(t({ available: "stAvailable", locked: "stLocked", done: "stDone" }[st] || "stAll"))}</b></div>
    </div>
    <div class="row chips">
      ${task.kappaRequired ? `<span class="tag k">${esc(t("kappa"))}</span>` : ""}
      ${task.lightkeeperRequired ? `<span class="tag lk">${esc(t("lightkeeper"))}</span>` : ""}
      ${task.factionName && task.factionName !== "Any" ? `<span class="tag">${esc(task.factionName)}</span>` : ""}
    </div>
    <div class="actions">
      <button class="btn ${st === "done" ? "ghost" : ""}" data-act="toggle-done-sheet" data-id="${id}">${esc(st === "done" ? t("markUndone") : t("markDone"))}</button>
      ${task.wikiLink ? `<a class="btn ghost" href="${esc(task.wikiLink)}" target="_blank" rel="noopener">${esc(t("wiki"))} ↗</a>` : ""}
    </div>

    <h3>${esc(t("objectives"))}</h3>
    <ol class="objs">${objs.map((o) => {
      const pts = objPoints(o);
      const items = (o.items || []).filter(Boolean);
      const keys = (o.requiredKeys || []).flat().filter(Boolean);
      const isDone = S.objDone[o.id] || st === "done";
      return `<li class="obj ${isDone ? "is-done" : ""}">
        <button class="check sm" data-act="toggle-obj" data-id="${o.id}" data-task="${id}" aria-pressed="${!!isDone}" ${st === "done" ? "disabled" : ""}><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
        <div class="obj-body">
          <p>${esc(o.description)}${o.optional ? ` <span class="tag">${esc(t("optional"))}</span>` : ""}</p>
          ${items.length || o.questItem || o.markerItem ? `<div class="ichips">
            ${items.slice(0, 6).map((it, i) => itemChip(it, i === 0 ? o.count : 0, i === 0 && o.foundInRaid ? `<em class="fir">FIR</em>` : "")).join("")}
            ${items.length > 6 ? `<span class="more">+${items.length - 6}</span>` : ""}
            ${o.questItem ? `<span class="ichip quest">${o.questItem.iconLink ? `<img src="${esc(o.questItem.iconLink)}" alt="" loading="lazy">` : ""}<span>${esc(o.questItem.name)}</span>${o.count > 1 ? `<b>×${o.count}</b>` : ""}</span>` : ""}
            ${o.markerItem ? itemChip(o.markerItem, 0) : ""}
          </div>` : ""}
          ${keys.length ? `<p class="keys"><span>${esc(t("keys"))}</span> ${keys.map((k) => itemChip(k, 0)).join("")}</p>` : ""}
          ${(o.maps || []).length ? `<p class="obj-maps">${(o.maps || []).map((m) => esc(m.name)).join(" / ")}</p>` : ""}
          ${pts.length ? `<button class="link" data-act="show-on-map" data-task="${id}" data-obj="${o.id}">◎ ${esc(t("showOnMap"))}</button>` : ""}
        </div></li>`;
    }).join("")}</ol>

    ${trReq.length ? `<h3>${esc(t("traderLevel"))}</h3><p class="plain">${trReq.map((r) => `${esc(r.trader.name)} ${r.requirementType === "level" ? "LL" : esc(r.requirementType || "")}${esc(r.compareMethod === ">=" ? "" : r.compareMethod || "")}${r.value}`).join(" · ")}</p>` : ""}

    <h3>${esc(t("prereqs"))}</h3>
    <div class="tlinks">${prereqs.length ? prereqs.map((r) => taskLink(r.task.id)).join("") : `<p class="plain muted">${esc(t("none"))}</p>`}</div>

    <h3>${esc(t("rewards"))}</h3>
    <div class="ichips">
      <span class="ichip"><span>${esc(t("exp"))}</span><b>+${fmtNum(task.experience)}</b></span>
      ${(rew.traderStanding || []).filter((s) => s?.trader).map((s) => `<span class="ichip"><span>${esc(s.trader.name)} ${esc(t("standing"))}</span><b>${s.standing > 0 ? "+" : ""}${s.standing}</b></span>`).join("")}
      ${(rew.items || []).filter((r) => r?.item).map((r) => itemChip(r.item, r.count)).join("")}
    </div>

    ${unlocks.length ? `<h3>${esc(t("unlocks"))}</h3><div class="tlinks">${unlocks.map(taskLink).join("")}</div>` : ""}
  `;
  openSheet(html);
}

/* ---------- sheet (bottom panel) with Android back-button support ---------- */
let sheetOpen = false;
function openSheet(html) {
  $("#sheet-body").innerHTML = html;
  $(".sheet-panel").scrollTop = 0;
  if (sheetOpen) return; // nested views replace the content; Back always closes the sheet
  const sheet = $("#sheet");
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add("open"));
  history.pushState({ sheet: true }, "");
  sheetOpen = true;
}
function hideSheet() {
  const sheet = $("#sheet");
  sheetOpen = false;
  sheet.classList.remove("open");
  setTimeout(() => { if (!sheetOpen) sheet.hidden = true; }, 220);
}
function closeSheet() { if (sheetOpen) history.back(); }
window.addEventListener("popstate", () => {
  if (viewerOpen) { hideViewer(); return; }
  if (sheetOpen) { hideSheet(); return; }
  if (mapFs) exitFullscreenUI();
});

/* ---------- map ---------- */
let LMAP = null;
let pendingFocus = null;
let pendingExtract = null;
let SVGSTATE = null;
let EXTRACT_MARKERS = new Map();
function destroyMap() {
  if (LMAP) { LMAP.remove(); LMAP = null; }
  SVGSTATE = null;
  EXTRACT_MARKERS = new Map();
}

function rotate(latLng, deg) {
  if (!latLng.lng && !latLng.lat) return L.latLng(0, 0);
  if (!deg) return latLng;
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const { lng: x, lat: y } = latLng;
  return L.latLng(x * s + y * c, x * c - y * s);
}
function makeCRS(cfg) {
  const [sx, mx, sy, my] = cfg.transform || [1, 0, 1, 0];
  return L.extend({}, L.CRS.Simple, {
    transformation: new L.Transformation(sx, mx, -sy, my),
    projection: L.extend({}, L.Projection.LonLat, {
      project: (ll) => L.Projection.LonLat.project(rotate(ll, cfg.coordinateRotation)),
      unproject: (p) => rotate(L.Projection.LonLat.unproject(p), -(cfg.coordinateRotation || 0)),
    }),
  });
}
const toBounds = (b) => L.latLngBounds([b[0][1], b[0][0]], [b[1][1], b[1][0]]);
const OBJ_COLORS = { visit: "#6fb0d9", mark: "#e0a43c", plantItem: "#e0a43c", plantQuestItem: "#e0a43c", findQuestItem: "#c97be0", giveQuestItem: "#c97be0", shoot: "#d9604a", extract: "#7fbf6a" };
const objColor = (type) => OBJ_COLORS[type] || "#d8c38f";
const ICONS = {
  fsOn: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  fsOff: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  exits: "M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10",
};
const facKey = (f) => { f = (f || "").toLowerCase(); return f === "pmc" ? "pmc" : f === "scav" ? "scav" : "shared"; };

function mapOptions() {
  const seen = new Set(), out = [];
  for (const m of G.maps) {
    const k = cfgKeyFor(m.normalizedName);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push({ key: k, name: m.name });
  }
  return out;
}
// the map record for a config key; prefer the exact match (factory over night-factory)
function currentMapData(key = S.mapKey) {
  return G.maps.find((x) => x.normalizedName === key) || G.maps.find((x) => cfgKeyFor(x.normalizedName) === key);
}

function renderMap() {
  const opts = mapOptions();
  if (!opts.find((o) => o.key === S.mapKey) && opts.length) S.mapKey = opts[0].key;
  const cfg = MAP_CONFIG[S.mapKey];
  const both = cfg && cfg.tilePath && cfg.svgPath;
  $("#view").innerHTML = `
    <div class="map-bar">
      <select id="map-select" aria-label="${esc(t("mapPick"))}">${opts.map((o) => `<option value="${o.key}" ${o.key === S.mapKey ? "selected" : ""}>${esc(o.name)}</option>`).join("")}</select>
      <div class="seg sm" role="group">
        <button data-act="map-scope" data-v="available" aria-pressed="${S.mapScope === "available"}">${esc(t("mapAvail"))}</button>
        <button data-act="map-scope" data-v="open" aria-pressed="${S.mapScope === "open"}">${esc(t("mapOpen"))}</button>
      </div>
      <button class="chip" data-act="map-extracts" aria-pressed="${S.mapExtracts}">${esc(t("mapExtracts"))}</button>
      ${both ? `<button class="chip" data-act="map-layer">${esc(S.mapLayer === "sat" ? t("layerAbs") : t("layerSat"))}</button>` : ""}
    </div>
    <div class="map-wrap"><div id="leaflet" class="leaflet-host"></div>
      <div class="map-ctrls">
        <button id="fs-btn" class="map-btn" data-act="map-fs" aria-label="${esc(t(mapFs ? "fsExit" : "fsEnter"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${mapFs ? ICONS.fsOff : ICONS.fsOn}"/></svg></button>
        <button class="map-btn" data-act="extract-list" aria-label="${esc(t("exList"))}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS.exits}"/></svg></button>
        <select id="floor-select" class="map-floor" aria-label="${esc(t("floor"))}" hidden></select>
      </div>
      <div id="map-note" class="map-note" hidden></div>
      <div class="legend">
        <span><i style="background:${objColor("visit")}"></i>${esc(t("lgVisit"))}</span>
        <span><i style="background:${objColor("mark")}"></i>${esc(t("lgMark"))}</span>
        <span><i style="background:${objColor("findQuestItem")}"></i>${esc(t("lgQuestItem"))}</span>
        <span><i style="background:${objColor("shoot")}"></i>${esc(t("lgKill"))}</span>
        ${S.mapExtracts ? `<span><i class="sq"></i>${esc(t("mapExtracts"))}</span><span><i class="sq tr"></i>${esc(t("fac_transit"))}</span><span class="lg-hint">${esc(t("lgTap"))}</span>` : ""}
      </div></div>`;
  $("#map-select").addEventListener("change", (e) => { S.mapKey = e.target.value; save(); renderView(); });
  if (!cfg || !window.L) { const n = $("#map-note"); n.hidden = false; n.textContent = t("mapNotSupported"); return; }
  buildLeaflet(cfg);
}

function buildLeaflet(cfg) {
  const bounds = toBounds(cfg.bounds);
  // zoomSnap 0.5: at half steps Leaflet uses the next tile level and scales it down, so tiles stay sharp
  const map = (LMAP = L.map("leaflet", {
    crs: makeCRS(cfg), minZoom: cfg.minZoom, maxZoom: cfg.maxZoom,
    zoomSnap: 0.5, zoomDelta: 0.5, attributionControl: false, maxBounds: bounds.pad(0.6), maxBoundsViscosity: 0.8,
  }));
  const useTiles = cfg.tilePath && (S.mapLayer === "sat" || !cfg.svgPath);
  if (useTiles) addTiles(cfg, bounds);
  else if (cfg.svgPath) addSvg(cfg, bounds, map);
  map.fitBounds(bounds);

  if (S.mapExtracts) addExtracts(map);

  const byObj = new Map();
  let count = 0;
  for (const task of G.tasks) {
    const st = statusOf(task);
    if (st === "na" || st === "done") continue;
    if (S.mapScope === "available" && st !== "available") continue;
    for (const o of task.objectives || []) {
      if (!o || S.objDone[o.id]) continue;
      const pts = objPoints(o).filter((p) => p.key === S.mapKey);
      if (!pts.length) continue;
      const color = objColor(o.type);
      const popup = `<div class="pop"><p class="eyebrow">${esc(task.trader.name)}</p><b>${esc(task.name)}</b><p>${esc(o.description)}</p>
        <button class="btn sm" data-act="open-task" data-id="${task.id}">${esc(t("viewTask"))}</button></div>`;
      const layers = [];
      for (const p of pts) {
        if (p.outline?.length > 2) {
          layers.push(L.polygon(p.outline.map((q) => [q.z, q.x]), { color, weight: 1.5, fillOpacity: 0.18 }).bindPopup(popup).addTo(map));
        }
        layers.push(L.circleMarker([p.z, p.x], { radius: 7, color: "#17150f", weight: 2, fillColor: color, fillOpacity: 1 }).bindPopup(popup).addTo(map));
        count++;
      }
      byObj.set(o.id, layers);
    }
  }
  if (!count) { const n = $("#map-note"); n.hidden = false; n.textContent = t("mapNoMarkers"); }

  if (pendingFocus) {
    const layers = byObj.get(pendingFocus) || [];
    const mk = layers.find((l) => l instanceof L.CircleMarker);
    if (mk) { map.setView(mk.getLatLng(), Math.min(cfg.maxZoom, cfg.minZoom + 2)); setTimeout(() => mk.openPopup(), 150); }
    pendingFocus = null;
  }
  if (pendingExtract) {
    const { kind, id } = pendingExtract;
    pendingExtract = null;
    setTimeout(() => focusExtract(kind, id), 100);
  }
}

// High-density screens get tiles from one zoom level deeper drawn at half size (what Leaflet's
// detectRetina does), capped so we never ask for tiles beyond the deepest level that exists.
function addTiles(cfg, bounds) {
  const ts = cfg.tileSize || 256;
  const retina = (window.devicePixelRatio || 1) >= 1.5 && cfg.maxZoom > cfg.minZoom;
  L.tileLayer(cfg.tilePath, retina
    ? { tileSize: ts / 2, zoomOffset: 1, bounds, maxNativeZoom: cfg.maxZoom - 1, maxZoom: cfg.maxZoom }
    : { tileSize: ts, bounds, maxNativeZoom: cfg.maxZoom, maxZoom: cfg.maxZoom }).addTo(LMAP);
}

/* The abstract maps are SVGs with one group per floor. Drawn as an <img> every floor shows at
   once; inlined, we can show the ground floor and let the user switch floors. */
const svgCache = new Map();
function scopeCss(css, scope) {
  return css.replace(/([^{}]+)\{/g, (m, sel) => {
    const x = sel.trim();
    if (!x || x.startsWith("@") || /^(from|to|\d+%)$/.test(x)) return m;
    return x.split(",").map((part) => `${scope} ${part.trim()}`).join(", ") + " {";
  });
}
async function addSvg(cfg, bounds, map) {
  const b = cfg.svgBounds ? toBounds(cfg.svgBounds) : bounds;
  let text = svgCache.get(cfg.svgPath);
  if (!text) {
    try {
      const r = await fetch(cfg.svgPath);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      text = await r.text();
      if (!/<svg[\s>]/i.test(text)) throw new Error("not svg");
      svgCache.set(cfg.svgPath, text);
    } catch { text = null; }
  }
  if (map !== LMAP) return; // the user already switched maps
  const fallback = () => L.imageOverlay(cfg.svgPath, b, { className: "svg-base" }).addTo(map).bringToBack();
  if (!text) { fallback(); return; }
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  el.innerHTML = text;
  const inner = el.querySelector("svg");
  if (!inner) { fallback(); return; }
  el.setAttribute("viewBox", inner.getAttribute("viewBox") || "");
  el.classList.add("tkh-svg");
  for (const st of el.querySelectorAll("style")) st.textContent = scopeCss(st.textContent, ".tkh-svg");
  const groups = [...inner.children].filter((c) => c.nodeName.toLowerCase() === "g" && c.id);
  const base = cfg.svgLayer || (groups[0] && groups[0].id);
  const withBase = (g) => g.id === base || g.dataset.keepWithGroup === base;
  const levels = groups.filter((g) => !withBase(g) && !g.dataset.keepWithGroup);
  L.svgOverlay(el, b, { interactive: false }).addTo(map).bringToBack();
  SVGSTATE = { groups, base, withBase, levels };
  applyFloor();
  const sel = $("#floor-select");
  if (sel && levels.length) {
    const cur = S.mapFloor[S.mapKey] || "";
    sel.innerHTML = [`<option value="">${esc(floorName(base))}</option>`, ...levels.map((g) => `<option value="${esc(g.id)}" ${g.id === cur ? "selected" : ""}>${esc(floorName(g.id))}</option>`)].join("");
    sel.hidden = false;
    sel.onchange = (e) => { S.mapFloor[S.mapKey] = e.target.value; save(); applyFloor(); };
  }
}
function applyFloor() {
  if (!SVGSTATE) return;
  const want = S.mapFloor[S.mapKey] || "";
  const active = SVGSTATE.levels.some((g) => g.id === want) ? want : "";
  for (const g of SVGSTATE.groups) {
    if (SVGSTATE.withBase(g)) { g.style.display = ""; g.style.opacity = active ? "0.3" : ""; }
    else g.style.display = active && (g.id === active || g.dataset.keepWithGroup === active) ? "" : "none";
  }
}
const FLOOR_ZH = { Ground_Level: "地面", Ground_Floor: "地面", Underground_Level: "地下", Underground: "地下", Basement: "地下室", Basement_Level: "地下室",
  First_Floor: "一楼", Second_Floor: "二楼", Third_Floor: "三楼", Fourth_Floor: "四楼", Fifth_Floor: "五楼", Roof: "屋顶", Rooftop: "屋顶", Rooftops: "屋顶",
  Tunnels: "隧道", Bunker: "地堡", Bunkers: "地堡" };
const floorName = (id) => (getLang() === "zh" && FLOOR_ZH[id]) || String(id || "").replace(/_/g, " ");

/* ---------- extracts ---------- */
function addExtracts(map) {
  const m = currentMapData();
  if (!m) return;
  const add = (e, kind) => {
    if (!e?.position) return;
    const cls = kind === "transit" ? "transit" : facKey(e.faction);
    const mk = L.marker([e.position.z, e.position.x], {
      icon: L.divIcon({ className: `exfil ${cls}`, html: `<span>${esc(e.name)}</span>`, iconSize: null }),
      keyboard: false, riseOnHover: true,
    }).addTo(map);
    mk.on("click", () => openExtract(kind, e.id));
    EXTRACT_MARKERS.set(`${kind}:${e.id}`, mk);
  };
  for (const e of m.extracts || []) add(e, "extract");
  for (const x of m.transits || []) add(x, "transit");
}

function findExtract(m, kind, id) {
  return ((kind === "transit" ? m.transits : m.extracts) || []).find((x) => String(x.id) === String(id));
}

let exToken = 0;
function openExtract(kind, id, fromList = false) {
  const m = currentMapData();
  const e = m && findExtract(m, kind, id);
  if (!e) return;
  if (LMAP) LMAP.closePopup();
  const fac = kind === "transit" ? "transit" : facKey(e.faction);
  const title = api.wikiTitle(m);
  const conds = [];
  if (kind === "transit" && e.targetName) conds.push(`<li>${esc(t("exTransitTo", { map: e.targetName }))}</li>`);
  if (e.switches?.length) conds.push(`<li><span>${esc(t("exSwitch"))}</span><b>${e.switches.map(esc).join(" / ")}</b></li>`);
  if (e.transferItem) conds.push(`<li><span>${esc(t("exPay"))}</span>${itemChip(e.transferItem.item, e.transferItem.count)}</li>`);
  openSheet(`
    <div class="sheet-head">
      <div><p class="eyebrow">${esc(m.name)} · <span class="fac fac-${fac}">${esc(t("fac_" + fac))}</span></p>
        <h2>${esc(e.name)}</h2>${e.nameEn && e.nameEn !== e.name ? `<p class="sub-name">${esc(e.nameEn)}</p>` : ""}</div>
      <button class="icon-btn" data-act="close-sheet" aria-label="${esc(t("close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </div>
    <div id="ex-photo" class="ex-photo"><div class="spinner" aria-hidden="true"></div><span>${esc(t("exWikiLoading"))}</span></div>
    <div id="ex-facts"></div>
    ${conds.length ? `<h3>${esc(t("exConditions"))}</h3><ul class="conds">${conds.join("")}</ul>` : ""}
    <div id="ex-wiki"></div>
    <div class="actions">
      ${fromList ? `<button class="btn" data-act="ex-locate" data-kind="${kind}" data-id="${esc(e.id)}">${esc(t("exLocate"))}</button>` : ""}
      ${title ? `<a class="btn ghost" href="${esc(api.wikiPageUrl(title, kind === "transit" ? "Transits" : "Extractions"))}" target="_blank" rel="noopener">Wiki ↗</a>` : ""}
    </div>`);
  const token = ++exToken;
  api.wikiExtracts(title)
    .then((rows) => { if (token === exToken && sheetOpen) renderExtractWiki(api.matchWiki(rows, e, kind), e); })
    .catch(() => { if (token === exToken && sheetOpen) renderExtractWiki(undefined, e); });
}

function renderExtractWiki(w, e) {
  const photo = $("#ex-photo"), facts = $("#ex-facts"), box = $("#ex-wiki");
  if (!photo) return;
  const note = (key) => { photo.className = "ex-photo empty"; photo.innerHTML = `<span>${esc(t(key))}</span>`; };
  if (w === undefined) { note("exWikiFail"); return; }
  if (!w) { note("exWikiNone"); return; }
  if (w.image) {
    photo.className = "ex-photo";
    photo.innerHTML = `<button class="ex-photo-btn" data-act="view-photo" data-src="${esc(api.wikiImage(w.image, 1600))}" data-cap="${esc(e.name)}">
      <img src="${esc(api.wikiImage(w.image, 800))}" alt="${esc(e.name)}" referrerpolicy="no-referrer" decoding="async"><span class="zoom-hint">${esc(t("tapToEnlarge"))}</span></button>`;
    photo.querySelector("img").addEventListener("error", () => note("imgFail"));
  } else note("exNoPhoto");
  const zhFaction = (s) => (getLang() === "zh" ? s.replace(/^All$/i, "全部") : s);
  facts.innerHTML = `<div class="facts">
    <div><span>${esc(t("exFaction"))}</span><b class="sm">${esc(zhFaction(w.faction) || "—")}</b></div>
    <div><span>${esc(t("exAlways"))}</span><b class="sm">${esc(w.always || "—")}</b></div>
    <div><span>${esc(t("exSingle"))}</span><b class="sm">${esc(w.single || "—")}</b></div></div>`;
  const req = w.requirements && w.requirements !== "-" ? w.requirements : "";
  box.innerHTML = req || w.notes ? `<h3>${esc(t("exWikiInfo"))}</h3>
    ${req ? `<p class="wiki-line"><span>${esc(t("exReq"))}</span>${esc(req)}</p>` : ""}
    ${w.notes ? `<p class="wiki-line"><span>${esc(t("exNotes"))}</span>${esc(w.notes)}</p>` : ""}
    ${getLang() === "zh" ? `<p class="hint">${esc(t("exWikiEnglish"))}</p>` : ""}` : "";
}

function openExtractList() {
  const m = currentMapData();
  if (!m) return;
  const ex = m.extracts || [];
  const groups = [
    ["pmc", ex.filter((e) => facKey(e.faction) === "pmc")],
    ["shared", ex.filter((e) => facKey(e.faction) === "shared")],
    ["scav", ex.filter((e) => facKey(e.faction) === "scav")],
    ["transit", m.transits || []],
  ].filter(([, list]) => list.length);
  const badges = (e) => {
    const b = [];
    if (e.switches?.length) b.push(t("badgeSwitch"));
    if (e.transferItem) b.push(t("badgePaid"));
    return b.length ? `<small>${b.map(esc).join(" · ")}</small>` : "";
  };
  openSheet(`
    <div class="sheet-head"><div><p class="eyebrow">${esc(m.name)}</p><h2>${esc(t("exList"))}</h2></div>
      <button class="icon-btn" data-act="close-sheet" aria-label="${esc(t("close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <p class="hint">${esc(t("exListHint"))}</p>
    ${groups.length ? groups.map(([fac, list]) => `<h3>${esc(t("fac_" + fac))} · ${list.length}</h3><div class="ex-rows">${list.map((e) => `
      <button class="ex-row" data-act="open-extract" data-kind="${fac === "transit" ? "transit" : "extract"}" data-id="${esc(e.id)}">
        <span class="dot fac-${fac}"></span><span class="ex-row-name">${esc(e.name)}</span>${badges(e)}</button>`).join("")}</div>`).join("")
      : `<p class="plain muted">${esc(t("none"))}</p>`}`);
}

function focusExtract(kind, id) {
  if (!LMAP) return;
  const mk = EXTRACT_MARKERS.get(`${kind}:${id}`);
  if (!mk) {
    if (!S.mapExtracts) { S.mapExtracts = true; save(); pendingExtract = { kind, id }; renderView(); }
    return;
  }
  const cfg = MAP_CONFIG[S.mapKey];
  LMAP.setView(mk.getLatLng(), Math.max(LMAP.getZoom(), Math.min(cfg.maxZoom, cfg.minZoom + 2)));
  const el = mk.getElement();
  if (el) { el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
}

/* ---------- full-screen map ---------- */
// Capacitor's WebView ignores the browser Fullscreen API, so the map simply covers the whole app.
let mapFs = false;
function setFsButton() {
  const b = $("#fs-btn");
  if (!b) return;
  b.setAttribute("aria-label", t(mapFs ? "fsExit" : "fsEnter"));
  b.querySelector("path").setAttribute("d", mapFs ? ICONS.fsOff : ICONS.fsOn);
}
function enterFullscreen() {
  if (mapFs) return;
  mapFs = true;
  document.body.classList.add("map-fs");
  history.pushState({ fs: true }, "");
  setFsButton();
  setTimeout(() => LMAP && LMAP.invalidateSize(), 60);
}
function exitFullscreenUI() {
  mapFs = false;
  document.body.classList.remove("map-fs");
  setFsButton();
  setTimeout(() => LMAP && LMAP.invalidateSize(), 60);
}

/* ---------- photo viewer (pinch to zoom) ---------- */
let VMAP = null;
let viewerOpen = false;
function openViewer(src, caption) {
  if (!src) return;
  const v = $("#viewer");
  v.hidden = false;
  $("#viewer-cap").textContent = caption || "";
  if (!viewerOpen) { viewerOpen = true; history.pushState({ viewer: true }, ""); }
  if (VMAP) { VMAP.remove(); VMAP = null; }
  const img = new Image();
  img.referrerPolicy = "no-referrer";
  img.onload = () => {
    if (!viewerOpen) return;
    const w = img.naturalWidth, h = img.naturalHeight;
    const b = L.latLngBounds([0, 0], [h, w]);
    VMAP = L.map("viewer-map", { crs: L.CRS.Simple, zoomSnap: 0, attributionControl: false, zoomControl: false, maxBoundsViscosity: 1 });
    L.imageOverlay(src, b).addTo(VMAP);
    VMAP.fitBounds(b);
    const z = VMAP.getZoom();
    VMAP.setMinZoom(z);
    VMAP.setMaxZoom(z + 3);
    VMAP.setMaxBounds(b);
  };
  img.onerror = () => { toast(t("imgFail")); if (viewerOpen) history.back(); };
  img.src = src;
}
function hideViewer() {
  viewerOpen = false;
  $("#viewer").hidden = true;
  if (VMAP) { VMAP.remove(); VMAP = null; }
}

function showOnMap(taskId, objId) {
  const task = G.byId.get(taskId);
  const o = task?.objectives.find((x) => x?.id === objId);
  const p = o && objPoints(o)[0];
  if (!p) return;
  // make sure the marker will be drawn even if the objective was ticked or the quest is locked
  if (S.objDone[objId]) { delete S.objDone[objId]; }
  if (statusOf(task) !== "available") S.mapScope = "open";
  S.mapKey = p.key; pendingFocus = objId; save();
  if (sheetOpen) closeSheet();
  setTab("map");
}

/* ---------- items needed for quests ---------- */
function neededItems() {
  const groups = new Map();
  for (const task of G.tasks) {
    const st = statusOf(task);
    if (st === "na" || st === "done") continue;
    if (S.itemScope === "available" && st !== "available") continue;
    for (const o of task.objectives || []) {
      if (!o || S.objDone[o.id]) continue;
      if (o.type !== "giveItem" && o.type !== "plantItem") continue;
      const items = (o.items || []).filter(Boolean);
      if (!items.length) continue;
      if (S.itemFir && !o.foundInRaid) continue;
      const key = items.map((i) => i.id).sort().join("|") + (o.foundInRaid ? ":fir" : "");
      if (!groups.has(key)) groups.set(key, { key, item: items[0], alts: items.length - 1, fir: !!o.foundInRaid, need: 0, tasks: [] });
      const g = groups.get(key);
      g.need += o.count || 1;
      if (!g.tasks.includes(task.id)) g.tasks.push(task.id);
    }
  }
  return [...groups.values()].sort((a, b) => (b.need - (S.have[b.key] || 0)) - (a.need - (S.have[a.key] || 0)) || a.item.name.localeCompare(b.item.name));
}
function renderItems() {
  $("#view").innerHTML = `
    <div class="filters">
      <p class="hint">${esc(t("itemsHint"))}</p>
      <div class="seg" role="group">
        <button data-act="item-scope" data-v="available" aria-pressed="${S.itemScope === "available"}">${esc(t("scopeAvail"))}</button>
        <button data-act="item-scope" data-v="open" aria-pressed="${S.itemScope === "open"}">${esc(t("scopeOpen"))}</button>
      </div>
      <div class="row chips"><button class="chip" data-act="item-fir" aria-pressed="${S.itemFir}">${esc(t("itemsFirOnly"))}</button><span id="item-count" class="count"></span></div>
    </div>
    <ul id="item-list" class="list items"></ul>`;
  renderItemList();
}
function renderItemList() {
  const rows = neededItems();
  $("#item-count").textContent = `${rows.length}`;
  const ul = $("#item-list");
  if (!rows.length) { ul.innerHTML = `<li class="empty">${esc(t("noItems"))}</li>`; return; }
  ul.innerHTML = rows.map((g) => {
    const have = Math.min(S.have[g.key] || 0, g.need);
    const left = g.need - have;
    return `<li class="need ${left === 0 ? "complete" : ""}">
      <button class="need-icon" data-act="open-item" data-id="${esc(g.item.id)}" aria-label="${esc(g.item.name)}">${g.item.iconLink ? `<img src="${esc(g.item.iconLink)}" alt="" loading="lazy">` : ""}</button>
      <div class="need-main">
        <button class="need-name" data-act="open-item" data-id="${esc(g.item.id)}">${esc(g.item.name)}${g.alts ? ` <small>+${g.alts}</small>` : ""}</button>
        <div class="need-tasks">${g.fir ? `<em class="fir">FIR</em>` : ""}${g.tasks.slice(0, 3).map((id) => `<button data-act="open-task" data-id="${id}">${esc(G.byId.get(id).name)}</button>`).join("")}${g.tasks.length > 3 ? `<span>+${g.tasks.length - 3}</span>` : ""}</div>
      </div>
      <div class="stepper">
        <button data-act="have" data-k="${esc(g.key)}" data-d="-1" aria-label="−">−</button>
        <span class="num"><b>${have}</b>/${g.need}</span>
        <button data-act="have" data-k="${esc(g.key)}" data-d="1" aria-label="+">+</button>
      </div></li>`;
  }).join("");
}

/* ---------- prices ---------- */
const POPULAR = ["59faff1d86f7746c51718c9c", "57347ca924597744596b4e71", "5c0530ee86f774697952d952", "5d1b376e86f774252519444e", "5c0e874186f7745dc7616606", "59e3577886f774176a362503"];
let lastPriceQuery = "";
let priceResults = null;
function bestTrader(item) {
  const offers = (item.sellFor || []).filter((s) => s.vendor?.normalizedName !== "flea-market");
  return offers.sort((a, b) => (b.priceRUB || 0) - (a.priceRUB || 0))[0];
}
function renderPrices() {
  $("#view").innerHTML = `
    <div class="filters">
      <label class="search"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4"/></svg>
        <input id="price-q" type="search" placeholder="${esc(t("priceSearch"))}" value="${esc(lastPriceQuery)}" autocomplete="off"></label>
      <p class="hint">${esc(t("priceHint"))}</p>
    </div>
    <ul id="price-list" class="list prices"></ul>`;
  const run = debounce((q) => {
    lastPriceQuery = q;
    if (!searchable(q)) { showPopular(); return; }
    priceResults = api.searchItems(q);
    paintPrices(priceResults);
  }, 200);
  $("#price-q").addEventListener("input", (e) => run(e.target.value.trim()));
  if (searchable(lastPriceQuery) && priceResults) paintPrices(priceResults); else showPopular();
}
// two Latin characters, or a single Chinese character, is enough to search
const searchable = (q) => q.length >= 2 || /[㐀-鿿]/.test(q);
function setPriceList(html) { const ul = $("#price-list"); if (ul) ul.innerHTML = html; }
function showPopular() {
  paintPrices(api.itemsByIds(POPULAR), true);
}
function paintPrices(items, popular = false) {
  if (!items.length) { setPriceList(`<li class="empty">${esc(t("noResult"))}</li>`); return; }
  setPriceList((popular ? `<li class="sub">${esc(t("popular"))}</li>` : "") + items.map((it) => {
    const bt = bestTrader(it);
    const ch = it.changeLast48hPercent;
    const slots = (it.width || 1) * (it.height || 1);
    return `<li><button class="price-row" data-act="open-item" data-id="${esc(it.id)}">
      <span class="pic">${it.iconLink ? `<img src="${esc(it.iconLink)}" alt="" loading="lazy">` : ""}</span>
      <span class="pr-main"><b>${esc(it.name)}</b><small>${bt ? `${esc(t("bestSell"))}: ${esc(bt.vendor.name)} ${money(bt.price, bt.currency)}` : ""}</small></span>
      <span class="pr-num"><b>${money(it.avg24hPrice || it.lastLowPrice)}</b>
        <small>${ch != null ? `<span class="${ch >= 0 ? "up" : "down"}">${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch).toFixed(1)}%</span>` : ""}${slots > 1 && it.avg24hPrice ? ` · ${money(it.avg24hPrice / slots)}/${esc(t("perSlot"))}` : ""}</small></span>
    </button></li>`;
  }).join(""));
}
function barterHTML(b) {
  const side = (arr) => arr.filter((x) => x?.item).map((x) => itemChip(x.item, x.count)).join("");
  return `<li class="barter"><p class="eyebrow">${esc(b.trader?.name)} · ${esc(t("lv", { n: b.level }))}${b.buyLimit ? ` · max ${b.buyLimit}` : ""}</p>
    <div class="bx"><div class="ichips">${side(b.requiredItems || [])}</div><span class="arrow">→</span><div class="ichips">${side(b.rewardItems || [])}</div></div></li>`;
}
function openItem(id) {
  openSheet(`<div class="state"><div class="spinner"></div></div>`);
  const it = api.itemDetail(id);
  if (!it) { $("#sheet-body").innerHTML = `<div class="state"><p>${esc(t("noResult"))}</p></div>`; return; }
  const sells = (it.sellFor || []).slice().sort((a, b) => (b.priceRUB || 0) - (a.priceRUB || 0));
  const buys = (it.buyFor || []).slice().sort((a, b) => (a.priceRUB || 0) - (b.priceRUB || 0));
  const ch = it.changeLast48hPercent;
  const vendorLabel = (o) => `${esc(o.vendor?.name)}${o.vendor?.minTraderLevel ? ` <small>${esc(t("lv", { n: o.vendor.minTraderLevel }))}</small>` : ""}${o.vendor?.taskUnlock ? ` <small>🔒 ${esc(o.vendor.taskUnlock.name)}</small>` : ""}`;
  $("#sheet-body").innerHTML = `
    <div class="sheet-head">
      <div class="item-head">${it.iconLink ? `<img src="${esc(it.iconLink)}" alt="">` : ""}<div><p class="eyebrow">${esc(it.shortName)}</p><h2>${esc(it.name)}</h2></div></div>
      <button class="icon-btn" data-act="close-sheet" aria-label="${esc(t("close"))}"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    </div>
    <div class="facts">
      <div><span>${esc(t("avg24"))}</span><b>${money(it.avg24hPrice)}</b></div>
      <div><span>${esc(t("lastLow"))}</span><b>${money(it.lastLowPrice)}</b></div>
      <div><span>${esc(t("change48"))}</span><b class="${ch >= 0 ? "up" : "down"}">${ch != null ? `${ch >= 0 ? "+" : ""}${ch.toFixed(1)}%` : "—"}</b></div>
    </div>
    ${it.wikiLink ? `<div class="actions"><a class="btn ghost" href="${esc(it.wikiLink)}" target="_blank" rel="noopener">${esc(t("wiki"))} ↗</a></div>` : ""}
    <h3>${esc(t("sellTo"))}</h3>
    <table class="tbl"><tbody>${sells.map((o) => `<tr><td>${vendorLabel(o)}</td><td class="r">${money(o.price, o.currency)}${o.currency !== "RUB" ? ` <small>${money(o.priceRUB)}</small>` : ""}</td></tr>`).join("") || `<tr><td class="muted">${esc(t("none"))}</td></tr>`}</tbody></table>
    <h3>${esc(t("buyFrom"))}</h3>
    <table class="tbl"><tbody>${buys.map((o) => `<tr><td>${vendorLabel(o)}</td><td class="r">${money(o.price, o.currency)}${o.currency !== "RUB" ? ` <small>${money(o.priceRUB)}</small>` : ""}</td></tr>`).join("") || `<tr><td class="muted">${esc(t("none"))}</td></tr>`}</tbody></table>
    ${(it.bartersFor || []).length ? `<h3>${esc(t("bartersFor"))}</h3><ul class="barters">${it.bartersFor.map(barterHTML).join("")}</ul>` : ""}
    ${(it.bartersUsing || []).length ? `<h3>${esc(t("bartersUsing"))}</h3><ul class="barters">${it.bartersUsing.slice(0, 12).map(barterHTML).join("")}</ul>` : ""}
    ${(it.usedInTasks || []).length ? `<h3>${esc(t("usedInTasks"))}</h3><div class="tlinks">${it.usedInTasks.map((x) => G.byId.has(x.id) ? taskLink(x.id) : `<span class="tlink">${esc(x.name)}</span>`).join("")}</div>` : ""}
  `;
}

/* ---------- settings ---------- */
let resetArmed = false;
function renderSettings() {
  const exportText = JSON.stringify({ v: 1, done: Object.keys(S.done), objDone: Object.keys(S.objDone), have: S.have, level: S.level, faction: S.faction });
  $("#view").innerHTML = `
    <div class="settings">
      <section><h3>${esc(t("settings"))}</h3>
        <div class="field"><span>${esc(t("language"))}</span><div class="seg sm">
          <button data-act="lang" data-v="zh" aria-pressed="${getLang() === "zh"}">中文</button>
          <button data-act="lang" data-v="en" aria-pressed="${getLang() === "en"}">English</button></div></div>
        <div class="field"><span>${esc(t("gameMode"))}</span><div class="seg sm">
          <button data-act="mode" data-v="regular" aria-pressed="${S.mode === "regular"}">${esc(t("pvp"))}</button>
          <button data-act="mode" data-v="pve" aria-pressed="${S.mode === "pve"}">${esc(t("pve"))}</button></div></div>
        <div class="field"><span>${esc(t("faction"))}</span><div class="seg sm">
          <button data-act="faction" data-v="USEC" aria-pressed="${S.faction === "USEC"}">USEC</button>
          <button data-act="faction" data-v="BEAR" aria-pressed="${S.faction === "BEAR"}">BEAR</button></div></div>
        <div class="field"><label for="lvl">${esc(t("playerLevel"))}</label>
          <div class="stepper"><button data-act="lvl" data-d="-1">−</button><input id="lvl" type="number" inputmode="numeric" min="1" max="79" value="${S.level}"><button data-act="lvl" data-d="1">+</button></div></div>
      </section>
      <section><h3>${esc(t("data"))}</h3>
        <p class="plain muted">${G.ready ? esc(t("updated", { time: ago(G.fetchedAt) })) : ""}</p>
        <button class="btn" data-act="refresh">${esc(t("refresh"))}</button>
      </section>
      <section><h3>${esc(t("progress"))}</h3>
        <p class="plain muted">${esc(t("exportHint"))}</p>
        <textarea id="progress-text" rows="4" spellcheck="false">${esc(exportText)}</textarea>
        <div class="actions">
          <button class="btn ghost" data-act="copy-progress">${esc(t("copy"))}</button>
          <button class="btn ghost" data-act="import-progress">${esc(t("importP"))}</button>
          <button class="btn danger" data-act="reset">${esc(t("reset"))}</button>
        </div>
      </section>
      <section><h3>${esc(t("about"))}</h3><p class="plain muted">${esc(t("aboutText"))}</p>
        <p class="plain"><a href="https://tarkov.dev" target="_blank" rel="noopener">tarkov.dev ↗</a></p></section>
    </div>`;
  $("#lvl").addEventListener("change", (e) => { S.level = Math.max(1, Math.min(79, parseInt(e.target.value, 10) || 1)); save(); e.target.value = S.level; });
}

/* ---------- event delegation ---------- */
document.addEventListener("click", async (e) => {
  const tabBtn = e.target.closest("[data-tab]");
  if (tabBtn) { if (sheetOpen) closeSheet(); setTab(tabBtn.dataset.tab); return; }
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act, v = el.dataset.v, id = el.dataset.id;
  switch (act) {
    case "retry": loadData(true); break;
    case "close-sheet": closeSheet(); break;
    case "status": S.f.status = v; save(); renderTasks(); break;
    case "kappa": S.f.kappa = !S.f.kappa; save(); renderTasks(); break;
    case "lk": S.f.lk = !S.f.lk; save(); renderTasks(); break;
    case "open-task": if (LMAP) LMAP.closePopup(); openTask(id); break;
    case "toggle-done": setDone(id, !S.done[id]); renderTaskList(); break;
    case "toggle-done-sheet": setDone(id, !S.done[id]); openTask(id); refreshUnderlying(); break;
    case "toggle-obj": {
      if (S.objDone[id]) delete S.objDone[id]; else S.objDone[id] = true;
      save(); openTask(el.dataset.task); refreshUnderlying(); break;
    }
    case "show-on-map": showOnMap(el.dataset.task, el.dataset.obj); break;
    case "map-scope": S.mapScope = v; save(); renderView(); break;
    case "map-extracts": S.mapExtracts = !S.mapExtracts; save(); renderView(); break;
    case "map-layer": S.mapLayer = S.mapLayer === "sat" ? "svg" : "sat"; save(); renderView(); break;
    case "map-fs": if (mapFs) history.back(); else enterFullscreen(); break;
    case "extract-list": openExtractList(); break;
    case "open-extract": openExtract(el.dataset.kind, id, true); break;
    case "ex-locate": { const kind = el.dataset.kind; closeSheet(); setTimeout(() => focusExtract(kind, id), 260); break; }
    case "view-photo": openViewer(el.dataset.src, el.dataset.cap); break;
    case "viewer-close": if (viewerOpen) history.back(); break;
    case "item-scope": S.itemScope = v; save(); renderItems(); break;
    case "item-fir": S.itemFir = !S.itemFir; save(); renderItems(); break;
    case "have": {
      const k = el.dataset.k; const g = neededItems().find((x) => x.key === k);
      const n = Math.max(0, Math.min(g ? g.need : 999, (S.have[k] || 0) + parseInt(el.dataset.d, 10)));
      if (n) S.have[k] = n; else delete S.have[k];
      save(); renderItemList(); break;
    }
    case "open-item": openItem(id); break;
    case "lang": if (v !== getLang()) { S.lang = v; save(); setLang(v); renderShell(); G.ready = false; priceResults = null; await loadData(); } break;
    case "mode": if (v !== S.mode) { S.mode = v; save(); G.ready = false; priceResults = null; renderView(); await loadData(); } break;
    case "faction": S.faction = v; save(); renderSettings(); break;
    case "lvl": { S.level = Math.max(1, Math.min(79, S.level + parseInt(el.dataset.d, 10))); save(); $("#lvl").value = S.level; break; }
    case "refresh": {
      el.disabled = true; el.textContent = t("loading");
      await loadData(true);
      if (G.ready && !G.stale) toast(t("updated", { time: ago(G.fetchedAt) }));
      break;
    }
    case "copy-progress": {
      const ta = $("#progress-text");
      try { await navigator.clipboard.writeText(ta.value); toast(t("copied")); } catch { ta.select(); }
      break;
    }
    case "import-progress": {
      try {
        const p = JSON.parse($("#progress-text").value);
        if (!Array.isArray(p.done)) throw new Error();
        S.done = Object.fromEntries(p.done.map((x) => [x, true]));
        S.objDone = Object.fromEntries((p.objDone || []).map((x) => [x, true]));
        S.have = p.have || {}; if (p.level) S.level = p.level; if (p.faction) S.faction = p.faction;
        save(); toast(t("imported", { n: p.done.length })); renderSettings();
      } catch { toast(t("badImport")); }
      break;
    }
    case "reset": {
      if (!resetArmed) { resetArmed = true; el.textContent = t("resetConfirm"); setTimeout(() => { resetArmed = false; if (el.isConnected) el.textContent = t("reset"); }, 4000); break; }
      resetArmed = false; S.done = {}; S.objDone = {}; S.have = {}; save(); toast(t("resetDone")); renderSettings(); break;
    }
  }
});
function refreshUnderlying() {
  if (S.tab === "tasks" && $("#task-list")) renderTaskList();
  else if (S.tab === "items" && $("#item-list")) renderItemList();
  else if (S.tab === "map") { destroyMap(); renderMap(); }
}

/* ---------- boot ---------- */
setLang(S.lang);
renderShell();
loadData();
if ("serviceWorker" in navigator && !window.Capacitor && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
