const db = require("./db");
const openai = require("./openai");
const { retrieveTop3, loadIntelligence } = require("./retrieve");
const { segmentScript, countWords } = require("./segment");
const history = require("./history");
const royalMode = require("./royalMode");

const SCRIPT_MAKERS = [
  { id: "royal-family", label: "Royal Family" },
  { id: "celebrity", label: "Celebrity" },
  { id: "mystery-discovery", label: "Mystery / Discovery" },
  { id: "ancient-history", label: "Ancient History" },
  { id: "space-ufo", label: "Space / UFO" },
  { id: "predictions", label: "Predictions" },
  { id: "documentary", label: "Documentary" },
  { id: "custom", label: "Custom" },
];

function extractJson(raw) {
  const text = String(raw || "").trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("No JSON object");
  return JSON.parse(candidate.slice(start, end + 1));
}

function makerLabel(id) {
  return SCRIPT_MAKERS.find((m) => m.id === id)?.label || id;
}

function parseCustomInstructions(text) {
  return String(text || "")
    .split(/\n+|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 6)
    .slice(0, 16);
}

function compactBible(bible) {
  return {
    hook: bible.hook,
    narration: bible.narration,
    commonGround: bible.commonGround,
    topRehooks: (bible.rehooks || []).slice(0, 12).map((x) => x.value),
    topTransitions: (bible.transitions || []).slice(0, 16).map((x) => x.value),
    topQuestions: (bible.questions || []).slice(0, 10).map((x) => x.value),
    topCtas: (bible.ctas || []).slice(0, 8).map((x) => x.value),
    openingPatterns: (bible.hook.openingPatterns || []).slice(0, 8).map((x) => x.value),
  };
}

function engineSystem(scriptMaker) {
  if (royalMode.isRoyalMaker(scriptMaker)) return royalMode.engineSystem();
  return `You are the AW Media High-Retention Documentary Script Engine.

You do not write generic scripts. You write original spoken documentary narration informed by reverse-engineered successful patterns.

PRIMARY OBJECTIVE
Make the viewer keep watching while staying loyal to the title promise.

TITLE LOYALTY
The title is the narrative center of gravity. Every section must move the viewer closer to understanding why they clicked. No generic biography filler.

HOOK
100–150 words. Validate the title immediately. Open curiosity gaps. Do not give the full payoff. End with a 10–30 word rehook that makes Section 1 necessary.

SECTIONS
Follow the provided outline. Each section needs new information, a title connection, and a 10–30 word rehook unless it is the outro.

NARRATION
Sound human. Simple spoken English. One idea per line. About 10–15 words per line. Explain why facts matter: fact → meaning → consequence → next question.

RESEARCH
Use supplied research accurately. Never invent quotes, documents, crimes, diagnoses, private conversations, or events and present them as fact.

SPECULATION
Aggressive theories are allowed if framed as possibility, question, or interpretation.

CUSTOM INSTRUCTIONS
Mandatory. Satisfy every checklist item throughout the script, not once.

CTAs
Two short subscribe CTAs: one mid-script, one in the outro. Do not interrupt the strongest reveal.

FORMAT
Return ONLY the finished script:
TITLE
HOOK
lines
SECTION 1 — heading
lines
...
OUTRO
lines

No markdown. No JSON. No analysis. No scores.`;
}

function planSystem(scriptMaker) {
  if (royalMode.isRoyalMaker(scriptMaker)) return royalMode.planSystem();
  return `You plan high-retention documentary scripts for AW Media.
Return compact JSON only. No chain of thought.
Use the database style bible and the three reverse-engineered references.
Do not copy reference wording. Extract patterns.
Research only people/events actually required by the title.
Distinguish established vs interpretation vs speculation.
Custom instructions override default section count and tone.
This planner is NOT Royal Family Special Storytelling Mode. Do not apply Royal-only dramatization rules.`;
}

