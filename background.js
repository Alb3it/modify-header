import { STORAGE_KEYS, buildDnrRules } from "./common/ruleModel.js";

async function syncDnrRules() {
  const stored = await chrome.storage.local.get({
    [STORAGE_KEYS.RULES]: [],
    [STORAGE_KEYS.GLOBAL_ENABLED]: true,
  });

  const nextRules = buildDnrRules(
    stored[STORAGE_KEYS.RULES],
    stored[STORAGE_KEYS.GLOBAL_ENABLED]
  );

  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: nextRules,
  });

  await chrome.action.setBadgeText({ text: nextRules.length ? String(nextRules.length) : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
}

// Storage can change several times in quick succession (debounced keystrokes,
// drag reorder, select/deselect all). Chain the syncs so only one
// getDynamicRules/updateDynamicRules round trip runs at a time — running them
// concurrently lets a later call's stale removeRuleIds race an earlier call's
// addRules and throw ("does not have a unique ID"), silently dropping that
// update.
let syncChain = Promise.resolve();
function queueSync() {
  syncChain = syncChain.then(syncDnrRules).catch((err) => console.error("syncDnrRules failed", err));
  return syncChain;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (STORAGE_KEYS.RULES in changes || STORAGE_KEYS.GLOBAL_ENABLED in changes) {
    queueSync();
  }
});

// Runs every time this service worker script is evaluated: on install,
// browser startup, "reload" in chrome://extensions, and whenever Chrome
// wakes the worker for an event. onInstalled/onStartup alone miss the
// dev-reload case, which is why the badge could go stale after a reload.
queueSync();
