const state = {
  view: "create",
  status: null,
  current: null,
  editing: false,
  jobs: [],
  pollTimer: null,
};

const $ = (id) => document.getElementById(id);

function showView(name) {
  state.view = name;
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("hidden", el.id !== `view-${name}`));
  document.querySelectorAll(".nav").forEach((btn) => {
    const active = btn.dataset.view === name || (name === "script" && btn.dataset.view === "history");
    btn.classList.toggle("on", active);
  });
}

function toast(message, ok = false) {
  const el = $("errorToast");
  el.textContent = message;
  el.classList.toggle("ok", ok);
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
    <p class="meta">Generate runs in the background. The form clears so you can queue another script.</p>
  `;
  await refreshJobs();
  startPolling();
}

function formPayload() {
  return {
    title: $("title").value.trim(),
    targetWordCount: Number($("wordCount").value) || 3500,
    scriptMaker: $("scriptMaker").value,
    customInstructions: $("custom").value.trim(),
  };
}

function clearForm() {
  $("title").value = "";
  $("custom").value = "";
  $("title").focus();
}

function renderQueue() {
  const active = state.jobs.filter((j) => j.status === "generating");
  $("historyBadge").textContent = String(active.length);
  $("historyBadge").classList.toggle("hidden", active.length === 0);
  if (!active.length) {
    $("queue").classList.add("hidden");
    $("queue").innerHTML = "";
    return;
  }
  $("queue").classList.remove("hidden");
  $("queue").innerHTML = active
    .map(
      (job) => `<article data-job="${job.id}">
        <p class="eyebrow">Generating in background</p>
        <h3>${escapeHtml(job.title)}</h3>
        <p class="meta">${escapeHtml(job.stageLabel || "Working...")}</p>
      </article>`
    )
    .join("");
}

async function refreshJobs() {
  const prev = new Map(state.jobs.map((j) => [j.id, j.status]));
  const data = await fetch("/api/jobs").then((r) => r.json()).catch(() => ({ items: [] }));
  const historyData = await fetch("/api/history").then((r) => r.json()).catch(() => ({ items: [] }));
  const generating = (historyData.items || []).filter((j) => j.status === "generating");
  const live = data.items || [];
  const byId = new Map();
  [...generating, ...live].forEach((j) => byId.set(j.id, j));
  state.jobs = [...byId.values()];
  renderQueue();
  for (const job of live.concat(generating)) {
    const was = prev.get(job.id);
    if (was === "generating" && job.status === "complete") {
      toast(`Script ready: ${job.title}`, true);
    }
    if (job.status === "failed" && was !== "failed") {
      toast(`Generation was interrupted. Try again. ${job.error || ""}`.trim());
    }
  }
  if (state.view === "history") await loadHistory(false);
  if (state.view === "script" && state.current && state.current.status === "generating") {
    const latest = await fetch(`/api/history/${state.current.id}`).then((r) => r.json()).catch(() => null);
    if (latest) openScript(latest, false);
  }
}

function startPolling() {
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(refreshJobs, 2000);
}

async function generate(payload) {
  if (!payload.title) {
    $("title").focus();
    return;
  }
  const response = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok) {
    toast(data.error || "Could not start generation");
    return;
  }
  clearForm();
  toast(`Generating in background: ${payload.title}`, true);
  await refreshJobs();
}

function openScript(item, switchView = true) {
  state.current = item;
  state.editing = false;
  const generating = item.status === "generating";
  $("scriptTitle").textContent = item.title;
  $("scriptMeta").textContent = generating
    ? `${item.scriptMakerLabel || item.scriptMaker} · ${item.stageLabel || "Generating..."}`
    : `${item.scriptMakerLabel || item.scriptMaker} · ${item.actualWordCount || 0} words · ${new Date(item.createdAt).toLocaleString()} · loyalty ${item.titleLoyaltyScore || "—"}`;
  $("scriptBody").innerHTML = formatScript(item.script || item.draft || (generating ? "Writing in the background..." : ""));
  $("intelBody").innerHTML = (item.references || [])
    .map(
      (r, i) => `<p><strong>${i + 1}. ${escapeHtml(r.title)}</strong><br>${r.similarity}% relevant · ${escapeHtml(r.reasonSelected || "")}</p>`
    )
    .join("") || "<p>Built using patterns from the trained library.</p>";
  $("saveState").textContent = generating ? item.stageLabel || "Generating..." : item.status === "failed" ? item.stageLabel : "Saved";
  if (switchView) showView("script");
}

async function loadHistory(switchTo = true) {
  if (switchTo) showView("history");
  const params = new URLSearchParams({
    q: $("historyQ").value.trim(),
    scriptMaker: $("historyMaker").value,
    sort: $("historySort").value,
  });
  const data = await fetch(`/api/history?${params}`).then((r) => r.json());
  $("historyList").innerHTML =
    data.items
      .map((item) => {
        const generating = item.status === "generating";
        const failed = item.status === "failed";
        return `<article data-id="${item.id}" class="${generating ? "generating" : ""}">
          <h3>${escapeHtml(item.title)}</h3>
          <p class="meta">${escapeHtml(item.scriptMaker)} · ${generating ? item.stageLabel || "Generating..." : `${item.actualWordCount || 0} words`} · ${new Date(item.createdAt).toLocaleString()}</p>
          ${generating ? `<span class="pill">In progress</span>` : ""}
          ${failed ? `<span class="pill">Failed — retry from New Script</span>` : ""}
        </article>`;
      })
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
    status: "complete",
  });
}

document.querySelectorAll(".nav").forEach((btn) => {
  btn.addEventListener("click", () => {
    const view = btn.dataset.view;
    if (view === "history") loadHistory();
    else if (view === "library") {
      showView("library");
      loadLibrary();
    } else showView(view);
  });
});

$("createForm").addEventListener("submit", (e) => {
  e.preventDefault();
  generate(formPayload());
});

$("queue").addEventListener("click", async (e) => {
  const card = e.target.closest("article");
  if (!card) return;
  const item = await fetch(`/api/jobs/${card.dataset.job}`).then((r) => r.json());
  openScript(item);
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
  $(id).addEventListener("input", () => loadHistory(false));
  $(id).addEventListener("change", () => loadHistory(false));
});
$("libQ").addEventListener("input", loadLibrary);

document.querySelector("#view-script .actions").addEventListener("click", async (e) => {
  const act = e.target.dataset.act;
  const item = state.current;
  if (!item || !act) return;
  if (item.status === "generating" && act !== "regen") return;
  if (act === "copy") {
    await navigator.clipboard.writeText(item.script || "");
    $("saveState").textContent = "Copied";
  }
  if (act === "txt") window.location = `/api/history/${item.id}.txt`;
  if (act === "docx") window.location = `/api/history/${item.id}.docx`;
  if (act === "regen") {
    await generate({
      title: item.title,
      targetWordCount: item.targetWordCount || 3500,
      scriptMaker: item.scriptMaker || "royal-family",
      customInstructions: item.customInstructions || "",
    });
    showView("create");
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
