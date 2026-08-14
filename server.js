const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { execSync } = require("child_process");
const express = require("express");
const db = require("./lib/db");
const openai = require("./lib/openai");
const retrieve = require("./lib/retrieve");
const pipeline = require("./lib/pipeline");
const history = require("./lib/history");
const exporter = require("./lib/export");
const royalMode = require("./lib/royalMode");
const { countWords, segmentScript } = require("./lib/segment");

const PORT = process.env.PORT || 3000;
const INTEL_INDEX = path.join(__dirname, "data", "intelligence", "index.json");
if (!fs.existsSync(INTEL_INDEX)) {
  console.log("Building script intelligence cache...");
  execSync("node scripts/build-intelligence.js", { stdio: "inherit" });
}

const app = express();
const liveJobs = new Map();

function jobSnapshot(id) {
  const live = liveJobs.get(id);
  const stored = history.get(id);
  return { ...stored, ...live, id };
}

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
  res.json({
    ...item,
    qa: item.scriptMaker === "royal-family" ? royalMode.verifyReport(item.script || "", item.title) : null,
  });
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

app.get("/api/jobs", (_req, res) => {
  const items = [...liveJobs.values()].map((job) => jobSnapshot(job.id));
  res.json({ items });
});

app.get("/api/jobs/:id", (req, res) => {
  const stored = history.get(req.params.id);
  const live = liveJobs.get(req.params.id);
  if (!stored && !live) return res.status(404).json({ error: "Not found" });
  res.json({ ...stored, ...live, id: req.params.id });
});

app.post("/api/generate", (req, res) => {
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "Title is required" });

  const id = crypto.randomBytes(8).toString("hex");
  const scriptMaker = String(req.body?.scriptMaker || "royal-family");
  const payload = {
    id,
    title,
    targetWordCount: Number(req.body?.targetWordCount) || 3500,
    scriptMaker,
    customInstructions: String(req.body?.customInstructions || "").trim(),
  };

  const job = history.save({
    ...payload,
    scriptMakerLabel: pipeline.makerLabel(scriptMaker),
    actualWordCount: 0,
    script: "",
    references: [],
    status: "generating",
    stage: "queued",
    stageLabel: "Queued in background...",
    error: null,
  });
  liveJobs.set(id, { ...job, draft: "" });

  setImmediate(async () => {
    try {
      await pipeline.runJob({
        ...payload,
        onUpdate: (patch) => {
          const current = liveJobs.get(id) || { id };
          const next = { ...current, ...patch };
          if (patch.draft) next.draft = patch.draft;
          if (patch.script) next.draft = patch.script;
          liveJobs.set(id, next);
          if (patch.stage || patch.script || patch.status === "complete" || patch.status === "failed") {
            history.update(id, {
              status: patch.status || "generating",
              stage: patch.stage,
              stageLabel: patch.stageLabel,
              ...(patch.script ? { script: patch.script } : {}),
              error: patch.error || null,
            });
          }
        },
      });
    } catch (err) {
      history.update(id, {
        status: "failed",
        stage: "error",
        stageLabel: "Generation was interrupted. Try again.",
        error: err.message,
      });
      const current = liveJobs.get(id) || { id, title };
      liveJobs.set(id, {
        ...current,
        status: "failed",
        stage: "error",
        stageLabel: "Generation was interrupted. Try again.",
        error: err.message,
      });
      console.error("Background generate failed", id, err);
    } finally {
      setTimeout(() => liveJobs.delete(id), 15000);
    }
  });

  res.json({ ok: true, job: jobSnapshot(id) });
});

app.listen(PORT, "0.0.0.0", () => {
  const intel = pipeline.intelligenceStatus();
  console.log(`AW Script Intelligence listening on ${PORT} · ${intel.scripts} trained reference scripts`);
});
