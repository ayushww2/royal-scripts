const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require("docx");
const { isHeading } = require("./segment");

function narrationLines(script) {
  return String(script || "")
    .replace(/\r\n/g, "\n")
    .split("\n");
}

function toTxt(record) {
  const lines = [`${record.title}`, ""];
  for (const line of narrationLines(record.script)) {
    lines.push(line);
  }
  return lines.join("\n").trim() + "\n";
}

async function toDocx(record) {
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: record.title, bold: true })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${record.scriptMakerLabel || record.scriptMaker}  ·  ${record.actualWordCount || 0} words  ·  ${new Date(record.createdAt).toLocaleDateString()}`,
          italics: true,
          size: 20,
          color: "666666",
        }),
      ],
    }),
    new Paragraph({ text: "" }),
  ];

  for (const line of narrationLines(record.script)) {
    const trimmed = line.trim();
    if (!trimmed) {
      children.push(new Paragraph({ text: "" }));
      continue;
    }
    if (isHeading(trimmed) || /^(HOOK|OUTRO|TITLE)\b/i.test(trimmed)) {
      children.push(
        new Paragraph({
          spacing: { before: 280, after: 80 },
          children: [new TextRun({ text: trimmed, bold: true, size: 26 })],
        })
      );
      continue;
    }
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: trimmed, size: 24 })],
      })
    );
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });
  return Packer.toBuffer(doc);
}

function filename(record, ext) {
  const base = String(record.title || "script")
    .replace(/[^\w\s-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${base || "script"}.${ext}`;
}

module.exports = { toTxt, toDocx, filename };
