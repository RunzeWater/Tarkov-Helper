// Data layer.
// Reads the pre-built JSON files that tarkov.dev's own website uses (json.tarkov.dev),
// applies the translations, keeps only the fields this app needs and caches the result
// in IndexedDB so the app opens instantly and still works offline.
const BASE = "https://json.tarkov.dev/";
export const MAX_AGE = 3 * 60 * 60 * 1000; // refresh in the background after 3 hours
const CACHE_VERSION = 2;

/* ---------- network ---------- */
// Capacitor keeps the WebView's own fetch as CapacitorWebFetch. json.tarkov.dev allows
// cross-origin reads, so the big files stream straight into the WebView.
function webFetch(url, opts) {
  const f = window.CapacitorWebFetch || window.fetch;
  return f.call(window, url, opts);
}

async function fetchJson(path, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 120000);
    try {
      let res;
      try {
        res = await webFetch(BASE + path, { headers: { Accept: "application/json" }, cache: "no-cache", signal: ctrl.signal });
      } catch (e) {
        if (ctrl.signal.aborted) throw e;
        res = await window.fetch(BASE + path, { headers: { Accept: "application/json" } }); // native HTTP fallback
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      last = e && e.name === "AbortError" ? new Error("timeout") : e;
      if (i < tries - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${path}: ${last?.message || last}`);
}

async function pool(list, size, worker) {
  let next = 0;
  const run = async () => { while (next < list.length) { const i = next++; await worker(list[i], i); } };
  await Promise.all(Array.from({ length: Math.min(size, list.length) }, run));
}

/* ---------- translation + slimming ---------- */
function makeTr(primary = {}, fallback = {}) {
  return (key) => {
    if (key == null) return key;
    const p = primary[key];
    if (p) return p;
    const f = fallback[key];
    if (f) return f;
    if (p === "" || f === "") return "";
    return key;
  };
}
const xz = (p) => (p ? { x: p.x, z: p.z } : null);

export function slimBundle(raw, lang) {
  const tT = makeTr(raw.tasksL, raw.tasksEn);
  const tR = makeTr(raw.tradersL, raw.tradersEn);
  const tM = makeTr(raw.mapsL, raw.mapsEn);
  const tI = makeTr(raw.itemsL, raw.itemsEn);
  const enI = lang === "en" ? null : makeTr(raw.itemsEn, {});

  const traders = Object.values(raw.traders || {}).filter((x) => x && x.id).map((x) => ({
    id: x.id, name: tR(x.name), normalizedName: x.normalizedName, imageLink: x.imageLink || null,
  }));

  const maps = Object.values(raw.maps?.maps || {}).filter((m) => m && m.id).map((m) => ({
    id: m.id, name: tM(m.name), normalizedName: m.normalizedName, raidDuration: m.raidDuration ?? null, players: m.players ?? null,
    extracts: (m.extracts || []).filter((e) => e && e.position).map((e) => ({ name: tM(e.name), faction: e.faction || "", position: xz(e.position) })),
  }));

  const items = Object.values(raw.items?.items || {}).filter((i) => i && i.id).map((i) => ({
    id: i.id,
    name: tI(i.name),
    shortName: tI(i.shortName),
    nameEn: enI ? enI(i.name) : undefined,
    normalizedName: i.normalizedName || "",
    iconLink: i.iconLink || null,
    width: i.width || 1,
    height: i.height || 1,
    wikiLink: i.wikiLink || null,
    noFlea: (i.types || []).includes("noFlea"),
    avg24hPrice: i.avg24hPrice || null,
    lastLowPrice: i.lastLowPrice || null,
    changeLast48hPercent: i.changeLast48hPercent ?? null,
    buy: (i.buyFromTrader || []).map((b) => ({ trader: b.trader, price: b.price, currency: b.currency, priceRUB: b.priceRUB, minTraderLevel: b.minTraderLevel ?? null, taskUnlock: b.taskUnlock || null, buyLimit: b.buyLimit || null })),
    sell: (i.sellToTrader || []).map((s) => ({ trader: s.trader, price: s.price, currency: s.currency, priceRUB: s.priceRUB })),
  }));

  const questItems = {};
  for (const q of Object.values(raw.tasks?.questItems || {})) {
    if (q && q.id) questItems[q.id] = { id: q.id, name: tT(q.name), shortName: tT(q.shortName), iconLink: q.iconLink || null };
  }

  const tasks = Object.values(raw.tasks?.tasks || {}).filter((t) => t && t.id).map((t) => ({
    id: t.id,
    name: tT(t.name),
    normalizedName: t.normalizedName,
    experience: t.experience || 0,
    wikiLink: t.wikiLink || null,
    minPlayerLevel: t.minPlayerLevel || 0,
    kappaRequired: !!t.kappaRequired,
    lightkeeperRequired: !!t.lightkeeperRequired,
    factionName: t.factionName || "Any",
    trader: t.trader,
    map: t.map || null,
    taskRequirements: (t.taskRequirements || []).map((r) => ({ task: r.task, status: r.status || [] })),
    traderRequirements: (t.traderRequirements || []).map((r) => ({ trader: r.trader, requirementType: r.requirementType, compareMethod: r.compareMethod, value: r.value })),
    objectives: (t.objectives || []).filter(Boolean).map((o) => {
      const seen = new Set();
      const zones = [];
      for (const z of o.zones || []) {
        if (!z || !z.position) continue;
        const k = `${z.map}:${z.position.x}:${z.position.z}`;
        if (seen.has(k)) continue;
        seen.add(k);
        zones.push({ map: z.map, position: xz(z.position), outline: (z.outline || []).map(xz) });
      }
      return {
        id: o.id,
        type: o.type,
        description: tT(o.description),
        optional: !!o.optional,
        count: o.count ?? null,
        foundInRaid: !!o.foundInRaid,
        maps: o.maps || [],
        zones,
        possibleLocations: (o.possibleLocations || []).map((p) => ({ map: p.map, positions: (p.positions || []).map(xz) })),
        items: o.items || [],
        questItem: o.questItem || null,
        markerItem: o.markerItem || null,
        requiredKeys: o.requiredKeys || [],
      };
    }),
    rewardItems: (t.finishRewards?.items || []).map((r) => ({ item: r.item, count: r.count })),
    rewardStanding: (t.finishRewards?.traderStanding || []).map((s) => ({ trader: s.trader, standing: s.standing })),
  }));

  const barters = Object.values(raw.barters || {}).filter(Boolean).map((b) => ({
    trader: b.trader,
    level: b.minTraderLevel ?? b.level ?? 1,
    buyLimit: b.buyLimit || null,
    taskUnlock: b.taskUnlock || null,
    requiredItems: (b.requiredItems || []).map((r) => ({ item: r.item, count: r.count })),
    rewardItems: b.offeredItem ? [{ item: b.offeredItem.item, count: b.offeredItem.count }] : (b.rewardItems || []).map((r) => ({ item: r.item, count: r.count })),
  }));

  return { v: CACHE_VERSION, lang, traders, maps, items, questItems, tasks, barters };
}

/* ---------- in-memory model (same shape the UI used with the GraphQL API) ---------- */
let MODEL = null;

export function buildModel(b) {
  const fleaName = b.lang === "zh" ? "跳蚤市场" : "Flea Market";
  const traderById = new Map(b.traders.map((x) => [x.id, x]));
  const mapById = new Map(b.maps.map((m) => [m.id, m]));
  const taskName = new Map(b.tasks.map((t) => [t.id, t.name]));
  const trader = (id) => traderById.get(id) || { id, name: id, normalizedName: id, imageLink: null };
  const vendor = (id) => { const x = trader(id); return { name: x.name, normalizedName: x.normalizedName }; };
  const mapRef = (id) => { const m = mapById.get(id); return m ? { id: m.id, name: m.name, normalizedName: m.normalizedName } : null; };

  const itemById = new Map();
  for (const i of b.items) {
    const it = { ...i };
    it.sellFor = i.sell.map((s) => ({ price: s.price, currency: s.currency, priceRUB: s.priceRUB, vendor: vendor(s.trader) }));
    const fleaSell = i.lastLowPrice || i.avg24hPrice;
    if (!i.noFlea && fleaSell) it.sellFor.push({ price: fleaSell, currency: "RUB", priceRUB: fleaSell, vendor: { name: fleaName, normalizedName: "flea-market" } });
    it.buyFor = i.buy.map((x) => ({
      price: x.price, currency: x.currency, priceRUB: x.priceRUB,
      vendor: { ...vendor(x.trader), minTraderLevel: x.minTraderLevel, taskUnlock: x.taskUnlock ? { id: x.taskUnlock, name: taskName.get(x.taskUnlock) || "" } : null },
    }));
    if (!i.noFlea && i.lastLowPrice) it.buyFor.push({ price: i.lastLowPrice, currency: "RUB", priceRUB: i.lastLowPrice, vendor: { name: fleaName, normalizedName: "flea-market" } });
    itemById.set(i.id, it);
  }
  const itemRef = (id) => itemById.get(id) || b.questItems[id] || { id, name: id, shortName: id, iconLink: null };

  const tasks = b.tasks.map((t) => ({
    ...t,
    trader: trader(t.trader),
    map: t.map ? mapRef(t.map) : null,
    taskRequirements: t.taskRequirements.map((r) => ({ task: { id: r.task }, status: r.status })),
    traderRequirements: t.traderRequirements.map((r) => ({ trader: { name: vendor(r.trader).name }, requirementType: r.requirementType, compareMethod: r.compareMethod, value: r.value })),
    objectives: t.objectives.map((o) => ({
      ...o,
      maps: o.maps.map(mapRef).filter(Boolean),
      zones: o.zones.map((z) => ({ map: mapRef(z.map), position: z.position, outline: z.outline })),
      possibleLocations: o.possibleLocations.map((p) => ({ map: mapRef(p.map), positions: p.positions })),
      items: o.items.map(itemRef),
      questItem: o.questItem ? itemRef(o.questItem) : null,
      markerItem: o.markerItem ? itemRef(o.markerItem) : null,
      requiredKeys: o.requiredKeys.map((g) => (Array.isArray(g) ? g : [g]).map(itemRef)),
    })),
    finishRewards: {
      items: t.rewardItems.map((r) => ({ item: itemRef(r.item), count: r.count })),
      traderStanding: t.rewardStanding.map((s) => ({ trader: { name: vendor(s.trader).name }, standing: s.standing })),
    },
  }));

  const maps = b.maps.map((m) => ({ ...m }));
  const items = [...itemById.values()];
  return { lang: b.lang, tasks, maps, items, itemById, itemRef, vendor, barters: b.barters, index: null };
}

export function useModel(model) { MODEL = model; }

/* ---------- local queries (prices, barters, item detail) ---------- */
export function searchItems(q) {
  if (!MODEL) return [];
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const scored = [];
  for (const it of MODEL.items) {
    const n = (it.name || "").toLowerCase();
    const sn = (it.shortName || "").toLowerCase();
    const en = (it.nameEn || "").toLowerCase();
    let score = -1;
    if (n === s || sn === s || en === s) score = 0;
    else if (n.startsWith(s) || sn.startsWith(s) || en.startsWith(s)) score = 1;
    else if (n.includes(s) || sn.includes(s) || en.includes(s) || it.normalizedName.includes(s)) score = 2;
    if (score >= 0) scored.push([score, it]);
  }
  scored.sort((a, b) => a[0] - b[0] || (b[1].avg24hPrice || 0) - (a[1].avg24hPrice || 0));
  return scored.slice(0, 40).map((x) => x[1]);
}

export function itemsByIds(ids) {
  if (!MODEL) return [];
  return ids.map((id) => MODEL.itemById.get(id)).filter(Boolean);
}

function ensureIndex() {
  if (MODEL.index) return MODEL.index;
  const bartersFor = new Map(), bartersUsing = new Map(), usedIn = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); if (!m.get(k).includes(v)) m.get(k).push(v); };
  for (const b of MODEL.barters) {
    for (const r of b.rewardItems) push(bartersFor, r.item, b);
    for (const r of b.requiredItems) push(bartersUsing, r.item, b);
  }
  for (const t of MODEL.tasks) {
    for (const o of t.objectives) {
      if (["giveItem", "plantItem", "findItem"].includes(o.type)) for (const it of o.items) push(usedIn, it.id, t);
      if (o.markerItem) push(usedIn, o.markerItem.id, t);
    }
  }
  MODEL.index = { bartersFor, bartersUsing, usedIn };
  return MODEL.index;
}

function resolveBarter(b) {
  return {
    trader: { name: MODEL.vendor(b.trader).name },
    level: b.level,
    buyLimit: b.buyLimit,
    requiredItems: b.requiredItems.map((r) => ({ item: MODEL.itemRef(r.item), count: r.count })),
    rewardItems: b.rewardItems.map((r) => ({ item: MODEL.itemRef(r.item), count: r.count })),
  };
}

export function itemDetail(id) {
  if (!MODEL) return null;
  const it = MODEL.itemById.get(id);
  if (!it) return null;
  const ix = ensureIndex();
  return {
    ...it,
    bartersFor: (ix.bartersFor.get(id) || []).map(resolveBarter),
    bartersUsing: (ix.bartersUsing.get(id) || []).map(resolveBarter),
    usedInTasks: (ix.usedIn.get(id) || []).map((t) => ({ id: t.id, name: t.name })),
  };
}

/* ---------- tiny IndexedDB key/value store ---------- */
let dbp;
function idb() {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const r = indexedDB.open("tarkov-helper", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  return dbp;
}
async function cacheGet(key) {
  try {
    const db = await idb();
    return await new Promise((res) => {
      const q = db.transaction("kv").objectStore("kv").get(key);
      q.onsuccess = () => res(q.result);
      q.onerror = () => res(undefined);
    });
  } catch { return undefined; }
}
async function cacheSet(key, value) {
  try {
    const db = await idb();
    db.transaction("kv", "readwrite").objectStore("kv").put(value, key);
  } catch { /* storage unavailable: run without cache */ }
}

/* ---------- public loader ---------- */
async function downloadBundle(lang, mode, onProgress) {
  const files = {
    tasks: `${mode}/tasks`, traders: `${mode}/traders`, maps: `${mode}/maps`, items: `${mode}/items`, barters: `${mode}/barters`,
    tasksEn: `${mode}/tasks_en`, tradersEn: `${mode}/traders_en`, mapsEn: `${mode}/maps_en`, itemsEn: `${mode}/items_en`,
  };
  if (lang !== "en") {
    Object.assign(files, { tasksL: `${mode}/tasks_${lang}`, tradersL: `${mode}/traders_${lang}`, mapsL: `${mode}/maps_${lang}`, itemsL: `${mode}/items_${lang}` });
  }
  const entries = Object.entries(files);
  const raw = {};
  let done = 0;
  onProgress?.(0, entries.length);
  await pool(entries, 4, async ([k, path]) => {
    raw[k] = (await fetchJson(path)).data;
    onProgress?.(++done, entries.length);
  });
  if (lang === "en") Object.assign(raw, { tasksL: raw.tasksEn, tradersL: raw.tradersEn, mapsL: raw.mapsEn, itemsL: raw.itemsEn });
  return slimBundle(raw, lang);
}

/**
 * Returns {data, fetchedAt, fromCache, stale?, error?}.
 * Without `force`, a cached copy is returned immediately (check its age against MAX_AGE).
 */
export async function loadGameData(lang, mode, { force = false, onProgress } = {}) {
  const key = `bundle:v${CACHE_VERSION}:${lang}:${mode}`;
  if (!force) {
    const cached = await cacheGet(key);
    if (cached?.bundle) return { data: buildModel(cached.bundle), fetchedAt: cached.fetchedAt, fromCache: true };
  }
  try {
    const bundle = await downloadBundle(lang, mode, onProgress);
    const fetchedAt = Date.now();
    await cacheSet(key, { bundle, fetchedAt });
    return { data: buildModel(bundle), fetchedAt, fromCache: false };
  } catch (error) {
    const cached = await cacheGet(key);
    if (cached?.bundle) return { data: buildModel(cached.bundle), fetchedAt: cached.fetchedAt, fromCache: true, stale: true, error };
    throw error;
  }
}
