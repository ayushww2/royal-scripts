const { countWords, lineStats } = require("./segment");

const META_RES = [
  /\bin this dramatized (account|scene|moment|version|climax|story|sequence)\b/gi,
  /\bin this reconstruction\b/gi,
  /\bfor the purposes of this story\b/gi,
  /\bwe can imagine\b/gi,
  /\blet us imagine\b/gi,
  /\b(one|you) can imagine\b/gi,
  /\bthis fictional moment\b/gi,
  /\bin (this|the) fictional (scene|moment|account)\b/gi,
  /\bthis generated script\b/gi,
  /\bas a dramatization\b/gi,
  /\bdramatized (account|scene|climax|story|stories|version|moment|sequence)\b/gi,
  /\bimagined (memory|memories|words|message|conversation|conversations|private exchange|account|letter|note|scene|moment)\b/gi,
  /\bcarefully told royal history and dramatized stories\b/gi,
];

const OUTLINE_SPEAK_RES = [
  /\bthe image begins\b/i,
  /\bthe image shows\b/i,
  /\bthe title points\b/i,
  /\bthe title promises\b/i,
  /\bthe title says\b/i,
  /\bthe title event\b/i,
  /\bthis section\b/i,
  /\bthe timeline shows\b/i,
  /\bthe timeline of\b/i,
  /\binside the royal timeline\b/i,
  /\bthe documentary\b/i,
  /\bthe outline\b/i,
  /\bresearch used\b/i,
  /\btalking points\b/i,
  /\bcontrolling viewer question\b/i,
  /\bnew question created\b/i,
  /\bsuspense bridge\b/i,
  /\bloyalty check\b/i,
];

const DEBUNK_RES = [
  /\bthere is no evidence\b/i,
  /\bthis has never been verified\b/i,
  /\bno public record confirms\b/i,
  /\bthis story may not be true\b/i,
  /\bno authoritative source\b/i,
  /\bonly a rumor\b/i,
  /\bthis appears to be only a rumor\b/i,
  /\bwe cannot confirm\b/i,
  /\bthis may not have happened\b/i,
  /\bthere is no proof\b/i,
  /\bunverified claim\b/i,
  /\bno official confirmation\b/i,
  /\bthis is just speculation\b/i,
  /\bof course this might not be true\b/i,
  /\bno authenticated record\b/i,
  /\bno reliable account\b/i,
  /\bunsupported (palace |royal )?(conversation|letter|message|claim|revelation|wording)\b/i,
  /\bpalace mythology\b/i,
  /\bthe verified (history|record)\b/i,
  /\bno secret wording\b/i,
  /\bthe claim and the record\b/i,
  /\bdoes not show anne revealing\b/i,
  /\bhistory remains stronger than\b/i,
];

function recapitalizeLines(text) {
  return String(text || "")
    .replace(/(^|[\n.!?])([ \t]*)([a-z])/g, (_, left, space, ch) => left + space + ch.toUpperCase())
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      if (!trimmed) return line;
      return line.replace(/^(\s*)([a-z])/, (_, space, ch) => space + ch.toUpperCase());
    })
    .join("\n");
}

