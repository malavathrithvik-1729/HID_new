// ── i18n.js ───────────────────────────────────────────────────────
// Translation engine for V-Med ID patient dashboard.
//
// Usage in dashboard.js:
//   import { t, initI18n, setLang, getCurrentLang } from "./i18n.js";
//   await initI18n();          // call once at boot
//   t("nav.home")              // → "Home" / "होम" / "హోమ్"
//   t("home.greetMorning")     // → "Good morning" etc.
//   setLang("hi");             // switch language, re-renders sidebar
//
// ─────────────────────────────────────────────────────────────────

const LANG_KEY      = "vmed_lang";
const SUPPORTED     = ["en", "hi", "te"];
const DEFAULT_LANG  = "en";

// Loaded translation objects cached here
const cache = {};
const pendingLoads = {};
const warnedMissing = new Set();

// Currently active translations
let _current = {};
let _lang     = DEFAULT_LANG;

// ── Load a language JSON file ──────────────────────────────────────
// Looks for:  patient_dashboard/lang/{code}.json
// Falls back to en.json if the file fails to load.

async function loadLang(code) {
  if (cache[code]) return cache[code];
  if (pendingLoads[code]) return pendingLoads[code];
  pendingLoads[code] = (async () => {
  try {
    // Path is relative to patient_dashboard/index.html
    const res  = await fetch(`lang/${code}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    cache[code] = data;
    return cache[code];
  } catch (err) {
    console.warn(`i18n: failed to load lang/${code}.json —`, err.message);
    if (code !== DEFAULT_LANG) return loadLang(DEFAULT_LANG);
    cache[code] = {};
    return cache[code];
  } finally {
    delete pendingLoads[code];
  }
  })();
  return pendingLoads[code];
}

// ── Read saved language preference ────────────────────────────────
function getSavedLang() {
  const saved = localStorage.getItem(LANG_KEY);
  return SUPPORTED.includes(saved) ? saved : DEFAULT_LANG;
}

// ── Initialise — call once at app boot ────────────────────────────
export async function initI18n() {
  _lang    = getSavedLang();
  _current = await loadLang(_lang);

  // Pre-load the other two languages in the background so switching
  // is instant after the first page load.
  SUPPORTED.filter(c => c !== _lang).forEach(c => loadLang(c));

  return _current;
}

// ── Switch language ────────────────────────────────────────────────
// Saves preference, swaps translations, fires a custom event so
// the active section can re-render itself.

export async function setLang(code) {
  if (!SUPPORTED.includes(code)) {
    console.warn(`i18n: unsupported language "${code}"`);
    return;
  }
  if (code === _lang) return;          // nothing to do

  _lang    = code;
  _current = await loadLang(code);
  localStorage.setItem(LANG_KEY, code);

  // Tell the app to re-render everything
  document.dispatchEvent(new CustomEvent("langchange", { detail: { lang: code } }));

  // Update lang attribute for screen readers and font rendering
  document.documentElement.lang = code;

  // Update the sidebar language toggle buttons immediately
  updateLangButtons();
}

// ── Get current language code ──────────────────────────────────────
export function getCurrentLang() { return _lang; }

// ── Translate a dot-path key ───────────────────────────────────────
// t("nav.home")          → "Home"
// t("home.greetMorning") → "Good morning"
// t("missing.key")       → "missing.key"  (safe fallback)
// t("key", { name: "Priya" }) → replaces {name} in the string

export function t(key, vars) {
  const val = resolvePath(_current, key) ?? resolvePath(cache[DEFAULT_LANG], key);

  if (val === undefined || val === null) {
    const warnId = `${_lang}:${key}`;
    if (!warnedMissing.has(warnId)) {
      warnedMissing.add(warnId);
      console.warn(`i18n: missing key "${key}" for "${_lang}"`);
    }
    return key;
  }

  if (typeof val !== "string") return String(val);

  // Replace {variable} placeholders
  if (vars) {
    val = val.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  }

  return val;
}

// ── Get full translation object for a section ─────────────────────
// tSection("nav") → { home: "Home", history: "...", ... }
export function tSection(section) {
  return resolvePath(_current, section) || resolvePath(cache[DEFAULT_LANG], section) || {};
}

function resolvePath(obj, key) {
  if (!obj || !key) return undefined;
  const parts = String(key).split(".");
  let val = obj;
  for (const part of parts) {
    if (val == null || typeof val !== "object") return undefined;
    val = val[part];
  }
  return val;
}

// ── Update language toggle buttons already in the DOM ─────────────
function updateLangButtons() {
  document.querySelectorAll("[data-lang-btn]").forEach(btn => {
    const code    = btn.dataset.langBtn;
    const isActive = code === _lang;
    btn.classList.toggle("lang-btn-active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });
}

// ── Export supported language metadata ────────────────────────────
// Used to build the language switcher UI.
export const LANGUAGES = [
  { code: "en", name: "English",  native: "English" },
  { code: "hi", name: "Hindi",    native: "हिन्दी"   },
  { code: "te", name: "Telugu",   native: "తెలుగు"  },
];
