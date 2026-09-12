import { STORAGE_KEYS, createDefaultRule } from "../common/ruleModel.js";
import { DEFAULT_LANG, LANGUAGES, translator } from "../common/i18n.js";

const ruleListEl = document.getElementById("ruleList");
const emptyStateEl = document.getElementById("emptyState");
const globalToggleEl = document.getElementById("globalToggle");
const globalToggleLabelEl = document.getElementById("globalToggleLabel");
const addBtnEl = document.getElementById("addBtn");
const selectAllBtnEl = document.getElementById("selectAllBtn");
const deselectAllBtnEl = document.getElementById("deselectAllBtn");
const langSelectEl = document.getElementById("langSelect");
const colMemoEl = document.getElementById("colMemo");
const colHeaderNameEl = document.getElementById("colHeaderName");
const colValueEl = document.getElementById("colValue");

let rules = [];
let globalEnabled = true;
let lang = DEFAULT_LANG;
let tr = translator(lang);
let draggingEl = null;
const saveTimers = new Map();
const expandedIds = new Set();

async function loadState() {
  const stored = await chrome.storage.local.get({
    [STORAGE_KEYS.RULES]: [],
    [STORAGE_KEYS.GLOBAL_ENABLED]: true,
    [STORAGE_KEYS.UI_LANG]: DEFAULT_LANG,
  });
  rules = stored[STORAGE_KEYS.RULES];
  globalEnabled = stored[STORAGE_KEYS.GLOBAL_ENABLED];
  lang = stored[STORAGE_KEYS.UI_LANG];
  tr = translator(lang);
}

async function saveRules() {
  await chrome.storage.local.set({ [STORAGE_KEYS.RULES]: rules });
}

async function saveGlobalEnabled() {
  await chrome.storage.local.set({ [STORAGE_KEYS.GLOBAL_ENABLED]: globalEnabled });
}

async function saveLang() {
  await chrome.storage.local.set({ [STORAGE_KEYS.UI_LANG]: lang });
}

function debounceSave(rowId) {
  clearTimeout(saveTimers.get(rowId));
  saveTimers.set(
    rowId,
    setTimeout(() => saveRules(), 250)
  );
}

function applyStaticTranslations() {
  globalToggleLabelEl.title = tr("globalToggleTitle");
  selectAllBtnEl.textContent = tr("selectAll");
  selectAllBtnEl.title = tr("selectAllTitle");
  deselectAllBtnEl.textContent = tr("deselectAll");
  deselectAllBtnEl.title = tr("deselectAllTitle");
  addBtnEl.title = tr("addRuleTitle");
  langSelectEl.title = tr("languageTitle");
  colMemoEl.textContent = tr("colMemo");
  colHeaderNameEl.textContent = tr("colHeaderName");
  colValueEl.textContent = tr("colValue");
  emptyStateEl.textContent = tr("emptyState");
}

function populateLangSelect() {
  langSelectEl.innerHTML = LANGUAGES.map((l) => `<option value="${l.code}">${l.label}</option>`).join("");
  langSelectEl.value = lang;
}

// Updates every row's checkbox/disabled styling from the current `rules`
// data without touching the rest of the DOM (focus, cursor position, open
// detail panels), for bulk actions (solo, select/deselect all) that only
// change `enabled` flags.
function syncEnabledStatesFromModel() {
  for (const item of ruleListEl.querySelectorAll(".rule-item")) {
    const rule = rules.find((r) => r.id === item.dataset.id);
    if (!rule) continue;
    item.classList.toggle("disabled", !rule.enabled);
    const checkbox = item.querySelector(".row-enabled");
    if (checkbox) checkbox.checked = rule.enabled;
  }
}

function render() {
  ruleListEl.innerHTML = "";
  const sorted = rules.slice().sort((a, b) => a.order - b.order);
  emptyStateEl.hidden = sorted.length > 0;

  for (const rule of sorted) {
    ruleListEl.appendChild(buildRow(rule));
  }
}

