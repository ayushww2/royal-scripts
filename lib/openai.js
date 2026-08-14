const DEFAULT_BASE = "https://api.contactboxtools.me";
const DEFAULT_MODEL = "gpt-5.6-sol";

function config() {
  const apiKey = process.env.CONTACTBOX_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseUrl = (process.env.CONTACTBOX_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  return { apiKey, baseUrl, model };
}

function excerpt(text, maxChars = 1400) {
  if (!text) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trim()}…`;
}

function buildMessages({ collection, title, notes, examples, targetWords }) {
  const channel = collection?.channel || "the channel";
  const voice = collection?.voice || "Spoken YouTube narration for a royal-family channel.";
  const exampleBlock = examples
    .map((s, i) => {
      return `EXAMPLE ${i + 1} TITLE: ${s.title}\nEXAMPLE ${i + 1} OPENING:\n${excerpt(s.text)}`;
    })
    .join("\n\n");

  const system = `You are a senior YouTube scriptwriter for ${channel}.
${voice}

Rules:
- Write a complete spoken narration script, not a shot list and not a blog post.
- Match the cadence, punctuation, and energy of the examples.
- Target about ${targetWords} words.
- Open with a cold hook in the first 2–3 sentences.
- Keep the story moving in short spoken paragraphs.
- Do not invent on-screen graphics instructions unless the examples do.
- Do not mention that you are an AI, and do not mention the example scripts.
- Output the title on the first line, then a blank line, then the script body.`;

  const user = `Write a new original script in this library's style.

TITLE / TOPIC:
${title}

${notes ? `EXTRA DIRECTION:\n${notes}\n` : ""}COLLECTION: ${collection?.label || "mixed royal"}

${exampleBlock}`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

async function* streamCompletion({ messages, model }) {
  const { apiKey, baseUrl } = config();
  if (!apiKey) {
    throw new Error("CONTACTBOX_API_KEY is not set");
  }

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || config().model,
      messages,
      stream: true,
      max_tokens: 12000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GPT-5.6 request failed (${response.status}): ${errText.slice(0, 500)}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n");
    buffer = parts.pop() || "";
    for (const line of parts) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const token = json.choices?.[0]?.delta?.content || json.choices?.[0]?.message?.content || "";
        if (token) yield token;
      } catch {
        // ignore malformed SSE lines
      }
    }
  }
}

async function pingModel() {
  const { apiKey, baseUrl, model } = config();
  if (!apiKey) return { ok: false, error: "API key missing" };
  const response = await fetch(`${baseUrl}/v1/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!response.ok) {
    return { ok: false, error: `models ${response.status}` };
  }
  const body = await response.json();
  const ids = (body.data || []).map((m) => m.id);
  return {
    ok: ids.includes("gpt-5.6-sol") || ids.includes("gpt-5.6-terra"),
    model,
    models: ids,
  };
}

module.exports = {
  DEFAULT_MODEL,
  config,
  buildMessages,
  streamCompletion,
  pingModel,
};
