const { words, sentences } = require("./analyze");

const HEADING_RE = /^(HOOK|OUTRO|SECTION\s+\d+\b.*)$/i;

function isHeading(line) {
  return HEADING_RE.test(line.trim());
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
    if (w.length <= 16) {
      out.push(part);
      continue;
    }
    const chunks = part.split(/(?<=,|;|:)\s+/);
    let buf = "";
    for (const chunk of chunks) {
      const next = buf ? `${buf} ${chunk}` : chunk;
      if (words(next).length > 15 && buf) {
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

function packLine(text) {
  const w = words(text);
  if (w.length <= 16) return [text.trim()];
  const lines = [];
  let buf = [];
  for (const word of w) {
    buf.push(word);
    if (buf.length >= 12 && /[.,;:]$/.test(word)) {
      lines.push(buf.join(" "));
      buf = [];
    } else if (buf.length >= 16) {
      lines.push(buf.join(" "));
      buf = [];
    }
  }
  if (buf.length) {
    if (buf.length < 5 && lines.length) lines[lines.length - 1] += ` ${buf.join(" ")}`;
    else lines.push(buf.join(" "));
  }
  return lines;
}

function segmentScript(script) {
  const blocks = String(script || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim());
  const out = [];
  let pending = [];

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
    if (isHeading(line)) {
      flush();
      if (out.length && out[out.length - 1] !== "") out.push("");
      out.push(line.toUpperCase().startsWith("SECTION") || line.toUpperCase() === "HOOK" || line.toUpperCase() === "OUTRO"
        ? line.replace(/^section\s+(\d+)/i, (_, n) => `SECTION ${n}`)
        : line);
      continue;
    }
    pending.push(line);
  }
  flush();

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function countWords(script) {
  return words(
    String(script || "")
      .split("\n")
      .filter((l) => l.trim() && !isHeading(l.trim()))
      .join(" ")
  ).length;
}

module.exports = { segmentScript, countWords, isHeading };
