const { words, sentences } = require("./analyze");

const HEADING_RE = /^(TITLE|HOOK|OUTRO|SECTION\s+\d+\b.*)$/i;
const MIN_LINE = 12;
const MAX_LINE = 15;

function isHeading(line) {
  return HEADING_RE.test(line.trim());
}

function isTitleLine(line) {
  const t = line.trim();
  if (!t || isHeading(t)) return false;
  return !/[.!?]$/.test(t) && words(t).length >= 6;
}

function splitClauses(sentence) {
  const raw = sentence.trim();
  if (!raw) return [];
  const parts = raw
    .split(/,(?=\s+(and|but|because|while|when|as|then|so)\b)/i)
    .map((p) => p.trim())
    .filter(Boolean);
  const out = [];
  for (const part of parts) {
    const w = words(part);
    if (w.length <= MAX_LINE) {
      out.push(part);
      continue;
    }
    const chunks = part.split(/(?<=,|;|:)\s+/);
    let buf = "";
    for (const chunk of chunks) {
      const next = buf ? `${buf} ${chunk}` : chunk;
      if (words(next).length > MAX_LINE && buf) {
        out.push(buf.trim());
        buf = chunk;
      } else {
        buf = next;
      }
    }
    if (buf.trim()) out.push(buf.trim());
  }
  return out.length ? out : [raw];
}

