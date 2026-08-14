const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require("docx");
const { isHeading } = require("./segment");

function xmlSafe(text) {
  return String(text || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function narrationLines(script) {
  return xmlSafe(script)
    .replace(/\r\n/g, "\n")
    .split("\n");
}

async function toDocx(record) {
  const children = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      children: [new TextRun({ text: xmlSafe(record.title || "Script"), bold: true })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `${record.scriptMakerLabel || record.scriptMaker || ""}  ·  ${record.actualWordCount || 0} words  ·  ${record.createdAt ? new Date(record.createdAt).toLocaleDateString() : ""}`,
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
  const packed = await Packer.toBuffer(doc);
  return Buffer.from(packed);
}

function filename(record, ext = "docx") {
  const base = String(record.title || "script")
    .replace(/[^\w\s-]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${base || "script"}.${ext}`;
}

function contentDisposition(record, ext = "docx") {
  const name = filename(record, ext);
  const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

module.exports = { toDocx, filename, contentDisposition };