function stripMeta(script) {
  let text = String(script || "");
  const replacements = [
    [/,?[ \t]*\bin this dramatized (account|scene|moment|version|climax|story|sequence)\b,?/gi, ""],
    [/\bIn this reconstruction,?\s*/gi, ""],
    [/\bin this reconstruction,?\s*/gi, ""],
    [/\bfor the purposes of this story,?\s*/gi, ""],
    [/\bWe can imagine that\s+/gi, ""],
    [/\bwe can imagine that\s+/gi, ""],
    [/\bwe can imagine\s+/gi, ""],
    [/\bLet us imagine that\s+/gi, ""],
    [/\blet us imagine\s+/gi, ""],
    [/\b(one|you) can imagine that\s+/gi, ""],
    [/\b(one|you) can imagine\s+/gi, ""],
    [/\bthis fictional moment,?\s*/gi, ""],
    [/,?[ \t]*\bin (this|the) fictional (scene|moment|account)\b,?/gi, ""],
    [/\bthis generated script,?\s*/gi, ""],
    [/\bas a dramatization,?\s*/gi, ""],
    [/\ban imagined memory\b/gi, "a memory"],
    [/\bone imagined memory\b/gi, "one memory"],
    [/\bthis imagined memory\b/gi, "this memory"],
    [/\bthe imagined words\b/gi, "the words"],
    [/\bfinal imagined words\b/gi, "final words"],
    [/\bDiana’s imagined message\b/gi, "Diana’s message"],
    [/\bDiana's imagined message\b/gi, "Diana's message"],
    [/\bthe imagined message\b/gi, "the message"],
    [/\ban imagined conversation\b/gi, "a conversation"],
    [/\bthe imagined private exchange\b/gi, "the private exchange"],
    [/\bin the imagined private exchange\b/gi, "in the private exchange"],
    [/\bfor more carefully told royal history and dramatized stories, subscribe\b/gi, "If this story matters to you, subscribe"],
    [/\band dramatized stories\b/gi, "and royal stories"],
    [/\bdramatized stories\b/gi, "royal stories"],
    [/\bimagined answering\b/gi, "answered"],
    [/\bimagined telling\b/gi, "told"],
    [/\bimagined saying\b/gi, "said"],
    [/\bimagined whispering\b/gi, "whispered"],
    [/\bimagined asking\b/gi, "asked"],
    [/\bimagined promising\b/gi, "promised"],
    [/\bimagined repeating\b/gi, "repeated"],
    [/\bimagined (memory|memories|words|message|conversation|conversations|private exchange|account|letter|note|scene|moment)\b/gi, "$1"],
  ];
  for (const [re, to] of replacements) text = text.replace(re, to);
  text = text.replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:!?])/g, "$1").replace(/\n{3,}/g, "\n\n");
  text = text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return !/^(research used|talking points|hook talking points|hook material|controlling viewer question|new question created|suspense bridge|documentary hook outline|royal title loyalty check|private planning notes|private notes to turn into narration)\b/i.test(t);
    })
    .join("\n");
  return recapitalizeLines(text).replace(/^\s+/gm, "").trim();
}

