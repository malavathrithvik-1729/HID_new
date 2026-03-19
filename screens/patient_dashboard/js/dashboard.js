import { auth } from "../../../js/firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { db } from "../../../js/firebase.js";
import {
  doc, updateDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { t, initI18n, setLang, getCurrentLang, LANGUAGES } from "./i18n.js";

const API_BASE = "http://localhost:3000";

// ── DARK MODE ─────────────────────────────────────────────────────
const DARK_KEY = "vmed_dark_mode";

function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  document.querySelectorAll(".dark-toggle-btn").forEach(btn => {
    btn.textContent = dark ? `☀️ ${t("nav.lightMode")}` : `🌙 ${t("nav.darkMode")}`;
  });
}

function toggleDark() {
  const next = !document.documentElement.classList.contains("dark");
  localStorage.setItem(DARK_KEY, next ? "1" : "0");
  applyTheme(next);
}

;(function initTheme() {
  const saved       = localStorage.getItem(DARK_KEY);
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark",
    saved !== null ? saved === "1" : prefersDark);
})();

window.toggleDark = toggleDark;

// ── SIDEBAR TRANSLATION ───────────────────────────────────────────
function applyNavTranslations() {
  const map = {
    "[data-page='home']":        t("nav.home"),
    "[data-page='history']":     t("nav.history"),
    "[data-page='medications']": t("nav.medications"),
    "[data-page='visits']":      t("nav.visits"),
    "[data-page='ai']":          t("nav.ai"),
    "[data-page='settings']":    t("nav.settings"),
  };
  Object.entries(map).forEach(([sel, label]) => {
    const el = document.querySelector(`${sel} .nav-label`);
    if (el) el.textContent = label;
  });

  const darkBtn = document.querySelector(".dark-toggle-btn .nav-label");
  if (darkBtn) {
    const isDark = document.documentElement.classList.contains("dark");
    darkBtn.textContent = isDark ? t("nav.lightMode") : t("nav.darkMode");
  }

  const logoutLabel = document.querySelector(".logout-btn .nav-label");
  if (logoutLabel) logoutLabel.textContent = t("nav.logout");

  const loaderP = document.querySelector(".loader-box p");
  if (loaderP) loaderP.textContent = t("loading");
  const loaderSmall = document.querySelector(".loader-box small");
  if (loaderSmall) loaderSmall.textContent = t("loadingQuote");

  document.querySelectorAll("[data-lang-btn]").forEach(btn => {
    btn.classList.toggle("lang-btn-active", btn.dataset.langBtn === getCurrentLang());
  });
}

// ── SPA LOADER ────────────────────────────────────────────────────
async function loadPage(pageName) {
  const content = document.getElementById("content");
  if (!content) return;
  try {
    const res = await fetch(`sections/${pageName}.html`);
    if (!res.ok) throw new Error("Section not found");
    content.innerHTML = await res.text();

    content.className = "";
    content.style     = "";
    const mainEl = document.getElementById("main");
    if (mainEl) mainEl.scrollTop = 0;

    content.querySelectorAll("script").forEach(old => {
      const s = document.createElement("script");
      [...old.attributes].forEach(a => s.setAttribute(a.name, a.value));
      s.textContent = old.textContent;
      old.parentNode.replaceChild(s, old);
    });

    applyTheme(document.documentElement.classList.contains("dark"));

    const data = await window.patientDataReady;

    if (pageName === "home")        initHome(data);
    if (pageName === "history")     initHistory(data);
    if (pageName === "medications") initMedications(data);
    if (pageName === "visits")      initVisits(data);
    if (pageName === "ai")          initAIChat(data);
    if (pageName === "settings")    initSettings(data);

  } catch (e) {
    console.error("loadPage error:", e);
    content.innerHTML = `<div class="section-wrap"><p style="color:var(--danger)">Error loading section: ${e.message}</p></div>`;
  }
}

let _currentPage = "home";
let _currentData = null;

function loadSection(btn, page) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  _currentPage = page;
  loadPage(page);
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("collapsed");
}

async function handleLogout() {
  await signOut(auth);
  window.location.replace("../login/login.html");
}

