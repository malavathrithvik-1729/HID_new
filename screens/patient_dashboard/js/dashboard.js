import { auth } from "../../../js/firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { db } from "../../../js/firebase.js";
import {
  doc, updateDoc, getDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { t, initI18n, setLang, getCurrentLang, LANGUAGES } from "./i18n.js";

const API_BASE = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" 
  ? "http://127.0.0.1:3000" 
  : "";

const LAST_PAGE_KEY = "vmed_last_patient_page";

import { vStore } from "./vStore.js";

const $ = id => document.getElementById(id);
window.$ = $;
window.toggleDark = toggleDark;
window.loadPage = loadPage;
window.loadSection = loadSection;
window.toggleSidebar = toggleSidebar;
window.handleLogout = handleLogout;

// Multi-lingual support helpers

// ── DARK MODE ─────────────────────────────────────────────────────
const DARK_KEY = "vmed_dark_mode";

function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  const label = document.querySelector("#sidebarDarkBtn .nav-label");
  const icon = document.querySelector("#sidebarDarkBtn .nav-icon");
  if (label) label.textContent = dark ? t("nav.lightMode") : t("nav.darkMode");
  if (icon) icon.textContent = dark ? "☀️" : "🌙";
}

function toggleDark() {
  const next = !document.documentElement.classList.contains("dark");
  vStore.set(DARK_KEY, next ? "1" : "0", "local");
  applyTheme(next);
}

; (function initTheme() {
  const saved = vStore.get(DARK_KEY, "local");
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark",
    saved !== null ? saved === "1" : prefersDark);
})();

window.toggleDark = toggleDark;

