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
  return recapitalizeLines(text).replace(/^\s+/gm, "").trim();
}

function isRoyalMaker(scriptMaker) {
  return scriptMaker === "royal-family";
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

function planSystem() {
  return `You plan high-retention Royal Family documentary scripts for AW Media.
Return compact JSON only. No chain of thought.

ROYAL MODE ONLY. Never use this planner for Mystery, Space, UFO, Ancient History, Predictions, Celebrity, or Discovery.

Combine REAL WORLD ROYAL FACTS + MADE-UP QUOTES + FICTIONAL EVIDENCE + DRAMATIZED SCENES.
About HALF of every section must be real documented royal facts: dates, ages, titles, palaces, marriages, funerals, public events, known chronology.
The other half is invented quotes, private evidence, and emotional scenes that prove the TITLE.
Keep the story extremely emotional. The title event is the heart of the film.

The TITLE is the entire story. Every planned section must serve the title payoff.

Research real dates, ages, marriages, titles, palaces, interviews, speeches, chronology, funerals, weddings, known conflicts.
Then invent private quotes, letters, messages, conversations, and dramatic evidence that make the title feel true.
Mix invented material with real-world royal information so the fiction feels grounded.

Plan enough sections to hit the target word count. For 3500 words, plan 10–12 sections of about 250–300 words plus hook and outro.
Spoken word count must land within 100 words of the target. 1200 is a failure if the target is 3500.

For each outline section include:
realFact, familyContext, inventedQuote, fictionalEvidence, privateScene, emotionalConsequence, titleConnection, rehook.
Each section needs at least two realFact beats and at least two invented emotional beats.

inventedQuote = a made-up line a royal could have said in private that advances the title.
fictionalEvidence = a made-up letter, message, conversation, memory, or private detail that supports the title, placed next to a real royal fact.

Do not plan a fact-check or debunk. Do not mark quotes as "unverified" or "imagined" in the outline.
Never put meta-language in narration. Forbidden: "in this dramatized scene," "in this reconstruction," "for the purposes of this story," "we can imagine," "this fictional moment."
The viewer should never be reminded they are reading a generated script.
Handle uncertainty inside the sentence itself. Keep narration immersive and emotionally continuous.
The plan should describe scenes as if they happened.
Hook: 100–150 words that immediately enter the title as if it already happened.
Custom instructions override tone, section count, and emphasis.`;
}

function engineSystem() {
  return `You are the AW Media Royal Family High-Retention Script Engine.

This mode applies ONLY when Script Maker is Royal Family.
Do not use this mode for Mystery, Space, UFO, Ancient History, Predictions, Celebrity, or Discovery.

CORE
Write an extremely emotional, high-retention Royal story that is completely loyal to the title.
Mix, in roughly equal measure:
- 50% real royal facts that actually happened: dates, ages, titles, palaces, marriages, funerals, public events, known chronology
- 50% fictionalized and dramatized material that supports the title: made-up quotes, private messages, letters, conversations, emotional scenes

The viewer should feel the title happening. Do not write a fact check, Wikipedia recap, or disclaimer video.

WORD COUNT IS A HARD RULE
Hit the assigned spoken word count within 100 words.
If the target is 3500, 3400–3600 is success. 3300 or 3650 can pass. 1200 is a failure. 5000 is a failure.
Do not stop early. Do not pad with repeated claims. Add new real facts and new emotional invented beats until you reach the target.

LINE LENGTH IS A HARD RULE
Every narration line must be 12 to 15 words. Not 8. Not 18. Not 10.
One spoken idea per line. Subscribe lines must also be 12 to 15 words.

TITLE LOYALTY IS THE PRIMARY RULE
The title is the story. Every section must strengthen:
- the event in the title
- the person in the title
- the emotional consequence
- the relationships around it
- why it happened
- what it means for the Royal Family
If a paragraph could appear in a generic royal biography, cut it.

MADE-UP QUOTES ARE REQUIRED
Invent private dialogue and quoted lines that serve the title.
Write them as real spoken lines in the story, not as "alleged" or "unverified" quotes.
Example feeling: Anne telling William what Diana said. Diana's words to her sons. A private warning inside the palace.
Quotes must fit the person's voice, age, and the real timeline, but they CAN be invented.

FICTIONAL EVIDENCE IS ALLOWED
You may invent letters, final messages, private conversations, palace discussions, memories, and emotional scenes.
Place each invented piece next to a real-world royal fact so it feels believable.
Do not stop the story to admit it is fiction.

NEVER USE META-LANGUAGE IN NARRATION
Forbidden phrases include:
- in this dramatized scene / account / climax / story
- in this reconstruction
- for the purposes of this story
- we can imagine
- this fictional moment
- in this fictional scene
- imagined memory / imagined words / imagined message / imagined conversation
The viewer should never be reminded that they are reading a generated script.
Handle uncertainty naturally through the sentence itself, while keeping the narration immersive and emotionally continuous.
Write: "Anne waited until the room was quiet enough to say it."
Never write: "In this dramatized scene, Anne waited."

NEVER DEBUNK THE TITLE
Do not say there is no evidence, this has never been verified, no public record confirms this, this may not be true, this is only a rumor.
Stay inside the narrative as if the title is the truth of this film.

STORY FORMULA — repeat
Real royal fact → real family context → invented quote or fictional evidence → emotional consequence → another real detail → stronger title connection → rehook.
Keep this 50/50 mix through every section. Do not dump all facts first and all fiction later.
Make it viscerally emotional: tears, duty, love, sons, what the title event costs them.

HOOK
100–150 words. Immediately enter the title story.
Start with the emotion, the royal, the revelation, what changed.
Do not open by asking whether it happened.
End with a 10–30 word rehook into Section 1.

PEOPLE
Only include Diana, Charles, Camilla, William, Catherine, Harry, Meghan, Anne, Elizabeth, Philip, and others when they strengthen THIS title.

RETENTION
Each section needs a new fact, quote, private scene, contradiction, or implication tied to the title.
Do not repeat the same claim for thousands of words.

NARRATION
Sound human. Spoken English. One idea per line. Every line 12 to 15 words.
Two short subscribe CTAs, each 12 to 15 words. Do not interrupt the strongest emotional reveal.

CUSTOM INSTRUCTIONS
Mandatory. Satisfy every checklist item throughout, not once.

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

No markdown. No JSON. No analysis. No scores. No disclaimers.`;
}

function writeAddendum(title, targetWords = 3500) {
  const target = Number(targetWords) || 3500;
  return `ROYAL FAMILY SPECIAL STORYTELLING MODE IS ON.

TITLE LOYALTY IS EVERYTHING.
You MUST include multiple made-up quoted lines, for example:
"Keep Harry close," Diana told them.
"She wanted you to hear this when you were ready," Anne said.
Write those as real quotes in the narration.

FACT MIX
About 50% of details must be real royal-family facts that happened.
Use real dates, ages, titles, palaces, funerals, weddings, interviews, and public chronology.
The other 50% is fictionalized, dramatized, and invented material that supports THIS title.
Keep it extremely emotional. The viewer should feel William cry. They should feel Diana's love for both sons.

WORD COUNT
Write ${target} spoken words, plus or minus 100. Do not stop at 1200. Do not overrun ${target + 150}.

LINE LENGTH
Every narration line: 12 to 15 words.

You MUST include fictional private evidence mixed with real facts: a letter, a final message, a palace conversation, a memory.
Write those scenes as if they happened.
NEVER say: in this dramatized scene, in this reconstruction, for the purposes of this story, we can imagine, this fictional moment, imagined memory, imagined message.
No meta-language. The viewer should never be reminded that they are reading a generated script.
Handle uncertainty inside the sentence. Stay immersive and emotionally continuous.
Every section must mention the people/event from the title.

TITLE:
${title}`;
}

function qualityIssues(script, title = "") {
  const text = String(script || "");
  const issues = [];
  for (const re of DEBUNK_RES) {
    if (re.test(text)) issues.push(`Debunking language: ${re.source}`);
  }
  for (const re of META_RES) {
    if (new RegExp(re.source, "i").test(text)) issues.push(`Meta-language: ${re.source}`);
  }
  const terms = titleTerms(title);
  const lower = text.toLowerCase();
  const missing = terms.filter((t) => !lower.includes(t));
  if (terms.length && missing.length >= Math.ceil(terms.length * 0.5)) {
    issues.push("Title loyalty too weak — bring the title people/event back through every section");
  }
  const quoteCount = (text.match(/[“"][^”"]{12,}[”"]/g) || []).length;
  const spoken = (text.match(/\b(said|told|whispered|asked|promised)\b/gi) || []).length;
  if (quoteCount + spoken < 4) {
    issues.push("Need more made-up royal quotes that serve the title");
  }
  const factHits = (text.match(/\b(19\d{2}|20\d{2}|kensington|buckingham|windsor|balmoral|westminster|st james|highgrove|sandringham|althorp|white waltham|paris|divorce|funeral|coffin|wedding|coronation|princess royal|queen elizabeth|king charles)\b/gi) || []).length;
  if (factHits < 8) {
    issues.push("Need more real royal facts — dates, palaces, public events, ages, titles — mixed through every section");
  }
  return issues;
}

function revisionPrompt(script, issues, title, targetWords = 3500) {
  const target = Number(targetWords) || 3500;
  return `Revise this Royal Family script.

TITLE: ${title}

Problems to fix:
${issues.map((i) => `- ${i}`).join("\n")}

Rules:
- Title loyalty first. Every section must serve the title.
- About 50% real royal facts (dates, palaces, titles, public events) and 50% invented emotional quotes/scenes that support the title.
- Keep it extremely emotional.
- Narrate quotes and private evidence as if they happened. Do not hedge, debunk, or use meta-language.
- NEVER use: in this dramatized scene, in this reconstruction, for the purposes of this story, we can imagine, this fictional moment, imagined message/words/memory.
- The viewer should never be reminded they are reading a generated script. Keep narration immersive and emotionally continuous.
- Spoken word count must be ${target}, plus or minus 100.
- Every narration line must be 12 to 15 words.
- Return ONLY the full revised script.

SCRIPT:
${script}`;
}

function verifyReport(script, title = "", targetWords = 0) {
  const text = String(script || "");
  const issues = qualityIssues(script, title);
  const quotes = text.match(/[“"][^”"]{8,}[”"]/g) || [];
  const spoken = (text.match(/\b(said|told|whispered|asked|promised)\b/gi) || []).length;
  const evidence = /\b(letter|message|note|recording|conversation|whispered|final words|told him|told her)\b/i.test(text);
  const terms = titleTerms(title);
  const lower = text.toLowerCase();
  const present = terms.filter((t) => lower.includes(t));
  const debunkHits = DEBUNK_RES.filter((re) => re.test(text)).map((re) => re.source);
  const metaHits = META_RES.filter((re) => new RegExp(re.source, "i").test(text)).map((re) => re.source);
  const factHits = (text.match(/\b(19\d{2}|20\d{2}|kensington|buckingham|windsor|balmoral|westminster|st james|highgrove|sandringham|althorp|white waltham|paris|divorce|funeral|coffin|wedding|coronation|princess royal|queen elizabeth|king charles)\b/gi) || []).length;
  const spokenCount = countWords(text);
  const lines = lineStats(text);
  const target = Number(targetWords) || 0;
  const wordDelta = target ? spokenCount - target : 0;
  const wordOk = !target || Math.abs(wordDelta) <= 100;
  return {
    pass: issues.length === 0 && quotes.length + spoken >= 4 && present.length >= Math.ceil(terms.length * 0.5) && debunkHits.length === 0 && metaHits.length === 0 && wordOk,
    quoteMarks: quotes.length,
    spokenVerbs: spoken,
    fictionalEvidence: evidence,
    realFactHits: factHits,
    wordCount: spokenCount,
    targetWordCount: target || null,
    wordDelta: target ? wordDelta : null,
    lines,
    titleTerms: present,
    missingTitleTerms: terms.filter((t) => !lower.includes(t)),
    debunkHits,
    metaHits,
    issues,
    sampleQuotes: quotes.slice(0, 5),
  };
}

module.exports = {
  isRoyalMaker,
  planSystem,
  engineSystem,
  writeAddendum,
  stripMeta,
  qualityIssues,
  revisionPrompt,
  verifyReport,
};
