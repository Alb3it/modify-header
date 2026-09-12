// Shared data model + DNR rule builder, used by both the background
// service worker and the popup.

export const STORAGE_KEYS = {
  RULES: "rules",
  GLOBAL_ENABLED: "globalEnabled",
  UI_LANG: "uiLang",
};

export const RESOURCE_TYPES = [
  "main_frame",
  "sub_frame",
  "stylesheet",
  "script",
  "image",
  "font",
  "object",
  "xmlhttprequest",
  "ping",
  "csp_report",
  "media",
  "websocket",
  "webtransport",
  "other",
];

let idCounter = 0;
export function createId() {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createDefaultRule(order) {
  return {
    id: createId(),
    enabled: false,
    type: "request", // "request" | "response"
    operation: "set", // "set" | "remove"
    headerName: "",
    headerValue: "",
    urlMode: "all", // "all" | "urlFilter" | "regexFilter"
    urlPattern: "",
    note: "",
    order,
  };
}

// Builds the full declarativeNetRequest dynamic rule set from the stored
// rows. Rows are listed top-to-bottom in the popup; the top row wins when
// two enabled rules would otherwise conflict on the same header, so we map
// list order to descending DNR priority.
export function buildDnrRules(rules, globalEnabled) {
  if (!globalEnabled) return [];

  const active = rules
    .filter((r) => r.enabled && r.headerName.trim())
    // A urlFilter/regexFilter scope with no pattern typed yet is an
    // incomplete rule, not "all URLs" — never fall back to matching
    // everything just because the pattern field is still empty.
    .filter((r) => r.urlMode === "all" || r.urlPattern.trim())
    .slice()
    .sort((a, b) => a.order - b.order);

  return active.map((rule, index) => {
    const headerEntry =
      rule.operation === "remove"
        ? { header: rule.headerName.trim(), operation: "remove" }
        : { header: rule.headerName.trim(), operation: "set", value: rule.headerValue };

    const action = {
      type: "modifyHeaders",
      ...(rule.type === "response"
        ? { responseHeaders: [headerEntry] }
        : { requestHeaders: [headerEntry] }),
    };

    const condition = { resourceTypes: RESOURCE_TYPES };
    if (rule.urlMode === "urlFilter" && rule.urlPattern.trim()) {
      condition.urlFilter = rule.urlPattern.trim();
    } else if (rule.urlMode === "regexFilter" && rule.urlPattern.trim()) {
      condition.regexFilter = rule.urlPattern.trim();
    }

    return {
      id: index + 1,
      priority: active.length - index,
      action,
      condition,
    };
  });
}