// ── SIDEBAR TRANSLATION ───────────────────────────────────────────
function applyNavTranslations() {
  const map = {
    "[data-page='home']": t("nav.home"),
    "[data-page='documents']": t("nav.history"),
    "[data-page='medications']": t("nav.medications"),
    "[data-page='visits']": t("nav.visits"),
    "[data-page='ai']": t("nav.ai"),
    "[data-page='sos']": t("nav.sos"),
    "[data-page='blood_donor']": t("nav.blood_donor"),
    "[data-page='family']": t("nav.family"),
    "[data-page='settings']": t("nav.settings"),
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
  const shortcutTip = document.getElementById("shortcutTip");
  if (shortcutTip) shortcutTip.innerHTML = t("nav.shortcutTip");
  const offlineLabel = $("offlineLabel");
  if (offlineLabel) offlineLabel.textContent = t("offline.modeLabel");
  const reconnectBtn = $("reconnectBtn");
  if (reconnectBtn) reconnectBtn.textContent = t("offline.reconnect");

  document.querySelectorAll("[data-lang-btn]").forEach(btn => {
    btn.classList.toggle("lang-btn-active", btn.dataset.langBtn === getCurrentLang());
  });
}

// ── SPA LOADER ────────────────────────────────────────────────────
async function loadPage(pageName) {
  const content = $("content");
  if (!content) return;
  content.innerHTML = `
    <div class="loader-box">
      <div class="loader-ring"></div>
      <p>${t("loading")}</p>
      <small>${t("loadingQuote")}</small>
    </div>
  `;
  vStore.set(LAST_PAGE_KEY, pageName, "local");
  try {
    const res = await fetch(`sections/${pageName}.html`);
    if (!res.ok) throw new Error("Section not found");
    content.innerHTML = await res.text();

    content.className = "";
    content.style = "";
    const mainEl = document.getElementById("main");
    if (mainEl) mainEl.scrollTop = 0;

    content.querySelectorAll("script").forEach(old => {
      const s = document.createElement("script");
      [...old.attributes].forEach(a => s.setAttribute(a.name, a.value));
      s.textContent = old.textContent;
      old.parentNode.replaceChild(s, old);
    });

    applyTheme(document.documentElement.classList.contains("dark"));

    let data = window.currentPatientData;
    let isOffline = false;

    if (window.currentUserId) {
      try {
        const freshSnap = await getDoc(doc(db, "users", window.currentUserId));
        if (freshSnap.exists()) {
          data = freshSnap.data();
          window.currentPatientData = data;
          vStore.set("vmed_offline_data", JSON.stringify(data), 'local');
          vStore.set("vmed_last_sync", new Date().toISOString(), 'local');
        }
      } catch (e) {
        console.warn("Network error, attempting to load from offline cache...", e);
        const cached = vStore.get("vmed_offline_data", 'local');
        if (cached) {
          data = JSON.parse(cached);
          isOffline = true;
          window.currentPatientData = data;
        }
      }
    }

    // Show offline mode banner
    const offlineBanner = document.getElementById("offlineBanner");
    if (offlineBanner) {
      offlineBanner.style.display = isOffline ? "flex" : "none";
      if (isOffline) {
        const syncTime = vStore.get("vmed_last_sync", 'local');
        document.getElementById("offlineSyncTime").textContent = syncTime ? new Date(syncTime).toLocaleString() : "Unknown";
      }
    }

    if (pageName === "home") initHome(data);
    if (pageName === "documents") initDocuments(data);
    if (pageName === "medications") initMedications(data);
    if (pageName === "visits") initVisits(data);
    if (pageName === "ai") initAIChat(data);
    if (pageName === "settings") initSettings(data);
    if (pageName === "vitals") initVitals(data);
    if (pageName === "sos") initSOS(data);
    if (pageName === "blood_donor") initBloodDonor(data);
    if (pageName === "family") initFamily(data);
    if (pageName === "info") initInfo(data);

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
  vStore.set(LAST_PAGE_KEY, page, 'local');
  loadPage(page);
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) {
    vStore.set("vmed_sidebar_collapsed", sidebar.classList.contains("collapsed") ? "1" : "0", 'local');
    sidebar.classList.toggle("collapsed");
  }
}

async function handleLogout() {
  await signOut(auth);
  window.location.replace("../login/login.html");
}

// --- HEALTH SCORE CALCULATION (V2 Weighted Model) ---
function calculateScore(d) {
    let scores = {
        comp: 0,   // Profile Completeness (200)
        act: 0,    // Medical Activity (150)
        integ: 0,  // Data Integrity (200)
        prev: 0,   // Preventive Health (100)
        life: 0,   // Lifestyle (100)
        cons: 0,   // Consistency (100)
        risk: 0,   // Risk Prediction (50)
        wellness: 0, // Mental Wellness (50)
        emer: 0    // Emergency Readiness (50)
    };

    // 1. Profile Completeness (200)
    const idFields = ['fullName', 'gender', 'dob', 'address']; 
    const contactFields = ['email', 'phone'];
    scores.comp += idFields.reduce((acc, f) => acc + (d.identity?.[f] ? 30 : 0), 0); // 120
    scores.comp += contactFields.reduce((acc, f) => acc + (d.contact?.[f] ? 20 : 0), 0); // 40
    scores.comp += (d.patientData?.bloodGroup ? 20 : 0) + (d.patientData?.occupation ? 20 : 0); // 40
    scores.comp = Math.min(200, scores.comp);

    // 2. Medical Activity (150)
    const visitCount = (d.visits || []).length;
    const medCount   = (d.medications || []).length;
    const docCount   = (d.documents || []).length;
    scores.act += Math.min(50, visitCount * 10);
    scores.act += Math.min(50, medCount * 10);
    scores.act += Math.min(50, docCount * 10);

    // 3. Data Integrity (200)
    const totalRecs = docCount + (d.vitalsHistory?.length || 0);
    const verifiedRecs = (d.documents || []).filter(v => v.verified).length + 
                         (d.vitalsHistory || []).filter(v => v.verified).length;
    scores.integ = totalRecs > 0 ? Math.round((verifiedRecs / totalRecs) * 200) : 100;

    // 4. Preventive Health (100) - Vitals Freshness
    const vitals = d.vitalsHistory || [];
    if (vitals.length > 0) {
        const lastVital = new Date(vitals[vitals.length-1].date);
        const diffDays = Math.floor((new Date() - lastVital) / (1000 * 60 * 60 * 24));
        if (diffDays < 30) scores.prev = 100;
        else if (diffDays < 90) scores.prev = 50;
        else scores.prev = 20;
    } else {
        scores.prev = 0;
    }

    // 5. Lifestyle (100) - Chronic care & Personal details
    scores.life += (d.patientData?.conditions ? 50 : 25); // Documenting conditions is better for records
    scores.life += (docCount > 0 ? 50 : 0); // Historic data presence

    // 6. Consistency (100) - App retention
    const created = d.createdAt ? (d.createdAt.seconds ? new Date(d.createdAt.seconds*1000) : new Date(d.createdAt)) : new Date();
    const monthAge = Math.max(1, Math.floor((new Date() - created) / (1000 * 60 * 60 * 24 * 30)));
    scores.cons = Math.min(100, monthAge * 20); // 5 months = 100% consistency

    // 7. Risk Prediction (50) - AI Engagement
    scores.risk = (d.healthScore?.lastAiInteraction ? 50 : (d.visits?.length > 0 ? 25 : 0));

    // 8. Mental Wellness (50) - (Placeholder mapping to Medication Adherence or Self-Care)
    scores.wellness = (medCount > 0 ? 50 : 25); 

    // 9. Emergency Readiness (50)
    const ecCount = (d.emergencyContacts || []).length;
    scores.emer = Math.min(45, ecCount * 15) + ((d.familyLinks || []).length > 0 ? 5 : 0);

    const total = Object.values(scores).reduce((a, b) => a + b, 0);
    
    return { 
        total: Math.round(total), 
        compPct: Math.round((scores.comp / 200) * 100), 
        actPct: Math.round((scores.act / 150) * 100),
        integPct: Math.round((scores.integ / 200) * 100)
    };
}

// ── HOME ──────────────────────────────────────────────────────────
function initHome(data) {
  if (!data) return;
  _currentData = data;
  const $ = id => document.getElementById(id);

  const name = data.identity?.fullName?.split(" ")[0] || "";
  const hour = new Date().getHours();
  const greet = hour < 12
    ? t("home.greetMorning")
    : hour < 17
      ? t("home.greetAfternoon")
      : t("home.greetEvening");
  if ($("greetText")) $("greetText").textContent = `${greet}${name ? ", " + name : ""} 👋`;

  const sub = document.querySelector(".welcome-banner p");
  if (sub) sub.textContent = t("home.subtitle");

  const statLabels = document.querySelectorAll(".stat-label");
  const labelKeys = ["home.dob", "home.linkedDoctors", "home.totalVisits", "home.documents"];
  statLabels.forEach((el, i) => { if (labelKeys[i]) el.textContent = t(labelKeys[i]); });

  if ($("homeVmedId")) $("homeVmedId").textContent = data.vmedId || "--";
  if ($("homeBloodGroup")) $("homeBloodGroup").textContent = data.patientData?.bloodGroup || "--";
  if ($("homeBloodGroupStat")) $("homeBloodGroupStat").textContent = data.patientData?.bloodGroup || "--";
  if ($("homeGender")) $("homeGender").textContent = t(`gender.${data.identity?.gender}`) || data.identity?.gender || "--";

  if ($("homeDob")) {
    const dob = data.identity?.dob;
    if (dob) {
      const age = new Date().getFullYear() - new Date(dob).getFullYear();
      $("homeDob").textContent = dob;
    } else {
      $("homeDob").textContent = "--";
    }
  }

  if ($("homeDoctorCount")) $("homeDoctorCount").textContent = (data.linkedDoctors || []).length;
  if ($("homeVisitCount")) $("homeVisitCount").textContent = (data.visits || []).length;
  if ($("homeDocCount")) $("homeDocCount").textContent = (data.documents || []).length;

  const s = calculateScore(data);
  if ($("homeHealthScore")) {
      $("homeHealthScore").textContent = s.total;
      const prog = $("scoreProgress");
      if (prog) {
          const circumference = 377;
          prog.style.strokeDashoffset = circumference - (s.total / 1000) * circumference;
      }
      if ($("barComp")) $("barComp").style.width = s.compPct + "%";
      if ($("barAct"))  $("barAct").style.width = s.actPct + "%";
      if ($("barInteg")) $("barInteg").style.width = s.integPct + "%";
      
      if ($("scoreComp")) $("scoreComp").textContent = s.compPct + "%";
      if ($("scoreAct"))  $("scoreAct").textContent = s.actPct + "%";
      if ($("scoreInteg")) $("scoreInteg").textContent = s.integPct + "%";
      
      const statusEl = $("scoreStatus");
      if (statusEl) {
          if (s.total > 800) { statusEl.textContent = t("home.scoreExcellent") || "Excellent"; statusEl.style.color = "#16a34a"; }
          else if (s.total > 600) { statusEl.textContent = t("home.scoreGood") || "Good"; statusEl.style.color = "var(--accent)"; }
          else { statusEl.textContent = t("home.scorePending") || "Improving"; statusEl.style.color = "#b45309"; }
      }

      // Sync if needed
      if (!data.healthScore || Math.abs(data.healthScore.total - s.total) > 5) {
          updateDoc(doc(db, "users", auth.currentUser.uid), { healthScore: { total: s.total, lastCalculated: new Date().toLocaleDateString('en-GB') } }).catch(() => {});
      }
  }

  if ($("homeLastVisit")) {
    const visits = data.visits || [];
    if (visits.length > 0) {
      const last = visits[visits.length - 1];
      $("homeLastVisit").innerHTML = `
        <div style="font-size:15px;font-weight:600;color:var(--ink)">${escHtml(last.reason || "Consultation")}</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px">${last.date || ""} &nbsp;·&nbsp; ${t("visits.dr")} ${last.doctorName || ""}</div>`;
    } else {
      $("homeLastVisit").innerHTML = `<span style="font-size:14px;color:var(--muted)">${t("home.noVisits")}</span>`;
    }
  }

  if ($("homeMedList")) {
    const meds = (data.medications || []).filter(m => m.active !== false);
    if (meds.length > 0) {
      $("homeMedList").innerHTML = meds.slice(0, 3).map(m => `
        <div class="med-card" style="padding:10px; margin-bottom:8px;">
          <div class="med-icon" style="width:32px;height:32px;font-size:16px;">💊</div>
          <div class="med-info">
            <strong style="font-size:13px;">${m.name}</strong>
            <div class="freq" style="font-size:11px;">${m.frequency || ""} · ${m.timing || ""}</div>
          </div>
        </div>`).join("");
    } else {
      $("homeMedList").innerHTML = `<p style="font-size:13px;color:var(--muted);padding:8px 0">${t("home.noMeds")}</p>`;
    }
  }

  const noticeTitle = document.querySelector(".health-notice-title");
  const noticeText = document.querySelector(".health-notice-text");
  if (noticeTitle) noticeTitle.textContent = t("home.healthNotice");
  if (noticeText) noticeText.textContent = t("home.healthNoticeText");

  const vmedId = data.vmedId || "UNKNOWN";
  const fullName = data.identity?.fullName || "Patient";
  const blood = data.patientData?.bloodGroup || "";
  const qrText = `V-Med ID: ${vmedId} | Patient: ${fullName}` + (blood ? ` | Blood: ${blood}` : "");

  const qrUrl = s => `https://api.qrserver.com/v1/create-qr-code/?size=${s}x${s}&data=${encodeURIComponent(qrText)}&color=0a1628&bgcolor=ffffff&margin=4&format=png`;
  const qrFallbackUrl = s => `https://chart.googleapis.com/chart?cht=qr&chs=${s}x${s}&chl=${encodeURIComponent(qrText)}&chco=0a1628`;

  if ($("homeQrVmedId")) $("homeQrVmedId").textContent = vmedId;
  if ($("qrModalVmedId")) $("qrModalVmedId").textContent = vmedId;
  if ($("qrModalName")) $("qrModalName").textContent = fullName;

  const setModal = (id, key) => { const el = $(id); if (el) el.textContent = t(key); };
  setModal("qrModalTitle", "home.qrModalTitle");
  setModal("qrModalScanHint", "home.scanHint");
  setModal("qrVisitHistory", "home.visitHistory");
  setModal("qrBloodGroup", "home.bloodGroup");
  setModal("qrMedications", "medications.title");
  setModal("qrAllergies", "home.allergies");

  const closeBtn2 = $("closeQrBtn");
  if (closeBtn2) closeBtn2.textContent = t("home.closeBtn");

  const smallImg = $("homeQrImg");
  if (smallImg) {
    smallImg.src = qrUrl(150);
    smallImg.onerror = function () {
      this.onerror = function () {
        this.style.display = "none";
        if (this.parentElement) this.parentElement.innerHTML = `<div style="font-size:10px;color:#0a1628;word-break:break-all;text-align:center;padding:4px;line-height:1.4">${vmedId}</div>`;
      };
      this.src = qrFallbackUrl(150);
    };
  }

  const modal = $("qrFullModal");
  const bigImg = $("modalQrImg");
  $("showFullQrBtn")?.addEventListener("click", () => {
    if (bigImg && !bigImg.dataset.loaded) {
      bigImg.src = qrUrl(300);
      bigImg.onerror = function () { this.src = qrFallbackUrl(300); };
      bigImg.dataset.loaded = "true";
    }
    if (modal) modal.style.display = "flex";
  });
  $("closeQrBtn")?.addEventListener("click", () => { if (modal) modal.style.display = "none"; });
  modal?.addEventListener("click", e => { if (e.target === modal) modal.style.display = "none"; });

  // ── HEALTH TIPS (Priority 8) ──────────────────────────────
  const cachedKey = `vmed_insights_${data.uid}`;
  const cached = vStore.get(cachedKey);
  
  if (cached) {
    const parsed = JSON.parse(cached);
    // If cache has no articles, or is very old, force a background refresh
    if (!parsed.articles || parsed.articles.length === 0) {
        console.log("♻️ Cache stale or empty, refreshing insights...");
        loadHealthTips(data);
    } else {
        const loading = $("healthTipLoading");
        if (loading) loading.style.display = "none";
        renderHealthTips(parsed);
    }
  } else {
    loadHealthTips(data);
  }
}

async function loadHealthTips(data) {
  const loading = $("healthTipLoading");
  if (!loading) return;

  try {
    const bg = encodeURIComponent(data.patientData?.bloodGroup || "");
    const conditions = (data.visits || []).slice(0, 3).map(v => v.diagnosis).filter(d => d).join(", ");
    const cond = encodeURIComponent(conditions || "");

    const resp = await fetch(`${API_BASE}/api/health-tips?bloodGroup=${bg}&conditions=${cond}`, { headers: {  "Authorization": "Bearer " + (auth.currentUser ? await auth.currentUser.getIdToken() : "")  } });
    if (!resp.ok) {
        if (resp.status === 429) throw new Error("Medical engine is busy. Please try again shortly.");
        throw new Error("Failed to curate insights");
    }
    
    const result = await resp.json();
    vStore.set(`vmed_insights_${data.uid}`, JSON.stringify(result));
    
    if (loading) loading.style.display = "none";
    renderHealthTips(result);

  } catch (e) {
    console.warn("Health tips error:", e);
    if (loading) {
        loading.innerHTML = `<p style="font-size:12px; color:var(--muted); padding:20px;">Insights engine warming up. Check back shortly.</p>`;
    }
  }
}

function renderHealthTips(result) {
  const container = document.getElementById("healthTipContent");
  const sourceLabel = document.getElementById("healthTipSource");
  const mainTip = document.getElementById("mainTipText");
  const articlesList = document.getElementById("insightsArticlesList");
  const mediaBox = document.getElementById("insightsMedia");

  if (!container) return;
  
  if (mainTip) mainTip.innerHTML = `“${result.tip}”`;
  
  if (articlesList) {
    const articles = result.articles || [];
    if (articles.length === 0) {
      articlesList.innerHTML = `<div style="grid-column: 1/-1; padding: 20px; text-align: center; color: var(--muted); font-size: 13px;">Expanding health library... Check back in a moment.</div>`;
    } else {
      articlesList.innerHTML = articles.map(a => `
        <a href="${a.link || '#'}" target="_blank" class="article-item">
          <span class="article-title">${escHtml(a.title || 'Health Insight')}</span>
          <div class="article-meta">V-MED HEALTH &nbsp;·&nbsp; 2 min read</div>
        </a>
      `).join("");
    }
  }

  if (mediaBox) {
    mediaBox.innerHTML = `
      <iframe width="100%" height="100%" src="https://www.youtube.com/embed/videoseries?list=PL9S6xGsoqIBXRQzSDOfFb13iPrbL8fgy1" 
        title="WHO Science in 5 - Health Tips" frameborder="0" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
        allowfullscreen style="border:none;"></iframe>
      <div style="position:absolute; bottom:10px; right:10px; background:rgba(0,0,0,0.6); padding:4px 8px; border-radius:4px; font-size:10px; color:white; pointer-events:none;">
        If video fails, <a href="https://www.youtube.com/playlist?list=PL9S6xGsoqIBXRQzSDOfFb13iPrbL8fgy1" target="_blank" style="color:#3b82f6; pointer-events:auto; text-decoration:none;">click here</a>
      </div>
    `;
  }

  container.style.display = "block";
  if (sourceLabel) {
    sourceLabel.textContent = `SOURCE: ${result.source || 'V-MED INTELLIGENCE'}`;
    sourceLabel.style.display = "inline-block";
  }
}


// ── DOCUMENTS ─────────────────────────────────────────────────────
function initDocuments(data) {
  const docs = data?.documents || [];
  const list = document.getElementById("docList");
  const empty = document.getElementById("docEmpty");
  const filter = document.getElementById("docFilter");
  if (!list) return;

  const title = document.querySelector(".section-wrap .page-title");
  if (title) title.textContent = t("history.title") || "Medical History";

  window.deleteUserDoc = async (docId, title) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    try {
      const updated = (data.documents || []).filter(d => (d.id || d.title) !== docId);
      await updateDoc(doc(db, "users", auth.currentUser.uid), { documents: updated });
      loadPage("documents");
      showToast("Document deleted successfully");
    } catch (e) { alert("Error deleting document: " + e.message); }
  };

  function renderDocs() {
    const fval = filter ? filter.value : "All";
    const filtered = fval === "All" ? docs : docs.filter(d => d.type === fval);

    if (filtered.length === 0) {
      if (empty) empty.style.display = "block";
      list.innerHTML = "";
      return;
    }
    if (empty) empty.style.display = "none";
    
    list.innerHTML = [...filtered].reverse().map((d) => {
      const isVerified = d.verified === true;
      const uploader = d.addedBy || "Self";
      const docId = d.id || d.title;
      
      return `
      <div class="history-card" style="display:flex; flex-direction:column; gap:12px; border-left: 4px solid ${isVerified ? "var(--accent)" : "var(--border)"}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="doc-icon" style="font-size:20px">${isVerified ? "🛡️" : "📄"}</div>
            <div>
              <strong style="font-size:15px; color:var(--ink)">${escHtml(d.title)}</strong>
              ${isVerified ? `<span class="patient-tag tag-active" style="font-size:10px; margin-left:8px; padding: 2px 8px;">Verified</span>` : ""}
              <div style="font-size:12px; color:var(--muted); margin-top:2px;">
                ${d.type || "Other"} &nbsp;·&nbsp; ${d.date || "Unknown date"}
              </div>
            </div>
          </div>
          <div style="text-align:right">
             <div style="font-size:10px; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px">Source</div>
             <div style="font-size:12px; font-weight:600; color:var(--ink)">${escHtml(uploader)}</div>
          </div>
        </div>
        
        ${d.description ? `<p style="font-size:13px; color:var(--muted); line-height:1.5; background:var(--surface-2); padding:10px; border-radius:8px; border:1px solid var(--border)">${escHtml(d.description)}</p>` : ""}
        
        <div style="display:flex; gap:10px; margin-top:4px; align-items:center;">
          <a href="${d.externalUrl}" target="_blank" class="btn-primary" style="font-size:12px; padding:8px 20px; text-decoration:none; display:flex; align-items:center; gap:6px; background:var(--accent); border:none; border-radius:8px; color:#fff; font-weight:600; transition:opacity 0.2s;">
            👁️ View Clinical Record
          </a>
          ${isVerified ? `
            <div style="font-size:11px; color:var(--muted); display:flex; align-items:center; gap:4px; margin-left:auto; opacity:0.6;">
              🔒 CLINICAL DATA LOCKED
            </div>
          ` : ""}
        </div>
      </div>`;
    }).join("");
  }

  if (filter) filter.addEventListener("change", renderDocs);
  renderDocs();
}


