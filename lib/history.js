const fs = require("fs");
const path = require("path");

const HISTORY_PATH =
  process.env.HISTORY_PATH ||
  (fs.existsSync("/data") ? "/data/history.json" : path.join(__dirname, "..", "data", "history.json"));

function readAll() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
  } catch {
    return [];
  }
}

function writeAll(items) {
  fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(items, null, 2));
}

function summarize(item) {
  return {
    id: item.id,
    title: item.title,
    scriptMaker: item.scriptMaker,
    targetWordCount: item.targetWordCount,
    actualWordCount: item.actualWordCount,
    status: item.status,
    stage: item.stage,
    stageLabel: item.stageLabel,
    error: item.error || null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    titleLoyaltyScore: item.titleLoyaltyScore,
  };
}

function list({ q, scriptMaker, sort = "newest" } = {}) {
  let items = readAll();
  const query = String(q || "").toLowerCase().trim();
  if (query) items = items.filter((s) => s.title.toLowerCase().includes(query));
  if (scriptMaker && scriptMaker !== "all") {
    items = items.filter((s) => s.scriptMaker === scriptMaker);
  }
  items.sort((a, b) => {
    if (sort === "oldest") return new Date(a.createdAt) - new Date(b.createdAt);
    if (sort === "words") return (b.actualWordCount || 0) - (a.actualWordCount || 0);
    if (sort === "alpha") return a.title.localeCompare(b.title);
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  return items.map(summarize);
}

function get(id) {
  return readAll().find((s) => s.id === id) || null;
}

function save(entry) {
  const items = readAll();
  const now = new Date().toISOString();
  const existing = items.findIndex((s) => s.id === entry.id);
  const record = {
    ...entry,
    updatedAt: now,
    createdAt: entry.createdAt || now,
    status: entry.status || "complete",
  };
  if (existing >= 0) items[existing] = { ...items[existing], ...record };
  else items.unshift(record);
  writeAll(items.slice(0, 400));
  return record;
}

function update(id, patch) {
  const items = readAll();
  const idx = items.findIndex((s) => s.id === id);
  if (idx < 0) return null;
  const clean = Object.fromEntries(Object.entries(patch || {}).filter(([, v]) => v !== undefined));
  items[idx] = {
    ...items[idx],
    ...clean,
    updatedAt: new Date().toISOString(),
  };
  writeAll(items);
  return items[idx];
}

module.exports = { list, get, save, update, summarize };