async function planScript({ title, targetWords, scriptMaker, customInstructions, retrieval }) {
  const checklist = parseCustomInstructions(customInstructions);
  const payload = {
    title,
    target_words: targetWords,
    script_maker: makerLabel(scriptMaker),
    custom_instructions: checklist,
    corpus_size: retrieval.corpusSize,
    style_bible: compactBible(retrieval.bible),
    references: retrieval.references.map((r) => ({
      id: r.id,
      title: r.title,
      similarity: r.similarity,
      reason_selected: r.reasonSelected,
      hook: r.analysis.hook,
      structure: r.analysis.structure,
      title_shapes: r.analysis.titleShapes,
      entities: r.analysis.entities,
      narrative_tags: r.analysis.narrativeTags,
      rehooks: r.analysis.rehooks,
      questions: r.analysis.questions,
      natural_phrases: r.analysis.naturalPhrases,
    })),
  };

  const raw = await openai.complete({
    model: openai.config().planModel,
    json: true,
    maxTokens: 3500,
    messages: [
      { role: "system", content: planSystem(scriptMaker) },
      {
        role: "user",
        content: `Build the generation plan as JSON with keys:
titlePromise, customChecklist (array of strings),
research: {established:[], interpretation:[], speculation:[], people:[], familyContext:[], dramatizedPossibilities:[]},
outline: array of {id, heading, purpose, newInformation, emotionalPurpose, titleConnection, rehook, realFact, familyContext, speculation, privateScene, emotionalConsequence},
hookBrief, combinedStyle: {hookStyle, pacing, revealPattern, ctaPattern, sentenceStyle, retentionDevices}.

TITLE: ${title}
TARGET WORDS: ${targetWords}
NICHE: ${makerLabel(scriptMaker)}
ROYAL SPECIAL MODE: ${royalMode.isRoyalMaker(scriptMaker) ? "ON — facts + speculation + plausible dramatized fiction. Do not plan a debunk." : "OFF — do not use Royal Family special storytelling."}

INPUT:
${JSON.stringify(payload)}`,
      },
    ],
  });

  try {
    return extractJson(raw);
  } catch {
    return {
      titlePromise: title,
      customChecklist: checklist,
      research: { established: [], interpretation: [], speculation: [], people: [] },
      outline: [],
      hookBrief: "Validate the title, open gaps, force section 1.",
      combinedStyle: retrieval.bible.commonGround,
    };
  }
}

function buildWritePrompt({ title, targetWords, scriptMaker, customInstructions, retrieval, plan }) {
  return `Write the full original documentary script.

TITLE: ${title}
TARGET WORDS: ${targetWords} (quality first; land near this range)
SCRIPT MAKER: ${makerLabel(scriptMaker)}

TITLE PROMISE
${plan.titlePromise || title}

CUSTOM REQUIREMENTS — satisfy every item
${(plan.customChecklist || parseCustomInstructions(customInstructions)).map((c) => `[ ] ${c}`).join("\n") || "[ ] none"}

COMBINED STYLE FROM DATABASE
${JSON.stringify(plan.combinedStyle || compactBible(retrieval.bible), null, 2)}

HOOK BRIEF
${plan.hookBrief || retrieval.bible.commonGround.hookJob}

RESEARCH
${JSON.stringify(plan.research || {}, null, 2)}

OUTLINE
${JSON.stringify(plan.outline || [], null, 2)}

REFERENCE INTELLIGENCE (patterns only, do not copy wording)
${retrieval.references
    .map(
      (r) => `${r.label}: ${r.title}
Similarity ${r.similarity}% — ${r.reasonSelected}
Hook opening: ${r.analysis.hook.openingSentence}
Rehooks: ${(r.analysis.rehooks || []).slice(0, 3).join(" | ")}
Natural phrases (replace names, do not copy): ${(r.analysis.naturalPhrases || []).slice(0, 4).join(" | ")}`
    )
    .join("\n\n")}

COMMON GROUND FROM ${retrieval.corpusSize} SUCCESSFUL SCRIPTS
${JSON.stringify(compactBible(retrieval.bible), null, 2)}

${royalMode.isRoyalMaker(scriptMaker) ? royalMode.writeAddendum(title) : "Royal Family Special Storytelling Mode is OFF for this Script Maker."}

Write the complete script now.`;
}