// ── MEDICATIONS ───────────────────────────────────────────────────
function initMedications(data) {
  const meds = data?.medications || [];
  const list = document.getElementById("medList");
  const empty = document.getElementById("medEmpty");
  if (!list) return;

  if (meds.length === 0) {
    if (empty) { empty.style.display = "block"; empty.textContent = t("medications.empty"); }
    return;
  }
  if (empty) empty.style.display = "none";
  list.innerHTML = meds.map(m => {
    const isActive = m.active !== false;
    return `
    <div class="med-card" style="display:flex; align-items:center; gap:16px; padding:20px; background:var(--surface); border:1px solid var(--border); border-radius:14px; margin-bottom:12px; position:relative;">
      <div class="med-icon" style="width:50px; height:50px; border-radius:12px; background:var(--surface-2); display:flex; align-items:center; justify-content:center; font-size:24px;">💊</div>
      <div class="med-info" style="flex:1;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:4px;">
           <strong style="font-size:16px; color:var(--ink);">${escHtml(m.name)}</strong>
           <span class="stat-badge ${isActive ? "badge-green" : "badge-yellow"}" style="font-size:10px; padding:4px 10px; border-radius:100px;">
             ${isActive ? t("medications.active") : t("medications.completed")}
           </span>
        </div>
        <div style="font-size:13px; color:var(--muted); margin-bottom:8px;">${m.dosage || ""} &nbsp;·&nbsp; ${m.duration || "Course not set"}</div>
        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
           <span style="font-size:12px; color:var(--ink); font-weight:600; display:flex; align-items:center; gap:4px;">🕒 ${m.frequency || ""}</span>
           ${m.timing ? `<span style="background:var(--accent-light); padding:3px 10px; border-radius:6px; font-size:11px; color:var(--accent); font-weight:600;">🍽️ ${m.timing}</span>` : ""}
           ${m.endDate ? `<span style="background:var(--surface-2); padding:3px 10px; border-radius:6px; font-size:11px; color:var(--muted); border:1px solid var(--border); margin-left:auto;">📅 Ends: ${m.endDate}</span>` : ""}
        </div>
        ${m.instructions ? `<div style="margin-top:10px; font-size:12px; font-style:italic; border-top:1px solid var(--border); padding-top:8px; color:var(--muted);">${escHtml(m.instructions)}</div>` : ""}
        ${m.prescribedBy ? `<div style="margin-top:10px; font-size:11px; color:var(--accent); font-weight:600;">👨‍⚕️ Prescribed by: Dr. ${escHtml(m.prescribedBy)}</div>` : ""}
      </div>
    </div>`;
  }).join("");
}

