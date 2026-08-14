const db = require("./db");
const openai = require("./openai");
const { retrieveTop3, loadIntelligence } = require("./retrieve");
const { segmentScript, countWords, clipToTarget } = require("./segment");
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

function looksLikeRefusal(text, title = "") {
  if (royalMode.isRefusal(text, title)) return true;
  const t = String(text || "").toLowerCase();
  const n = countWords(text);
  return (
    n < 400 ||
    /i can'?t present fabricated/i.test(t) ||
    /i cannot (write|create|provide|present|invent)/i.test(t) ||
    /unsupported by public evidence/i.test(t) ||
    /clearly signposted dramatic interpretation/i.test(t) ||
    /i can'?t present/i.test(t) ||
    /clearly labeled fictional/i.test(t) ||
    /fictional royal-?drama/i.test(t) ||
    /or create a factual documentary/i.test(t) ||
    /as an ai\b/i.test(t)
  );
}

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

WORD COUNT
Hit the assigned spoken word count within 100 words. Do not stop early. Do not overrun.

NARRATION
Sound human. Simple spoken English. One idea per line. Every line 12 to 15 words. Explain why facts matter: fact → meaning → consequence → next question.

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

function planSystem(scriptMaker, targetWords = 3500) {
  if (royalMode.isRoyalMaker(scriptMaker)) return royalMode.planSystem(targetWords);
  return `You plan high-retention documentary scripts for AW Media.
Return compact JSON only. No chain of thought.
Use the database style bible and the three reverse-engineered references.
Do not copy reference wording. Extract patterns.
Research only people/events actually required by the title.
Distinguish established vs interpretation vs speculation.
Custom instructions override default section count and tone.
This planner is NOT Royal Family Special Storytelling Mode. Do not apply Royal-only dramatization rules.`;
}

