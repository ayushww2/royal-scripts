const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const express = require("express");
const db = require("./lib/db");
const openai = require("./lib/openai");
const retrieve = require("./lib/retrieve");
const pipeline = require("./lib/pipeline");
const history = require("./lib/history");
const exporter = require("./lib/export");
const { countWords, segmentScript } = require("./lib/segment");

const PORT = process.env.PORT || 3000;
const INTEL_INDEX = path.join(__dirname, "data", "intelligence", "index.json");
if (!fs.existsSync(INTEL_INDEX)) {
  console.log("Building script intelligence cache...");
  execSync("node scripts/build-intelligence.js", { stdio: "inherit" });
}

const app = express();

app.use(express.json({ limit: "4mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_req, res) => {
  const intel = pipeline.intelligenceStatus();
  res.json({
    ok: true,
    service: "aw-script-intelligence",
    scripts: intel.scripts,
  });
});

app.get("/api/status", async (_req, res) => {
  try {
    const ping = await openai.pingModel();
    const intel = pipeline.intelligenceStatus();
    res.json({
      ...ping,
      ...intel,
      defaultModel: openai.config().model,
      planModel: openai.config().planModel,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get("/api/makers", (_req, res) => {
  res.json({ makers: pipeline.listMakers() });
});

app.get("/api/references", (req, res) => {
  res.json(
    retrieve.searchIndex({
      q: req.query.q,
      niche: req.query.niche,
      limit: Math.min(Number(req.query.limit) || 40, 100),
      offset: Number(req.query.offset) || 0,
    })
  );
});

app.get("/api/references/:id", (req, res) => {
  const script = db.getScript(req.params.id);
  if (!script) return res.status(404).json({ error: "Not found" });
  res.json(script);
});

app.get("/api/history", (req, res) => {
  res.json({
    items: history.list({
      q: req.query.q,
      scriptMaker: req.query.scriptMaker,
      sort: req.query.sort || "newest",
    }),
  });
});

app.get("/api/history/:id", (req, res) => {
  const item = history.get(req.params.id);
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

app.patch("/api/history/:id", (req, res) => {
  const script = typeof req.body?.script === "string" ? segmentScript(req.body.script) : undefined;
  const item = history.update(req.params.id, {
    ...(script ? { script, actualWordCount: countWords(script) } : {}),
    ...(req.body?.title ? { title: String(req.body.title) } : {}),
    status: "complete",
  });
  if (!item) return res.status(404).json({ error: "Not found" });
  res.json(item);
});

app.get("/api/history/:id.txt", (req, res) => {
  const item = history.get(req.params.id);
  if (!item) return res.status(404).send("Not found");
  const body = exporter.toTxt(item);
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${exporter.filename(item, "txt")}"`);
  res.send(body);
});

app.get("/api/history/:id.docx", async (req, res) => {
  const item = history.get(req.params.id);
  if (!item) return res.status(404).send("Not found");
  const buf = await exporter.toDocx(item);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  res.setHeader("Content-Disposition", `attachment; filename="${exporter.filename(item, "docx")}"`);
  res.send(buf);
});

app.post("/api/generate", async (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "Title is required" });

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    for await (const event of pipeline.generateScript({
      title,
      targetWordCount: req.body?.targetWordCount,
      scriptMaker: req.body?.scriptMaker,
      customInstructions: req.body?.customInstructions,
      onStatus: (status) => res.write(`data: ${JSON.stringify({ type: "status", ...status })}\n\n`),
    })) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
  } finally {
    res.end();
  }
});

app.listen(PORT, "0.0.0.0", () => {
  const intel = pipeline.intelligenceStatus();
  console.log(`AW Script Intelligence listening on ${PORT} · ${intel.scripts} trained reference scripts`);
});