// ── VISITS ────────────────────────────────────────────────────────
function initVisits(data) {
  const visits = data?.visits || [];
  const list = document.getElementById("visitList");
  const empty = document.getElementById("visitEmpty");
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
      ${v.notes ? `<div class="visit-detail" style="margin-top:6px">${v.notes}</div>` : ""}
      ${v.prescriptions?.length
      ? `<div class="visit-pills">${v.prescriptions.map(p => `<span class="visit-pill">💊 ${p}</span>`).join("")}</div>`
      : ""}`).join("");
}

// ── AI CHAT ───────────────────────────────────────────────────────
function initAIChat(data) {
  const input = document.getElementById("aiInput");
  const chat = document.getElementById("aiChat");
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

  const qKeys = ["q1", "q2", "q3", "q4", "q5", "q6"];
  document.querySelectorAll(".quick-prompt-btn").forEach((btn, i) => {
    if (qKeys[i]) btn.textContent = t(`ai.${qKeys[i]}`);
  });

  const footer = document.getElementById("aiFooter");
  if (footer) footer.textContent = t("ai.footer");

  const ctxEl = document.getElementById("aiContextBadge");
  if (ctxEl && data?.identity?.fullName) {
    ctxEl.textContent = `${t("ai.personalised")} ${data.identity.fullName.split(" ")[0]}`;
    ctxEl.style.display = "inline-block";
  }

  // ── Mode Switch ──────────
  let aiMode = "assistant"; // "assistant" or "symptom"
  const assistantBtn = document.getElementById("modeAssistant");
  const symptomBtn = document.getElementById("modeSymptom");
  if (assistantBtn && symptomBtn) {
    assistantBtn.onclick = () => {
      aiMode = "assistant";
      assistantBtn.classList.add("active"); symptomBtn.classList.remove("active");
      // Console log instead of noisy chat bubble
      console.log("Switched to Health Assistant mode");
    };
    symptomBtn.onclick = () => {
      aiMode = "symptom";
      symptomBtn.classList.add("active"); assistantBtn.classList.remove("active");
      // Console log instead of noisy chat bubble
      console.log("Switched to Symptom Checker mode");
    };
  }

  const patientPayload = data ? {
    vmedId: data.vmedId,
    identity: {
      fullName: data.identity?.fullName,
      gender: data.identity?.gender,
      dob: data.identity?.dob,
      address: data.identity?.address,
    },
    patientData: {
      bloodGroup: data.patientData?.bloodGroup,
      occupation: data.patientData?.occupation,
    },
    medications: data.medications || [],
    visits: data.visits || [],
    documents: data.documents || [],
    linkedDoctors: data.linkedDoctors || [],
  } : null;

  // ── RENDER REPORT DROPDOWN ──────────
  const checklist = document.getElementById("aiReportChecklist");
  const countEl = document.getElementById("selectedCount");
  const docs = data?.documents || [];

  function updateCount() {
    const checked = document.querySelectorAll(".ai-doc-cb:checked").length;
    if (countEl) {
      countEl.textContent = checked === 0 
        ? "No Reports Selected" 
        : checked === docs.length 
          ? "All Reports (Default)" 
          : `${checked} Report${checked > 1 ? "s" : ""} Selected`;
    }
  }

  if (checklist && docs.length > 0) {
    checklist.innerHTML = docs.map((d, i) => `
      <div class="dropdown-item" onclick="var cb=this.querySelector('input'); cb.checked=!cb.checked; cb.dispatchEvent(new Event('change', {bubbles:true}));">
        <input type="checkbox" class="ai-doc-cb" value="${i}" checked onclick="event.stopPropagation()">
        <span>${d.title}</span>
      </div>`).join("");
    
    checklist.addEventListener("change", (e) => {
        if (e.target.classList.contains("ai-doc-cb")) updateCount();
    });
    updateCount();
  }

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

    // Hide quick prompts if this was the first interaction or a prompt was clicked
    const promptWrapper = document.getElementById("quickPromptsWrapper");
    if (promptWrapper) promptWrapper.style.display = "none";

    // Filter documents based on selection
    const selectedIndices = Array.from(document.querySelectorAll(".ai-doc-cb"))
      .filter(cb => cb.checked)
      .map(cb => parseInt(cb.value));
    
    const filteredDocs = data?.documents?.filter((_, i) => selectedIndices.includes(i)) || [];

    const patientPayloadFiltered = {
      ...patientPayload,
      documents: filteredDocs
    };

    document.getElementById("aiContinueBtn")?.remove();
    if (!overrideMsg) {
      chat.insertAdjacentHTML("beforeend",
        `<div class="ai-msg user"><div class="bubble">${escHtml(text)}</div></div>`);
      input.value = "";
    }
    chat.scrollTop = chat.scrollHeight;

    const typing = document.createElement("div");
    typing.className = "ai-msg ai";
    typing.innerHTML = `<div class="bubble" style="opacity:0.6; display:flex; align-items:center; gap:8px;">
      <div class="spinner-small" style="width:12px;height:12px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite;"></div>
      ${t("ai.thinking")}
    </div>`;
    chat.appendChild(typing);
    chat.scrollTop = chat.scrollHeight;

    try {
      const res = await fetch(`${API_BASE}/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json",  "Authorization": "Bearer " + (auth.currentUser ? await auth.currentUser.getIdToken() : "")  },
        body: JSON.stringify({
          message: text,
          patient: patientPayloadFiltered,
          history: chatHistory,
          lang: getCurrentLang(),
          mode: aiMode,
        })
      });

      if (!res.ok) {
        let errMsg = `Server error (${res.status})`;
        try {
          const errBody = await res.json();
          errMsg = errBody.error || errMsg;
        } catch { }
        throw new Error(errMsg);
      }

      const json = await res.json();
      typing.remove();

      if (json.error) throw new Error(json.error);

      const reply = json.reply || "";
      chatHistory.push({ role: "user", text });
      chatHistory.push({ role: "model", text: reply });
      if (chatHistory.length > 20) chatHistory.splice(0, 2);

      const fName = _currentData?.identity?.fullName?.split(" ")[0] || "Patient";
      chat.insertAdjacentHTML("beforeend",
        `<div class="ai-msg ai">
          <div class="bubble">
            ${parseMd(reply)}
            <div class="msg-footer" style="margin-top:10px; padding-top:8px; border-top:1px solid var(--border); font-size:10px; opacity:0.5; display:flex; justify-content:space-between;">
               <span>V-Med Engine · Gemini 2.0</span>
               <span>${t("ai.personalised")} ${fName}</span>
            </div>
          </div>
        </div>`);

      const trimmed = reply.trimEnd();
      if (trimmed.length > 200 && !/[.!?:»।]$/.test(trimmed)) addContinueBtn();

    } catch (err) {
      if (typing) typing.remove();
      console.error("AI fetch error:", err);
      const msg = err.message || "";
      let userMsg;

      if (msg.includes("Failed to fetch") || msg.includes("ERR_CONNECTION_REFUSED")) {
        userMsg = "⚠️ Cannot connect to the AI server. Please ensure the backend is running.";
      } else if (msg.includes("429")) {
        userMsg = "⚠️ Rate limit reached. The AI engine is currently busy.";
      } else {
        userMsg = `⚠️ ${escHtml(msg) || t("ai.aiUnavailable")}`;
      }

      const rid = "retry_" + Date.now();
      chat.insertAdjacentHTML("beforeend",
        `<div class="ai-msg ai error">
          <div class="bubble" style="color:var(--danger); background:var(--danger-bg); border:1px solid rgba(192,57,43,0.1);">
            ${userMsg}
            <div style="margin-top:12px;"><button id="${rid}" class="btn-primary" style="padding:4px 12px; font-size:11px; background:var(--danger); border:none;">🔄 Retry Now</button></div>
          </div>
        </div>`);
      
      document.getElementById(rid)?.addEventListener("click", () => {
        const lastErr = chat.querySelector(".ai-msg.error:last-child");
        if (lastErr) lastErr.remove();
        send(text, true);
      });
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
  setText("settingsThemeLabel", "settings.themeLabel");
  setText("settingsThemeDesc", "settings.themeDesc");
  setText("settingsLightLabel", "settings.lightTheme");
  setText("settingsLightDesc", "settings.lightThemeDesc");
  setText("settingsDarkLabel", "settings.darkTheme");
  setText("settingsDarkDesc", "settings.darkThemeDesc");
  setText("settingsLangTitle", "settings.language");
  setText("settingsLangDesc", "settings.languageDesc");
  setText("settingsEcTitle", "settings.emergency");
  setText("settingsEcDesc", "settings.emergencyDesc");
  setText("addContactBtn", "settings.addContact");
  setText("settingsPersonalTitle", "settings.personalInfo");
  setText("settingsContactTitle", "settings.contactDetails");
  setText("settingsIdTitle", "settings.identityDocs");
  setText("settingsVmedTitle", "settings.vmedIdCard");
  setText("settingsVmedDesc", "settings.vmedIdDesc");
  setText("settingsSecTitle", "settings.security");
  setText("changePassBtn", "settings.changePass");
  setText("settingsAccTitle", "settings.account");
  setText("logoutBtnSettings", "settings.logout");

  const labels = {
    "lbl_fullName": "settings.fullName", "lbl_father": "settings.fatherName",
    "lbl_gender": "settings.gender", "lbl_dob": "settings.dob",
    "lbl_blood": "settings.bloodGroup", "lbl_occ": "settings.occupation",
    "lbl_address": "settings.address", "lbl_email": "settings.email",
    "lbl_phone": "settings.phone", "lbl_aadhaar": "settings.aadhaar", "lbl_abha": "settings.abha",
  };
  Object.entries(labels).forEach(([id, key]) => setText(id, key));

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || "--"; };
  set("detailName", data.identity?.fullName);
  set("detailFather", data.identity?.fatherName);
  set("detailGender", t(`gender.${data.identity?.gender}`) || data.identity?.gender);
  set("detailDob", data.identity?.dob);
  set("detailBlood", data.patientData?.bloodGroup);
  set("detailOccupation", data.patientData?.occupation);
  set("detailAddress", data.identity?.address);
  set("detailEmail", data.contact?.email);
  set("detailPhone", data.contact?.phone);
  set("detailAbha", data.identity?.abha);

  const aadhaar = data.identity?.aadhaar;
  set("detailAadhaar", aadhaar ? "XXXX-XXXX-" + aadhaar.slice(-4) : "--");

  const vmedEl = document.getElementById("shareVmedId");
  if (vmedEl) vmedEl.textContent = data.vmedId || "--";

  if (typeof syncDmSwitch === "function") syncDmSwitch();

  const langBtnWrap = document.getElementById("langBtnWrap");
  if (langBtnWrap) {
    langBtnWrap.innerHTML = LANGUAGES.map(l => `
      <div
        data-lang-btn="${l.code}"
        class="lang-tile ${l.code === getCurrentLang() ? "lang-tile-active" : ""}"
        onclick="window._setLang('${l.code}')"
        title="${l.name}"
      >
        <div class="lang-tile-content">
            <span class="lang-native">${l.native}</span>
            <span class="lang-en">${l.name}</span>
        </div>
        <div class="lang-tile-check">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
      </div>`).join("");
  }

  setText("passModalTitle", "settings.changePassTitle");
  const currPass = document.getElementById("currPass");
  const newPass = document.getElementById("newPass");
  const confPass = document.getElementById("confPass");
  if (currPass) currPass.placeholder = t("settings.currPass");
  if (newPass) newPass.placeholder = t("settings.newPass");
  if (confPass) confPass.placeholder = t("settings.confPass");
  setText("savePassBtn", "settings.save");
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
  document.getElementById("btnExportPDF")?.addEventListener("click", () => exportHealthProfile(data));

  // ── Emergency Contacts ────────────────────────────────────────
  const uid = auth.currentUser?.uid;
  const userRef = uid ? doc(db, "users", uid) : null;
  const MAX = 3;
  let contacts = (data.emergencyContacts || []).map(c => ({ ...c }));

  function renderContacts() {
    const list = document.getElementById("ecList");
    const empty = document.getElementById("ecEmpty");
    const addBtn = document.getElementById("addContactBtn");
    if (!list) return;
    if (empty) {
      empty.style.display = contacts.length === 0 ? "block" : "none";
      const emptyTitle = empty.querySelector(".ec-empty-title");
      const emptyDesc = empty.querySelector(".ec-empty-desc");
      if (emptyTitle) emptyTitle.textContent = t("settings.noContacts");
      if (emptyDesc) emptyDesc.textContent = t("settings.noContactsDesc");
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
    const modal = document.getElementById("ecModal");
    const title = document.getElementById("ecModalTitle");
    const saveBtn = document.getElementById("ecSaveBtn");
    const errEl = document.getElementById("ecError");
    if (!modal) return;

    if (title) title.textContent = editIndex >= 0 ? t("settings.modalEdit") : t("settings.modalAdd");

    const setLabel = (id, key) => { const el = document.getElementById(id); if (el) el.textContent = t(key); };
    setLabel("ecNameLabel", "settings.nameLabel");
    setLabel("ecPhoneLabel", "settings.phoneLabel");
    setLabel("ecRelationLabel", "settings.relationLabel");
    setLabel("ecAltPhoneLabel", "settings.altPhoneLabel");
    setLabel("ecOptionalLabel", "settings.optional");

    const ecName = document.getElementById("ecName");
    const ecPhone = document.getElementById("ecPhone");
    const ecAltPhone = document.getElementById("ecAltPhone");
    if (ecName) ecName.placeholder = t("settings.nameLabel");
    if (ecPhone) ecPhone.placeholder = "e.g. 9876543210";
    if (ecAltPhone) ecAltPhone.placeholder = "e.g. 9876543211";

    const relSelect = document.getElementById("ecRelation");
    if (relSelect) {
      const relations = t("settings.relations");
      const relEn = ["Father", "Mother", "Spouse", "Son", "Daughter", "Brother", "Sister", "Friend", "Guardian", "Other"];
      relSelect.innerHTML = `<option value="">${t("settings.selectRelation")}</option>` +
        relEn.map((val, i) => `<option value="${val}">${Array.isArray(relations) ? relations[i] : val}</option>`).join("");
    }

    const newSaveBtn = document.getElementById("ecSaveBtn");
    if (newSaveBtn) newSaveBtn.textContent = t("settings.saveContact");
    modal.querySelectorAll(".ec-modal-cancel").forEach(b => b.textContent = t("settings.cancel"));

    if (ecName) ecName.value = "";
    if (ecPhone) ecPhone.value = "";
    if (relSelect) relSelect.value = "";
    if (ecAltPhone) ecAltPhone.value = "";
    if (errEl) { errEl.style.display = "none"; errEl.textContent = ""; }

    if (editIndex >= 0 && contacts[editIndex]) {
      const c = contacts[editIndex];
      if (ecName) ecName.value = c.name || "";
      if (ecPhone) ecPhone.value = c.phone || "";
      if (relSelect) relSelect.value = c.relation || "";
      if (ecAltPhone) ecAltPhone.value = c.altPhone || "";
    }

    modal.style.display = "flex";

    const freshSaveBtn = saveBtn.cloneNode(true);
    freshSaveBtn.textContent = t("settings.saveContact");
    saveBtn.parentNode.replaceChild(freshSaveBtn, saveBtn);

    freshSaveBtn.addEventListener("click", async () => {
      const name = document.getElementById("ecName")?.value.trim() || "";
      const phone = document.getElementById("ecPhone")?.value.trim() || "";
      const relation = document.getElementById("ecRelation")?.value || "";
      const altPhone = document.getElementById("ecAltPhone")?.value.trim() || "";
      const errEl2 = document.getElementById("ecError");
      const showErr = msg => { if (errEl2) { errEl2.textContent = msg; errEl2.style.display = "block"; } };

      if (!name) { showErr(t("settings.nameLabel") + " " + t("settings.required")); return; }
      if (!phone) { showErr(t("settings.phoneLabel") + " " + t("settings.required")); return; }
      if (!/^\d{10,15}$/.test(phone.replace(/[\s\-\+]/g, ""))) { showErr("Phone must be 10–15 digits."); return; }
      if (!relation) { showErr(t("settings.relationLabel") + " " + t("settings.required")); return; }
      if (altPhone && !/^\d{10,15}$/.test(altPhone.replace(/[\s\-\+]/g, ""))) { showErr("Alternate phone must be 10–15 digits."); return; }
      if (errEl2) errEl2.style.display = "none";

      const contact = {
        id: editIndex >= 0 ? contacts[editIndex].id : `ec_${Date.now()}`,
        name, phone, relation,
        altPhone: altPhone || "",
        addedAt: editIndex >= 0 ? (contacts[editIndex].addedAt || new Date().toISOString()) : new Date().toISOString(),
      };

      freshSaveBtn.disabled = true;
      freshSaveBtn.innerHTML = `<span class="ec-spinner"></span> ${t("settings.saving")}`;

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
        freshSaveBtn.disabled = false;
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

  window._ecEdit = (i) => openModal(i);
  window._ecDelete = (i) => deleteContact(i);
  document.getElementById("addContactBtn")?.addEventListener("click", () => openModal(-1));
  document.getElementById("ecModal")?.addEventListener("click", function (e) {
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
  if (newp !== conf) { alert(t("settings.passMismatch")); return; }
  if (newp.length < 8) { alert(t("settings.passShort")); return; }
  try {
    const user = auth.currentUser;
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, curr));
    await updatePassword(user, newp);
    alert(t("settings.passUpdated"));
    const m = document.getElementById("passwordModal");
    if (m) { m.classList.remove("open"); m.style.display = "none"; }
  } catch (e) { alert(e.message); }
}

// ── VITALS ────────────────────────────────────────────────────────
function initVitals(data) {
  const history = data?.vitalsHistory || [];
  const latest = history.length > 0 ? history[history.length - 1] : null;

  // Latest Reading Cards
  if (latest) {
    const bpEl = document.getElementById("vitBP");
    if (bpEl) bpEl.textContent = latest.bp || "--/--";
    const sugEl = document.getElementById("vitSugar");
    if (sugEl) sugEl.textContent = (latest.sugar || "--") + " mg/dL";
    const pulEl = document.getElementById("vitPulse");
    if (pulEl) pulEl.textContent = (latest.pulse || "--") + " bpm";

    // Simple status flags (can be expanded)
    const sBp = document.getElementById("statusBP");
    if (sBp && latest.bp) {
      const [sys, dia] = latest.bp.split("/").map(Number);
      if (sys > 140 || dia > 90) { sBp.textContent = "High"; sBp.style.display = "inline-block"; sBp.className = "patient-tag tag-warning"; }
      else if (sys < 90 || dia < 60) { sBp.textContent = "Low"; sBp.style.display = "inline-block"; sBp.className = "patient-tag tag-warning"; }
      else { sBp.textContent = "Normal"; sBp.style.display = "inline-block"; sBp.className = "patient-tag tag-active"; }
    }
  }

  // Render History Table (Latest 10)
  const tableBody = document.getElementById("vitalsTableBody");
  const empty = document.getElementById("vitalsEmpty");
  if (tableBody) {
    if (history.length === 0) {
      if (empty) empty.style.display = "block";
      tableBody.innerHTML = "";
    } else {
      if (empty) empty.style.display = "none";
      tableBody.innerHTML = [...history].reverse().slice(0, 10).map(v => `
        <tr style="border-bottom: 1px solid var(--border);">
          <td style="padding: 12px 20px;">
            <div style="font-weight:500;">${v.date || "N/A"}</div>
            <div style="font-size:10px; color:var(--muted)">${v.time || ""}</div>
          </td>
          <td>${v.bp || "--"}</td>
          <td>${v.sugar || "--"}</td>
          <td>${v.pulse || "--"}</td>
          <td>${v.temp || "--"}°C</td>
          <td>${v.weight || "--"}kg</td>
          <td>
            <span class="patient-tag ${v.verified ? "tag-active" : ""}" style="font-size:10px">
              ${v.verified ? "🛡️ Verified" : "Self-logged"}
            </span>
          </td>
        </tr>
      `).join("");
    }
  }

  // Render Charts
  renderVitalsCharts(history);

  // Save Logic
  const saveBtn = document.getElementById("btnSaveVitals");
  if (saveBtn) {
    saveBtn.onclick = async () => {
      const bp = document.getElementById("inBP").value;
      const sugar = document.getElementById("inSugar").value;
      const pulse = document.getElementById("inPulse").value;
      const temp = document.getElementById("inTemp").value;
      const weight = document.getElementById("inWeight").value;
      const notes = document.getElementById("inVitNotes").value;

      if (!bp && !sugar && !pulse) {
        alert("Please enter at least one vital reading.");
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";

      try {
        const newEntry = {
          date: new Date().toLocaleDateString('en-GB'),
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          bp, sugar, pulse, temp, weight, notes,
          verified: false,
          recordedBy: "Self"
        };

        await updateDoc(doc(db, "users", auth.currentUser.uid), {
          vitalsHistory: arrayUnion(newEntry)
        });

        // Update local session data & persistent cache
        if (window.currentPatientData) {
            if (!window.currentPatientData.vitalsHistory) window.currentPatientData.vitalsHistory = [];
            window.currentPatientData.vitalsHistory.push(newEntry);
            vStore.set(`vmed_data_${auth.currentUser.uid}`, JSON.stringify(window.currentPatientData));
        }

        console.log("✅ Vitals saved to cloud & cache");
        alert("Vitals logged successfully!");
        loadPage("vitals"); 
      } catch (e) {
        console.error("❌ Vitals save error:", e);
        const isPerm = e.message.includes("permission");
        alert(isPerm ? "Security Block: Check your login session. You may not have permission to edit this record." : "Error: " + e.message);
        saveBtn.disabled = false;
        saveBtn.textContent = "Log Vitals";
      }
    };
  }

  // ── AI Forecast ──
  const calcBtn = document.getElementById("calculateTrendBtn");
  const refreshBtn = document.getElementById("refreshForecastBtn");
  const initialV = document.getElementById("forecastInitialView");
  const loadingV = document.getElementById("forecastLoadingView");
  const forecastContent = document.getElementById("aiVitalsForecastContent");

  const startCalc = () => {
    if (initialV) initialV.style.display = "none";
    if (loadingV) loadingV.style.display = "flex";
    if (forecastContent && forecastContent.querySelector('.forecast-result')) {
        forecastContent.querySelector('.forecast-result').style.opacity = '0.3';
    }
    updateForecast();
  };

  if (calcBtn) calcBtn.onclick = startCalc;
  if (refreshBtn) refreshBtn.onclick = startCalc;

  async function updateForecast() {
    if (!forecastContent) return;
    
    try {
      const resp = await fetch(`${API_BASE}/api/vitals/forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json",  "Authorization": "Bearer " + (auth.currentUser ? await auth.currentUser.getIdToken() : "")  },
        body: JSON.stringify({ 
          history: history.slice(-5), 
          patient: { dob: data.identity?.dob, bloodGroup: data.patientData?.bloodGroup, vmedId: data.vmedId } 
        })
      });

      if (!resp.ok) throw new Error("Forecast engine busy");

      const res = await resp.json();
      if (loadingV) loadingV.style.display = "none";
      
      forecastContent.innerHTML = `
        <div class="forecast-result" style="width:100%; animation: fadeIn 0.5s ease-out;">
          <div style="background:var(--surface-2); padding:20px; border-radius:16px; border:1px solid var(--border); font-size:14px; line-height:1.7; color:var(--ink); box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
            ${parseMd(res.forecast)}
          </div>
        </div>`;
    } catch (e) {
       if (loadingV) loadingV.style.display = "none";
       if (initialV) initialV.style.display = "block";
       console.error("Forecast error:", e);
       alert("AI Forecasting is currently at capacity. Please try again in 30 seconds.");
    }
  }

  // if (history.length > 0) updateForecast(); // Removed automatic call to prevent 429
}

function renderVitalsCharts(history) {
  const chartBP = document.getElementById("chartBP");
  const chartSugar = document.getElementById("chartSugar");
  if (!chartBP || !chartSugar) return;
  if (typeof Chart === 'undefined') return;

  const labels = history.slice(-7).map(v => v.date);
  const sysData = history.slice(-7).map(v => v.bp ? parseInt(v.bp.split("/")[0]) : null);
  const diaData = history.slice(-7).map(v => v.bp ? parseInt(v.bp.split("/")[1]) : null);
  const pulseData = history.slice(-7).map(v => parseInt(v.pulse) || null);
  const sugarData = history.slice(-7).map(v => parseInt(v.sugar) || null);

  new Chart(chartBP, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Systolic', data: sysData, borderColor: '#1a6b4a', tension: 0.3, fill: false },
        { label: 'Diastolic', data: diaData, borderColor: '#b45309', tension: 0.3, fill: false },
        { label: 'Pulse', data: pulseData, borderColor: '#1a4a8a', tension: 0.3, fill: false, borderDash: [5, 5] }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: false } } }
  });

  new Chart(chartSugar, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ label: 'Blood Sugar (mg/dL)', data: sugarData, backgroundColor: 'rgba(26,107,74,0.5)', borderColor: '#1a6b4a', borderWidth: 1 }]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
  });
}

// ── PDF EXPORT ──────────────────────────────────────────────────
async function exportHealthProfile(data) {
  if (!data) return;
  const { jsPDF } = window.jspdf;
  const docPDF = new jsPDF();
  const vId = data.vmedId || "VMED-XXXX";
  
  // Helper for Section Headers
  const addHeader = (title, y) => {
    docPDF.setFontSize(18);
    docPDF.setTextColor(26, 107, 74); // --accent
    docPDF.text(title, 14, y);
    docPDF.setDrawColor(26, 107, 74);
    docPDF.line(14, y + 2, 196, y + 2);
    docPDF.setTextColor(0, 0, 0);
    return y + 12;
  };

  // --- PAGE 1: COVER & IDENTITY ---
  docPDF.setFillColor(26, 107, 74);
  docPDF.rect(0, 0, 210, 40, 'F');
  docPDF.setTextColor(255, 255, 255);
  docPDF.setFontSize(24);
  docPDF.text("V-MED ID", 14, 25);
  docPDF.setFontSize(12);
  docPDF.text("Virtual Medical Identity & Clinical Record", 14, 32);

  docPDF.setTextColor(0, 0, 0);
  let currY = 55;
  docPDF.setFontSize(20);
  docPDF.text(data.identity?.fullName || "Patient Profile", 14, currY);
  currY += 10;
  docPDF.setFontSize(12);
  docPDF.text(`V-MED ID: ${vId}`, 14, currY);
  currY += 20;

  // Identity Table
  const idRows = [
    ["Gender", t(`gender.${data.identity?.gender}`) || data.identity?.gender || "--"],
    ["Date of Birth", data.identity?.dob || "--"],
    ["Blood Group", data.patientData?.bloodGroup || "--"],
    ["Phone", data.contact?.phone || "--"],
    ["Email", data.contact?.email || "--"],
    ["ABHA Number", data.identity?.abha || "--"],
    ["Address", data.identity?.address || "--"]
  ];
  docPDF.autoTable({
    startY: currY,
    head: [["Field", "Information"]],
    body: idRows,
    theme: 'striped',
    headStyles: { fillColor: [26, 107, 74] }
  });
  currY = docPDF.lastAutoTable.finalY + 15;

  // Emergency Contacts
  if (data.emergencyContacts?.length) {
    docPDF.setFontSize(14);
    docPDF.text("Emergency Contacts", 14, currY);
    currY += 5;
    const ecRows = data.emergencyContacts.map(c => [c.name, c.relation, c.phone]);
    docPDF.autoTable({
      startY: currY,
      head: [["Name", "Relation", "Phone"]],
      body: ecRows,
      theme: 'grid'
    });
    currY = docPDF.lastAutoTable.finalY + 15;
  }

  // --- PAGE 2: MEDICATIONS & VITALS ---
  docPDF.addPage();
  currY = 20;
  currY = addHeader("Current Medications", currY);
  const meds = data.medications || [];
  if (meds.length) {
    const medRows = meds.map(m => [m.name, m.dosage, m.frequency, m.timing, m.active !== false ? "Active" : "Completed"]);
    docPDF.autoTable({
      startY: currY,
      head: [["Medicine", "Dose", "Frequency", "Timing", "Status"]],
      body: medRows,
      theme: 'striped'
    });
    currY = docPDF.lastAutoTable.finalY + 15;
  } else {
    docPDF.text("No active medications listed.", 14, currY);
    currY += 15;
  }

  currY = addHeader("Latest Vital Readings", currY);
  const vitals = data.vitalsHistory || [];
  if (vitals.length) {
    const lastV = vitals[vitals.length - 1];
    const vitRows = [
      ["Blood Pressure", lastV.bp || "--", lastV.date],
      ["Blood Sugar", (lastV.sugar || "--") + " mg/dL", lastV.date],
      ["Pulse Rate", (lastV.pulse || "--") + " bpm", lastV.date],
      ["Temperature", (lastV.temp || "--") + " °C", lastV.date],
      ["Body Weight", (lastV.weight || "--") + " kg", lastV.date]
    ];
    docPDF.autoTable({
      startY: currY,
      head: [["Metric", "Value", "Date Recorded"]],
      body: vitRows,
      theme: 'grid'
    });
    currY = docPDF.lastAutoTable.finalY + 15;
  }

  // --- PAGE 3: VISIT HISTORY ---
  docPDF.addPage();
  currY = 20;
  currY = addHeader("Clinical Visit History", currY);
  const visits = data.visits || [];
  if (visits.length) {
    const visitRows = [...visits].reverse().map(v => [v.date, v.reason, v.doctorName || "Dr. Unspecified", v.diagnosis || "N/A"]);
    docPDF.autoTable({
      startY: currY,
      head: [["Date", "Reason", "Doctor", "Diagnosis"]],
      body: visitRows,
      theme: 'striped',
      styles: { fontSize: 9 }
    });
  }

  // Footer on all pages (simplified for demo)
  const pageCount = docPDF.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    docPDF.setPage(i);
    docPDF.setFontSize(8);
    docPDF.setTextColor(150);
    docPDF.text(`Generated by V-Med ID on ${new Date().toLocaleString()} · Page ${i} of ${pageCount}`, 105, 290, { align: 'center' });
  }

  docPDF.save(`VMed_Record_${vId}.pdf`);
}

// ── EMERGENCY SOS ────────────────────────────────────────────────
function initSOS(data) {
  if (!data) return;
  const $ = id => document.getElementById(id);
  const btn = $("mainSosBtn");
  const list = $("sosContactsList");
  let timer = null;

  // Render contacts
  const contacts = data.emergencyContacts || [];
  if (contacts.length === 0) {
    list.innerHTML = `<div style="text-align:center; color:var(--muted); padding:20px;">No emergency contacts. Add them in Settings.</div>`;
  } else {
    list.innerHTML = contacts.map(c => `
      <div class="sos-contact-item">
        <div style="background:var(--accent-light); width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:var(--accent); font-weight:700;">${c.name[0]}</div>
        <div class="doc-info" style="flex:1;"><strong>${escHtml(c.name)}</strong><span>${c.relation || "Family"}</span></div>
        <a href="tel:${c.phone}" class="sos-call-btn">📞</a>
      </div>`).join("");
  }

  // SOS Activation Logic
  if (btn) {
    let startTime;
    const start = () => {
      startTime = Date.now();
      timer = setInterval(() => {
        const elapsed = Date.now() - startTime;
        if (elapsed >= 3000) {
          clearInterval(timer);
          triggerSOS();
        }
      }, 50);
      btn.style.background = "#fee2e2";
      $("sosStatus").textContent = "Activating in 3s...";
    };
    const end = () => {
      clearInterval(timer);
      if ($("sosStatus").textContent !== "ALERT ACTIVE!") {
          $("sosStatus").textContent = "Secure & Ready";
          btn.style.background = "#fff";
      }
    };
    btn.onmousedown = start; btn.onmouseup = end; btn.onmouseleave = end;
    btn.ontouchstart = start; btn.ontouchend = end;
  }

  async function triggerSOS() {
    $("sosStatus").textContent = "ALERT ACTIVE!";
    $("sosStatus").style.color = "#fff";
    $("sosStatus").style.fontWeight = "bold";
    btn.style.transform = "scale(0.9)";
    btn.style.background = "#ef4444";
    btn.style.color = "#fff";
    btn.textContent = "ALRT";

    const pos = await new Promise(res => navigator.geolocation.getCurrentPosition(res, () => res(null)));
    const locStr = pos ? `${pos.coords.latitude}, ${pos.coords.longitude}` : "Location not available";

    alert("SOS ALERT SENT! Notifications have been sent to your emergency contacts and local medical centers.");
    console.log("SOS Alert Triggered", { vmedId: data.vmedId, location: locStr });
    
    // Simulate API call to backend
    fetch(`${API_BASE}/api/sos/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json",  "Authorization": "Bearer " + (auth.currentUser ? await auth.currentUser.getIdToken() : "")  },
        body: JSON.stringify({ vmedId: data.vmedId, location: locStr, contacts: contacts.map(c=>c.phone) })
    }).catch(e => console.error("SOS notify fail", e));
  }

  // AI First-Aid Guide
  const aiIn = $("sosAiInput");
  const aiSend = $("sosAiSend");
  if (aiIn && aiSend) {
      aiSend.onclick = async () => {
          const q = aiIn.value.trim();
          if (!q) return;
          $("sosAiGuide").innerHTML = `<div style="text-align:center; padding:20px; color:var(--muted);">AI Thinking (Emergency Mode)...</div>`;
          try {
              const res = await fetch(`${API_BASE}/api/ai/emergency-aid`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json",  "Authorization": "Bearer " + (auth.currentUser ? await auth.currentUser.getIdToken() : "")  },
                  body: JSON.stringify({ query: q, patient: { bloodGroup: data.patientData?.bloodGroup, medications: data.medications } })
              });
              const json = await res.json();
              $("sosAiGuide").innerHTML = `<div style="background:var(--surface-2); border:1px solid var(--border); padding:16px; border-radius:12px; font-size:14px; line-height:1.6; color:var(--ink);">${parseMd(json.reply)}</div><div class="alert danger" style="margin-top:12px; font-size:11px;">⚠️ Help is arriving. Re-describe if symptoms change.</div>`;
          } catch(e) {
              $("sosAiGuide").textContent = "Unable to reach AI server. Please follow standard first aid measures.";
          }
      };
  }
  
  // Location sharing UX
  const shareBtn = $("shareLocationBtn");
  const nearbyInfo = $("sosNearbyInfo");
  if (shareBtn && nearbyInfo) {
      shareBtn.onclick = async () => {
          shareBtn.disabled = true;
          shareBtn.textContent = "Acquiring...";
          try {
              const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 5000 }));
              const msg = `Location Shared! Lat: ${pos.coords.latitude.toFixed(4)}, Lon: ${pos.coords.longitude.toFixed(4)}`;
              nearbyInfo.innerHTML = `<div style="flex:1; color:var(--success); font-weight:600;"><p>O📍 ${msg}</p><p style="font-size:11px; margin-top:4px;">Notifying 3 nearby medical centers and your emergency contacts.</p></div>`;
          } catch(e) {
              shareBtn.disabled = false;
              shareBtn.textContent = "Share Location";
              alert("Could not access location. Please check browser permissions.");
          }
      };
  }
}