// ── HOME ──────────────────────────────────────────────────────────
function initHome(data) {
  if (!data) return;
  _currentData = data;
  const $ = id => document.getElementById(id);

  const name  = data.identity?.fullName?.split(" ")[0] || "";
  const hour  = new Date().getHours();
  const greet = hour < 12
    ? t("home.greetMorning")
    : hour < 17
      ? t("home.greetAfternoon")
      : t("home.greetEvening");
  if ($("greetText")) $("greetText").textContent = `${greet}${name ? ", " + name : ""} 👋`;

  const sub = document.querySelector(".welcome-banner p");
  if (sub) sub.textContent = t("home.subtitle");

  const statLabels = document.querySelectorAll(".stat-label");
  const labelKeys  = ["home.dob", "home.linkedDoctors", "home.totalVisits", "home.documents"];
  statLabels.forEach((el, i) => { if (labelKeys[i]) el.textContent = t(labelKeys[i]); });

  if ($("homeVmedId"))     $("homeVmedId").textContent     = data.vmedId                 || "--";
  if ($("homeBloodGroup")) $("homeBloodGroup").textContent = data.patientData?.bloodGroup || "--";
  if ($("homeGender"))     $("homeGender").textContent     = t(`gender.${data.identity?.gender}`) || data.identity?.gender || "--";

  if ($("homeDob")) {
    const dob = data.identity?.dob;
    if (dob) {
      const age = new Date().getFullYear() - new Date(dob).getFullYear();
      $("homeDob").textContent = `${dob}  (${age} yrs)`;
    } else {
      $("homeDob").textContent = "--";
    }
  }

  if ($("homeDoctorCount")) $("homeDoctorCount").textContent = (data.linkedDoctors || []).length;
  if ($("homeVisitCount"))  $("homeVisitCount").textContent  = (data.visits        || []).length;
  if ($("homeDocCount"))    $("homeDocCount").textContent    = (data.documents     || []).length;

  const setTxt = (id, key) => { const el = $(id); if (el) el.textContent = t(key); };
  setTxt("homeQrEyebrow",    "home.emergencyQr");
  setTxt("homeQrTitle",      "home.scanProfile");
  setTxt("homeQrSub",        "home.qrSub");
  setTxt("homeQrVmedLabel",  "home.vmedIdLabel");
  setTxt("homeQrHint",       "home.qrHint");

  const fsBtn = $("showFullQrBtn");
  if (fsBtn) fsBtn.textContent = `🔍 ${t("home.fullScreenQr")}`;

  if ($("homeLastVisitTitle"))    $("homeLastVisitTitle").textContent    = t("home.lastVisit");
  if ($("homeCurrentMedsTitle"))  $("homeCurrentMedsTitle").textContent  = t("home.currentMeds");

  if ($("homeLastVisit")) {
    const visits = data.visits || [];
    if (visits.length > 0) {
      const last = visits[visits.length - 1];
      $("homeLastVisit").innerHTML = `
        <div style="font-size:15px;font-weight:600;color:var(--ink)">${last.reason || "Consultation"}</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px">${last.date || ""} &nbsp;·&nbsp; ${t("visits.dr")} ${last.doctorName || ""}</div>`;
    } else {
      $("homeLastVisit").innerHTML = `<span style="font-size:14px;color:var(--muted)">${t("home.noVisits")}</span>`;
    }
  }

  if ($("homeMedList")) {
    const meds = data.medications || [];
    if (meds.length > 0) {
      $("homeMedList").innerHTML = meds.slice(0, 3).map(m => `
        <div class="med-card">
          <div class="med-icon">💊</div>
          <div class="med-info">
            <strong>${m.name}</strong>
            <div class="dose">${m.dosage || ""} ${m.duration ? "· " + m.duration : ""}</div>
            <div class="freq">${m.frequency || ""}</div>
          </div>
        </div>`).join("");
    } else {
      $("homeMedList").innerHTML = `<p style="font-size:13px;color:var(--muted);padding:8px 0">${t("home.noMeds")}</p>`;
    }
  }

  const noticeTitle = document.querySelector(".health-notice-title");
  const noticeText  = document.querySelector(".health-notice-text");
  if (noticeTitle) noticeTitle.textContent = t("home.healthNotice");
  if (noticeText)  noticeText.textContent  = t("home.healthNoticeText");

  const vmedId   = data.vmedId || "UNKNOWN";
  const fullName = data.identity?.fullName || "Patient";
  const blood    = data.patientData?.bloodGroup || "";
  const qrText   = `V-Med ID: ${vmedId} | Patient: ${fullName}` + (blood ? ` | Blood: ${blood}` : "");

  const qrUrl         = s => `https://api.qrserver.com/v1/create-qr-code/?size=${s}x${s}&data=${encodeURIComponent(qrText)}&color=0a1628&bgcolor=ffffff&margin=4&format=png`;
  const qrFallbackUrl = s => `https://chart.googleapis.com/chart?cht=qr&chs=${s}x${s}&chl=${encodeURIComponent(qrText)}&chco=0a1628`;

  if ($("homeQrVmedId"))  $("homeQrVmedId").textContent  = vmedId;
  if ($("qrModalVmedId")) $("qrModalVmedId").textContent = vmedId;
  if ($("qrModalName"))   $("qrModalName").textContent   = fullName;

  const setModal = (id, key) => { const el = $(id); if (el) el.textContent = t(key); };
  setModal("qrModalTitle",    "home.qrModalTitle");
  setModal("qrModalScanHint", "home.scanHint");
  setModal("qrVisitHistory",  "home.visitHistory");
  setModal("qrBloodGroup",    "home.bloodGroup");
  setModal("qrMedications",   "medications.title");
  setModal("qrAllergies",     "home.allergies");

  const closeBtn2 = $("closeQrBtn");
  if (closeBtn2) closeBtn2.textContent = t("home.closeBtn");

  const smallImg = $("homeQrImg");
  if (smallImg) {
    smallImg.src = qrUrl(150);
    smallImg.onerror = function() {
      this.onerror = function() {
        this.style.display = "none";
        if (this.parentElement) this.parentElement.innerHTML = `<div style="font-size:10px;color:#0a1628;word-break:break-all;text-align:center;padding:4px;line-height:1.4">${vmedId}</div>`;
      };
      this.src = qrFallbackUrl(150);
    };
  }

  const modal  = $("qrFullModal");
  const bigImg = $("modalQrImg");
  $("showFullQrBtn")?.addEventListener("click", () => {
    if (bigImg && !bigImg.dataset.loaded) {
      bigImg.src = qrUrl(300);
      bigImg.onerror = function() { this.src = qrFallbackUrl(300); };
      bigImg.dataset.loaded = "true";
    }
    if (modal) modal.style.display = "flex";
  });
  $("closeQrBtn")?.addEventListener("click", () => { if (modal) modal.style.display = "none"; });
  modal?.addEventListener("click", e => { if (e.target === modal) modal.style.display = "none"; });
}

