const state = {
  view: "create",
  status: null,
  current: null,
  editing: false,
  draft: "",
  lastForm: null,
};

const $ = (id) => document.getElementById(id);

function showView(name) {
  state.view = name;
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("hidden", el.id !== `view-${name}`));
  document.querySelectorAll(".nav").forEach((btn) => btn.classList.toggle("on", btn.dataset.view === name || (name === "script" && btn.dataset.view === "history") || (name === "progress" && btn.dataset.view === "create")));
}

function toast(message) {
  const el = $("errorToast");
  el.textContent = message;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 5000);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatScript(text) {
  return String(text || "")
    .split("\n")
    .map((line) => {
      const t = line.trim();
      if (/^(HOOK|OUTRO)\b/i.test(t) || /^SECTION\s+\d+/i.test(t)) {
        return `<h3>${escapeHtml(t)}</h3>`;
      }
      return `${escapeHtml(line)}\n`;
    })
    .join("");
}

async function boot() {
  const status = await fetch("/api/status").then((r) => r.json());
  state.status = status;
  $("corpusLabel").textContent = `${status.scripts || 0} trained scripts`;
  $("statusLine").textContent = status.ok
    ? `GPT-5.6 connected · ${status.scripts} references`
    : status.error || "API not connected";
  const makers = status.makers || [];
  $("scriptMaker").innerHTML = makers.map((m) => `<option value="${m.id}">${m.label}</option>`).join("");
  $("historyMaker").innerHTML = `<option value="all">All</option>` + makers.map((m) => `<option value="${m.id}">${m.label}</option>`).join("");
  $("settingsBody").innerHTML = `
    <p class="meta">Write model: <strong>${status.defaultModel}</strong></p>
    <p class="meta">Plan model: <strong>${status.planModel}</strong></p>
    <p class="meta">Hook target from corpus: ${status.avgHookWords} words</p>
    <p class="meta">Average sentence length: ${status.avgSentenceWords} words</p>
    <p class="meta">Reference scripts stay in the success database. Generated drafts go to History until they earn performance data.</p>
  `;
}

function formPayload() {
  return {
    title: $("title").value.trim(),
    targetWordCount: Number($("wordCount").value) || 3500,
    scriptMaker: $("scriptMaker").value,
    customInstructions: $("custom").value.trim(),
  };
}

const STEPS = [
  ["parse", "Analyzing your title..."],
  ["search", "Searching successful scripts..."],
  ["references", "Found 3 strong references..."],
  ["reverse", "Reverse-engineering successful patterns..."],
  ["research", "Researching subject..."],
  ["write", "Writing hook and sections..."],
  ["loyalty", "Checking title loyalty..."],
  ["lines", "Optimizing narration lines..."],
  ["save", "Preparing document..."],
];

function renderSteps(active) {
  $("progressSteps").innerHTML = STEPS.map(
    ([id, label]) => `<li class="${id === active ? "on" : ""}">${escapeHtml(label)}</li>`
  ).join("");
}

async function generate(payload) {
  if (!payload.title) {
    $("title").focus();
    return;
  }
  state.lastForm = payload;
  state.draft = "";
  $("progressTitle").textContent = payload.title;
  $("liveDraft").textContent = "";
  renderSteps("parse");
  showView("progress");
  $("generateBtn").disabled = true;

  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        const event = JSON.parse(line.slice(5).trim());
        if (event.type === "status") renderSteps(event.stage);
        if (event.type === "token") {
          state.draft += event.token;
          $("liveDraft").textContent = state.draft;
          $("liveDraft").scrollTop = $("liveDraft").scrollHeight;
        }
        if (event.type === "done") openScript(event.saved);
        if (event.type === "error") throw new Error(event.error);
      }
    }
  } catch (err) {
    toast(`Generation was interrupted. Try again. ${err.message}`);
    showView("create");
    $("title").value = payload.title;
    $("wordCount").value = payload.targetWordCount;
    $("scriptMaker").value = payload.scriptMaker;
    $("custom").value = payload.customInstructions;
  } finally {
    $("generateBtn").disabled = false;
  }
}