function isRoyalMaker(scriptMaker) {
  return scriptMaker === "royal-family";
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

function circleForTitle(title) {
  const t = String(title || "").toLowerCase();
  const circle = new Set(
    titleTerms(title).filter((x) =>
      ["diana", "william", "harry", "charles", "camilla", "anne", "elizabeth", "philip", "catherine", "meghan"].includes(x)
    )
  );
  if (/(william|harry|diana|anne|charles)/.test(t)) {
    ["william", "harry", "diana", "charles", "anne", "elizabeth"].forEach((x) => circle.add(x));
  }
  if (/(diana|charles|camilla|william|harry)/.test(t)) circle.add("camilla");
  return [...circle];
}

const FACT_RE =
  /\b(19\d{2}|20\d{2}|kensington|buckingham|windsor|balmoral|westminster|st james|st\. james|highgrove|sandringham|althorp|white waltham|st mary'?s|pont de l'?alma|paris|divorce|funeral|coffin|wedding|coronation|investiture|princess royal|queen elizabeth|king charles|prince of wales|duchess of cornwall|queen camilla|spencer|candle in the wind|elton john|pont|abbey)\b/gi;

function factHits(text) {
  return (String(text || "").match(FACT_RE) || []).length;
}

function uniqueYears(text) {
  return [...new Set(String(text || "").match(/\b(?:19|20)\d{2}\b/g) || [])];
}

function researchSystem() {
  return `You are an AW Media Royal Family documentary researcher.
Return compact JSON only. No chain of thought.

HIGHEST RULE: research ONLY what strengthens the TITLE.
The title is the promise. Do not collect broad royal biographies.
Do not list everyone's date of birth, childhood, or full marriage history.
Do not research against the title. Do not prepare a debunk.

Find the main royal subject, the exact title event, the emotional wound, the palace pressure, and the public-record details that make the title feel inevitable.
Prioritize palace statements, public appearances, speeches, interviews, memoirs, legal/inheritance records, memorials, duty changes, documented timelines, and visible gestures.
Every fact must answer: how does this make the title stronger, more emotional, or more understandable?
If it does not help the title, leave it out.`;
}

function researchUser(title, targetWords = 3500) {
  const target = Number(targetWords) || 3500;
  return `Research this Royal Family title. Return JSON only.

TITLE: ${title}
TARGET WORDS: ${target}

Keys:
titleEvent, mainSubject, emotionalWound, palacePressure, expectedEvidence, requiredPayoff,
supportingFacts: array of at most 14 objects {fact, date, people, howItStrengthensTitle}
quotes: array of up to 8 public quotes {speaker, quote, context} from interviews, speeches, memoirs, or palace statements that serve the title
dotsToConnect: string[] of cause-and-effect links from past wound to present title event

Do not include a person's date of birth unless the title is about a birthday.
Do not dump Camilla, Charles, Elizabeth, or the children unless they directly strengthen THIS title.`;
}

async function researchDossier(title, targetWords = 3500) {
  const openai = require("./openai");
  const raw = await openai.complete({
    model: openai.config().planModel,
    json: true,
    maxTokens: 2500,
    messages: [
      { role: "system", content: researchSystem() },
      { role: "user", content: researchUser(title, targetWords) },
    ],
  });
  try {
    const dossier = extractJson(raw);
    return {
      titleEvent: dossier.titleEvent || title,
      mainSubject: dossier.mainSubject || "",
      emotionalWound: dossier.emotionalWound || "",
      palacePressure: dossier.palacePressure || "",
      expectedEvidence: dossier.expectedEvidence || "",
      requiredPayoff: dossier.requiredPayoff || "",
      supportingFacts: dossier.supportingFacts || [],
      quotes: dossier.quotes || [],
      dotsToConnect: dossier.dotsToConnect || [],
    };
  } catch {
    return { titleEvent: title, mainSubject: "", emotionalWound: "", palacePressure: "", expectedEvidence: "", requiredPayoff: "", supportingFacts: [], quotes: [], dotsToConnect: [] };
  }
}

function formatDossier(dossier) {
  if (!dossier) return "";
  return `TITLE-ONLY ROYAL RESEARCH
Use these points only when they strengthen the title. Do not turn them into a biography lesson.

${JSON.stringify(dossier, null, 2)}`;
}

function titleTerms(title) {
  const lower = String(title || "").toLowerCase();
  const keys = [
    "diana", "william", "harry", "charles", "camilla", "anne", "catherine",
    "meghan", "elizabeth", "philip", "charlotte", "george", "louis",
    "message", "letter", "sons", "crying", "tears", "final",
  ];
  const found = keys.filter((k) => lower.includes(k));
  if (found.length) return found;
  const stop = new Set(["after", "before", "about", "with", "from", "that", "this", "what", "when", "them", "their", "they", "then", "just", "into", "over", "prince", "princess", "queen", "king"]);
  return lower
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 4 && !stop.has(w));
}