function buildRow(rule) {
  const wrapper = document.createElement("div");
  wrapper.className = "rule-item" + (rule.enabled ? "" : " disabled");
  wrapper.dataset.id = rule.id;

  const row = document.createElement("div");
  row.className = "rule-row row-grid";

  // drag handle
  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.textContent = "⋮⋮";
  handle.draggable = true;
  handle.addEventListener("dragstart", () => {
    draggingEl = wrapper;
    wrapper.classList.add("dragging");
  });
  handle.addEventListener("dragend", () => {
    wrapper.classList.remove("dragging");
    draggingEl = null;
    persistOrderFromDom();
  });

  // enabled checkbox
  const enabledBox = document.createElement("input");
  enabledBox.type = "checkbox";
  enabledBox.className = "row-enabled";
  enabledBox.checked = rule.enabled;
  enabledBox.title = tr("enabledTitle");
  enabledBox.addEventListener("change", () => {
    rule.enabled = enabledBox.checked;
    wrapper.classList.toggle("disabled", !rule.enabled);
    saveRules();
  });

  // solo button: turn this rule on and every other rule off
  const soloBtn = document.createElement("button");
  soloBtn.type = "button";
  soloBtn.className = "solo-btn";
  soloBtn.textContent = tr("soloLabel");
  soloBtn.title = tr("soloTitle");
  soloBtn.addEventListener("click", async () => {
    for (const r of rules) r.enabled = r.id === rule.id;
    syncEnabledStatesFromModel();
    await saveRules();
  });

  // note
  const noteInput = document.createElement("input");
  noteInput.type = "text";
  noteInput.placeholder = tr("memoPlaceholder");
  noteInput.value = rule.note;
  noteInput.title = rule.note;
  noteInput.addEventListener("input", () => {
    rule.note = noteInput.value;
    noteInput.title = noteInput.value;
    debounceSave(rule.id);
  });

  // header name
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "name-input";
  nameInput.placeholder = tr("headerNamePlaceholder");
  nameInput.value = rule.headerName;
  nameInput.addEventListener("input", () => {
    rule.headerName = nameInput.value;
    debounceSave(rule.id);
  });

  // header value
  const valueInput = document.createElement("input");
  valueInput.type = "text";
  valueInput.placeholder = tr("headerValuePlaceholder");
  valueInput.value = rule.headerValue;
  valueInput.disabled = rule.operation === "remove";
  valueInput.addEventListener("input", () => {
    rule.headerValue = valueInput.value;
    debounceSave(rule.id);
  });

  // detail expand/collapse toggle
  const detailToggle = document.createElement("button");
  detailToggle.type = "button";
  detailToggle.className = "detail-toggle";
  const isExpanded = expandedIds.has(rule.id);
  detailToggle.textContent = isExpanded ? "▾" : "▸";
  detailToggle.title = tr("detailToggleTitle");
  detailToggle.addEventListener("click", () => {
    if (expandedIds.has(rule.id)) {
      expandedIds.delete(rule.id);
      wrapper.querySelector(".detail-panel")?.remove();
      detailToggle.textContent = "▸";
    } else {
      expandedIds.add(rule.id);
      wrapper.appendChild(buildDetailPanel(rule, valueInput));
      detailToggle.textContent = "▾";
    }
  });

  // delete
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "delete-btn";
  deleteBtn.title = tr("deleteTitle");
  deleteBtn.textContent = "×";
  deleteBtn.addEventListener("click", async () => {
    rules = rules.filter((r) => r.id !== rule.id);
    rules.forEach((r, i) => (r.order = i));
    expandedIds.delete(rule.id);
    wrapper.remove();
    emptyStateEl.hidden = rules.length > 0;
    await saveRules();
  });

  row.append(handle, enabledBox, soloBtn, noteInput, nameInput, valueInput, detailToggle, deleteBtn);
  wrapper.appendChild(row);

  if (isExpanded) {
    wrapper.appendChild(buildDetailPanel(rule, valueInput));
  }

  return wrapper;
}

