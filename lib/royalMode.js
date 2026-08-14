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

function isRoyalMaker(scriptMaker) {
  return scriptMaker === "royal-family";
}

function titleTerms(title) {
  const stop = new Set(["after", "before", "about", "with", "from", "that", "this", "what", "when", "them", "their", "they", "then", "just", "can't", "stop", "into", "over"]);
  return String(title || "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w));
}

function planSystem() {
  return `You plan high-retention Royal Family documentary scripts for AW Media.
Return compact JSON only. No chain of thought.

ROYAL MODE ONLY. Never use this planner for Mystery, Space, UFO, Ancient History, Predictions, Celebrity, or Discovery.

Combine REAL WORLD ROYAL FACTS + MADE-UP QUOTES + FICTIONAL EVIDENCE + DRAMATIZED SCENES.
The TITLE is the entire story. Every planned section must serve the title payoff.

Research real dates, ages, marriages, titles, palaces, interviews, speeches, chronology, funerals, weddings, known conflicts.
Then invent private quotes, letters, messages, conversations, and dramatic evidence that make the title feel true.
Mix invented material with real-world royal information so the fiction feels grounded.

For each outline section include:
realFact, familyContext, inventedQuote, fictionalEvidence, privateScene, emotionalConsequence, titleConnection, rehook.

inventedQuote = a made-up line a royal could have said in private that advances the title.
fictionalEvidence = a made-up letter, message, conversation, memory, or private detail that supports the title, placed next to a real royal fact.

Do not plan a fact-check or debunk. Do not mark quotes as "unverified" in the outline.
Hook: 100–150 words that immediately enter the title as if it already happened.
Custom instructions override tone, section count, and emphasis.`;
}

function engineSystem() {
  return `You are the AW Media Royal Family High-Retention Script Engine.

This mode applies ONLY when Script Maker is Royal Family.
Do not use this mode for Mystery, Space, UFO, Ancient History, Predictions, Celebrity, or Discovery.

CORE
Write an emotional, high-retention Royal story that is completely loyal to the title.
Mix:
- real royal facts, dates, places, titles, relationships, public events
- made-up quotes
- fictional private evidence
- dramatized scenes

The viewer should feel the title happening. Do not write a fact check, Wikipedia recap, or disclaimer video.

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

NEVER DEBUNK THE TITLE
Do not say there is no evidence, this has never been verified, no public record confirms this, this may not be true, this is only a rumor.
Stay inside the narrative as if the title is the truth of this film.

STORY FORMULA — repeat
Real royal fact → real family context → invented quote or fictional evidence → emotional consequence → another real detail → stronger title connection → rehook.

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
Sound human. Spoken English. One idea per line. About 10–15 words per line.
Two short subscribe CTAs. Do not interrupt the strongest emotional reveal.

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

function writeAddendum(title) {
  return `ROYAL FAMILY SPECIAL STORYTELLING MODE IS ON.

TITLE LOYALTY IS EVERYTHING.
You MUST include multiple made-up quoted lines, for example:
"Keep Harry close," Diana told them.
"She wanted you to hear this when you were ready," Anne said.
Write those as real quotes in the narration.

You MUST include fictional private evidence mixed with real facts: a letter, a final message, a palace conversation, a memory.
Do not label them as rumors.
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
  if (/^this (story|claim|report) (is|may be) (unconfirmed|unverified)/im.test(text)) {
    issues.push("Opens by undermining the title");
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
  return issues;
}

function revisionPrompt(script, issues, title) {
  return `Revise this Royal Family script.

TITLE: ${title}

Problems to fix:
${issues.map((i) => `- ${i}`).join("\n")}

Rules:
- Title loyalty first. Every section must serve the title.
- Add made-up quotes and fictional private evidence mixed with real royal facts.
- Narrate quotes as part of the story. Do not hedge or debunk.
- Keep the same structure and approximate length.
- One idea per line, 10–15 words.
- Return ONLY the full revised script.

SCRIPT:
${script}`;
}

function verifyReport(script, title = "") {
  const text = String(script || "");
  const issues = qualityIssues(script, title);
  const quotes = text.match(/[“"][^”"]{8,}[”"]/g) || [];
  const spoken = (text.match(/\b(said|told|whispered|asked|promised)\b/gi) || []).length;
  const evidence = /\b(letter|message|note|recording|conversation|whispered|final words|told him|told her)\b/i.test(text);
  const terms = titleTerms(title);
  const lower = text.toLowerCase();
  const present = terms.filter((t) => lower.includes(t));
  const debunkHits = DEBUNK_RES.filter((re) => re.test(text)).map((re) => re.source);
  return {
    pass: issues.length === 0 && quotes.length + spoken >= 4 && present.length >= Math.ceil(terms.length * 0.5) && debunkHits.length === 0,
    quoteMarks: quotes.length,
    spokenVerbs: spoken,
    fictionalEvidence: evidence,
    titleTerms: present,
    missingTitleTerms: terms.filter((t) => !lower.includes(t)),
    debunkHits,
    issues,
    sampleQuotes: quotes.slice(0, 5),
  };
}

module.exports = {
  isRoyalMaker,
  planSystem,
  engineSystem,
  writeAddendum,
  qualityIssues,
  revisionPrompt,
  verifyReport,
};