function planSystem(targetWords = 3500) {
  const target = Number(targetWords) || 3500;
  return `You are the AW Media Royal Family title-loyal research-to-outline strategist.
Return compact JSON only. No chain of thought. Do not write the full script.

ROYAL MODE ONLY.

HIGHEST RULE: THE ONLY NARRATIVE LOYALTY IS TO THE TITLE.
The title is the promise. Every research point, talking point, quote, and section must strengthen the exact title payoff.
Never research against the title. Never replace the literal promise with a symbolic or weaker ending.
Never let palace background, royal history, or another family member steal the documentary.

Build:
- one separate DOCUMENTARY HOOK (not Section 1)
- EXACTLY 10 main sections with the functions below
- a royal title loyalty check

Hook material for a 130–170 word opening.
Ten sections plus hook and outro must carry a ${target}-word spoken documentary in storytelling tone, like Crown Watch / Prime Expedition Royal scripts.
Not a Wikipedia page. Not a list of birth dates. Spoken storytelling first.

HEADINGS
heading must be 4–8 royal-specific words about THIS title.
NEVER copy the function names below as headings.
BAD heading: THE ROYAL MOMENT THAT CHANGED EVERYTHING
BAD heading: WHAT HAPPENED INSIDE THE ROYAL TIMELINE
GOOD heading: Anne Speaks and William Breaks
GOOD heading: The Coffin Walk of 1997

TALKING POINTS ARE STORY FACTS THE NARRATOR CAN SPEAK
BAD: The image begins with William walking silently behind Diana’s coffin.
BAD: The title points toward one devastating instant.
BAD: The timeline shows what happened next.
GOOD: William walked behind Diana’s coffin on 6 September 1997.
GOOD: Anne waited until the room was quiet, then spoke Diana’s words.
Never start a talking point with: The image, The title, The timeline, This section, The documentary, The outline, The viewer.

SECTION FUNCTIONS (internal jobs, not headings)
1 present event, people, date/place, first action
2 sequence leading to the title event
3 first major evidence (letter, statement, appearance, duty change)
4 only the past that gives this event emotional power
5 duty, succession, public expectation colliding with loyalty
6 the action that proved this was more than quiet disagreement
7 combined meaning; title event becoming unavoidable
8 strongest obstacle; it must NOT defeat the title
9 assemble the chain; payoff feels earned but not fully delivered
10 literal title event, emotional meaning, final question

SLOW BURN
Validate the title immediately. Do not dump the full payoff in the hook or Section 1.
Each section answers one question and makes the next section necessary.
Mix past into present only when it changes the meaning of the current title event.
Cause-and-effect: wound → relationship change → palace response → pressure across years → present event → the subject acts → title fulfilled.

QUOTES
Include one usable quote in the hook and in each section when possible.
Prefer public interviews, speeches, memoirs, and palace statements.
A short spoken line that serves the title is allowed in talking points. Do not label it fictional.
Do not invent secret letters, fake legal actions, or false palace announcements.

TALKING POINTS must be actual documentary content the writer can expand, not instructions like "explain their relationship."

FORBIDDEN in headings, talking points, bridges, and the loyalty check:
fictional, fiction, fake, hoax, fabricated, invented, exaggerated, debunked, unverified, rumor, gossip, misunderstanding, nothing happened, misleading, no evidence, claim falls apart, most realistic explanation, less dramatic, no one really knows, does not prove, cannot be confirmed, probably did not happen.

Do not write like a fact-check. Do not sound embarrassed by the title.
Empty suspense is forbidden: no "what happened next shocked everyone."

JSON KEYS
titlePromise
hook: { researchUsed: string[], talkingPoints: string[], quote, controllingQuestion, transitionToSection1 }
sections: array of EXACTLY 10 objects {
  id (1-10),
  heading (short, emotional, royal-specific),
  researchUsed: string[],
  talkingPoints: string[] (5 items of real content),
  quote,
  newQuestion,
  suspenseBridge
}
loyaltyCheck: {
  promisedEvent, mainSubject, emotionalWound, strongestEvidence,
  everySectionTied (true), strongestEmotionalSection, driftRiskSection,
  excludedBackground, palaceObstacle, questionIntoSection10,
  literalPayoff, emotionalMeaning, viewerSatisfaction
}`;
}

function planUser({ title, targetWords, dossier, checklist }) {
  const target = Number(targetWords) || 3500;
  return `Create the title-loyal hook + exactly 10 sections for this documentary.

TITLE: ${title}
TARGET SPOKEN WORDS: ${target}
HOOK: 130–170 words of material in talking points.
Each of the 10 sections must hold enough content for about ${Math.max(220, Math.round((target - 250) / 10))} spoken words.

CUSTOM REQUIREMENTS
${(checklist || []).map((c) => `- ${c}`).join("\n") || "- none"}

TITLE RESEARCH
${JSON.stringify(dossier || {}, null, 2)}

Return the JSON specified in the system prompt.
Every talking point must serve THIS title.
Do not add extra sections. Do not write birth-date biographies.
Do not write The image / The title / The timeline as talking points.
Headings must be royal-specific, never the internal function names.`;
}