function buildDetailPanel(rule, valueInput) {
  const panel = document.createElement("div");
  panel.className = "detail-panel";

  // type toggle (request/response)
  const typeBtn = document.createElement("button");
  typeBtn.type = "button";
  const refreshTypeBtn = () => {
    typeBtn.className = "toggle-badge" + (rule.type === "response" ? " response" : "");
    typeBtn.textContent = rule.type === "response" ? tr("typeResponse") : tr("typeRequest");
    typeBtn.title = rule.type === "response" ? tr("typeResponseTitle") : tr("typeRequestTitle");
  };
  typeBtn.addEventListener("click", () => {
    rule.type = rule.type === "response" ? "request" : "response";
    refreshTypeBtn();
    saveRules();
  });
  refreshTypeBtn();

  // operation toggle (set/remove)
  const opBtn = document.createElement("button");
  opBtn.type = "button";
  const refreshOpBtn = () => {
    opBtn.className = "toggle-badge" + (rule.operation === "remove" ? " remove" : "");
    opBtn.textContent = rule.operation === "remove" ? tr("opRemove") : tr("opAdd");
    opBtn.title = rule.operation === "remove" ? tr("opRemoveTitle") : tr("opAddTitle");
  };
  opBtn.addEventListener("click", () => {
    rule.operation = rule.operation === "remove" ? "set" : "remove";
    refreshOpBtn();
    valueInput.disabled = rule.operation === "remove";
    saveRules();
  });
  refreshOpBtn();

  // url mode
  const urlModeSelect = document.createElement("select");
  urlModeSelect.innerHTML = `<option value="all">${tr("urlScopeAll")}</option><option value="urlFilter">${tr("urlScopeUrlFilter")}</option><option value="regexFilter">${tr("urlScopeRegex")}</option>`;
  urlModeSelect.value = rule.urlMode;

  // url pattern + regex validation message
  const urlPatternCell = document.createElement("div");
  urlPatternCell.className = "url-pattern-cell";

  const urlPatternInput = document.createElement("input");
  urlPatternInput.type = "text";
  urlPatternInput.value = rule.urlPattern;
  urlPatternInput.disabled = rule.urlMode === "all";

  const regexWarning = document.createElement("p");
  regexWarning.className = "regex-warning";
  regexWarning.hidden = true;

  function refreshUrlPatternPlaceholder() {
    urlPatternInput.placeholder =
      rule.urlMode === "regexFilter"
        ? tr("urlPatternRegexPlaceholder")
        : rule.urlMode === "urlFilter"
          ? tr("urlPatternFilterPlaceholder")
          : tr("urlPatternAllPlaceholder");
  }
  refreshUrlPatternPlaceholder();

  async function validateRegex() {
    if (rule.urlMode !== "regexFilter" || !urlPatternInput.value.trim()) {
      regexWarning.hidden = true;
      return;
    }
    try {
      const result = await chrome.declarativeNetRequest.isRegexSupported({
        regex: urlPatternInput.value.trim(),
      });
      regexWarning.hidden = result.isSupported;
      regexWarning.textContent = result.isSupported ? "" : tr("regexUnsupported")(result.reason);
    } catch {
      regexWarning.hidden = true;
    }
  }

  urlModeSelect.addEventListener("change", () => {
    rule.urlMode = urlModeSelect.value;
    urlPatternInput.disabled = rule.urlMode === "all";
    refreshUrlPatternPlaceholder();
    saveRules();
    validateRegex();
  });

  urlPatternInput.addEventListener("input", () => {
    rule.urlPattern = urlPatternInput.value;
    debounceSave(rule.id);
    validateRegex();
  });

  urlPatternCell.append(urlPatternInput, regexWarning);
  if (rule.urlMode === "regexFilter") validateRegex();

  const typeField = document.createElement("div");
  typeField.className = "detail-field detail-field-narrow";
  typeField.append(labeled(tr("detailType"), typeBtn));

  const opField = document.createElement("div");
  opField.className = "detail-field detail-field-narrow";
  opField.append(labeled(tr("detailOp"), opBtn));

  const urlModeField = document.createElement("div");
  urlModeField.className = "detail-field detail-field-medium";
  urlModeField.append(labeled(tr("detailUrlScope"), urlModeSelect));

  const urlPatternField = document.createElement("div");
  urlPatternField.className = "detail-field detail-field-wide";
  urlPatternField.append(labeled(tr("detailUrlPattern"), urlPatternCell));

  panel.append(typeField, opField, urlModeField, urlPatternField);
  return panel;
}

function labeled(text, el) {
  const wrap = document.createElement("div");
  const label = document.createElement("label");
  label.textContent = text;
  wrap.append(label, el);
  return wrap;
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll(".rule-item:not(.dragging)")];
  return els.reduce(
    (closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child };
      }
      return closest;
    },
    { offset: Number.NEGATIVE_INFINITY, element: null }
  ).element;
}

ruleListEl.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (!draggingEl) return;
  const afterEl = getDragAfterElement(ruleListEl, e.clientY);
  if (afterEl == null) {
    ruleListEl.appendChild(draggingEl);
  } else {
    ruleListEl.insertBefore(draggingEl, afterEl);
  }
});

function persistOrderFromDom() {
  const ids = [...ruleListEl.querySelectorAll(".rule-item")].map((el) => el.dataset.id);
  ids.forEach((id, index) => {
    const rule = rules.find((r) => r.id === id);
    if (rule) rule.order = index;
  });
  saveRules();
}

globalToggleEl.addEventListener("change", () => {
  globalEnabled = globalToggleEl.checked;
  saveGlobalEnabled();
});

selectAllBtnEl.addEventListener("click", async () => {
  for (const r of rules) r.enabled = true;
  syncEnabledStatesFromModel();
  await saveRules();
});

deselectAllBtnEl.addEventListener("click", async () => {
  for (const r of rules) r.enabled = false;
  syncEnabledStatesFromModel();
  await saveRules();
});

langSelectEl.addEventListener("change", async () => {
  lang = langSelectEl.value;
  tr = translator(lang);
  await saveLang();
  applyStaticTranslations();
  render();
});

addBtnEl.addEventListener("click", async () => {
  // New rules always get the highest `order`, so appending its row at the
  // end of the current DOM order matches where render() would place it —
  // no need to rebuild rows that are mid-edit.
  const rule = createDefaultRule(rules.length);
  rules.push(rule);
  emptyStateEl.hidden = true;
  const rowEl = buildRow(rule);
  ruleListEl.appendChild(rowEl);
  rowEl.querySelector(".name-input")?.focus();
  await saveRules();
});

(async function init() {
  await loadState();
  globalToggleEl.checked = globalEnabled;
  populateLangSelect();
  applyStaticTranslations();
  render();
})();