// ── BLOOD DONOR ─────────────────────────────────────────────────
function initBloodDonor(data) {
  if (!data) return;
  const $ = id => document.getElementById(id);
  const searchBtn = $("searchDonorBtn");
  const searchGrp = $("bloodSearchGroup");
  const list = $("donorList");
  const toggle = $("donorToggle");

  // Availability Toggle
  if (toggle) {
    toggle.checked = data.isDonor === true;
    toggle.onchange = async () => {
      const active = toggle.checked;
      await updateDoc(doc(db, "users", auth.currentUser.uid), { isDonor: active });
      $("donorToggleLabel").textContent = active ? "You are an active donor! 🟢" : "Available to help?";
    };
  }

  // Search logic
  if (searchBtn) {
    searchBtn.onclick = async () => {
      const grp = searchGrp.value;
      list.innerHTML = `<div style="text-align:center; padding:20px;">Searching for ${grp || "all"} donors...</div>`;
      try {
        // Real Firestore query would go here, simulated for now
        const resp = await fetch(`${API_BASE}/api/donors/search?group=${encodeURIComponent(grp)}`, { headers: {  "Authorization": "Bearer " + (auth.currentUser ? await auth.currentUser.getIdToken() : "")  } });
        const donors = await resp.json();
        if (donors.length === 0) {
          list.innerHTML = `<div style="text-align:center; padding:20px; color:var(--muted);">No donors found with this group nearby.</div>`;
        } else {
          list.innerHTML = donors.map(d => `
            <div class="donor-card">
              <div class="blood-bg">${d.bloodGroup}</div>
              <div class="donor-info"><strong>${escHtml(d.name)}</strong><span>${d.distance} km away</span></div>
              <button class="donor-contact" onclick="alert('Contacting donor...')">Contact</button>
            </div>`).join("");
        }
      } catch(e) {
        list.innerHTML = `<div style="text-align:center; color:var(--danger); padding:20px;">Search failed. Please try again.</div>`;
      }
    };
  }
}