function asList(value) {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean);
  if (value == null || value === "") return [];
  return [String(value).trim()].filter(Boolean);
}

function normalizePlan(plan, title, checklist = []) {
  const src = plan && typeof plan === "object" ? plan : {};
  const hook = src.hook && typeof src.hook === "object" ? src.hook : {};
  const rawSections = Array.isArray(src.sections) ? src.sections : Array.isArray(src.outline) ? src.outline : [];
  const defaults = [
    "The Moment That Forced It",
    "What Came Before the Break",
    "The Proof They Could Not Hide",
    "The Wound That Never Closed",
    "The Pressure Inside the Palace",
    "The Action That Made It Public",
    "What the Evidence Now Means",
    "The Obstacle That Could Not Stop It",
    "The Choice That Locked the Ending",
    "The Payoff the Title Promised",
  ];
  const sections = [];
  for (let i = 0; i < 10; i++) {
    const s = rawSections[i] && typeof rawSections[i] === "object" ? rawSections[i] : {};
    sections.push({
      id: i + 1,
      heading: String(s.heading || defaults[i]).replace(/^\d+\.?\s*/, "").trim(),
      researchUsed: asList(s.researchUsed),
      talkingPoints: asList(s.talkingPoints).slice(0, 8),
      quote: s.quote ? String(s.quote).trim() : "",
      newQuestion: String(s.newQuestion || s.rehook || "").trim(),
      suspenseBridge: String(s.suspenseBridge || s.rehook || "").trim(),
    });
  }
  const loyalty = src.loyaltyCheck && typeof src.loyaltyCheck === "object" ? src.loyaltyCheck : {};
  return {
    titlePromise: src.titlePromise || title,
    customChecklist: asList(src.customChecklist).length ? asList(src.customChecklist) : checklist,
    hook: {
      researchUsed: asList(hook.researchUsed),
      talkingPoints: asList(hook.talkingPoints),
      quote: hook.quote ? String(hook.quote).trim() : "",
      controllingQuestion: String(hook.controllingQuestion || "").trim(),
      transitionToSection1: String(hook.transitionToSection1 || hook.transitionIntoSection1 || "").trim(),
    },
    sections,
    loyaltyCheck: loyalty,
    combinedStyle: src.combinedStyle || null,
    research: src.research || null,
    outline: sections,
    hookBrief: asList(hook.talkingPoints).join(" "),
  };
}

function formatWriterOutline(plan) {
  if (!plan) return "";
  const hook = plan.hook || {};
  const lines = [
    "PRIVATE PLANNING NOTES — never print these labels on the script page.",
    "Turn every bullet into spoken narration. Do not copy the words The image, The title, or The timeline.",
    "",
    "HOOK MATERIAL",
    ...asList(hook.talkingPoints).map((x) => `- ${x}`),
  ];
  if (hook.quote) lines.push(`Quote: ${hook.quote}`);
  if (hook.controllingQuestion) lines.push(`Controlling Viewer Question: ${hook.controllingQuestion}`);
  if (hook.transitionToSection1) lines.push(`Transition Into Section 1: ${hook.transitionToSection1}`);
  for (const s of plan.sections || []) {
    lines.push("");
    lines.push(`${s.id}. ${s.heading}`);
    lines.push(...asList(s.talkingPoints).map((x) => `- ${x}`));
    if (s.quote) lines.push(`Quote: ${s.quote}`);
    if (s.newQuestion) lines.push(`Next: ${s.newQuestion}`);
    if (s.suspenseBridge) lines.push(`Then: ${s.suspenseBridge}`);
  }
  const l = plan.loyaltyCheck || {};
  if (Object.keys(l).length) {
    lines.push("");
    lines.push("PAYOFF YOU MUST DELIVER");
    lines.push(String(l.literalPayoff || l.promisedEvent || "").trim());
  }
  return lines.join("\n");
}