// ── HISTORY ───────────────────────────────────────────────────────
function initHistory(data) {
  const docs  = data?.documents || [];
  const list  = document.getElementById("historyList");
  const empty = document.getElementById("historyEmpty");
  if (!list) return;

  const title = document.querySelector(".section-wrap .page-title");
  if (title) title.textContent = t("history.title");

  if (docs.length === 0) {
    if (empty) { empty.style.display = "block"; empty.textContent = t("history.empty"); }
    return;
  }
  if (empty) empty.style.display = "none";
  list.innerHTML = docs.map(d => `
    <div class="doc-item">
      <div class="doc-icon">📄</div>
      <div class="doc-info"><strong>${d.title || "Document"}</strong><span>${d.type || "report"}</span></div>
      <a class="doc-link" href="${d.externalUrl}" target="_blank">${t("history.viewBtn")}</a>
    </div>`).join("");
}

// ── MEDICATIONS ───────────────────────────────────────────────────
function initMedications(data) {
  const meds  = data?.medications || [];
  const list  = document.getElementById("medList");
  const empty = document.getElementById("medEmpty");
  if (!list) return;

  if (meds.length === 0) {
    if (empty) { empty.style.display = "block"; empty.textContent = t("medications.empty"); }
    return;
  }
  if (empty) empty.style.display = "none";
  list.innerHTML = meds.map(m => `
    <div class="med-card">
      <div class="med-icon">💊</div>
      <div class="med-info">
        <strong>${m.name}</strong>
        <div class="dose">${m.dosage || ""} ${m.duration ? "· " + m.duration : ""}</div>
        <div class="freq">${m.frequency || ""}</div>
        ${m.instructions ? `<div class="dose" style="margin-top:4px;font-style:italic">${m.instructions}</div>` : ""}
        ${m.prescribedBy  ? `<div class="dose" style="margin-top:4px;color:var(--accent)">${t("medications.dr")} ${m.prescribedBy}</div>` : ""}
      </div>
      <span class="stat-badge ${m.active !== false ? "badge-green" : "badge-yellow"}">
        ${m.active !== false ? t("medications.active") : t("medications.completed")}
      </span>
    </div>`).join("");
}

// ── VISITS ────────────────────────────────────────────────────────
function initVisits(data) {
  const visits = data?.visits || [];
  const list   = document.getElementById("visitList");
  const empty  = document.getElementById("visitEmpty");
  if (!list) return;

  if (visits.length === 0) {
    if (empty) { empty.style.display = "block"; empty.textContent = t("visits.empty"); }
    return;
  }
  if (empty) empty.style.display = "none";
  list.innerHTML = [...visits].reverse().map(v => `
    <div class="visit-card">
      <div class="visit-header">
        <h4>${v.reason || "Consultation"}</h4>
        <span class="visit-date">${v.date || ""}</span>
      </div>
      <div class="visit-doctor">👨‍⚕️ ${t("visits.dr")} ${v.doctorName || "Unknown"} ${v.doctorSpec ? "· " + v.doctorSpec : ""}</div>
      ${v.diagnosis ? `<div class="visit-detail"><strong>${t("visits.diagnosis")}:</strong> ${v.diagnosis}</div>` : ""}
      ${v.notes     ? `<div class="visit-detail" style="margin-top:6px">${v.notes}</div>` : ""}
      ${v.prescriptions?.length
        ? `<div class="visit-pills">${v.prescriptions.map(p => `<span class="visit-pill">💊 ${p}</span>`).join("")}</div>`
        : ""}`).join("");
}

