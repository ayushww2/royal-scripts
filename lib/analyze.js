const ROYAL_ENTITIES = [
  ["princess diana", "diana"],
  ["queen elizabeth", "elizabeth ii", "the queen"],
  ["prince philip", "philip"],
  ["king charles", "prince charles", "charles"],
  ["queen camilla", "camilla parker bowles", "camilla"],
  ["prince william", "william"],
  ["kate middleton", "catherine", "princess of wales", "kate"],
  ["prince harry", "harry"],
  ["meghan markle", "meghan"],
  ["princess anne", "anne"],
  ["prince andrew", "andrew"],
  ["sarah ferguson", "fergie"],
  ["princess charlotte", "charlotte"],
  ["prince george", "george"],
  ["prince louis", "louis"],
  ["prince edward", "edward"],
  ["duchess sophie", "sophie"],
  ["lady louise", "louise"],
  ["tom parker bowles", "parker bowles"],
  ["charles spencer", "earl spencer"],
  ["buckingham palace", "the palace"],
  ["windsor", "windsor castle"],
  ["sandringham", "balmoral", "kensington", "highgrove"],
];

const ENTITY_CANON = {
  diana: "Diana",
  charles: "Charles",
  camilla: "Camilla",
  william: "William",
  harry: "Harry",
  meghan: "Meghan",
  catherine: "Catherine",
  elizabeth: "Elizabeth",
  philip: "Philip",
  anne: "Anne",
  andrew: "Andrew",
  charlotte: "Charlotte",
  george: "George",
  louis: "Louis",
  edward: "Edward",
  sophie: "Sophie",
  palace: "Palace",
};

const NARRATIVE_TAGS = {
  "tragic-revelation": ["before she died", "before he died", "final", "last wish", "autopsy", "funeral", "passed away", "death"],
  confession: ["confess", "admits", "admitted", "breaks silence", "revealed", "reveals", "tells the truth"],
  betrayal: ["betray", "affair", "cheating", "humiliated", "sidelined", "cut off", "banned", "stripped"],
  "secret-relationship": ["secret", "behind closed doors", "hidden", "private", "affair"],
  "family-conflict": ["fury", "explodes", "slams", "war", "fight", "confrontation", "court", "revenge"],
  "hidden-discovery": ["found", "uncovers", "discovered", "letter", "vault", "recording", "what they found"],
  "power-shift": ["takes control", "takes over", "seizes", "coronation", "abdicate", "heir", "title", "stripped"],
  "public-humiliation": ["humiliated", "live tv", "audience stunned", "destroys", "exposed"],
  warning: ["warned", "warning", "last warning", "don't ignore"],
  silence: ["breaks silence", "finally speaks", "refuses to speak", "won't answer"],
};

