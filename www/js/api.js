// tarkov.dev GraphQL client with an IndexedDB cache so the app still opens offline.
const ENDPOINT = "https://api.tarkov.dev/graphql";
const MAX_AGE = 6 * 60 * 60 * 1000; // re-fetch quest/map data after 6 hours

const ZONE = `zones { map { normalizedName } position { x y z } outline { x z } }`;
const KEYS = `requiredKeys { id name shortName }`;

export const TASKS_QUERY = `
query Tasks($lang: LanguageCode, $mode: GameMode, $limit: Int, $offset: Int) {
  tasks(lang: $lang, gameMode: $mode, limit: $limit, offset: $offset) {
    id name normalizedName experience wikiLink minPlayerLevel
    kappaRequired lightkeeperRequired factionName
    trader { id name normalizedName imageLink }
    map { id name normalizedName }
    taskRequirements { task { id } status }
    traderRequirements { trader { name } requirementType compareMethod value }
    objectives {
      id type description optional
      maps { normalizedName name }
      ... on TaskObjectiveBasic { ${ZONE} ${KEYS} }
      ... on TaskObjectiveItem { items { id name shortName iconLink } count foundInRaid ${ZONE} ${KEYS} }
      ... on TaskObjectiveQuestItem { questItem { id name shortName iconLink } count possibleLocations { map { normalizedName } positions { x y z } } ${ZONE} ${KEYS} }
      ... on TaskObjectiveMark { markerItem { id name shortName iconLink } ${ZONE} ${KEYS} }
      ... on TaskObjectiveShoot { targetNames count zoneNames ${ZONE} ${KEYS} }
      ... on TaskObjectiveExtract { exitName count ${KEYS} }
    }
    finishRewards {
      items { item { id name shortName iconLink } count }
      traderStanding { trader { name } standing }
    }
  }
}`;

export const MAPS_QUERY = `
query Maps($lang: LanguageCode, $mode: GameMode) {
  maps(lang: $lang, gameMode: $mode) {
    id name normalizedName raidDuration players
    extracts { id name faction position { x y z } }
  }
}`;

const ITEM_FIELDS = `
  id name shortName iconLink width height wikiLink
  avg24hPrice lastLowPrice changeLast48hPercent
  sellFor { price currency priceRUB vendor { name normalizedName ... on TraderOffer { minTraderLevel } } }
  buyFor { price currency priceRUB vendor { name normalizedName ... on TraderOffer { minTraderLevel taskUnlock { name } } } }`;

export const ITEM_SEARCH_QUERY = `
query ItemSearch($name: String, $ids: [ID], $lang: LanguageCode, $mode: GameMode) {
  items(name: $name, ids: $ids, lang: $lang, gameMode: $mode, limit: 40) { ${ITEM_FIELDS} }
}`;

const BARTER = `trader { name } level buyLimit
  requiredItems { item { id name shortName iconLink } count }
  rewardItems { item { id name shortName iconLink } count }`;

export const ITEM_DETAIL_QUERY = `
query ItemDetail($id: ID, $lang: LanguageCode, $mode: GameMode) {
  item(id: $id, lang: $lang, gameMode: $mode) {
    ${ITEM_FIELDS}
    bartersFor { ${BARTER} }
    bartersUsing { ${BARTER} }
    usedInTasks { id name }
  }
}`;

async function gql(query, variables) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    let detail = "";
    try { const j = await res.json(); detail = j.errors?.[0]?.message || JSON.stringify(j).slice(0, 200); } catch { /* no body */ }
    throw new Error(`HTTP ${res.status}${detail ? " " + detail : ""}`);
  }
  const json = await res.json();
  if (json.errors?.length && !json.data) throw new Error(json.errors[0].message);
  return json.data;
}

async function gqlRetry(query, variables, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await gql(query, variables); }
    catch (e) { last = e; if (i < tries - 1) await new Promise((r) => setTimeout(r, 1200 * (i + 1))); }
  }
  throw last;
}

// Small requests are far less likely to time out on the server than one giant query.
async function fetchGameData(lang, mode) {
  const { maps } = await gqlRetry(MAPS_QUERY, { lang, mode });
  const tasks = [];
  const PAGE = 40;
  for (let offset = 0; offset < 3000; offset += PAGE) {
    const res = await gqlRetry(TASKS_QUERY, { lang, mode, limit: PAGE, offset });
    const page = res.tasks || [];
    tasks.push(...page);
    if (page.length < PAGE) break;
  }
  return { tasks, maps };
}

// --- tiny IndexedDB key/value store ---
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

/** Returns {data, fetchedAt, stale, error} — falls back to cache when offline. */
export async function loadGameData(lang, mode, force = false) {
  const key = `game:${lang}:${mode}`;
  const cached = await cacheGet(key);
  if (cached && !force && Date.now() - cached.fetchedAt < MAX_AGE) return { ...cached, stale: false };
  try {
    const data = await fetchGameData(lang, mode);
    const entry = { data, fetchedAt: Date.now() };
    cacheSet(key, entry);
    return { ...entry, stale: false };
  } catch (error) {
    if (cached) return { ...cached, stale: true, error };
    throw error;
  }
}

export async function searchItems(name, lang, mode) {
  return (await gql(ITEM_SEARCH_QUERY, { name, lang, mode })).items || [];
}
export async function itemsByIds(ids, lang, mode) {
  return (await gql(ITEM_SEARCH_QUERY, { ids, lang, mode })).items || [];
}
export async function itemDetail(id, lang, mode) {
  return (await gql(ITEM_DETAIL_QUERY, { id, lang, mode })).item;
}