function openScript(item) {
  state.current = item;
  state.editing = false;
  $("scriptTitle").textContent = item.title;
  $("scriptMeta").textContent = `${item.scriptMakerLabel || item.scriptMaker} · ${item.actualWordCount} words · ${new Date(item.createdAt).toLocaleString()} · loyalty ${item.titleLoyaltyScore || "—"}`;
  $("scriptBody").innerHTML = formatScript(item.script);
  $("intelBody").innerHTML = (item.references || [])
    .map(
      (r, i) => `<p><strong>${i + 1}. ${escapeHtml(r.title)}</strong><br>${r.similarity}% relevant · ${escapeHtml(r.reasonSelected || "")}</p>`
    )
    .join("") || "<p>Built using patterns from the trained library.</p>";
  $("saveState").textContent = "Saved";
  showView("script");
}

async function loadHistory() {
  const params = new URLSearchParams({
    q: $("historyQ").value.trim(),
    scriptMaker: $("historyMaker").value,
    sort: $("historySort").value,
  });
  const data = await fetch(`/api/history?${params}`).then((r) => r.json());
  $("historyList").innerHTML =
    data.items
      .map(
        (item) => `<article data-id="${item.id}">
          <h3>${escapeHtml(item.title)}</h3>
          <p class="meta">${escapeHtml(item.scriptMaker)} · ${item.actualWordCount} words · ${new Date(item.createdAt).toLocaleString()}</p>
        </article>`
      )
      .join("") || `<p class="meta">No generated scripts yet.</p>`;
}

async function loadLibrary() {
  const params = new URLSearchParams({ q: $("libQ").value.trim(), limit: "60" });
  const data = await fetch(`/api/references?${params}`).then((r) => r.json());
  $("libraryList").innerHTML = data.items
    .map(
      (item) => `<article data-ref="${item.id}">
        <h3>${escapeHtml(item.title)}</h3>
        <p class="meta">${item.niche} · ${item.wordCount} words</p>
        <p class="meta">${escapeHtml(item.preview || "")}</p>
      </article>`
    )
    .join("");
}

async function openReference(id) {
  const item = await fetch(`/api/references/${id}`).then((r) => r.json());
  openScript({
    ...item,
    script: `${item.title}\n\n${item.text}`,
    scriptMaker: item.collection,
    actualWordCount: item.wordCount,
    createdAt: new Date().toISOString(),
    references: [],
    titleLoyaltyScore: "ref",
  });
}

document.querySelectorAll(".nav").forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    if (view === "history") loadHistory();
    if (view === "library") loadLibrary();
    showView(view);
  });
});

$("createForm").addEventListener("submit", (e) => {
  e.preventDefault();
  generate(formPayload());
});

$("historyList").addEventListener("click", async (e) => {
  const card = e.target.closest("article");
  if (!card) return;
  const item = await fetch(`/api/history/${card.dataset.id}`).then((r) => r.json());
  openScript(item);
});

$("libraryList").addEventListener("click", (e) => {
  const card = e.target.closest("article");
  if (!card) return;
  openReference(card.dataset.ref);
});

["historyQ", "historyMaker", "historySort"].forEach((id) => {
  $(id).addEventListener("input", loadHistory);
  $(id).addEventListener("change", loadHistory);
});
$("libQ").addEventListener("input", loadLibrary);

document.querySelector("#view-script .actions").addEventListener("click", async (e) => {
  const act = e.target.dataset.act;
  const item = state.current;
  if (!item || !act) return;
  if (act === "copy") {
    await navigator.clipboard.writeText(item.script);
    $("saveState").textContent = "Copied";
  }
  if (act === "txt") window.location = `/api/history/${item.id}.txt`;
  if (act === "docx") window.location = `/api/history/${item.id}.docx`;
  if (act === "regen") {
    generate({
      title: item.title,
      targetWordCount: item.targetWordCount || 3500,
      scriptMaker: item.scriptMaker || "royal-family",
      customInstructions: item.customInstructions || "",
    });
  }
  if (act === "edit") {
    state.editing = !state.editing;
    if (state.editing) {
      $("scriptBody").innerHTML = `<textarea id="editor" class="edit-area">${escapeHtml(item.script)}</textarea>`;
      const editor = $("editor");
      let t;
      editor.addEventListener("input", () => {
        $("saveState").textContent = "Saving…";
        clearTimeout(t);
        t = setTimeout(async () => {
          const saved = await fetch(`/api/history/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ script: editor.value }),
          }).then((r) => r.json());
          state.current = saved;
          $("saveState").textContent = "Saved";
        }, 700);
      });
    } else {
      openScript(state.current);
    }
  }
});

boot().catch((err) => toast(err.message));
