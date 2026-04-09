/* MedAssist – frontend logic */

(function () {
  "use strict";

  // ── DOM refs ─────────────────────────────────────────────
  const tabs        = document.querySelectorAll(".tab");
  const panels      = document.querySelectorAll(".tab-panel");
  const textArea    = document.getElementById("symptom-text");
  const symSearch   = document.getElementById("sym-search");
  const symGrid     = document.getElementById("sym-grid");
  const selPreview  = document.getElementById("selected-preview");
  const selTags     = document.getElementById("selected-tags");
  const predictBtn  = document.getElementById("predict-btn");
  const resultCard  = document.getElementById("result-card");
  const resultContent = document.getElementById("result-content");

  // ── State ─────────────────────────────────────────────────
  let allSymptoms   = [];   // { readable, raw }
  let selectedRaw   = new Set();

  // ── Tab switching ─────────────────────────────────────────
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      panels.forEach(p => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("tab-" + tab.dataset.tab).classList.add("active");
    });
  });

  // ── Load symptoms from API ────────────────────────────────
  async function loadSymptoms() {
    try {
      const res  = await fetch("/api/symptoms");
      const data = await res.json();
      allSymptoms = data.raw.map((r, i) => ({ raw: r, readable: data.symptoms[i] }));
      renderChips(allSymptoms);
    } catch {
      symGrid.innerHTML = '<span class="loading-chips">Failed to load symptoms.</span>';
    }
  }

  function renderChips(list) {
    symGrid.innerHTML = "";
    if (list.length === 0) {
      symGrid.innerHTML = '<span class="loading-chips">No symptoms match.</span>';
      return;
    }
    list.forEach(({ raw, readable }) => {
      const chip = document.createElement("button");
      chip.className = "chip" + (selectedRaw.has(raw) ? " selected" : "");
      chip.textContent = readable;
      chip.dataset.raw = raw;
      chip.addEventListener("click", () => toggleChip(chip, raw));
      symGrid.appendChild(chip);
    });
  }

  function toggleChip(chip, raw) {
    if (selectedRaw.has(raw)) {
      selectedRaw.delete(raw);
      chip.classList.remove("selected");
    } else {
      selectedRaw.add(raw);
      chip.classList.add("selected");
    }
    updatePreview();
  }

  function updatePreview() {
    if (selectedRaw.size === 0) {
      selPreview.hidden = true;
      return;
    }
    selPreview.hidden = false;
    const labels = [...selectedRaw].map(r => {
      const item = allSymptoms.find(s => s.raw === r);
      return item ? item.readable : r;
    });
    selTags.textContent = labels.join(", ");
  }

  // ── Filter chips ──────────────────────────────────────────
  symSearch.addEventListener("input", () => {
    const q = symSearch.value.toLowerCase().trim();
    const filtered = q
      ? allSymptoms.filter(s => s.readable.toLowerCase().includes(q))
      : allSymptoms;
    renderChips(filtered);
  });

  // ── Prediction ────────────────────────────────────────────
  predictBtn.addEventListener("click", predict);
  textArea.addEventListener("keydown", e => {
    if (e.key === "Enter" && e.ctrlKey) predict();
  });

  async function predict() {
    const text     = textArea.value.trim();
    const selected = [...selectedRaw];

    if (!text && selected.length === 0) {
      showError("Please describe your symptoms or select at least one from the list.");
      return;
    }

    predictBtn.disabled = true;
    predictBtn.innerHTML = '<span class="btn-icon">⏳</span> Analysing…';
    resultCard.hidden = true;

    try {
      const res  = await fetch("/api/predict", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ text, selected }),
      });
      const data = await res.json();

      if (!res.ok) {
        showError(data.error || "Prediction failed. Please try again.");
      } else {
        showResult(data);
      }
    } catch {
      showError("Network error. Make sure the Flask server is running.");
    } finally {
      predictBtn.disabled = false;
      predictBtn.innerHTML = '<span class="btn-icon">🔍</span> Predict Disease';
    }
  }

  // ── Render result ─────────────────────────────────────────
  function showResult(data) {
    const conf     = data.confidence;
    const confColor = conf >= 70 ? "var(--accent)" : conf >= 40 ? "var(--warn)" : "var(--danger)";

    const chipsHtml = data.symptoms_found
      .map(s => `<span class="sym-found-chip">${escHtml(s)}</span>`)
      .join("");

    resultContent.innerHTML = `
      <div class="result-header">
        <div class="result-icon">🩺</div>
        <div>
          <div class="result-label">Predicted Condition</div>
          <div class="result-disease">${escHtml(data.disease)}</div>
        </div>
      </div>

      <div class="confidence-bar-wrap">
        <div class="conf-label">
          <span>Model Confidence</span>
          <span style="color:${confColor}">${conf}%</span>
        </div>
        <div class="conf-bar-bg">
          <div class="conf-bar-fill" style="width:0%;background:linear-gradient(90deg,var(--primary),${confColor})"></div>
        </div>
      </div>

      <div class="sym-found-section">
        <div class="sym-found-label">
          ${data.symptom_count} symptom${data.symptom_count !== 1 ? "s" : ""} detected
        </div>
        <div class="sym-found-chips">${chipsHtml}</div>
      </div>
    `;

    resultCard.hidden = false;
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });

    // Animate bar after render
    requestAnimationFrame(() => {
      const fill = resultContent.querySelector(".conf-bar-fill");
      if (fill) fill.style.width = conf + "%";
    });
  }

  function showError(msg) {
    resultContent.innerHTML = `
      <div class="error-box">
        <span class="error-icon">⚠️</span>
        <span>${escHtml(msg)}</span>
      </div>
    `;
    resultCard.hidden = false;
    resultCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function escHtml(str) {
    return str.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  }

  // ── Init ──────────────────────────────────────────────────
  loadSymptoms();
})();
