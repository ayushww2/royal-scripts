const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const GENERATED_PATH = path.join(DATA_DIR, "generated.json");

const COLLECTIONS = {
  "crownwatch-25k": {
    id: "crownwatch-25k",
    label: "Crownwatch 25k",
    file: "crownwatch-25k.json",
    channel: "Crown Watch",
    voice:
      "Conversational spoken-word YouTube narration. Breathless, intimate, slightly conspiratorial. Mid-script subscribe CTA like “hit subscribe and join us here at Crown Watch.” End on a reflective institutional beat rather than a hard sell.",
  },
  "prime-expedition-royal-50k": {
    id: "prime-expedition-royal-50k",
    label: "Prime Expedition Royal 50k",
    file: "prime-expedition-royal-50k.json",
    channel: "Prime Expedition Royal",
    voice:
      "Documentary YouTube narration with question hooks and “stick around” promises. Warm, cinematic, story-first. Close with comments, share, subscribe, and “we’ll see you in the next one.”",
  },
};

let cache = null;

function loadAll() {
  if (cache) return cache;
  const byId = {};
  const all = [];
  for (const col of Object.values(COLLECTIONS)) {
    const full = path.join(DATA_DIR, col.file);
    const items = JSON.parse(fs.readFileSync(full, "utf8"));
    byId[col.id] = items;
    all.push(...items);
  }
  cache = { byId, all, collections: Object.values(COLLECTIONS) };
  return cache;
}

function collectionMeta(id) {
  return COLLECTIONS[id] || null;
}

function listCollections() {
  const { byId } = loadAll();
  return Object.values(COLLECTIONS).map((col) => {
    const items = byId[col.id] || [];
    const words = items.reduce((n, s) => n + (s.wordCount || 0), 0);
    return {
      id: col.id,
      label: col.label,
      channel: col.channel,
      count: items.length,
      words,
      avgWords: items.length ? Math.round(words / items.length) : 0,
    };
  });
}

function tokenize(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9'\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function scoreOverlap(queryTokens, title) {
  const titleTokens = tokenize(title);
  let n = 0;
  for (const t of queryTokens) {
    if (titleTokens.has(t)) n += 1;
  }
  return n;
}

function searchScripts({ collection, q, limit = 40, offset = 0 } = {}) {
  const { byId, all } = loadAll();
  let items = collection && byId[collection] ? byId[collection] : all;
  const query = String(q || "").trim().toLowerCase();
  if (query) {
    items = items.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        s.text.toLowerCase().includes(query)
    );
  }
  const sliced = items.slice(offset, offset + limit).map(summarize);
  return { total: items.length, items: sliced };
}

function getScript(id) {
  const { all } = loadAll();
  return all.find((s) => s.id === id) || null;
}

function summarize(script) {
  return {
    id: script.id,
    collection: script.collection,
    collectionLabel: script.collectionLabel,
    filename: script.filename,
    title: script.title,
    wordCount: script.wordCount,
    charCount: script.charCount,
    preview: script.text.slice(0, 280),
  };
}

function similarScripts(collectionId, title, count = 3) {
  const { byId, all } = loadAll();
  const pool = collectionId && byId[collectionId] ? byId[collectionId] : all;
  const qTokens = tokenize(title);
  const ranked = pool
    .map((s) => ({ script: s, score: scoreOverlap(qTokens, s.title) }))
    .sort((a, b) => b.score - a.score || b.script.wordCount - a.script.wordCount);
  if (ranked[0] && ranked[0].score > 0) {
    return ranked.slice(0, count).map((x) => x.script);
  }
  const step = Math.max(1, Math.floor(pool.length / count));
  return pool.filter((_, i) => i % step === 0).slice(0, count);
}

function collectionStats(collectionId) {
  const { byId, all } = loadAll();
  const items = collectionId && byId[collectionId] ? byId[collectionId] : all;
  const words = items.reduce((n, s) => n + (s.wordCount || 0), 0);
  return {
    count: items.length,
    avgWords: items.length ? Math.round(words / items.length) : 3500,
  };
}

function readGenerated() {
  try {
    return JSON.parse(fs.readFileSync(GENERATED_PATH, "utf8"));
  } catch {
    return [];
  }
}

function saveGenerated(entry) {
  const list = readGenerated();
  list.unshift(entry);
  fs.writeFileSync(GENERATED_PATH, JSON.stringify(list.slice(0, 200), null, 2));
  return entry;
}

module.exports = {
  DATA_DIR,
  COLLECTIONS,
  loadAll,
  collectionMeta,
  listCollections,
  searchScripts,
  getScript,
  similarScripts,
  collectionStats,
  summarize,
  readGenerated,
  saveGenerated,
};
