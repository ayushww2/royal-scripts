const fs = require("fs");
const path = require("path");
const {
  cosine,
  hashEmbed,
  tokenize,
  extractEntities,
  extractNarrativeTags,
  titleFormat,
} = require("./analyze");

const INTEL_DIR = path.join(__dirname, "..", "data", "intelligence");

let cache = null;

function loadIntelligence() {
  if (cache) return cache;
  const index = JSON.parse(fs.readFileSync(path.join(INTEL_DIR, "index.json"), "utf8"));
  const bible = JSON.parse(fs.readFileSync(path.join(INTEL_DIR, "style-bible.json"), "utf8"));
  cache = { index, bible };
  return cache;
}

function overlap(a, b) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let n = 0;
  for (const x of a) if (setB.has(x)) n += 1;
  return n / a.length;
}

function queryFeatures(title, scriptMaker) {
  const format = titleFormat(title);
  const entities = extractEntities(title);
  const tags = extractNarrativeTags(title);
  const titleEmbedding = hashEmbed([
    ...tokenize(title),
    ...format.shapes.map((s) => `shape:${s}`),
    ...tokenize(format.template),
  ]);
  const contentEmbedding = hashEmbed([
    ...tokenize(title),
    ...entities.map((e) => `ent:${e}`),
    ...tags.map((t) => `tag:${t}`),
    ...format.shapes.map((s) => `shape:${s}`),
  ]);
  return {
    title,
    scriptMaker: scriptMaker || "royal-family",
    format,
    entities,
    tags,
    titleEmbedding,
    contentEmbedding,
  };
}

function scoreRecord(query, rec) {
  const qTitleTokens = tokenize(query.title);
  const titleTokenScore = overlap(qTitleTokens, tokenize(rec.title));
  const shapeScore = overlap(query.format.shapes, rec.titleShapes);
  const titleFormatScore = Math.max(
    cosine(query.titleEmbedding, rec.titleEmbedding),
    shapeScore,
    titleTokenScore
  );
  const titleEntityScore = overlap(query.entities, extractTitleEntities(rec.title));
  const bodyEntityScore = overlap(query.entities, rec.entities);
  const entityScore = Math.max(titleEntityScore, bodyEntityScore * 0.55);
  const narrativeScore = Math.max(
    cosine(query.contentEmbedding, rec.contentEmbedding),
    overlap(query.tags, rec.narrativeTags)
  );
  const nicheScore = rec.niche === query.scriptMaker ? 1 : rec.niche === "royal-family" && query.scriptMaker === "documentary" ? 0.4 : 0.15;
  const qualityScore = rec.wordCount >= 2800 && rec.wordCount <= 5200 ? 1 : 0.55;
  const total =
    0.35 * titleFormatScore +
    0.25 * entityScore +
    0.2 * narrativeScore +
    0.1 * nicheScore +
    0.1 * qualityScore;
  return {
    total,
    parts: {
      titleFormat: titleFormatScore,
      subject: entityScore,
      narrative: narrativeScore,
      niche: nicheScore,
      quality: qualityScore,
    },
  };
}

function extractTitleEntities(title) {
  return extractEntities(title);
}

function reasonSelected(query, rec, parts) {
  const reasons = [];
  if (parts.titleFormat >= 0.45) reasons.push("title/narrative format similarity");
  if (parts.subject >= 0.3) reasons.push("subject/entity handling");
  if (parts.narrative >= 0.3) reasons.push("reveal and confession structure");
  if (parts.niche >= 0.8) reasons.push("same niche");
  if (!reasons.length) reasons.push("retention pacing and hook pattern");
  return reasons[0];
}

function complementaryPick(ranked) {
  if (!ranked.length) return [];
  const picked = [ranked[0]];
  const usedIds = new Set([ranked[0].rec.id]);

  const formatCandidate = ranked.find((row) => {
    if (usedIds.has(row.rec.id)) return false;
    return row.parts.titleFormat >= 0.35 || row.rec.titleShapes.some((s) => !ranked[0].rec.titleShapes.includes(s));
  });
  if (formatCandidate) {
    picked.push(formatCandidate);
    usedIds.add(formatCandidate.rec.id);
  }

  const narrativeCandidate = ranked.find((row) => {
    if (usedIds.has(row.rec.id)) return false;
    const newTag = row.rec.narrativeTags.some((t) => !picked[0].rec.narrativeTags.includes(t));
    const newReason = row.reason !== picked[0].reason;
    return newTag || newReason || row.parts.narrative >= 0.4;
  });
  if (narrativeCandidate) {
    picked.push(narrativeCandidate);
    usedIds.add(narrativeCandidate.rec.id);
  }

  for (const row of ranked) {
    if (picked.length >= 3) break;
    if (!usedIds.has(row.rec.id)) {
      picked.push(row);
      usedIds.add(row.rec.id);
    }
  }
  return picked.slice(0, 3);
}

function retrieveTop3(title, scriptMaker) {
  const { index, bible } = loadIntelligence();
  const query = queryFeatures(title, scriptMaker);
  const ranked = index
    .map((rec) => {
      const scored = scoreRecord(query, rec);
      return {
        rec,
        score: scored.total,
        parts: scored.parts,
        reason: reasonSelected(query, rec, scored.parts),
      };
    })
    .sort((a, b) => b.score - a.score);
  const picked = complementaryPick(ranked);
  const labels = ["REFERENCE A", "REFERENCE B", "REFERENCE C"];
  return {
    query,
    bible,
    corpusSize: index.length,
    references: picked.map((row, i) => ({
      label: labels[i],
      id: row.rec.id,
      title: row.rec.title,
      niche: row.rec.niche,
      wordCount: row.rec.wordCount,
      similarity: Math.round(Math.min(97, 42 + row.score * 100)),
      reasonSelected: row.reason,
      usefulPatterns: [
        row.rec.hook.openingSentence,
        ...(row.rec.rehooks || []).slice(0, 3),
      ].filter(Boolean),
      hookPreview: String(row.rec.hook.text || "").slice(0, 520),
      analysis: {
        hook: row.rec.hook,
        titleShapes: row.rec.titleShapes,
        entities: row.rec.entities.slice(0, 8),
        narrativeTags: row.rec.narrativeTags,
        structure: row.rec.structure,
        rehooks: (row.rec.rehooks || []).slice(0, 5),
        questions: (row.rec.questions || []).slice(0, 4),
        ctas: (row.rec.ctas || []).slice(0, 3),
        naturalPhrases: (row.rec.naturalPhrases || []).slice(0, 6),
      },
    })),
  };
}

function searchIndex({ q, niche, limit = 40, offset = 0 } = {}) {
  const { index } = loadIntelligence();
  const query = String(q || "").toLowerCase().trim();
  let items = index;
  if (niche && niche !== "all") items = items.filter((s) => s.niche === niche);
  if (query) {
    items = items.filter(
      (s) =>
        s.title.toLowerCase().includes(query) ||
        (s.entities || []).some((e) => e.includes(query))
    );
  }
  return {
    total: items.length,
    items: items.slice(offset, offset + limit).map((s) => ({
      id: s.id,
      title: s.title,
      niche: s.niche,
      wordCount: s.wordCount,
      collection: s.collection,
      titleShapes: s.titleShapes,
      entities: s.entities.slice(0, 6),
      preview: s.hook.text.slice(0, 240),
    })),
  };
}

module.exports = {
  loadIntelligence,
  retrieveTop3,
  searchIndex,
  queryFeatures,
};
