const path = require("path");
const crypto = require("crypto");
const express = require("express");
const db = require("./lib/db");
const openai = require("./lib/openai");

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  const collections = db.listCollections();
  res.json({
    ok: true,
    service: "royal-scripts-maker",
    scripts: collections.reduce((n, c) => n + c.count, 0),
    collections: collections.map((c) => ({ id: c.id, count: c.count })),
  });
});

app.get("/api/status", async (_req, res) => {
  try {
    const ping = await openai.pingModel();
    res.json({
      ...ping,
      collections: db.listCollections(),
      defaultModel: openai.config().model,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/collections", (_req, res) => {
  res.json({ collections: db.listCollections() });
});

app.get("/api/scripts", (req, res) => {
  const { collection, q, limit, offset } = req.query;
  res.json(
    db.searchScripts({
      collection,
      q,
      limit: Math.min(Number(limit) || 40, 100),
      offset: Number(offset) || 0,
    })
  );
});

app.get("/api/scripts/:id", (req, res) => {
  const script = db.getScript(req.params.id);
  if (!script) return res.status(404).json({ error: "Script not found" });
  res.json(script);
});

app.get("/api/generated", (_req, res) => {
  res.json({ items: db.readGenerated() });
});

app.post("/api/generate", async (req, res) => {
  const title = String(req.body?.title || "").trim();
  const notes = String(req.body?.notes || "").trim();
  const collectionId = String(req.body?.collection || "crownwatch-25k");
  const model = String(req.body?.model || openai.config().model);

  if (!title) {
    return res.status(400).json({ error: "Title or topic is required" });
  }

  const collection = db.collectionMeta(collectionId) || db.collectionMeta("crownwatch-25k");
  const stats = db.collectionStats(collection.id);
  const examples = db.similarScripts(collection.id, title, 3);
  const messages = openai.buildMessages({
    collection,
    title,
    notes,
    examples,
    targetWords: stats.avgWords,
  });

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let full = "";
  try {
    for await (const token of openai.streamCompletion({ messages, model })) {
      full += token;
      res.write(`data: ${JSON.stringify({ token })}\n\n`);
    }
    const saved = db.saveGenerated({
      id: crypto.randomBytes(8).toString("hex"),
      title,
      collection: collection.id,
      collectionLabel: collection.label,
      model,
      text: full,
      wordCount: full.trim() ? full.trim().split(/\s+/).length : 0,
      createdAt: new Date().toISOString(),
    });
    res.write(`data: ${JSON.stringify({ done: true, saved })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

app.listen(PORT, "0.0.0.0", () => {
  const collections = db.listCollections();
  const total = collections.reduce((n, c) => n + c.count, 0);
  console.log(`Royal Scripts Maker listening on port ${PORT} (${total} stored scripts)`);
});