// ── AI CHAT ───────────────────────────────────────────────────────
function initAIChat(data) {
  const input   = document.getElementById("aiInput");
  const chat    = document.getElementById("aiChat");
  const sendBtn = document.getElementById("aiSendBtn");
  if (!input || !chat || !sendBtn) return;

  const aiTitle = document.querySelector(".ai-section-title");
  if (aiTitle) aiTitle.textContent = t("ai.title");
  const aiSub = document.querySelector(".ai-section-sub");
  if (aiSub) aiSub.textContent = t("ai.poweredBy");
  const aiDisc = document.getElementById("aiDisclaimer");
  if (aiDisc) aiDisc.innerHTML = t("ai.disclaimer");
  const qTitle = document.querySelector(".ai-quick-title");
  if (qTitle) qTitle.textContent = t("ai.quickTitle");
  if (input) input.placeholder = t("ai.placeholder");
  if (sendBtn) sendBtn.textContent = t("ai.send");

  const qKeys = ["q1","q2","q3","q4","q5","q6"];
  document.querySelectorAll(".quick-prompt-btn").forEach((btn, i) => {
    if (qKeys[i]) btn.textContent = t(`ai.${qKeys[i]}`);
  });

  const footer = document.getElementById("aiFooter");
  if (footer) footer.textContent = t("ai.footer");

  const ctxEl = document.getElementById("aiContextBadge");
  if (ctxEl && data?.identity?.fullName) {
    ctxEl.textContent   = `${t("ai.personalised")} ${data.identity.fullName.split(" ")[0]}`;
    ctxEl.style.display = "inline-block";
  }

  const patientPayload = data ? {
    vmedId:        data.vmedId,
    identity: {
      fullName:    data.identity?.fullName,
      gender:      data.identity?.gender,
      dob:         data.identity?.dob,
      address:     data.identity?.address,
    },
    patientData: {
      bloodGroup:  data.patientData?.bloodGroup,
      occupation:  data.patientData?.occupation,
    },
    medications:   data.medications   || [],
    visits:        data.visits        || [],
    documents:     data.documents     || [],
    linkedDoctors: data.linkedDoctors || [],
  } : null;

  const chatHistory = [];

  function addContinueBtn() {
    document.getElementById("aiContinueBtn")?.remove();
    const btn = document.createElement("div");
    btn.id = "aiContinueBtn";
    btn.style.cssText = "text-align:center;margin:8px 0";
    btn.innerHTML = `<button onclick="window._aiContinue()" style="padding:7px 20px;background:var(--accent,#1a6b4a);color:#fff;border:none;border-radius:20px;font-family:'Outfit',sans-serif;font-size:13px;cursor:pointer;opacity:0.85">${t("ai.continueBtn")}</button>`;
    chat.appendChild(btn);
    chat.scrollTop = chat.scrollHeight;
  }

  // ── SEND ─────────────────────────────────────────────────────
  async function send(overrideMsg) {
    const text = overrideMsg || input.value.trim();
    if (!text) return;

    document.getElementById("aiContinueBtn")?.remove();
    if (!overrideMsg) {
      chat.insertAdjacentHTML("beforeend",
        `<div class="ai-msg user"><div class="bubble">${escHtml(text)}</div></div>`);
      input.value = "";
    }
    chat.scrollTop = chat.scrollHeight;

    const typing = document.createElement("div");
    typing.className = "ai-msg ai";
    typing.innerHTML = `<div class="bubble" style="color:var(--muted)">${t("ai.thinking")}</div>`;
    chat.appendChild(typing);
    chat.scrollTop = chat.scrollHeight;

    try {
      // ✅ FIX 1: added lang field so backend replies in selected language
      const res = await fetch(`${API_BASE}/api/ai/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          patient: patientPayload,
          history: chatHistory,
          lang:    getCurrentLang(),   // "en" | "hi" | "te"
        })
      });

      // ✅ FIX 2: check HTTP status before parsing JSON
      //    Previously a non-200 response caused res.json() to reject,
      //    landing in catch{} which showed the generic "server not running" message
      //    even when the server WAS running but returned an error code.
      if (!res.ok) {
        let errMsg = `Server returned ${res.status}`;
        try {
          const errBody = await res.json();
          errMsg = errBody.error || errMsg;
        } catch { /* body wasn't valid JSON — keep status message */ }
        throw new Error(errMsg);
      }

      const json = await res.json();
      typing.remove();

      if (json.error) {
        chat.insertAdjacentHTML("beforeend",
          `<div class="ai-msg ai"><div class="bubble" style="color:var(--danger,#c0392b)">⚠️ ${escHtml(json.error)}</div></div>`);
        chat.scrollTop = chat.scrollHeight;
        return;
      }

      const reply = json.reply || "";
      chatHistory.push({ role: "user",  text });
      chatHistory.push({ role: "model", text: reply });
      if (chatHistory.length > 20) chatHistory.splice(0, 2);

      chat.insertAdjacentHTML("beforeend",
        `<div class="ai-msg ai"><div class="bubble">${parseMd(reply)}</div></div>`);

      const trimmed = reply.trimEnd();
      if (trimmed.length > 200 && !/[.!?:»।]$/.test(trimmed)) addContinueBtn();

    } catch (err) {
      // ✅ FIX 3: show the REAL error so you can diagnose it
      //    Old code: catch{} — swallowed err, always showed generic message
      //    New code: reads err.message and maps to a helpful diagnosis
      typing.remove();
      console.error("AI fetch error:", err);

      const msg = err.message || "";
      let userMsg;

      if (msg.includes("Failed to fetch") || msg.includes("ERR_CONNECTION_REFUSED") || msg.includes("NetworkError")) {
        // Server is not running — most common cause
        userMsg =
          `⚠️ Cannot connect to the AI server at <code>${API_BASE}</code>.<br><br>` +
          `Open a terminal in the <code>backend/</code> folder and run:<br>` +
          `<code style="background:rgba(0,0,0,0.08);padding:2px 6px;border-radius:4px">node server.js</code>`;
      } else if (msg.includes("503") || msg.includes("UNAVAILABLE")) {
        userMsg = "⚠️ Gemini is temporarily unavailable. Please wait a moment and try again.";
      } else if (msg.includes("429")) {
        userMsg = "⚠️ Rate limit reached. Please wait a few seconds and try again.";
      } else if (msg.includes("401") || msg.includes("403")) {
        userMsg = "⚠️ Gemini API key issue. Check your <code>.env</code> file in the backend folder.";
      } else if (msg.includes("404")) {
        userMsg = "⚠️ Gemini model not found. Update <code>GEMINI_MODEL</code> in <code>server.js</code>.";
      } else {
        userMsg = `⚠️ ${escHtml(msg) || t("ai.aiUnavailable")}`;
      }

      chat.insertAdjacentHTML("beforeend",
        `<div class="ai-msg ai"><div class="bubble" style="color:var(--danger,#c0392b);line-height:1.8">${userMsg}</div></div>`);
    }

    chat.scrollTop = chat.scrollHeight;
  }

  // ── Continue button handler ───────────────────────────────────
  window._aiContinue = () => {
    document.getElementById("aiContinueBtn")?.remove();
    // Send the continue request in the active language
    const lang = getCurrentLang();
    const continueMsg =
      lang === "hi" ? "कृपया अपना पिछला उत्तर वहाँ से जारी रखें जहाँ आप रुके थे।" :
      lang === "te" ? "దయచేసి మీరు ఆపిన చోటి నుండి కొనసాగించండి." :
                      "Please continue your previous response from where you left off.";
    send(continueMsg);
  };

  window._aiQuickSend = (btn) => {
    if (input && sendBtn) { input.value = btn.textContent.trim(); sendBtn.click(); }
  };

  sendBtn.onclick = () => send();
  input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
}

// ── SETTINGS + EMERGENCY CONTACTS ────────────────────────────────
function initSettings(data) {
  if (!data) return;
  _currentData = data;

  const setText = (id, key) => { const el = document.getElementById(id); if (el) el.textContent = t(key); };
  setText("settingsAppearanceTitle", "settings.appearance");
  setText("settingsThemeLabel",      "settings.themeLabel");
  setText("settingsThemeDesc",       "settings.themeDesc");
  setText("settingsLightLabel",      "settings.lightTheme");
  setText("settingsLightDesc",       "settings.lightThemeDesc");
  setText("settingsDarkLabel",       "settings.darkTheme");
  setText("settingsDarkDesc",        "settings.darkThemeDesc");
  setText("settingsLangTitle",       "settings.language");
  setText("settingsLangDesc",        "settings.languageDesc");
  setText("settingsEcTitle",         "settings.emergency");
  setText("settingsEcDesc",          "settings.emergencyDesc");
  setText("addContactBtn",           "settings.addContact");
  setText("settingsPersonalTitle",   "settings.personalInfo");
  setText("settingsContactTitle",    "settings.contactDetails");
  setText("settingsIdTitle",         "settings.identityDocs");
  setText("settingsVmedTitle",       "settings.vmedIdCard");
  setText("settingsVmedDesc",        "settings.vmedIdDesc");
  setText("settingsSecTitle",        "settings.security");
  setText("changePassBtn",           "settings.changePass");
  setText("settingsAccTitle",        "settings.account");
  setText("logoutBtnSettings",       "settings.logout");

  const labels = {
    "lbl_fullName":"settings.fullName","lbl_father":"settings.fatherName",
    "lbl_gender":"settings.gender","lbl_dob":"settings.dob",
    "lbl_blood":"settings.bloodGroup","lbl_occ":"settings.occupation",
    "lbl_address":"settings.address","lbl_email":"settings.email",
    "lbl_phone":"settings.phone","lbl_aadhaar":"settings.aadhaar","lbl_abha":"settings.abha",
  };
  Object.entries(labels).forEach(([id, key]) => setText(id, key));

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || "--"; };
  set("detailName",       data.identity?.fullName);
  set("detailFather",     data.identity?.fatherName);
  set("detailGender",     t(`gender.${data.identity?.gender}`) || data.identity?.gender);
  set("detailDob",        data.identity?.dob);
  set("detailBlood",      data.patientData?.bloodGroup);
  set("detailOccupation", data.patientData?.occupation);
  set("detailAddress",    data.identity?.address);
  set("detailEmail",      data.contact?.email);
  set("detailPhone",      data.contact?.phone);
  set("detailAbha",       data.identity?.abha);

  const aadhaar = data.identity?.aadhaar;
  set("detailAadhaar", aadhaar ? "XXXX-XXXX-" + aadhaar.slice(-4) : "--");

  const vmedEl = document.getElementById("shareVmedId");
  if (vmedEl) vmedEl.textContent = data.vmedId || "--";

  if (typeof syncDmSwitch === "function") syncDmSwitch();

  const langBtnWrap = document.getElementById("langBtnWrap");
  if (langBtnWrap) {
    langBtnWrap.innerHTML = LANGUAGES.map(l => `
      <button
        data-lang-btn="${l.code}"
        class="lang-btn ${l.code === getCurrentLang() ? "lang-btn-active" : ""}"
        onclick="window._setLang('${l.code}')"
        title="${l.name}"
      >
        <span class="lang-native">${l.native}</span>
        <span class="lang-en">${l.name}</span>
      </button>`).join("");
  }

  setText("passModalTitle", "settings.changePassTitle");
  const currPass = document.getElementById("currPass");
  const newPass  = document.getElementById("newPass");
  const confPass = document.getElementById("confPass");
  if (currPass) currPass.placeholder = t("settings.currPass");
  if (newPass)  newPass.placeholder  = t("settings.newPass");
  if (confPass) confPass.placeholder = t("settings.confPass");
  setText("savePassBtn",   "settings.save");
  setText("cancelPassBtn", "settings.cancel");

  document.getElementById("changePassBtn")?.addEventListener("click", () => {
    const m = document.getElementById("passwordModal");
    if (m) { m.classList.add("open"); m.style.display = "flex"; }
  });
  document.getElementById("cancelPassBtn")?.addEventListener("click", () => {
    const m = document.getElementById("passwordModal");
    if (m) { m.classList.remove("open"); m.style.display = "none"; }
  });
  document.getElementById("savePassBtn")?.addEventListener("click", changePassword);
  document.getElementById("logoutBtnSettings")?.addEventListener("click", handleLogout);

  // ── Emergency Contacts ────────────────────────────────────────
  const uid     = auth.currentUser?.uid;
  const userRef = uid ? doc(db, "users", uid) : null;
  const MAX     = 3;
  let contacts  = (data.emergencyContacts || []).map(c => ({ ...c }));

  function renderContacts() {
    const list   = document.getElementById("ecList");
    const empty  = document.getElementById("ecEmpty");
    const addBtn = document.getElementById("addContactBtn");
    if (!list) return;
    if (empty) {
      empty.style.display = contacts.length === 0 ? "block" : "none";
      const emptyTitle = empty.querySelector(".ec-empty-title");
      const emptyDesc  = empty.querySelector(".ec-empty-desc");
      if (emptyTitle) emptyTitle.textContent = t("settings.noContacts");
      if (emptyDesc)  emptyDesc.textContent  = t("settings.noContactsDesc");
    }
    if (addBtn) {
      addBtn.disabled = contacts.length >= MAX;
      addBtn.textContent = t("settings.addContact");
    }
    if (contacts.length === 0) { list.innerHTML = ""; return; }
    list.innerHTML = contacts.map((c, i) => `
      <div class="ec-contact-card" id="ecCard-${i}">
        <div class="ec-avatar">🆘</div>
        <div class="ec-info">
          <div class="ec-name">${escHtml(c.name)}</div>
          <span class="ec-relation">${escHtml(c.relation)}</span>
          <div class="ec-phone">📞 ${escHtml(c.phone)}${c.altPhone ? ` &nbsp;·&nbsp; 📞 ${escHtml(c.altPhone)}` : ""}</div>
        </div>
        <div class="ec-actions">
          <button class="ec-edit-btn" onclick="window._ecEdit(${i})">${t("settings.editBtn")}</button>
          <button class="ec-del-btn"  onclick="window._ecDelete(${i})">${t("settings.deleteBtn")}</button>
        </div>
      </div>`).join("");
  }

  function openModal(editIndex = -1) {
    const modal   = document.getElementById("ecModal");
    const title   = document.getElementById("ecModalTitle");
    const saveBtn = document.getElementById("ecSaveBtn");
    const errEl   = document.getElementById("ecError");
    if (!modal) return;

    if (title) title.textContent = editIndex >= 0 ? t("settings.modalEdit") : t("settings.modalAdd");

    const setLabel = (id, key) => { const el = document.getElementById(id); if (el) el.textContent = t(key); };
    setLabel("ecNameLabel","settings.nameLabel");
    setLabel("ecPhoneLabel","settings.phoneLabel");
    setLabel("ecRelationLabel","settings.relationLabel");
    setLabel("ecAltPhoneLabel","settings.altPhoneLabel");
    setLabel("ecOptionalLabel","settings.optional");

    const ecName     = document.getElementById("ecName");
    const ecPhone    = document.getElementById("ecPhone");
    const ecAltPhone = document.getElementById("ecAltPhone");
    if (ecName)     ecName.placeholder     = t("settings.nameLabel");
    if (ecPhone)    ecPhone.placeholder    = "e.g. 9876543210";
    if (ecAltPhone) ecAltPhone.placeholder = "e.g. 9876543211";

    const relSelect = document.getElementById("ecRelation");
    if (relSelect) {
      const relations = t("settings.relations");
      const relEn = ["Father","Mother","Spouse","Son","Daughter","Brother","Sister","Friend","Guardian","Other"];
      relSelect.innerHTML = `<option value="">${t("settings.selectRelation")}</option>` +
        relEn.map((val, i) => `<option value="${val}">${Array.isArray(relations) ? relations[i] : val}</option>`).join("");
    }

    const newSaveBtn = document.getElementById("ecSaveBtn");
    if (newSaveBtn) newSaveBtn.textContent = t("settings.saveContact");
    modal.querySelectorAll(".ec-modal-cancel").forEach(b => b.textContent = t("settings.cancel"));

    if (ecName)     ecName.value     = "";
    if (ecPhone)    ecPhone.value    = "";
    if (relSelect)  relSelect.value  = "";
    if (ecAltPhone) ecAltPhone.value = "";
    if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

    if (editIndex >= 0 && contacts[editIndex]) {
      const c = contacts[editIndex];
      if (ecName)     ecName.value     = c.name     || "";
      if (ecPhone)    ecPhone.value    = c.phone    || "";
      if (relSelect)  relSelect.value  = c.relation || "";
      if (ecAltPhone) ecAltPhone.value = c.altPhone || "";
    }

    modal.style.display = "flex";

    const freshSaveBtn = saveBtn.cloneNode(true);
    freshSaveBtn.textContent = t("settings.saveContact");
    saveBtn.parentNode.replaceChild(freshSaveBtn, saveBtn);

    freshSaveBtn.addEventListener("click", async () => {
      const name     = document.getElementById("ecName")?.value.trim()     || "";
      const phone    = document.getElementById("ecPhone")?.value.trim()    || "";
      const relation = document.getElementById("ecRelation")?.value        || "";
      const altPhone = document.getElementById("ecAltPhone")?.value.trim() || "";
      const errEl2   = document.getElementById("ecError");
      const showErr  = msg => { if (errEl2) { errEl2.textContent = msg; errEl2.style.display = "block"; } };

      if (!name)     { showErr(t("settings.nameLabel")     + " " + t("settings.required")); return; }
      if (!phone)    { showErr(t("settings.phoneLabel")    + " " + t("settings.required")); return; }
      if (!/^\d{10,15}$/.test(phone.replace(/[\s\-\+]/g, ""))) { showErr("Phone must be 10–15 digits."); return; }
      if (!relation) { showErr(t("settings.relationLabel") + " " + t("settings.required")); return; }
      if (altPhone && !/^\d{10,15}$/.test(altPhone.replace(/[\s\-\+]/g, ""))) { showErr("Alternate phone must be 10–15 digits."); return; }
      if (errEl2) errEl2.style.display = "none";

      const contact = {
        id:       editIndex >= 0 ? contacts[editIndex].id : `ec_${Date.now()}`,
        name, phone, relation,
        altPhone:  altPhone || "",
        addedAt:   editIndex >= 0 ? (contacts[editIndex].addedAt || new Date().toISOString()) : new Date().toISOString(),
      };

      freshSaveBtn.disabled    = true;
      freshSaveBtn.innerHTML   = `<span class="ec-spinner"></span> ${t("settings.saving")}`;

      try {
        if (!userRef) throw new Error("Not logged in");
        const updatedList = editIndex >= 0
          ? contacts.map((c, i) => i === editIndex ? contact : c)
          : [...contacts, contact];
        await updateDoc(userRef, { emergencyContacts: updatedList });
        contacts = updatedList;
        renderContacts();
        modal.style.display = "none";
        showToast(editIndex >= 0 ? t("settings.contactUpdated") : t("settings.contactAdded"));
      } catch (err) {
        console.error("EC save:", err);
        showErr("Failed to save. Please try again.");
      } finally {
        freshSaveBtn.disabled    = false;
        freshSaveBtn.textContent = t("settings.saveContact");
      }
    });
  }

  async function deleteContact(index) {
    if (!window.confirm(t("settings.confirmDelete").replace("{name}", contacts[index]?.name || ""))) return;
    const card = document.getElementById(`ecCard-${index}`);
    if (card) { card.style.opacity = "0.4"; card.style.pointerEvents = "none"; }
    try {
      if (!userRef) throw new Error("Not logged in");
      const updated = contacts.filter((_, i) => i !== index);
      await updateDoc(userRef, { emergencyContacts: updated });
      contacts = updated;
      renderContacts();
      showToast(t("settings.contactRemoved"));
    } catch (err) {
      console.error("EC delete:", err);
      if (card) { card.style.opacity = "1"; card.style.pointerEvents = ""; }
      alert("Failed to delete. Try again.");
    }
  }

  function showToast(msg) {
    document.getElementById("ecToast")?.remove();
    const toast = document.createElement("div");
    toast.id = "ecToast";
    toast.textContent = msg;
    toast.style.cssText = "position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#1a6b4a;color:#fff;padding:10px 22px;border-radius:100px;font-family:'Outfit',sans-serif;font-size:13px;font-weight:500;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,0.2)";
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = "0"; toast.style.transition = "opacity .3s"; }, 2200);
    setTimeout(() => toast.remove(), 2500);
  }

  window._ecEdit   = (i) => openModal(i);
  window._ecDelete = (i) => deleteContact(i);
  document.getElementById("addContactBtn")?.addEventListener("click", () => openModal(-1));
  document.getElementById("ecModal")?.addEventListener("click", function(e) {
    if (e.target === this) this.style.display = "none";
  });

  renderContacts();
}

// ── CHANGE PASSWORD ───────────────────────────────────────────────
async function changePassword() {
  const { updatePassword, EmailAuthProvider, reauthenticateWithCredential }
    = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
  const curr = document.getElementById("currPass").value;
  const newp = document.getElementById("newPass").value;
  const conf = document.getElementById("confPass").value;
  if (newp !== conf)   { alert(t("settings.passMismatch")); return; }
  if (newp.length < 8) { alert(t("settings.passShort"));    return; }
  try {
    const user = auth.currentUser;
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, curr));
    await updatePassword(user, newp);
    alert(t("settings.passUpdated"));
    const m = document.getElementById("passwordModal");
    if (m) { m.classList.remove("open"); m.style.display = "none"; }
  } catch (e) { alert(e.message); }
}

// ── UTILS ─────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function parseMd(t) {
  if (!t) return "";
  return t
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm,  "<h3>$1</h3>")
    .replace(/^## (.+)$/gm,   "<h3>$1</h3>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g,     "<strong>$1</strong>")
    .replace(/^[ \t]{2,}[\*\-] (.+)$/gm, "<li style='margin-left:20px'>$1</li>")
    .replace(/^[\*\-] (.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\. (.+)$/gm,  "<li>$1</li>")
    .replace(/(<li[\s\S]*?<\/li>\n?)+/g, m => `<ul style="margin:6px 0 6px 18px;padding:0">${m}</ul>`)
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, " ")
    .replace(/(<\/(?:ul|h3|h4)>)(<br>)+/g, "$1");
}

// ── GLOBALS ───────────────────────────────────────────────────────
window.loadPage      = loadPage;
window.loadSection   = loadSection;
window.toggleSidebar = toggleSidebar;
window.handleLogout  = handleLogout;

window._setLang = async (code) => {
  await setLang(code);
  if (_currentPage && _currentData) {
    await loadPage(_currentPage);
  }
  applyNavTranslations();
};

// ── BOOT ──────────────────────────────────────────────────────────
(async () => {
  await initI18n();
  applyNavTranslations();
  document.documentElement.lang = getCurrentLang();
  await window.patientDataReady;
  loadPage("home");
  document.addEventListener("langchange", async () => {
    applyNavTranslations();
    document.documentElement.lang = getCurrentLang();
  });
})();