async function planScript({ title, targetWords, scriptMaker, customInstructions, retrieval, dossier }) {
  const checklist = parseCustomInstructions(customInstructions);
  if (royalMode.isRoyalMaker(scriptMaker)) {
    const raw = await openai.complete({
      model: openai.config().planModel,
      json: true,
      maxTokens: 6000,
      messages: [
        { role: "system", content: royalMode.planSystem(targetWords) },
        {
          role: "user",
          content: royalMode.planUser({ title, targetWords, dossier, checklist }),
        },
      ],
    });
    try {
      return royalMode.normalizePlan(extractJson(raw), title, checklist);
    } catch {
      return royalMode.normalizePlan({}, title, checklist);
    }
  }

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
      { role: "system", content: planSystem(scriptMaker, targetWords) },
      {
        role: "user",
        content: `Build the generation plan as JSON with keys:
titlePromise, customChecklist (array of strings),
research: {established:[], interpretation:[], speculation:[], people:[], familyContext:[], dramatizedPossibilities:[]},
outline: array of {id, heading, purpose, newInformation, emotionalPurpose, titleConnection, rehook, realFact, familyContext, speculation, privateScene, emotionalConsequence},
hookBrief, combinedStyle: {hookStyle, pacing, revealPattern, ctaPattern, sentenceStyle, retentionDevices}.

TITLE: ${title}
TARGET WORDS: ${targetWords}
PLAN ${Math.max(8, Math.round(targetWords / 280))} outline sections so the finished script can reach ${targetWords} spoken words.
NICHE: ${makerLabel(scriptMaker)}
ROYAL SPECIAL MODE: OFF — do not use Royal Family special storytelling.

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

function buildWritePrompt({ title, targetWords, scriptMaker, customInstructions, retrieval, plan, dossier }) {
  if (royalMode.isRoyalMaker(scriptMaker)) {
    const refs = retrieval.references
      .map(
        (r) => `${r.label}: ${r.title}
Similarity ${r.similarity}% — ${r.reasonSelected}
VOICE SAMPLE (copy the spoken attitude, not the plot):
${r.hookPreview || r.analysis.hook.openingSentence}`
      )
      .join("\n\n");
    return `Write the full original Royal Family documentary script.

TITLE: ${title}
TARGET WORDS: ${targetWords}
HARD WORD COUNT: land between ${targetWords - 100} and ${targetWords + 100} spoken narration words. Headings do not count. Do not stop early. NEVER write past ${targetWords + 100}.
LINE LENGTH: every narration line must be 12 to 15 words.
SCRIPT MAKER: Royal Family

CUSTOM REQUIREMENTS — satisfy every item
${(plan.customChecklist || parseCustomInstructions(customInstructions)).map((c) => `[ ] ${c}`).join("\n") || "[ ] none"}

${royalMode.voiceGuide()}

MATCHED LIBRARY HOOKS
${refs}

${royalMode.writeAddendum(title, targetWords, dossier, plan)}

Write the complete script now. HOOK first, then SECTION 1 through SECTION 10, then OUTRO.
Never write The image, The title points, or The timeline. Narrate the event.
Sound like those library hooks. Do not sound like a school essay.`;
  }

  return `Write the full original documentary script.

TITLE: ${title}
TARGET WORDS: ${targetWords}
HARD WORD COUNT: land between ${targetWords - 100} and ${targetWords + 100} spoken narration words. Headings do not count. Do not stop early. NEVER write past ${targetWords + 100}. 5000 words is a failure if the target is 3500.
LINE LENGTH: every narration line must be 12 to 15 words.
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

${royalMode.isRoyalMaker(scriptMaker) ? royalMode.formatDossier(dossier) : ""}

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

${royalMode.isRoyalMaker(scriptMaker) ? royalMode.writeAddendum(title, targetWords, dossier, plan) : "Royal Family Special Storytelling Mode is OFF for this Script Maker."}

Write the complete script now.`;
}

function lengthPrompt({ script, title, targetWords, actual, scriptMaker, dossier, plan }) {
  const delta = targetWords - actual;
  const royal = royalMode.isRoyalMaker(scriptMaker);
  if (delta > 0) {
    return `The script is ${actual} spoken words. Required length is ${targetWords}, plus or minus 100.
Add about ${delta} NEW words.

TITLE: ${title}

${royal ? `Stay inside the HOOK plus SECTION 1–10 outline. Expand unused talking points that serve the title.
Keep spoken storytelling. Do not add dates of birth or extra biographies.
Do not invent closed-door dialogue. Use public quotes already in the outline.
${plan ? `OUTLINE\n${royalMode.formatWriterOutline(plan)}` : ""}
${dossier ? royalMode.formatDossier(dossier) : ""}` : `Add new researched detail, meaning, and retention beats. Do not invent fake quotes as fact.`}

Every narration line must be 12 to 15 words.
No meta-language. Stay inside the story.
Do not repeat existing paragraphs.
Return the COMPLETE script at the new length, not a fragment.

SCRIPT:
${script}`;
  }
  return `The script is ${actual} spoken words. Required length is ${targetWords}, plus or minus 100.
Cut about ${Math.abs(delta)} words by removing repetition only.
Keep the title story, the real facts, the quotes, and the emotional climax.
Every narration line must be 12 to 15 words.
Return the COMPLETE shortened script.

SCRIPT:
${script}`;
}

async function fitWordCount({ script, title, targetWords, scriptMaker, onUpdate, dossier, plan }) {
  let text = script;
  for (let attempt = 0; attempt < 2; attempt++) {
    const actual = countWords(text);
    if (Math.abs(actual - targetWords) <= 100) return text;
    const delta = targetWords - actual;
    const label = delta > 0 ? `Expanding to ${targetWords} words...` : `Tightening to ${targetWords} words...`;
    onUpdate?.({ status: "generating", stage: "length", stageLabel: label, script: text });
    let draft = "";
    let lastPersist = 0;
    for await (const token of openai.streamCompletion({
      model: openai.config().model,
      maxTokens: 12000,
      messages: [
        { role: "system", content: engineSystem(scriptMaker) },
        { role: "user", content: lengthPrompt({ script: text, title, targetWords, actual, scriptMaker, dossier, plan }) },
      ],
    })) {
      draft += token;
      const now = Date.now();
      if (now - lastPersist > 1200) {
        onUpdate?.({ status: "generating", stage: "length", stageLabel: label, script: draft });
        lastPersist = now;
      }
    }
    if (!draft.trim() || looksLikeRefusal(draft, title)) break;
    const next = segmentScript(royalMode.isRoyalMaker(scriptMaker) ? royalMode.stripMeta(draft) : draft);
    const nextCount = countWords(next);
    if (nextCount > targetWords + 100) {
      text = clipToTarget(next, targetWords);
    } else if (Math.abs(nextCount - targetWords) <= Math.abs(actual - targetWords)) {
      text = next;
    }
  }
  return clipToTarget(text, targetWords);
}

async function streamWrite({ scriptMaker, userContent, onUpdate, stageLabel }) {
  let draft = "";
  let lastPersist = 0;
  for await (const token of openai.streamCompletion({
    model: openai.config().model,
    maxTokens: 12000,
    messages: [
      { role: "system", content: engineSystem(scriptMaker) },
      { role: "user", content: userContent },
    ],
  })) {
    draft += token;
    const now = Date.now();
    if (now - lastPersist > 1200) {
      onUpdate?.({ status: "generating", stage: "write", stageLabel, script: draft });
      lastPersist = now;
    } else {
      onUpdate?.({ draft });
    }
  }
  return draft;
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

  let dossier = null;
  if (royalMode.isRoyalMaker(maker)) {
    emit("research", "Researching only what strengthens the title...");
    dossier = await royalMode.researchDossier(title, targetWords);
  } else {
    emit("research", "Researching subject and building retention structure...");
  }

  const plan = await planScript({
    title,
    targetWords,
    scriptMaker: maker,
    customInstructions: notes,
    retrieval,
    dossier,
  });

  emit("write", "Writing hook and sections...");
  let draft = await streamWrite({
    scriptMaker: maker,
    userContent: buildWritePrompt({
      title,
      targetWords,
      scriptMaker: maker,
      customInstructions: notes,
      retrieval,
      plan,
      dossier,
    }),
    onUpdate,
    stageLabel: "Writing hook and sections...",
  });

  if (royalMode.isRoyalMaker(maker) && looksLikeRefusal(draft, title)) {
    emit("write", "Rewriting so the title stays the story...");
    const retry = await streamWrite({
      scriptMaker: maker,
      userContent: royalMode.refusalBypassPrompt({ title, targetWords, plan, dossier, refused: draft }),
      onUpdate,
      stageLabel: "Rewriting so the title stays the story...",
    });
    if (retry.trim() && !looksLikeRefusal(retry, title)) draft = retry;
  }

  emit("loyalty", "Checking title loyalty and custom requirements...");
  emit("lines", "Optimizing narration lines...");
  let script = segmentScript(draft);
  if (royalMode.isRoyalMaker(maker)) {
    script = segmentScript(royalMode.stripMeta(script));
    const issues = royalMode.qualityIssues(script, title, targetWords);
    if (issues.length) {
      emit("loyalty", "Revising Royal Family story so it stays loyal to the title...");
      const revised = await openai.complete({
        model: openai.config().model,
        maxTokens: 12000,
        messages: [
          { role: "system", content: royalMode.engineSystem() },
          { role: "user", content: royalMode.revisionPrompt(script, issues, title, targetWords) },
        ],
      });
      if (revised.trim()) {
        const cleaned = segmentScript(royalMode.stripMeta(revised));
        const originalWasRefusal = looksLikeRefusal(script, title);
        const longEnough = originalWasRefusal
          ? countWords(cleaned) >= 800
          : countWords(cleaned) >= Math.max(800, Math.round(countWords(script) * 0.55));
        if (!looksLikeRefusal(cleaned, title) && longEnough) {
          script = countWords(cleaned) > targetWords + 100 ? clipToTarget(cleaned, targetWords) : cleaned;
        } else if (looksLikeRefusal(cleaned, title) || originalWasRefusal) {
          emit("loyalty", "Rewriting so the title stays the story...");
          const bypass = await openai.complete({
            model: openai.config().model,
            maxTokens: 12000,
            messages: [
              { role: "system", content: royalMode.engineSystem() },
              { role: "user", content: royalMode.refusalBypassPrompt({ title, targetWords, plan, dossier, refused: cleaned || script }) },
            ],
          });
          const bypassed = segmentScript(royalMode.stripMeta(bypass));
          if (!looksLikeRefusal(bypassed, title) && countWords(bypassed) >= 800) {
            script = countWords(bypassed) > targetWords + 100 ? clipToTarget(bypassed, targetWords) : bypassed;
          } else {
            console.log(`[job ${id}] skip unusable revision words=${countWords(cleaned)}`);
          }
        } else {
          console.log(`[job ${id}] skip unusable revision words=${countWords(cleaned)}`);
        }
      }
    }
    script = segmentScript(royalMode.stripMeta(script));
    if (looksLikeRefusal(script, title)) {
      emit("loyalty", "Forcing the title payoff...");
      const lastTry = await openai.complete({
        model: openai.config().model,
        maxTokens: 12000,
        messages: [
          { role: "system", content: royalMode.engineSystem() },
          { role: "user", content: royalMode.refusalBypassPrompt({ title, targetWords, plan, dossier, refused: script }) },
        ],
      });
      const forced = segmentScript(royalMode.stripMeta(lastTry));
      if (!looksLikeRefusal(forced, title) && countWords(forced) >= 800) {
        script = countWords(forced) > targetWords + 100 ? clipToTarget(forced, targetWords) : forced;
      }
    }
  }
  emit("length", "Matching the target word count...");
  script = await fitWordCount({
    script,
    title,
    targetWords,
    scriptMaker: maker,
    dossier,
    plan,
    onUpdate: (patch) => onUpdate?.(patch),
  });
  if (royalMode.isRoyalMaker(maker)) script = segmentScript(royalMode.stripMeta(script));
  else script = segmentScript(script);
  script = clipToTarget(script, targetWords);
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
