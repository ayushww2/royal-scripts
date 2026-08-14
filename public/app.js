const els = {
  collection: document.getElementById("collection"),
  model: document.getElementById("model"),
  title: document.getElementById("title"),
  notes: document.getElementById("notes"),
  generateBtn: document.getElementById("generateBtn"),
  collectionHint: document.getElementById("collectionHint"),
  statusPill: document.getElementById("statusPill"),
  scriptOut: document.getElementById("scriptOut"),
  outputTitle: document.getElementById("outputTitle"),
  copyBtn: document.getElementById("copyBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  search: document.getElementById("search"),
  libraryList: document.getElementById("libraryList"),
  scriptView: document.getElementById("scriptView"),
};

let collections = [];
let currentTab = "library";
let lastScript = "";

async function boot() {
  const status = await fetch("/api/status").then((r) => r.json());
  collections = status.collections || [];
  els.collection.innerHTML = collections
    .map((c) => `<option value="${c.id}">${c.label} (${c.count})</option>`)
    .join("");
  if (status.defaultModel) els.model.value = status.defaultModel;
  els.statusPill.textContent = status.ok
    ? `GPT-5.6 connected · ${collections.reduce((n, c) => n + c.count, 0)} scripts stored`
    : `API issue: ${status.error || "not connected"}`;
  updateHint();
  await loadLibrary();
}

function updateHint() {
  const col = collections.find((c) => c.id === els.collection.value);
  if (!col) return;
  els.collectionHint.textContent = `${col.count} stored scripts · ~${col.avgWords.toLocaleString()} words each. New drafts match this library's voice.`;
}

async function loadLibrary() {
  if (currentTab === "generated") {
    const data = await fetch("/api/generated").then((r) => r.json());
    renderCards(data.items || [], true);
    return;
  }
  const params = new URLSearchParams({
    collection: els.collection.value,
    q: els.search.value.trim(),
    limit: "48",
  });
  const data = await fetch(`/api/scripts?${params}`).then((r) => r.json());
  renderCards(data.items || [], false);
}

function renderCards(items, generated) {
  els.libraryList.innerHTML = items
    .map(
      (item) => `
      <article class="card" data-id="${item.id}" data-generated="${generated ? "1" : "0"}">
        <h3>${escapeHtml(item.title)}</h3>
        <p class="meta">${escapeHtml(item.collectionLabel || item.collection || "")} · ${(item.wordCount || 0).toLocaleString()} words</p>
        <p class="meta">${escapeHtml(item.preview || (item.text || "").slice(0, 180))}</p>
      </article>`
    )
    .join("") || `<p class="hint">No scripts in this view yet.</p>`;
}

async function openCard(id, generated) {
  if (generated) {
    const data = await fetch("/api/generated").then((r) => r.json());
    const item = (data.items || []).find((x) => x.id === id);
    if (!item) return;
    showScript(item.title, item.text);
    return;
  }
  const item = await fetch(`/api/scripts/${id}`).then((r) => r.json());
  showScript(item.title, `${item.title}\n\n${item.text}`);
}

function showScript(title, text) {
  lastScript = text;
  els.outputTitle.textContent = title;
  els.scriptOut.textContent = text;
  els.scriptView.classList.remove("hidden");
  els.scriptView.textContent = text;
}

async function generate() {
  const title = els.title.value.trim();
  if (!title) {
    els.title.focus();
    return;
  }
  els.generateBtn.disabled = true;
  els.generateBtn.textContent = "Writing…";
  els.outputTitle.textContent = title;
  els.scriptOut.textContent = "";
  lastScript = "";

  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title,
      notes: els.notes.value.trim(),
      collection: els.collection.value,
      model: els.model.value,
    }),
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() || "";
      for (const chunk of chunks) {
        const line = chunk.trim();
        if (!line.startsWith("data:")) continue;
        const payload = JSON.parse(line.slice(5).trim());
        if (payload.error) throw new Error(payload.error);
        if (payload.token) {
          lastScript += payload.token;
          els.scriptOut.textContent = lastScript;
          els.scriptOut.scrollTop = els.scriptOut.scrollHeight;
        }
      }
    }
  } catch (err) {
    els.scriptOut.textContent = `Generation failed: ${err.message}`;
  } finally {
    els.generateBtn.disabled = false;
    els.generateBtn.textContent = "Write script";
    if (currentTab === "generated") loadLibrary();
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

els.collection.addEventListener("change", () => {
  updateHint();
  if (currentTab === "library") loadLibrary();
});
els.search.addEventListener("input", () => {
  if (currentTab === "library") loadLibrary();
});
els.generateBtn.addEventListener("click", generate);
els.title.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
});
els.copyBtn.addEventListener("click", async () => {
  if (!lastScript) return;
  await navigator.clipboard.writeText(lastScript);
  els.copyBtn.textContent = "Copied";
  setTimeout(() => (els.copyBtn.textContent = "Copy"), 1200);
});
els.downloadBtn.addEventListener("click", () => {
  if (!lastScript) return;
  const blob = new Blob([lastScript], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(els.outputTitle.textContent || "script").slice(0, 80)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    currentTab = tab.dataset.tab;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t === tab));
    loadLibrary();
  });
});
els.libraryList.addEventListener("click", (e) => {
  const card = e.target.closest(".card");
  if (!card) return;
  openCard(card.dataset.id, card.dataset.generated === "1");
});

boot().catch((err) => {
  els.statusPill.textContent = err.message;
});