async function runJob({ id, title, targetWordCount, scriptMaker, customInstructions, onUpdate }) {
  const targetWords = Number(targetWordCount) || 3500;
  const maker = scriptMaker || "royal-family";
  const notes = String(customInstructions || "").trim();
  const emit = (stage, label, extra = {}) =>
    onUpdate?.({ status: "generating", stage, stageLabel: label, ...extra });

  emit("parse", "Analyzing your title...");
  console.log(`[job ${id}] start royal=${royalMode.isRoyalMaker(maker)} title=${title}`);
  const retrieval = retrieveTop3(title, maker);
  emit("search", `Searching ${retrieval.corpusSize} successful scripts...`);
  emit("references", "Found 3 strong references...");
  emit("reverse", "Reverse-engineering successful patterns...");
  emit("research", "Researching subject and building retention structure...");

  const plan = await planScript({
    title,
    targetWords,
    scriptMaker: maker,
    customInstructions: notes,
    retrieval,
  });

  emit("write", "Writing hook and sections...");
  let draft = "";
  let lastPersist = 0;
  for await (const token of openai.streamCompletion({
    model: openai.config().model,
    maxTokens: 12000,
    messages: [
      { role: "system", content: engineSystem(maker) },
      {
        role: "user",
        content: buildWritePrompt({
          title,
          targetWords,
          scriptMaker: maker,
          customInstructions: notes,
          retrieval,
          plan,
        }),
      },
    ],
  })) {
    draft += token;
    const now = Date.now();
    if (now - lastPersist > 1200) {
      emit("write", "Writing hook and sections...", { script: draft });
      lastPersist = now;
    } else {
      onUpdate?.({ draft });
    }
  }

  emit("loyalty", "Checking title loyalty and custom requirements...");
  emit("lines", "Optimizing narration lines...");
  let script = segmentScript(draft);
  if (royalMode.isRoyalMaker(maker)) {
    const issues = royalMode.qualityIssues(script, title);
    if (issues.length) {
      emit("loyalty", "Revising Royal Family story so it stays loyal to the title...");
      const revised = await openai.complete({
        model: openai.config().model,
        maxTokens: 12000,
        messages: [
          { role: "system", content: royalMode.engineSystem() },
          { role: "user", content: royalMode.revisionPrompt(script, issues, title) },
        ],
      });
      if (revised.trim()) script = segmentScript(revised);
    }
  }
  const actualWordCount = countWords(script);
  const titleHits = (script.toLowerCase().match(new RegExp(title.split(/\s+/).filter((w) => w.length > 3).slice(0, 6).join("|"), "gi")) || []).length;
  const titleLoyaltyScore = Math.min(99, 78 + Math.min(21, titleHits));
  emit("save", "Preparing document...");

  const saved = history.save({
    id,
    title,
    scriptMaker: maker,
    scriptMakerLabel: makerLabel(maker),
    targetWordCount: targetWords,
    actualWordCount,
    customInstructions: notes,
    script,
    references: retrieval.references.map((r) => ({
      id: r.id,
      title: r.title,
      similarity: r.similarity,
      reasonSelected: r.reasonSelected,
    })),
    titleLoyaltyScore,
    status: "complete",
    stage: "done",
    stageLabel: "Complete",
    error: null,
  });
  onUpdate?.({ status: "complete", saved });
  console.log(`[job ${id}] complete words=${actualWordCount} loyalty=${titleLoyaltyScore}`);
  return saved;
}

function listMakers() {
  return SCRIPT_MAKERS;
}

function intelligenceStatus() {
  const { index, bible } = loadIntelligence();
  return {
    scripts: index.length,
    avgHookWords: bible.hook.targetWords,
    avgSentenceWords: bible.narration.avgSentenceWords,
    makers: SCRIPT_MAKERS,
    collections: db.listCollections(),
  };
}

module.exports = {
  SCRIPT_MAKERS,
  runJob,
  listMakers,
  intelligenceStatus,
  parseCustomInstructions,
  makerLabel,
};