// ── FAMILY LINK ──────────────────────────────────────────────────
function initFamily(data) {
  if (!data) return;
  const $ = id => document.getElementById(id);
  const list = $("familyList");
  const addBtn = $("addFamilyBtn");
  const modal = $("addFamilyModal");

  window.closeFamilyModal = () => { if (modal) modal.classList.remove("open"); };

  if (addBtn) {
    addBtn.onclick = () => modal.classList.add("open");
  }

  // Render existing
  const family = data.familyMembers || [];
  if (family.length > 0) {
    list.innerHTML = family.map(f => `
      <div class="family-card">
        <div class="family-avatar">${f.name[0]}</div>
        <div class="family-info"><strong>${escHtml(f.name)}</strong><span>${f.relation} &nbsp;·&nbsp; ${f.vmedId}</span></div>
        <button class="family-view-btn" onclick="alert('Switching to dependent profile...')">View</button>
      </div>`).join("");
  }

  const sendBtn = $("sendFamilyRequestBtn");
  if (sendBtn) {
    sendBtn.onclick = async () => {
      const id = $("familyIdentifier").value.trim();
      const rel = $("familyRelation").value;
      if (!id) return;
      sendBtn.disabled = true; sendBtn.textContent = "Sending...";
      try {
        await fetch(`${API_BASE}/api/family/request`, {
          method: "POST",
          headers: { "Content-Type": "application/json",  "Authorization": "Bearer " + (auth.currentUser ? await auth.currentUser.getIdToken() : "")  },
          body: JSON.stringify({ requester: data.vmedId, target: id, relation: rel })
        });
        alert("Request sent successfully!");
        closeFamilyModal();
      } catch(e) {
        alert("Could not send request. Ensure the ID is correct.");
      } finally {
        sendBtn.disabled = false; sendBtn.textContent = "Send Request";
      }
    };
  }
}
// ── INFO & FAQ ──────────────────────────────────────────────────
function initInfo(data) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  
  if (!data) return;
  const s = calculateScore(data);
  const $ = id => document.getElementById(id);
  
  if ($("infoMainScore")) $("infoMainScore").textContent = "Your V-Med Health Score is " + s.total;
  
  // Update percentages if the elements exist in info.html
  if ($("infoCompScore")) $("infoCompScore").textContent = s.compPct + "%";
  if ($("infoActScore")) $("infoActScore").textContent = s.actPct + "%";
  if ($("infoIntegScore")) $("infoIntegScore").textContent = s.integPct + "%";
}