function packWordList(list) {
  const w = list.filter(Boolean);
  if (!w.length) return [];
  const lines = [];
  let buf = [];

  const pushBuf = () => {
    if (!buf.length) return;
    lines.push(buf.join(" "));
    buf = [];
  };

  for (let i = 0; i < w.length; i++) {
    buf.push(w[i]);
    const punct = /[.,;:!?]$|[”"']$/.test(w[i]);
    if (buf.length >= MIN_LINE && buf.length <= MAX_LINE && punct) {
      pushBuf();
    } else if (buf.length >= MAX_LINE) {
      pushBuf();
    }
  }

  if (buf.length) {
    if (buf.length >= MIN_LINE || !lines.length) {
      pushBuf();
    } else {
      const prev = words(lines.pop());
      const all = prev.concat(buf);
      if (all.length <= 18) {
        lines.push(all.join(" "));
      } else if (all.length >= MIN_LINE * 2) {
        const cut = Math.min(MAX_LINE, Math.max(MIN_LINE, all.length - MIN_LINE));
        lines.push(all.slice(0, cut).join(" "));
        lines.push(all.slice(cut).join(" "));
      } else {
        lines.push(all.join(" "));
      }
    }
  }
  return lines;
}

function packLine(text) {
  const w = words(text);
  if (w.length <= MAX_LINE) return [text.trim()];
  return packWordList(w);
}

function dedupeJoins(line, prev) {
  let text = line.replace(/\b(but|and|while|yet|so)\s+\1\b/gi, "$1");
  if (prev && !isHeading(prev)) {
    const lastWord = prev.trim().split(/\s+/).pop().replace(/[.,;:]+$/, "").toLowerCase();
    const firstWord = text.trim().split(/\s+/)[0].replace(/[.,;:]+$/, "").toLowerCase();
    if (["but", "and", "while", "yet", "so"].includes(lastWord) && firstWord === lastWord) {
      return {
        prev: prev.replace(new RegExp(`\\s+${lastWord}$`, "i"), ""),
        text,
      };
    }
  }
  return { prev, text };
}

function mergeShortLines(lines, preservedTitle) {
  const keep = (line) => isHeading(line) || (preservedTitle && line === preservedTitle);
  const out = [];
  for (const line of lines) {
    if (!line) {
      out.push("");
      continue;
    }
    if (keep(line)) {
      out.push(line);
      continue;
    }
    const prev = out[out.length - 1];
    if (prev && !keep(prev) && prev !== "" && words(prev).length < MIN_LINE) {
      const combined = `${prev} ${line}`.trim();
      const n = words(combined).length;
      if (n <= MAX_LINE) {
        out[out.length - 1] = combined;
        continue;
      }
      if (n <= 18) {
        out[out.length - 1] = combined;
        continue;
      }
    }
    if (words(line).length < MIN_LINE && prev && !keep(prev) && prev !== "") {
      const combined = `${prev} ${line}`.trim();
      if (words(combined).length <= 18) {
        out[out.length - 1] = combined;
        continue;
      }
    }
    out.push(line);
  }
  return out;
}

function splitLongLines(lines, preservedTitle) {
  const keep = (line) => isHeading(line) || (preservedTitle && line === preservedTitle);
  const out = [];
  for (const line of lines) {
    if (!line || keep(line) || words(line).length <= MAX_LINE) {
      out.push(line);
      continue;
    }
    out.push(...packLine(line));
  }
  return out;
}

function segmentScript(script) {
  const blocks = String(script || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim());
  const out = [];
  let pending = [];
  let preservedTitle = "";

  const flush = () => {
    const blob = pending.join(" ").trim();
    pending = [];
    if (!blob) return;
    for (const sent of sentences(blob)) {
      for (const clause of splitClauses(sent)) {
        out.push(...packLine(clause));
      }
    }
  };

  for (const line of blocks) {
    if (!line) {
      flush();
      if (out[out.length - 1] !== "") out.push("");
      continue;
    }
    const firstContent = !preservedTitle && out.every((l) => !l || isHeading(l)) && pending.length === 0;
    if (isHeading(line) || (firstContent && isTitleLine(line))) {
      flush();
      if (out.length && out[out.length - 1] !== "") out.push("");
      if (isHeading(line)) {
        out.push(
          line.toUpperCase().startsWith("SECTION") || line.toUpperCase() === "HOOK" || line.toUpperCase() === "OUTRO" || line.toUpperCase() === "TITLE"
            ? line.replace(/^section\s+(\d+)/i, (_, n) => `SECTION ${n}`)
            : line
        );
      } else {
        preservedTitle = line;
        out.push(line);
      }
      continue;
    }
    pending.push(line);
  }
  flush();

  const cleaned = [];
  for (const line of mergeShortLines(out, preservedTitle)) {
    if (!line) {
      cleaned.push("");
      continue;
    }
    if (isHeading(line) || line === preservedTitle) {
      cleaned.push(line);
      continue;
    }
    const prev = cleaned[cleaned.length - 1];
    const next = dedupeJoins(line, prev);
    if (prev && next.prev !== prev) cleaned[cleaned.length - 1] = next.prev;
    cleaned.push(next.text);
  }

  return splitLongLines(mergeShortLines(cleaned, preservedTitle), preservedTitle)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(script) {
  const lines = String(script || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !isHeading(l));
  if (lines[0] && !/[.!?]$/.test(lines[0])) lines.shift();
  return words(lines.join(" ")).length;
}

function clipToTarget(script, targetWords, tolerance = 100) {
  const target = Number(targetWords) || 3500;
  const max = target + tolerance;
  if (countWords(script) <= max) return String(script || "").trim();

  const lines = String(script || "").replace(/\r\n/g, "\n").split("\n");
  const outroAt = lines.findIndex((l) => /^OUTRO\b/i.test(l.trim()));
  const body = outroAt >= 0 ? lines.slice(0, outroAt) : lines;
  const outro = outroAt >= 0 ? lines.slice(outroAt) : [];
  const outroCount = countWords(outro.join("\n"));
  const bodyMax = Math.max(Math.round(target * 0.7), max - outroCount);

  const kept = [];
  for (const line of body) {
    const trial = kept.concat(line).join("\n");
    if (countWords(trial) > bodyMax && kept.length > 20 && line.trim() && !isHeading(line.trim())) {
      break;
    }
    kept.push(line);
  }

  let out = [...kept, ...(outro.length ? ["", ...outro] : [])].join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (countWords(out) <= max) return out;

  const clipped = [];
  for (const line of out.split("\n")) {
    const trial = clipped.concat(line).join("\n");
    if (countWords(trial) > max && line.trim() && !isHeading(line.trim())) break;
    clipped.push(line);
  }
  return clipped.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function lineStats(script) {
  const raw = String(script || "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !isHeading(l));
  if (raw[0] && !/[.!?]$/.test(raw[0])) raw.shift();
  const lengths = raw.map((l) => words(l).length);
  if (!lengths.length) return { count: 0, inRange: 0, min: 0, max: 0, avg: 0, over: 0, under: 0 };
  const inRange = lengths.filter((n) => n >= MIN_LINE && n <= MAX_LINE).length;
  return {
    count: lengths.length,
    inRange,
    min: Math.min(...lengths),
    max: Math.max(...lengths),
    avg: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
    over: lengths.filter((n) => n > MAX_LINE).length,
    under: lengths.filter((n) => n < MIN_LINE).length,
  };
}

module.exports = { segmentScript, countWords, isHeading, lineStats, clipToTarget, MIN_LINE, MAX_LINE };
