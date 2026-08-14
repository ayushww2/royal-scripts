const DEFAULT_BASE = "https://api.contactboxtools.me";
const DEFAULT_MODEL = "gpt-5.6-sol";
const PLAN_MODEL = process.env.OPENAI_PLAN_MODEL || "gpt-5.6-terra";

function config() {
  const apiKey = process.env.CONTACTBOX_API_KEY || process.env.OPENAI_API_KEY || "";
  const baseUrl = (process.env.CONTACTBOX_BASE_URL || DEFAULT_BASE).replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  return { apiKey, baseUrl, model, planModel: PLAN_MODEL };
}

async function chat({ messages, model, stream = false, maxTokens = 4000, json = false }) {
  const { apiKey, baseUrl } = config();
  if (!apiKey) throw new Error("CONTACTBOX_API_KEY is not set");
  const body = {
    model: model || config().model,
    messages,
    stream,
    max_tokens: maxTokens,
  };
  if (json) body.response_format = { type: "json_object" };
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`GPT-5.6 request failed (${response.status}): ${errText.slice(0, 700)}`);
  }
  return response;
}

async function complete({ messages, model, maxTokens = 4000, json = false }) {
  try {
    const response = await chat({ messages, model, stream: false, maxTokens, json });
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  } catch (err) {
    if (!json) throw err;
    const response = await chat({ messages, model, stream: false, maxTokens, json: false });
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "";
  }
}

async function* streamCompletion({ messages, model, maxTokens = 12000 }) {
  const response = await chat({ messages, model, stream: true, maxTokens });
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
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const json = JSON.parse(payload);
        const token = json.choices?.[0]?.delta?.content || "";
        if (token) yield token;
      } catch {
        // ignore
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
  if (!response.ok) return { ok: false, error: `models ${response.status}` };
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
  complete,
  streamCompletion,
  pingModel,
};