const TITLE_SHAPES = [
  { id: "before-died", re: /\bbefore (she|he|they) died\b/i },
  { id: "behind-closed-doors", re: /\bbehind closed doors\b/i },
  { id: "at-age", re: /\bat \d+\b/i },
  { id: "breaks-silence", re: /\bbreaks? silence\b/i },
  { id: "what-they-found", re: /\bwhat they found\b|\bhere'?s what they found\b/i },
  { id: "finally-revealed", re: /\bfinally (revealed|confirms|admits|speaks)\b/i },
  { id: "scientists-finally", re: /\bscientists finally\b/i },
  { id: "warned-us", re: /\bwarned (us|them|the world)\b/i },
  { id: "shocks-world", re: /\bshocks? (the )?(world|nation|everyone|palace|uk)\b/i },
  { id: "stuns", re: /\bstuns?\b/i },
  { id: "breaking", re: /\bbreaking\b/i },
  { id: "minutes-ago", re: /\b\d+ minutes? ago\b/i },
  { id: "caught", re: /\bcaught\b/i },
  { id: "exposed", re: /\bexpos(e|es|ed)\b/i },
  { id: "takes-control", re: /\btakes (control|over|action|revenge)\b/i },
  { id: "humiliated", re: /\bhumiliated\b/i },
  { id: "banned-stripped", re: /\b(banned|stripped|evicted|kicked out|thrown out)\b/i },
  { id: "secret-wish", re: /\bsecret (wish|letter|clause|vault|recording)\b/i },
  { id: "dna-court", re: /\b(dna|court|lawsuit|divorce)\b/i },
  { id: "you-wont-believe", re: /\byou won'?t believe\b|\bwill shock you\b|\bleaves? everyone\b/i },
];

const REHOOK_RES = [
  /\b(and )?(this|that) is where (things|it|the story)\b/i,
  /\bbut what happened next\b/i,
  /\bnow think about\b/i,
  /\bbecause if that (was|were) true\b/i,
  /\band really,? that raises\b/i,
  /\bhere'?s where (the story|things|it)\b/i,
  /\bbut that creates another problem\b/i,
  /\bto understand why\b/i,
  /\bwhat happened (next|inside|after)\b/i,
  /\band when .{3,40} (entered|appeared|happened)\b/i,
  /\bthe bigger question\b/i,
  /\bstick around\b/i,
  /\bbefore we (get|go) (into|any)\b/i,
  /\bbut there'?s (another|more)\b/i,
  /\bthat'?s not even\b/i,
];

const CTA_RE = /\b(subscribe|hit that|join us|smash|turn on (the )?notif|we'?ll see you|drop .+ comment|share this video)\b/i;
const QUESTION_RE = /[^.!?]*\?/g;
const VIEWER_RE = /\b(you|your|viewer|think about that|ask yourself|would you)\b/i;
const CLICHE_RE = /\b(little did they know|chilling truth|shocking truth|sinister secret|web of deception|tapestry|sends shivers|echoes through history|only time will tell)\b/gi;

function words(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function sentences(text) {
  const blocks = String(text || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
  const out = [];
  for (const block of blocks) {
    const w = block.split(/\s+/);
    if (w.length <= 40) {
      out.push(block);
      continue;
    }
    let buf = [];
    for (const word of w) {
      buf.push(word);
      if (buf.length >= 16 && /[,;:]$/.test(word)) {
        out.push(buf.join(" "));
        buf = [];
      } else if (buf.length >= 28) {
        out.push(buf.join(" "));
        buf = [];
      }
    }
    if (buf.length) out.push(buf.join(" "));
  }
  return out;
}

function paragraphs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hashEmbed(tokens, dim = 256) {
  const v = new Array(dim).fill(0);
  for (const token of tokens) {
    const h = hash32(token);
    const idx = h % dim;
    const sign = h & 1 ? 1 : -1;
    v[idx] += sign;
  }
  let mag = 0;
  for (const n of v) mag += n * n;
  mag = Math.sqrt(mag) || 1;
  return v.map((n) => Math.round((n / mag) * 10000) / 10000);
}

function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const den = Math.sqrt(magA) * Math.sqrt(magB);
  return den ? dot / den : 0;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function extractEntities(text) {
  const lower = String(text || "").toLowerCase();
  const found = new Set();
  for (const aliases of ROYAL_ENTITIES) {
    if (aliases.some((a) => lower.includes(a))) found.add(aliases[0]);
  }
  return [...found];
}

function extractNarrativeTags(text) {
  const lower = String(text || "").toLowerCase();
  return Object.entries(NARRATIVE_TAGS)
    .filter(([, keys]) => keys.some((k) => lower.includes(k)))
    .map(([tag]) => tag);
}

function titleFormat(title) {
  let t = String(title || "");
  t = t.replace(/\bprincess diana\b/gi, "PERSON");
  t = t.replace(/\bprince (william|harry|charles|andrew|edward|philip|george|louis)\b/gi, "PERSON");
  t = t.replace(/\b(king charles|queen camilla|queen elizabeth|princess anne|princess charlotte|kate middleton|catherine|meghan markle|camilla|diana|william|harry|charles)\b/gi, "PERSON");
  t = t.replace(/\b\d+\b/g, "N");
  const shapes = TITLE_SHAPES.filter((s) => s.re.test(title)).map((s) => s.id);
  return { template: t.replace(/\s+/g, " ").trim(), shapes };
}

function normalizePhrase(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\b(diana|charles|camilla|william|harry|meghan|catherine|kate|anne|elizabeth|philip|andrew|charlotte|george|louis|edward|sophie)\b/gi, "PERSON")
    .replace(/[^a-z'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRehooks(text) {
  const sents = sentences(text);
  const hits = [];
  for (const s of sents) {
    if (REHOOK_RES.some((re) => re.test(s)) || (s.includes("?") && VIEWER_RE.test(s))) {
      hits.push(s);
    }
  }
  return hits.slice(0, 12);
}

function extractCtas(text) {
  return sentences(text).filter((s) => CTA_RE.test(s)).slice(0, 6);
}

function hookBlock(text) {
  const w = words(text);
  const hookWords = w.slice(0, 140).join(" ");
  const sents = sentences(hookWords);
  return {
    words: Math.min(w.length, 140),
    text: hookWords,
    openingSentence: sents[0] || "",
    questionCount: (hookWords.match(/\?/g) || []).length,
    titlePersonEarly: /diana|charles|camilla|william|harry|meghan|catherine|anne/i.test(sents.slice(0, 2).join(" ")),
  };
}

function inferNiche(script) {
  const title = String(script.title || "");
  const blob = `${title}\n${String(script.text || "").slice(0, 1500)}`.toLowerCase();
  const royalHit = extractEntities(`${title}\n${blob}`).length > 0 ||
    /\b(royal family|buckingham|windsor|palace|queen|prince|princess|king charles|camilla|diana)\b/i.test(blob);
  if (royalHit) return "royal-family";
  if (/\b(ufo|alien|nasa|galaxy|asteroid|moon landing|mars rover)\b/i.test(blob)) return "space-ufo";
  if (/\b(pyramid|pharaoh|ancient egypt|roman empire|artifact)\b/i.test(blob)) return "ancient-history";
  if (/\b(predict|prophecy|psychic|year 20\d{2} prediction)\b/i.test(blob)) return "predictions";
  if (/\b(hollywood|oscar|celebrity|pop star)\b/i.test(blob)) return "celebrity";
  if (/\b(mystery|unexplained|discovery channel)\b/i.test(blob)) return "mystery-discovery";
  return "documentary";
}

function analyzeScript(script) {
  const text = script.text || "";
  const title = script.title || "";
  const paras = paragraphs(text);
  const sents = sentences(text);
  const w = words(text);
  const sentLens = sents.map((s) => words(s).length);
  const avgSentence = sentLens.length
    ? Math.round(sentLens.reduce((a, b) => a + b, 0) / sentLens.length)
    : 0;
  const format = titleFormat(title);
  const entities = extractEntities(`${title}\n${text}`);
  const narrativeTags = extractNarrativeTags(`${title}\n${text.slice(0, 2500)}`);
  const hook = hookBlock(text);
  const rehooks = extractRehooks(text);
  const ctas = extractCtas(text);
  const qs = (text.match(QUESTION_RE) || []).map((q) => q.trim()).filter((q) => q.length > 8).slice(0, 16);
  const ctaPositions = ctas.map((cta) => {
    const idx = text.indexOf(cta.slice(0, 40));
    return idx < 0 ? null : Math.round((idx / Math.max(text.length, 1)) * 100);
  }).filter((n) => n != null);

  const titleTokens = [
    ...tokenize(title),
    ...format.shapes.map((s) => `shape:${s}`),
    ...tokenize(format.template),
  ];
  const contentTokens = [
    ...tokenize(hook.text),
    ...entities.map((e) => `ent:${e}`),
    ...narrativeTags.map((t) => `tag:${t}`),
    ...tokenize(rehooks.slice(0, 4).join(" ")),
  ];

  return {
    id: script.id,
    title,
    collection: script.collection,
    niche: inferNiche(script),
    wordCount: script.wordCount || w.length,
    createdAt: script.createdAt || null,
    titleFormat: format.template,
    titleShapes: format.shapes,
    entities,
    narrativeTags,
    hook,
    structure: {
      paragraphs: paras.length,
      estimatedSections: Math.max(6, Math.min(12, Math.round(paras.length / 3) || 10)),
      avgSentenceWords: avgSentence,
      questionCount: qs.length,
      viewerAddressCount: sents.filter((s) => VIEWER_RE.test(s)).length,
      ctaCount: ctas.length,
      ctaPositions,
    },
    rehooks: rehooks.slice(0, 8),
    transitions: rehooks.slice(0, 8).map(normalizePhrase),
    ctas: ctas.map(normalizePhrase),
    questions: qs.slice(0, 8),
    naturalPhrases: sents
      .filter((s) => /^(and |but |now |because |so |here)/i.test(s) && words(s).length <= 18)
      .slice(0, 10)
      .map(normalizePhrase),
    titleEmbedding: hashEmbed(titleTokens),
    contentEmbedding: hashEmbed(contentTokens),
  };
}

function topCounts(items, n = 24) {
  const counts = new Map();
  for (const item of items) {
    if (!item) continue;
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([value, count]) => ({ value, count }));
}

function buildStyleBible(analyses) {
  const hooks = analyses.map((a) => a.hook);
  const hookWords = hooks.map((h) => h.words);
  const avgHook = Math.round(hookWords.reduce((a, b) => a + b, 0) / hookWords.length);
  const avgSentence = Math.round(
    analyses.reduce((n, a) => n + a.structure.avgSentenceWords, 0) / analyses.length
  );
  const shapeCounts = topCounts(analyses.flatMap((a) => a.titleShapes), 16);
  const entityCounts = topCounts(analyses.flatMap((a) => a.entities), 20);
  const tagCounts = topCounts(analyses.flatMap((a) => a.narrativeTags), 16);
  const rehooks = topCounts(analyses.flatMap((a) => a.transitions).filter((p) => p.length > 12), 30);
  const phrases = topCounts(analyses.flatMap((a) => a.naturalPhrases).filter((p) => p.length > 10), 40);
  const questions = topCounts(
    analyses.flatMap((a) => a.questions.map(normalizePhrase)).filter((p) => p.length > 12),
    20
  );
  const ctas = topCounts(analyses.flatMap((a) => a.ctas).filter((p) => p.length > 10), 16);
  const openings = topCounts(
    analyses.map((a) => normalizePhrase(a.hook.openingSentence)).filter((p) => p.length > 12),
    20
  );

  return {
    corpusSize: analyses.length,
    hook: {
      targetWords: avgHook,
      personAppearsImmediately: Math.round(
        (analyses.filter((a) => a.hook.titlePersonEarly).length / analyses.length) * 100
      ),
      typicalQuestions: Math.round(
        (hooks.reduce((n, h) => n + h.questionCount, 0) / analyses.length) * 10
      ) / 10,
      openingPatterns: openings,
    },
    narration: {
      avgSentenceWords: avgSentence,
      questionsPerScript: Math.round(
        analyses.reduce((n, a) => n + a.structure.questionCount, 0) / analyses.length
      ),
      ctasPerScript: Math.round(
        (analyses.reduce((n, a) => n + a.structure.ctaCount, 0) / analyses.length) * 10
      ) / 10,
      estimatedSections: 10,
    },
    titleShapes: shapeCounts,
    dominantEntities: entityCounts,
    narrativeTags: tagCounts,
    rehooks,
    transitions: phrases,
    questions,
    ctas,
    commonGround: {
      hookJob: "Validate the title in the first two sentences, open 2–3 curiosity gaps, withhold the full payoff, then force Section 1 with a 10–30 word rehook.",
      rehookJob: "End sections by creating a new unanswered need: contradiction, withheld detail, new person, or incomplete explanation. Vary the formula.",
      lineJob: "One spoken idea per line, about 10–15 words, visual-beat friendly.",
      ctaJob: "Two short subscribe CTAs: one near the middle woven into story, one in the outro. Never interrupt the strongest reveal.",
      payoffJob: "Release the title promise as a ladder across hook → early proof → contradiction → climax → lingering question.",
    },
  };
}

module.exports = {
  ROYAL_ENTITIES,
  TITLE_SHAPES,
  CLICHE_RE,
  words,
  sentences,
  paragraphs,
  cosine,
  hashEmbed,
  tokenize,
  extractEntities,
  extractNarrativeTags,
  titleFormat,
  normalizePhrase,
  analyzeScript,
  buildStyleBible,
  inferNiche,
};
