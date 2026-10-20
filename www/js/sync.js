// Progress sync between devices (phone ↔ iPad) through a secret GitHub Gist in the user's own account.
// The user pastes a personal access token that can only read and write gists; every device signed in
// to the same GitHub account finds the same gist by its file name. Every progress entry carries the
// time it last changed (removals are kept as tombstones) and two copies merge entry by entry, newest
// first. Edits made on different devices, offline or at the same moment, therefore all survive, and a
// copy that was overwritten or read stale heals itself on the next round.
const API = "https://api.github.com";
const API_VERSION = "2026-03-10"; // this version leaves the revision history out of gist responses
export const GIST_FILE = "tarkov-helper-progress.json";
export const TOKEN_URL = "https://github.com/settings/tokens/new?scopes=gist&description=Tarkov%20Helper%20sync";
const GIST_DESC = "塔科夫助手 · 进度同步（Tarkov Helper sync）";
const STORE = "tkh.sync";
const POLL_MS = 60 * 1000;

let st = load(); // { token, login, gistId, etag, stamps: {key: [value|null, time]}, dirty, at, err }
function load() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } }
function persist() { try { localStorage.setItem(STORE, JSON.stringify(st)); } catch { /* storage blocked */ } }

let A = null; // app adapter: getFlat(), setFlat(flat), onPulled(n), onStatus()
let running = null, again = false, lastTry = 0, timer = null;

export const isOn = () => !!st.token;
export const syncInfo = () => ({ on: !!st.token, login: st.login || "", at: st.at || 0, err: st.err || null, busy: !!running });

export function deviceName() {
  const ua = navigator.userAgent || "";
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "iPad";
  if (/iPhone/.test(ua)) return "iPhone";
  if (window.Capacitor || /Android/.test(ua)) return "Android";
  return "Web";
}