function engineSystem() {
  return `You are the AW Media Royal Family documentary script writer.
This mode applies ONLY when Script Maker is Royal Family.

You write spoken YouTube documentaries in the trained library voice: Crown Watch and Prime Expedition.
You are the narrator. You are not a planner, a critic, or a Wikipedia page.

THE SCRIPT IS THE STORY, NOT THE OUTLINE
Never write about the documentary. Tell it.
Forbidden narration openers and phrases:
- The image begins / The image shows
- The title points / The title promises / The title says
- The timeline / This section / The documentary / The outline
- Research used / Talking points / Controlling viewer question / Suspense bridge
If a planning note says "the title event," you still write the event as if the viewer is inside it.

BAD:
The image begins with William walking silently behind Diana’s coffin.
The title points toward one devastating instant.

GOOD:
William walked behind Diana’s coffin through a silent London street.
Anne waited until the room was quiet enough to speak.

Open like the database:
So Sophie, Duchess of Edinburgh, just turned 60.
Something just happened inside the walls of Buckingham Palace.
Walked into that state banquet wearing the Cambridge lover’s knot tiara.

Start with a person, a place, a date that matters, or a public action. Never start with The image or The title.

YOU MUST WRITE ALL 10 SECTIONS
Output this exact skeleton, filled with spoken narration:
TITLE
HOOK
spoken hook, 130–170 words
SECTION 1 — royal heading
full spoken section
SECTION 2 — royal heading
full spoken section
SECTION 3 — royal heading
full spoken section
SECTION 4 — royal heading
full spoken section
SECTION 5 — royal heading
full spoken section
SECTION 6 — royal heading
full spoken section
SECTION 7 — royal heading
full spoken section
SECTION 8 — royal heading
full spoken section
SECTION 9 — royal heading
full spoken section
SECTION 10 — royal heading
full spoken section, the exact title payoff
OUTRO
spoken close
Stopping after Section 1 is a failure. Outline bullets are a failure. Each section needs real spoken paragraphs, not one sentence.

DATABASE TONE
Sound like a narrator speaking to one viewer who already loves this family.
Open on the title event. Keep returning to it.
Mix past into present only when it changes the meaning of THIS title.
Use cause and effect: a wound, a relationship change, palace pressure, a present action, the title payoff.
Keep sentences spoken, emotional, short, and clear.
Use public quotes supplied in the outline. Do not invent private palace conversations, secret letters, or fake legal actions.
If a closed-door moment is not public, show timing, duty, public action, and consequence instead of fake dialogue.
Do not list birthdays, childhoods, or every royal marriage.
Do not stop for a biography of anyone not required by the title.
If a date matters, it is the date of the title event, an anniversary, a funeral, a memorial, a statement, or a decision — never a date of birth unless the title is about a birthday.

FORMAT
Every narration line 12–15 words. Plain lines. No markdown.
Stay within ±100 of the assigned word count. Never write past the hard cap.

TITLE LAW
The title is the promise. Every paragraph must strengthen it.
Never research against the title. Never end by weakening it.
Never replace the literal payoff with a symbol, a metaphor, or a softer ending.
Never let another family member take over unless they serve the title.
Section 10 must deliver the exact event the title promised.

EMOTION
Emotion comes from the royal event itself.
Explain why the moment hurts. Explain what memory it reopens. Explain what could be lost.
Do not pile empty adjectives. Do not write What happened next shocked everyone.

FORBIDDEN ON THE PAGE
No fictional, fake, hoax, fabricated, invented, exaggerated, debunked, unverified, rumor, gossip.
No In this dramatized scene. No reconstruction. No we can imagine.
No private thoughts written as fact. No medical details. No invented letters or courtroom scenes.

CUSTOM INSTRUCTIONS
Mandatory. Satisfy every checklist item throughout, not once.

CTAs
Two short subscribe lines, each 12 to 15 words. Do not interrupt the Section 10 payoff.

Return ONLY the finished script. No markdown. No JSON. No analysis.`;
}

