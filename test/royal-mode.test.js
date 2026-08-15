const assert = require("assert");
const royal = require("../lib/royalMode");
const { segmentScript } = require("../lib/segment");

const WARNING_TITLE =
  "Princess Anne BREAKS Silence On Diana’s Final Warning About Camilla — William Left SPEECHLESS!";

function pad(text, n = 90) {
  const extra = " The palace felt the pressure of that night in every corridor around them.";
  let out = String(text || "");
  while (out.split(/\s+/).filter(Boolean).length < n) out += extra;
  return out;
}

function scriptFrom(sections = {}, { hook, title = WARNING_TITLE } = {}) {
  const lines = [
    title,
    "",
    "HOOK",
    pad(hook || "So Princess Anne asked William to sit with her tonight after years of silence around Diana."),
  ];
  for (let i = 1; i <= 10; i++) {
    lines.push("");
    lines.push(`SECTION ${i} — Beat ${i}`);
    lines.push(
      pad(
        sections[i] ||
          `This section moves the royal story forward with a new public fact about the family on this night.`
      )
    );
  }
  lines.push("");
  lines.push("OUTRO");
  lines.push(pad("If this story matters to you, subscribe so the next chapter reaches you tonight."));
  return lines.join("\n");
}

function test(name, fn) {
  fn();
  console.log(`ok  ${name}`);
}

test("stripMeta is exported for the pipeline", () => {
  assert.equal(typeof royal.stripMeta, "function");
});

test("extra And honestly phrases are polished down to one", () => {
  const raw = [
    "And honestly, Camilla’s place in that story was never simple.",
    "And honestly, their different approaches made the palace colder.",
    "And honestly, that distinction still sits between them.",
    "And honestly, that balance was hard for William to hold.",
  ].join("\n");
  const out = royal.polishNarration(raw);
  assert.equal(royal.honestlyCount(out), 1);
  assert.match(out, /Camilla’s place in that story was never simple/);
  assert.match(out, /their different approaches made the palace colder/);
  assert.doesNotMatch(out, /And honestly, their different/);
  assert.doesNotMatch(out, /And honestly, that distinction/);
});

test("quoted warning in section 1 is an early payoff", () => {
  const script = scriptFrom({
    1: `Anne told him, "Never let duty make William deny his heart." William went still in the chair.`,
    10: `Anne finally spoke the line. "Never let duty make William deny his heart." William could not move.`,
  });
  assert.equal(royal.earlyQuotedPayoff(script, WARNING_TITLE), true);
  const issues = royal.qualityIssues(script, WARNING_TITLE, 0);
  assert.ok(issues.some((i) => /quoted too early|Hold the exact warning/i.test(i)));
});

test("unquoted warning wording in section 1 is also an early payoff", () => {
  const script = scriptFrom({
    1: "Never let duty make William deny his heart. That was the warning Anne carried.",
  });
  assert.equal(royal.earlyQuotedPayoff(script, WARNING_TITLE), true);
});

test("section 1 can start the mystery without quoting the warning", () => {
  const script = scriptFrom({
    1: "Anne asked William to sit down. She said Diana left him one last warning and then stopped.",
    10: `Anne finally spoke the line. "Never let duty make William deny his heart." William could not move.`,
  });
  assert.equal(royal.earlyQuotedPayoff(script, WARNING_TITLE), false);
});

test("For years openings are not treated as fact-check essays", () => {
  const script = scriptFrom(
    {},
    {
      hook: "For years, Diana’s sons have carried her absence through every important milestone in public life.",
    }
  );
  assert.equal(royal.soundsLikeEssay(script), false);
});

test("model refusals are still detected", () => {
  assert.equal(
    royal.isRefusal("I can't present an unverified Buckingham Palace announcement or reassignment of Camilla's duties."),
    true
  );
  assert.equal(royal.isRefusal("I can’t truthfully write that Princess Anne revealed Diana’s words."), true);
});

test("repeated family-history beats across five sections are flagged", () => {
  const beat =
    "William loved Diana through all of it. Camilla made the whole matter complicated and she understood that. Diana married and waited while the palace watched.";
  const script = scriptFrom({
    1: beat,
    2: beat,
    3: beat,
    4: beat,
    5: beat,
    6: "Anne asked for a private room at Windsor and waited until the staff had gone.",
  });
  assert.equal(royal.repeatedBeats(script), true);
  const issues = royal.qualityIssues(script, WARNING_TITLE, 0);
  assert.ok(issues.some((i) => /repeating across sections/i.test(i)));
});

test("normalizePlan parks the secret quote until section 10", () => {
  const plan = royal.normalizePlan(
    {
      hook: {
        talkingPoints: ['Anne said "Never let duty make William deny his heart."'],
        quote: '"Never let duty make William deny his heart."',
      },
      sections: [
        {
          heading: "Anne Speaks",
          talkingPoints: ['Anne told William, "Never let duty make William deny his heart."'],
          quote: '"Never let duty make William deny his heart."',
        },
      ],
    },
    WARNING_TITLE
  );
  assert.doesNotMatch(plan.hook.quote || "", /never let duty/i);
  assert.doesNotMatch((plan.hook.talkingPoints || []).join(" "), /never let duty/i);
  assert.doesNotMatch((plan.sections[0].talkingPoints || []).join(" "), /never let duty/i);
  assert.doesNotMatch(plan.sections[0].quote || "", /never let duty/i);
  assert.match(plan.sections[9].quote || "", /never let duty/i);
  const outline = royal.formatWriterOutline(plan);
  assert.match(outline, /Quote for Section 10 only:/i);
});

test("line packing prefers a natural break before and", () => {
  const packed = segmentScript(
    "William loved Diana more than anyone in the palace could understand and Camilla made that history painfully complicated for everyone involved tonight."
  );
  const lines = packed.split("\n").map((l) => l.trim()).filter(Boolean);
  assert.ok(lines.length >= 2, packed);
  assert.doesNotMatch(lines[0], /\band$/i);
});

console.log("\nAll royal-mode tests passed.");