/* ---------- GitHub API ---------- */
class SyncError extends Error {
  constructor(status, msg) { super(msg || `HTTP ${status}`); this.status = status; }
}
let sendVersion = true;
async function gh(path, { method = "GET", body, token = st.token, etag } = {}) {
  const headers = (withVersion) => {
    const h = { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` };
    if (body !== undefined) h["Content-Type"] = "application/json";
    if (etag) h["If-None-Match"] = etag;
    if (withVersion) h["X-GitHub-Api-Version"] = API_VERSION;
    return h;
  };
  const opts = (withVersion) => ({ method, headers: headers(withVersion), cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body) });
  const web = window.CapacitorWebFetch || window.fetch;
  let res;
  try {
    res = await web.call(window, API + path, opts(sendVersion));
  } catch {
    // A browser refuses the request outright when CORS does not allow a header; try without the version header.
    try {
      if (sendVersion) { res = await web.call(window, API + path, opts(false)); sendVersion = false; }
    } catch { /* still failing */ }
    if (!res && window.CapacitorWebFetch) { try { res = await window.fetch(API + path, opts(true)); } catch { /* offline */ } }
    if (!res) throw new SyncError(0, "network");
  }
  if (res.status === 400 && sendVersion) { sendVersion = false; return gh(path, { method, body, token, etag }); }
  if (res.status === 304) return { status: 304 };
  if (!res.ok) {
    let msg = "";
    try { msg = (await res.json()).message || ""; } catch { /* not JSON */ }
    throw new SyncError(res.status, msg);
  }
  return { status: res.status, etag: res.headers.get("ETag"), data: res.status === 204 ? null : await res.json() };
}

/* ---------- merging ---------- */
// The newer entry wins; on a tie a value beats a removal and the larger value wins, so every device
// settles on the same answer.
function pick(x, y) {
  if (!x) return y;
  if (!y) return x;
  if (x[1] !== y[1]) return x[1] > y[1] ? x : y;
  if (x[0] === y[0]) return x;
  if (x[0] === null) return y;
  if (y[0] === null) return x;
  return x[0] > y[0] ? x : y;
}
export function mergeStamps(a, b) {
  const out = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) out[k] = pick(a[k], b[k]);
  return out;
}
function sameStamps(a, b) {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) { const x = a[k], y = b[k]; if (!y || x[0] !== y[0] || x[1] !== y[1]) return false; }
  return true;
}
export function flatOf(stamps) {
  const f = {};
  for (const [k, e] of Object.entries(stamps)) if (e[0] !== null) f[k] = e[0];
  return f;
}
function countDiff(a, b) {
  let n = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) n++;
  return n;
}
function cleanStamps(raw) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, e] of Object.entries(raw)) {
    if (k.length > 200 || !Array.isArray(e) || e.length !== 2 || !Number.isFinite(e[1])) continue;
    const v = e[0];
    if (v === null || (typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.length < 40)) out[k] = [v, e[1]];
  }
  return out;
}
// Progress that was on a device before it joined counts as "time unknown" (0): any change made
// on a synced device since then is newer, and anything else is simply added.
function initialStamps(flat) {
  const s = {};
  for (const [k, v] of Object.entries(flat)) s[k] = [v, 0];
  return s;
}
function docText(stamps) {
  return JSON.stringify({ app: "tarkov-helper", v: 3, updated: new Date().toISOString(), by: deviceName(), stamps });
}

/* ---------- local changes ---------- */
// Called by the app after every save: stamps whatever changed since the last call.
export function noteLocal(flat) {
  if (!st.token || !st.stamps) return;
  const now = Date.now();
  let changed = false;
  const stamp = (k, v) => {
    const e = st.stamps[k];
    // a change always supersedes the entry it replaced, even if this device's clock runs behind
    st.stamps[k] = [v, Math.max(now, e ? e[1] + 1 : 0)];
    changed = true;
  };
  for (const [k, v] of Object.entries(flat)) { const e = st.stamps[k]; if (!e || e[0] !== v) stamp(k, v); }
  for (const [k, e] of Object.entries(st.stamps)) if (e[0] !== null && !(k in flat)) stamp(k, null);
  if (changed) { st.dirty = true; persist(); schedule(2500); }
}

/* ---------- the sync round ---------- */
async function findGists() {
  const hits = [];
  for (let page = 1; page <= 10; page++) {
    const r = await gh(`/gists?per_page=100&page=${page}`);
    const list = Array.isArray(r.data) ? r.data : [];
    for (const g of list) if (g && g.files && g.files[GIST_FILE]) hits.push(g);
    if (list.length < 100) break;
  }
  return hits.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}
// Finds this account's progress gist, or creates it from this device's progress. Returns true if created.
async function locateGist() {
  const found = await findGists();
  if (found.length) { Object.assign(st, { gistId: found[0].id, etag: null }); persist(); return false; }
  let r;
  try {
    r = await gh("/gists", { method: "POST", body: { description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: docText(st.stamps) } } } });
  } catch (e) {
    if (e.status === 404 || e.status === 403) throw new SyncError(403, "scope");
    throw e;
  }
  Object.assign(st, { gistId: r.data.id, etag: null, dirty: false });
  persist();
  // two devices joining at the same moment could each create one: everyone settles on the oldest
  const all = await findGists();
  if (all.length > 1 && all[0].id !== st.gistId) { Object.assign(st, { gistId: all[0].id, dirty: true }); persist(); return false; }
  return true;
}

async function syncOnce() {
  if (!st.gistId && await locateGist()) return 0;
  let r;
  try {
    r = await gh(`/gists/${st.gistId}`, { etag: st.etag });
  } catch (e) {
    if (e.status !== 404) throw e;
    // the gist was deleted on GitHub: find another one or start a new one
    Object.assign(st, { gistId: null, etag: null, dirty: true });
    persist();
    if (await locateGist()) return 0;
    r = await gh(`/gists/${st.gistId}`);
  }
  let remote = null; // null: unchanged since this device last merged it
  if (r.status !== 304) {
    const file = r.data && r.data.files && r.data.files[GIST_FILE];
    let text = file ? file.content : null;
    if (file && file.truncated && file.raw_url) text = await (await fetch(file.raw_url, { cache: "no-store" })).text();
    let doc = null;
    try { doc = text ? JSON.parse(text) : null; } catch { doc = null; }
    remote = doc && doc.app === "tarkov-helper" ? cleanStamps(doc.stamps) : {};
    st.etag = r.etag || null;
  }
  let pulled = 0;
  if (remote) {
    const merged = mergeStamps(st.stamps, remote);
    if (!sameStamps(merged, st.stamps)) {
      const before = flatOf(st.stamps), after = flatOf(merged);
      st.stamps = merged;
      persist();
      pulled = countDiff(before, after);
      if (pulled) A.setFlat(after);
    }
  }
  const needPush = remote ? !sameStamps(st.stamps, remote) : st.dirty;
  if (needPush) {
    st.dirty = false;
    try {
      const p = await gh(`/gists/${st.gistId}`, { method: "PATCH", body: { files: { [GIST_FILE]: { content: docText(st.stamps) } } } });
      st.etag = p.etag || null;
    } catch (e) {
      st.dirty = true;
      throw e;
    }
  } else if (remote) {
    st.dirty = false;
  }
  st.at = Date.now();
  persist();
  return pulled;
}

function errCode(e) {
  if (!e || e.status === 0) return "net";
  if (e.status === 401) return "auth";
  if (e.message === "scope") return "scope";
  if ((e.status === 403 || e.status === 429) && /rate limit/i.test(e.message)) return "rate";
  return e.message || "error";
}

export function syncNow() {
  if (!st.token || !A) return Promise.resolve(0);
  if (running) { again = true; return running; }
  lastTry = Date.now();
  running = (async () => {
    let pulled = 0;
    try {
      let rounds = 0;
      do { again = false; pulled += await syncOnce(); } while (again && ++rounds < 3);
      st.err = null;
    } catch (e) {
      st.err = errCode(e);
    } finally {
      running = null;
      persist();
    }
    if (pulled) A.onPulled(pulled);
    A.onStatus();
    return pulled;
  })();
  A.onStatus();
  return running;
}
function schedule(ms) {
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow(); }, ms);
}
function kick(minGap = 10000) {
  if (!st.token || st.err === "auth" || st.err === "scope") return;
  if (Date.now() - lastTry < minGap) return;
  syncNow();
}

/* ---------- connect / disconnect ---------- */
export async function connect(token) {
  token = String(token || "").trim();
  if (!token) throw new SyncError(-1, "empty");
  let u;
  try { u = await gh("/user", { token }); } catch (e) { throw new SyncError(e.status, errCode(e)); }
  const login = u.data && u.data.login ? u.data.login : "";
  // reconnecting the same account (say, with a new token) keeps this device's change history
  const keep = st.stamps && st.login === login;
  st = {
    token, login,
    gistId: keep ? st.gistId || null : null,
    etag: null,
    stamps: keep ? st.stamps : initialStamps(A.getFlat()),
    dirty: true, at: 0, err: null,
  };
  persist();
  await syncNow();
  return syncInfo();
}
export function disconnect() {
  clearTimeout(timer);
  st = {};
  try { localStorage.removeItem(STORE); } catch { /* ignore */ }
}

export function startSync(adapter) {
  A = adapter;
  if (st.token && !st.stamps) { st.stamps = initialStamps(A.getFlat()); persist(); }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") kick(); });
  window.addEventListener("online", () => kick(0));
  window.addEventListener("focus", () => kick());
  setInterval(() => { if (document.visibilityState === "visible") kick(POLL_MS / 2); }, POLL_MS);
  kick(0);
}
