const fs = require("fs");
const path = require("path");
const db = require("../lib/db");
const { analyzeScript, buildStyleBible } = require("../lib/analyze");

const OUT_DIR = path.join(__dirname, "..", "data", "intelligence");

function main() {
  const { all } = db.loadAll();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const analyses = all.map(analyzeScript);
  const bible = buildStyleBible(analyses);
  const compact = analyses.map((a) => ({
    ...a,
    hook: {
      words: a.hook.words,
      openingSentence: a.hook.openingSentence,
      questionCount: a.hook.questionCount,
      titlePersonEarly: a.hook.titlePersonEarly,
      text: a.hook.text,
    },
  }));
  fs.writeFileSync(path.join(OUT_DIR, "index.json"), JSON.stringify(compact));
  fs.writeFileSync(path.join(OUT_DIR, "style-bible.json"), JSON.stringify(bible, null, 2));
  const summary = {
    scripts: compact.length,
    niches: compact.reduce((m, a) => {
      m[a.niche] = (m[a.niche] || 0) + 1;
      return m;
    }, {}),
    avgHookWords: bible.hook.targetWords,
    avgSentenceWords: bible.narration.avgSentenceWords,
    topTitleShapes: bible.titleShapes.slice(0, 8),
    topRehooks: bible.rehooks.slice(0, 8),
    topTransitions: bible.transitions.slice(0, 8),
  };
  fs.writeFileSync(path.join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main();