function writeAddendum(title, targetWords = 3500, dossier = null, plan = null) {
  const target = Number(targetWords) || 3500;
  return `Write the Royal Family documentary now.

TITLE: ${title}
Write about ${target} spoken words. Hard cap ${target + 100}. Stop when you reach the cap.
The notes below are private. Convert them into spoken narration.
Never print: The image, The title points, The timeline, Research used, Talking points.
Never copy outline labels onto the page.
HOOK, then SECTION 1, SECTION 2, SECTION 3, SECTION 4, SECTION 5, SECTION 6, SECTION 7, SECTION 8, SECTION 9, SECTION 10, then OUTRO.
Each numbered section must be full spoken paragraphs. Stopping after Section 1 is a failure.
Write like the trained database: a person doing something, not a description of an image.
Do not recite dates of birth. Do not give everyone a biography.
Use only title-serving facts. Mix past and present inside the same chain.
Use outline quotes if they are public lines. Do not invent closed-door dialogue.
Section 10 must deliver the exact title event and the feeling the click promised.

${formatDossier(dossier)}

PRIVATE NOTES TO TURN INTO NARRATION
${formatWriterOutline(plan) || "(follow title loyalty: hook plus 10 spoken sections)"}`;
}

function listedSectionIds(script) {
  return [...new Set([...String(script || "").matchAll(/^SECTION\s+(\d+)/gim)].map((m) => Number(m[1])))];
}

function sectionBodies(script) {
  const bodies = { hook: [], outro: [], sections: {} };
  let current = "pre";
  for (const line of String(script || "").split("\n")) {
    const t = line.trim();
    if (/^HOOK\b/i.test(t)) {
      current = "hook";
      continue;
    }
    const sm = t.match(/^SECTION\s+(\d+)/i);
    if (sm) {
      current = `s${sm[1]}`;
      bodies.sections[sm[1]] = bodies.sections[sm[1]] || [];
      continue;
    }
    if (/^OUTRO\b/i.test(t) || /^TITLE\b/i.test(t)) {
      current = /^OUTRO\b/i.test(t) ? "outro" : "pre";
      continue;
    }
    if (!t) continue;
    if (current === "hook") bodies.hook.push(t);
    else if (current === "outro") bodies.outro.push(t);
    else if (current.startsWith("s")) bodies.sections[current.slice(1)].push(t);
  }
  return bodies;
}

function qualityIssues(script, title = "", targetWords = 3500) {
  const text = String(script || "");
  const issues = [];
  const target = Number(targetWords) || 3500;
  const wc = countWords(text);
  if (wc && target && wc < target - 100) issues.push(`Too short (${wc}; need ${target - 100}+).`);
  if (wc && target && wc > target + 100) issues.push(`Too long (${wc}; cap ${target + 100}).`);
  for (const re of DEBUNK_RES) {
    if (re.test(text)) issues.push(`Debunking language: ${re.source}`);
  }
  for (const re of META_RES) {
    if (new RegExp(re.source, "i").test(text)) issues.push(`Meta-language: ${re.source}`);
  }
  if (OUTLINE_SPEAK_RES.some((re) => re.test(text))) {
    issues.push("Outline language leaked onto the page. Narrate the event instead of describing the title, the image, or the timeline.");
  }
  if (/(^|\n)\s*(the image|the title|the timeline|this section)\b/i.test(text)) {
    issues.push("Do not start lines with The image, The title, The timeline, or This section. Narrate the event.");
  }
  const terms = titleTerms(title);
  const lower = text.toLowerCase();
  const missing = terms.filter((t) => !lower.includes(t));
  if (terms.length && missing.length >= Math.ceil(terms.length * 0.5)) {
    issues.push("Title loyalty too weak — bring the title people/event back through every section");
  }
  const ids = listedSectionIds(text);
  for (let i = 1; i <= 10; i++) {
    if (!ids.includes(i)) issues.push(`Missing SECTION ${i}. Write all 10 spoken sections.`);
  }
  const bodies = sectionBodies(text);
  if (countWords(bodies.hook.join(" ")) < 80) {
    issues.push("Hook is too thin. Write a spoken opening, not an outline note.");
  }
  for (let i = 1; i <= 10; i++) {
    const n = countWords((bodies.sections[String(i)] || []).join(" "));
    if (ids.includes(i) && n < 80) {
      issues.push(`SECTION ${i} is outline notes (${n} words). Expand it into spoken narration.`);
    }
  }
  const bornHits = (text.match(/\b(was born|born on|date of birth)\b/gi) || []).length;
  if (bornHits >= 3) issues.push("Biography dump: too many birth lines. Cut dates of birth and write the title event.");
  if (/\b(in this dramatized scene|we can imagine|reconstruction of|fictional moment)\b/i.test(text)) {
    issues.push("Meta reconstruction language leaked onto the page.");
  }
  return issues;
}