// ── UTILS ─────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function parseMd(t) {
  if (!t) return "";
  return t
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h3>$1</h3>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^[ \t]{2,}[\*\-] (.+)$/gm, "<li style='margin-left:20px'>$1</li>")
    .replace(/^[\*\-] (.+)$/gm, "<li>$1</li>")
    .replace(/^\d+\. (.+)$/gm, "<li>$1</li>")
    .replace(/(<li[\s\S]*?<\/li>\n?)+/g, m => `<ul style="margin:6px 0 6px 18px;padding:0">${m}</ul>`)
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, " ")
    .replace(/(<\/(?:ul|h3|h4)>)(<br>)+/g, "$1");
}

// ── GLOBALS ───────────────────────────────────────────────────────
window._setLang = async (code) => {
  await setLang(code);
  if (_currentPage && _currentData) {
    await loadPage(_currentPage);
  }
  applyNavTranslations();
};

function setupKeyboardShortcuts() {
  const pageOrder = [
    "home", "documents", "medications", "vitals", "visits",
    "ai", "sos", "blood_donor", "family", "settings"
  ];
  document.addEventListener("keydown", (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (!/^[0-9]$/.test(e.key)) return;
    const idx = Number(e.key) - 1;
    const page = pageOrder[idx];
    if (!page) return;
    const btn = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (!btn) return;
    e.preventDefault();
    loadSection(btn, page);
  });
}

// ── BOOT ──────────────────────────────────────────────────────────
(async () => {
  await initI18n();
  applyNavTranslations();
  document.documentElement.lang = getCurrentLang();
  const sidebar = document.getElementById("sidebar");
  if (sidebar && vStore.get("vmed_sidebar_collapsed", 'local') === "1") {
    sidebar.classList.add("collapsed");
  }
  setupKeyboardShortcuts();
  await window.patientDataReady;
  const savedPage = vStore.get(LAST_PAGE_KEY, 'local') || "home";
  const firstBtn = document.querySelector(`.nav-item[data-page="${savedPage}"]`)
    || document.querySelector(`.nav-item[data-page="home"]`);
  loadSection(firstBtn, savedPage);
  document.addEventListener("langchange", async () => {
    applyNavTranslations();
    document.documentElement.lang = getCurrentLang();
  });
})();