function revisionPrompt(script, issues, title, targetWords = 3500) {
  const target = Number(targetWords) || 3500;
  return `Revise this Royal Family documentary into spoken narration.

TITLE: ${title}

Problems to fix:
${issues.map((i) => `- ${i}`).join("\n")}

Rules:
- You are the narrator. Never write The image, The title points, The timeline, This section.
- Keep HOOK plus SECTION 1 through SECTION 10 plus OUTRO.
- If any section is missing, write it. Do not stop after Section 1.
- Each section must be full spoken paragraphs, not outline bullets.
- Title loyalty first. Sound like Crown Watch, not a planner.
- Do not add extra biographies. Do not recite dates of birth.
- Use public quotes. Do not invent private palace dialogue.
- NEVER use: in this dramatized scene, in this reconstruction, we can imagine, this fictional moment.
- Spoken word count must be ${target}, plus or minus 100. NEVER exceed ${target + 100}.
- Every narration line must be 12 to 15 words.
- Return ONLY the full revised script as finished narration.

SCRIPT:
${script}`;
}

function verifyReport(script, title = "", targetWords = 0) {
  const text = String(script || "");
  const issues = qualityIssues(script, title, targetWords);
  const quotes = text.match(/[“"][^”"]{8,}[”"]/g) || [];
  const spoken = (text.match(/\b(said|told|whispered|asked|promised)\b/gi) || []).length;
  const evidence = /\b(letter|message|note|recording|conversation|whispered|final words|told him|told her)\b/i.test(text);
  const terms = titleTerms(title);
  const lower = text.toLowerCase();
  const present = terms.filter((t) => lower.includes(t));
  const debunkHits = DEBUNK_RES.filter((re) => re.test(text)).map((re) => re.source);
  const metaHits = META_RES.filter((re) => new RegExp(re.source, "i").test(text)).map((re) => re.source);
  const factHitCount = factHits(text);
  const years = uniqueYears(text);
  const spokenCount = countWords(text);
  const lines = lineStats(text);
  const target = Number(targetWords) || 0;
  const wordDelta = target ? spokenCount - target : 0;
  const wordOk = !target || Math.abs(wordDelta) <= 100;
  const bornHits = (text.match(/\b(was born|born on|date of birth)\b/gi) || []).length;
  const hasStructure = /^HOOK\b/im.test(text) && /^SECTION 1\b/im.test(text) && /^SECTION 10\b/im.test(text);
  return {
    pass: issues.length === 0 && present.length >= Math.ceil(terms.length * 0.5 || 1) && debunkHits.length === 0 && metaHits.length === 0 && wordOk && hasStructure && bornHits < 3,
    quoteMarks: quotes.length,
    spokenVerbs: spoken,
    publicQuotes: quotes.length,
    realFactHits: factHitCount,
    uniqueYears: years,
    wordCount: spokenCount,
    targetWordCount: target || null,
    wordDelta: target ? wordDelta : null,
    lines,
    titleTerms: present,
    missingTitleTerms: terms.filter((t) => !lower.includes(t)),
    debunkHits,
    metaHits,
    biographyDump: bornHits >= 3,
    issues,
    sampleQuotes: quotes.slice(0, 5),
    fictionalEvidence: evidence,
  };
}

module.exports = {
  researchDossier,
  formatDossier,
  formatWriterOutline,
  normalizePlan,
  circleForTitle,
  isRoyalMaker,
  planSystem,
  planUser,
  engineSystem,
  writeAddendum,
  stripMeta,
  qualityIssues,
  revisionPrompt,
  verifyReport,
};
