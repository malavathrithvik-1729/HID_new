import { auth, db } from "../../../js/firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc, getDoc, updateDoc, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const API_BASE = "http://127.0.0.1:3000";

// ── DARK MODE ─────────────────────────────────────────────────
const DARK_KEY = "vmed_dark_mode";

function applyTheme(dark) {
  document.documentElement.classList.toggle("dark", dark);
  const btn   = document.getElementById("sidebarDarkBtn");
  const label = btn?.querySelector(".nav-label");
  if (label) label.textContent = dark ? "Light mode" : "Dark mode";
  const icon  = btn?.querySelector(".nav-icon");
  if (icon)  icon.textContent  = dark ? "☀️" : "🌙";
}

function toggleDark() {
  const next = !document.documentElement.classList.contains("dark");
  localStorage.setItem(DARK_KEY, next ? "1" : "0");
  applyTheme(next);
}

// Apply immediately before any render to prevent flash
;(function () {
  const saved       = localStorage.getItem(DARK_KEY);
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark",
    saved !== null ? saved === "1" : prefersDark);
})();

window.toggleDark = toggleDark;

// ── SPA ROUTER ────────────────────────────────────────────────
async function loadPage(pageName, arg = null) {
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

    // Re-execute inline scripts
    content.querySelectorAll("script").forEach(old => {
      const s = document.createElement("script");
      [...old.attributes].forEach(a => s.setAttribute(a.name, a.value));
      s.textContent = old.textContent;
      old.parentNode.replaceChild(s, old);
    });

    applyTheme(document.documentElement.classList.contains("dark"));

    // Always await fresh data
    const data = await window.doctorDataReady;

    if (pageName === "home")           initHome(data);
    if (pageName === "patients")       initPatients(data);
    if (pageName === "add_patient")    initAddPatient(data);
    if (pageName === "consultation")   initConsultation(data);
    if (pageName === "add_document")   initAddDocument(data);
    if (pageName === "history")        initHistory(data);
    if (pageName === "ai")             initAIChat(data, arg);
    if (pageName === "settings")       initSettings(data);
    if (pageName === "patient_detail") initPatientDetail(data, arg);

  } catch (e) {
    console.error("loadPage error:", e);
    const content2 = document.getElementById("content");
    if (content2) {
      content2.innerHTML =
        `<div class="section-wrap"><p style="color:var(--danger)">Error loading section: ${e.message}</p></div>`;
    }
  }
}

function loadSection(btn, page, arg = null) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  if (btn) {
    btn.classList.add("active");
  } else {
    // If no btn provided, try to find the one with data-page=page
    const target = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (target) target.classList.add("active");
  }
  loadPage(page, arg);
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("collapsed");
}

async function handleLogout() {
  await signOut(auth);
  window.location.replace("../login/login.html");
}

// ── HOME ──────────────────────────────────────────────────────
function initHome(data) {
  if (!data) return;
  const $ = id => document.getElementById(id);
  const name  = data.identity?.fullName?.split(" ")[0] || "Doctor";
  const hour  = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if ($("greetText"))        $("greetText").textContent        = `${greet}, Dr. ${name} 👋`;
  if ($("homeVmedId"))       $("homeVmedId").textContent       = data.vmedId || "--";
  if ($("homeSpec"))         $("homeSpec").textContent         = data.doctorData?.specializations || "--";
  if ($("homeSince"))        $("homeSince").textContent        = data.doctorData?.practisingSince || "--";
  if ($("homePatientCount")) $("homePatientCount").textContent = (data.linkedPatients || []).length;
  if ($("homeTodayDate"))    $("homeTodayDate").textContent    = new Date().toLocaleDateString("en-IN",
    { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// ── MY PATIENTS ───────────────────────────────────────────────
async function initPatients(data) {
  const linkedPatients = data?.linkedPatients || [];
  const list        = document.getElementById("patientList");
  const empty       = document.getElementById("patientEmpty");
  const searchInput = document.getElementById("patientSearch");
  if (!list) return;

  if (linkedPatients.length === 0) {
    if (empty) empty.style.display = "block";
    list.innerHTML = "";
    return;
  }

  list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted)">Loading patients…</div>`;

  let allPatients = [];
  for (const pid of linkedPatients) {
    try {
      const snap = await getDoc(doc(db, "users", pid));
      if (snap.exists()) allPatients.push({ id: pid, ...snap.data() });
    } catch (e) { console.warn("Failed to fetch patient", pid, e); }
  }

  if (empty) empty.style.display = "none";

  function renderPatients(patients) {
    if (patients.length === 0) {
      list.innerHTML = `<div style="text-align:center;padding:20px;color:var(--muted)">No patients match your search.</div>`;
      return;
    }
    list.innerHTML = patients.map(p => {
      const name      = p.identity?.fullName || "Unknown";
      const initials  = name.trim().split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
      const lastVisit = (p.visits || []).slice(-1)[0];
      return `
        <div class="patient-card" onclick="loadSection(null, 'patient_detail', '${p.id}')">
          <div class="patient-avatar">${initials}</div>
          <div class="patient-info">
            <strong>${escHtml(name)}</strong>
            <span>${p.identity?.gender || "--"} · ${p.identity?.dob || "--"} · 🩸 ${p.patientData?.bloodGroup || "--"}</span>
            <span class="patient-vmed">${p.vmedId || "--"}</span>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <span class="patient-tag tag-active">Active</span>
            <div style="font-size:11px;color:var(--muted);margin-top:4px">
              Last: ${lastVisit ? lastVisit.date : "No visits yet"}
            </div>
          </div>
        </div>`;
    }).join("");
  }

  renderPatients(allPatients);

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const q = searchInput.value.toLowerCase();
      renderPatients(allPatients.filter(p =>
        (p.identity?.fullName      || "").toLowerCase().includes(q) ||
        (p.vmedId                  || "").toLowerCase().includes(q) ||
        (p.patientData?.bloodGroup || "").toLowerCase().includes(q)
      ));
    });
  }
}

// ── PATIENT DETAIL ANALYSIS ──────────────────────────────────
async function initPatientDetail(data, pid) {
  if (!pid || typeof pid !== 'string' || pid.length < 5) {
    console.error("Invalid Patient ID:", pid);
    loadSection(null, 'patients');
    return;
  }

  const $ = id => document.getElementById(id);
  let snap;
  try {
    snap = await getDoc(doc(db, "users", pid));
  } catch (err) {
    console.error("Firestore fetch error:", err);
    alert("Could not load patient record. Please check your connection.");
    return;
  }
  
  if (!snap.exists()) {
     alert("Patient record not found.");
     loadSection(null, 'patients');
     return;
  }
  
  const p = snap.data();
  const name = p.identity?.fullName || "Patient";
  const initials = name.trim().split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

  if ($("detName"))       $("detName").textContent = name;
  if ($("detVmed"))       $("detVmed").textContent = p.vmedId || "--";
  if ($("detAvatar"))     $("detAvatar").textContent = initials;
  if ($("consultPatName")) $("consultPatName").textContent = name;
  
  const age = p.identity?.dob ? `${new Date().getFullYear() - new Date(p.identity.dob).getFullYear()} yrs` : "--";
  if ($("detGenderAge")) $("detGenderAge").textContent = `${p.identity?.gender || "--"}, ${age}`;
  if ($("detBlood"))     $("detBlood").textContent     = `Blood: ${p.patientData?.bloodGroup || "--"}`;
  if ($("detAbha"))      $("detAbha").textContent      = p.identity?.abha || "--";
  if ($("detPhone"))     $("detPhone").textContent     = p.contact?.phone || "--";
  if ($("detHealthScore")) $("detHealthScore").textContent = p.healthScore?.total || "N/A";

  // Vitals Logic (History only now, sidebar card removed)
  const vitalsArr = p.vitalsHistory || [];
  const latestVit = vitalsArr.length > 0 ? vitalsArr[vitalsArr.length - 1] : {};
  
  if ($("vitBP"))       $("vitBP").textContent       = latestVit.bp || "--/--";
  if ($("vitHR"))       $("vitHR").textContent       = latestVit.heartRate || "--";
  if ($("vitTemp"))     $("vitTemp").textContent     = latestVit.temp || "--";
  if ($("vitWeight"))   $("vitWeight").textContent   = latestVit.weight || "--";
  if ($("vitLastDate")) $("vitLastDate").textContent = latestVit.date ? `Updated ${latestVit.date}` : "No data";

  if ($("detVitHistList")) {
    $("detVitHistList").innerHTML = vitalsArr.length === 0
      ? `<div class="empty-state">No recorded vitals history.</div>`
      : `<div class="card" style="padding:0">
          <table style="width:100%; font-size:13px; border-collapse:collapse;">
            <thead><tr style="text-align:left; border-bottom:1px solid var(--border); background:var(--surface-2);"><th style="padding:12px 16px;">Date</th><th>BP</th><th>Sugar</th><th>Pulse</th><th>Temp</th><th>Wt</th><th>Status</th></tr></thead>
            <tbody>${vitalsArr.map(v => `<tr style="border-bottom:1px solid var(--border);"><td style="padding:12px 16px; color:var(--muted);">${v.date}</td><td><strong>${v.bp || "--"}</strong></td><td>${v.sugar || "--"}</td><td>${v.pulse || "--"}</td><td>${v.temp || "--"}°C</td><td>${v.weight || "--"}kg</td><td><span class="patient-tag ${v.verified ? "tag-active" : ""}" style="font-size:10px">${v.verified ? "Verified" : "Self"}</span></td></tr>`).reverse().join("")}</tbody>
          </table>
        </div>`;
  }

  // Consultation & Documents setup
  if ($("detConsultAI")) $("detConsultAI").onclick = () => loadSection(null, "ai", pid);

  // AI Summary Logic
  const genAiInsight = async () => {
    const box = $("detailAiSummary");
    if (!box) return;
    box.innerHTML = `<div class="loader-ring" style="width:16px;height:16px;border-width:2px;"></div><span style="font-size:12px;color:var(--muted);margin-left:8px;">Synthesizing...</span>`;
    try {
      const res = await fetch(`${API_BASE}/api/ai/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Provide a sharp clinical insight for this patient. Sum up history, trend of vitals if any, and current medications. Max 120 words.",
          patient: { ...p, vitalsHistory: vitalsArr },
          doctor:  { identity: data.identity }, lang: "en"
        })
      });
      const resJson = await res.json();
      box.innerHTML = parseMd(resJson.reply || "No insight available.");
    } catch (e) { box.textContent = "Analysis unavailable."; }
  };
  genAiInsight();
  if ($("btnRegenSummary")) $("btnRegenSummary").onclick = genAiInsight;

  // ── SAVE HANDLERS ──────────────────────────────────────────

  // Vitals
  if ($("btnSaveVitalsDetail")) {
    $("btnSaveVitalsDetail").onclick = async () => {
      const btn = $("btnSaveVitalsDetail");
      const msg = $("vitalsDetMsg");
      const vData = {
        bp:        $("inBP").value,
        sugar:     $("inSugar").value,
        pulse:     $("inPulse").value,
        temp:      $("inTemp").value,
        weight:    $("inWeight").value,
        notes:     $("inVitNotes").value,
        verified:  true,
        recordedBy: data.identity?.fullName || "Doctor",
        doctorId:   data.vmedId || "",
        date:      new Date().toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })
      };
      if (!vData.bp || !vData.pulse) { alert("Please enter BP and Pulse"); return; }
      btn.disabled = true;
      try {
        await updateDoc(doc(db, "users", pid), { vitalsHistory: arrayUnion(vData) });
        msg.className = "alert success"; msg.textContent = "Verified vitals recorded!"; msg.style.display = "block";
        setTimeout(() => loadPage("patient_detail", pid), 1000);
      } catch (e) { btn.disabled = false; alert(e.message); }
    };
  }

  // Consultation
  window.addDetMedRow = () => {
    const cont = $("detMedsContainer");
    if (!cont) return;
    const div = document.createElement("div");
    div.className = "med-row";
    div.innerHTML = `
      <input type="text" class="med-name" placeholder="Med" style="flex:1.2" />
      <input type="text" class="med-dosage" placeholder="Dose" style="flex:0.8" />
      <input type="text" class="med-freq" placeholder="Freq" style="flex:0.8" />
      <select class="med-timing" style="flex:1; font-size:12px; border-radius:8px; border:1px solid var(--border);">
        <option value="After Food">After Food</option>
        <option value="Before Food">Before Food</option>
        <option value="With Food">With Food</option>
        <option value="Empty Stomach">Empty Stomach</option>
        <option value="Bedtime">Bedtime</option>
      </select>
      <input type="text" class="med-end" placeholder="End Date" style="flex:0.8; font-size:11px;" />`;
    cont.appendChild(div);
  };

  if ($("btnSaveConsultDetail")) {
    $("btnSaveConsultDetail").onclick = async () => {
      const btn = $("btnSaveConsultDetail");
      const msg = $("consultDetMsg");
      const consultData = {
        reason:    $("detVisitReason").value,
        diagnosis: $("detVisitDiagnosis").value,
        notes:     $("detVisitNotes").value,
        date:      new Date().toLocaleDateString("en-IN", { day:"2-digit", month:"short", year:"numeric" }),
        prescriptions: Array.from(document.querySelectorAll("#detMedsContainer .med-row")).map(row => {
          const name = row.querySelector(".med-name").value;
          const dose = row.querySelector(".med-dosage").value;
          const freq = row.querySelector(".med-freq").value;
          const time = row.querySelector(".med-timing")?.value || "";
          const end  = row.querySelector(".med-end")?.value || "";
          return name ? `${name} (${dose} ${freq}) - ${time}${end ? " until " + end : ""}` : null;
        }).filter(Boolean)
      };
      if (!consultData.reason) { alert("Reason is required"); return; }
      btn.disabled = true;
      try {
        await updateDoc(doc(db, "users", pid), {
          visits: arrayUnion(consultData),
          medications: arrayUnion(...Array.from(document.querySelectorAll("#detMedsContainer .med-row")).map(row => {
            const name = row.querySelector(".med-name").value;
            if (!name) return null;
            return { 
              name, 
              dosage: row.querySelector(".med-dosage").value, 
              frequency: row.querySelector(".med-freq").value, 
              timing: row.querySelector(".med-timing")?.value || "After Food",
              endDate: row.querySelector(".med-end")?.value || "",
              active: true 
            };
          }).filter(Boolean))
        });
        msg.className = "alert success"; msg.textContent = "Consultation saved!"; msg.style.display = "block";
        setTimeout(() => loadPage("patient_detail", pid), 1000);
      } catch (e) { btn.disabled = false; alert(e.message); }
    };
  }

  // Upload Document
  if ($("btnSaveDocDetail")) {
    $("btnSaveDocDetail").onclick = async () => {
      const btn = $("btnSaveDocDetail");
      const docData = {
        id: "doc_" + Date.now(),
        title: $("detDocTitle").value,
        type:  $("detDocType").value,
        externalUrl: $("detDocUrl").value,
        description: $("detDocDesc").value,
        date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
        addedAt: new Date().toISOString(),
        verified: true,
        uploadedBy: data.vmedId,
        addedBy: data.identity?.fullName || "Doctor"
      };
      if (!docData.title || !docData.externalUrl) { alert("Title and URL required"); return; }
      btn.disabled = true;
      try {
        await updateDoc(doc(db, "users", pid), { documents: arrayUnion(docData) });
        const msg = $("addDocDetMsg");
        if (msg) { msg.className = "alert success"; msg.textContent = "Verified document added!"; msg.style.display = "block"; }
        setTimeout(() => loadPage("patient_detail", pid), 1000);
      } catch (e) { btn.disabled = false; alert(e.message); }
    };
  }

  // Visit Timeline Rendering
  const vList = $("detVisitList");
  if (vList) {
    const visits = p.visits || [];
    vList.innerHTML = visits.length === 0
      ? `<div class="empty-state">No clinical notes recorded yet.</div>`
      : [...visits].reverse().map(v => `
          <div class="history-card" style="border-left: 4px solid var(--accent);">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <strong style="color:var(--ink)">${escHtml(v.reason)}</strong>
              <span style="font-size:12px;color:var(--muted)">${v.date}</span>
            </div>
            ${v.diagnosis ? `<p style="font-size:13px;margin-bottom:4px"><strong>Diagnosis:</strong> ${escHtml(v.diagnosis)}</p>` : ""}
            <p style="font-size:13px;color:var(--muted)">${escHtml(v.notes || "No notes.")}</p>
            ${v.prescriptions?.length ? `<div class="visit-pills" style="margin-top:8px">${v.prescriptions.map(med => `<span class="visit-pill">💊 ${med}</span>`).join("")}</div>` : ""}
          </div>`).join("");
  }

  // Medications
  if ($("detMedList")) {
    const meds = p.medications || [];
    $("detMedList").innerHTML = meds.length === 0
      ? `<div style="padding:24px; color:var(--muted); font-size:13px;">No current medications.</div>`
      : meds.map(m => `
          <div style="display:flex;gap:12px;padding:12px 20px;border-bottom:1px solid var(--border)">
            <span>💊</span>
            <div><strong style="font-size:14px;">${escHtml(m.name)}</strong><br><span style="font-size:12px;color:var(--muted);">${m.dosage || ""} · ${m.frequency || ""}</span></div>
            <span class="patient-tag ${m.active !== false ? "tag-active" : ""}" style="margin-left:auto">${m.active !== false ? "Active" : "Completed"}</span>
          </div>`).join("");
  }

  // Documents
  if ($("detDocList")) {
    const docs = p.documents || [];
    $("detDocList").innerHTML = docs.length === 0 ? `<div class="empty-state">No uploaded records.</div>` : docs.map(d => `
      <div class="card" style="padding:16px;display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:20px">${d.verified ? "🛡️" : "📄"}</span>
          <div>
            <strong style="font-size:14px;">${escHtml(d.title)}</strong>
            ${d.verified ? `<span class="patient-tag tag-active" style="font-size:10px; padding: 2px 6px; margin-left: 6px;">Verified</span>` : ""}
            <br><span style="font-size:11px;color:var(--muted);">${d.type} · ${d.date || "Unknown date"}</span>
          </div>
        </div>
        <a href="${d.externalUrl}" target="_blank" class="btn-secondary" style="font-size:12px;text-decoration:none">View</a>
      </div>`).join("");
  }
}

// ── ADD PATIENT ───────────────────────────────────────────────
function initAddPatient(data) {
  const searchBtn = document.getElementById("searchPatientBtn");
  const addBtn    = document.getElementById("addPatientBtn");
  const msgEl     = document.getElementById("addPatientMsg");
  let foundPatient   = null;
  let foundPatientId = null;

  function showMsg(type, text) {
    if (!msgEl) return;
    msgEl.className     = `alert ${type}`;
    msgEl.textContent   = text;
    msgEl.style.display = "block";
  }

  searchBtn?.addEventListener("click", async () => {
    const vmedId = document.getElementById("searchVmedId")?.value.trim();
    if (!vmedId) { showMsg("error", "Please enter a V-Med ID."); return; }
    searchBtn.disabled    = true;
    searchBtn.textContent = "Searching…";
    try {
      const mapSnap = await getDoc(doc(db, "vmedIndex", vmedId));
      if (!mapSnap.exists()) { showMsg("error", "No patient found with this V-Med ID."); return; }
      const mapped = mapSnap.data();
      if (!mapped.uid) { showMsg("error", "Invalid V-Med mapping. Contact support."); return; }
      const docSnap = await getDoc(doc(db, "users", mapped.uid));
      if (!docSnap.exists()) { showMsg("error", "Patient profile not found."); return; }
      const pData = docSnap.data();
      if (pData.role !== "patient") { showMsg("error", "This V-Med ID does not belong to a patient."); return; }
      foundPatient   = pData;
      foundPatientId = mapped.uid;
      const linked   = data?.linkedPatients || [];
      if (linked.includes(foundPatientId)) {
        showMsg("info", "This patient is already linked to your profile.");
        return;
      }
      const card = document.getElementById("foundPatientCard");
      if (card) {
        card.style.display = "block";
        document.getElementById("foundName").textContent   = pData.identity?.fullName      || "--";
        document.getElementById("foundVmed").textContent   = pData.vmedId                  || "--";
        document.getElementById("foundGender").textContent = pData.identity?.gender        || "--";
        document.getElementById("foundDob").textContent    = pData.identity?.dob           || "--";
        document.getElementById("foundBlood").textContent  = pData.patientData?.bloodGroup || "--";
      }
      showMsg("success", "Patient found! Review and confirm to add.");
    } catch (e) {
      showMsg("error", "Search failed: " + e.message);
    } finally {
      searchBtn.disabled    = false;
      searchBtn.textContent = "Search Patient";
    }
  });

  addBtn?.addEventListener("click", async () => {
    if (!foundPatientId || !foundPatient) { showMsg("error", "Please search for a patient first."); return; }
    addBtn.disabled    = true;
    addBtn.textContent = "Linking…";
    try {
      const doctorId   = window.currentDoctorId;
      const doctorData = window.currentDoctorData;
      const doctorName = doctorData?.identity?.fullName          || "Unknown Doctor";
      const doctorSpec = doctorData?.doctorData?.specializations || "";

      // ── Doctor doc: add patient UID to linkedPatients (plain string array) ──
      await updateDoc(doc(db, "users", doctorId), {
        linkedPatients: arrayUnion(foundPatientId)
      });

      // ── Patient doc: add doctor object AND plain string ID ──────────────────
      // linkedDoctorIds (string array) is what Firestore rules check via
      // resource.data.linkedDoctorIds.hasAny([doctorUid]) — zero extra get() calls.
      // linkedDoctors (object array) is for display purposes in the patient dashboard.
      await updateDoc(doc(db, "users", foundPatientId), {
        linkedDoctors: arrayUnion({
          doctorId, doctorName, doctorSpec,
          addedAt: new Date().toISOString()
        }),
        linkedDoctorIds: arrayUnion(doctorId)   // ← CRITICAL: rules depend on this field
      });

      // Update in-memory cache so patient count reflects immediately
      if (!window.currentDoctorData.linkedPatients) window.currentDoctorData.linkedPatients = [];
      window.currentDoctorData.linkedPatients.push(foundPatientId);

      showMsg("success", `${foundPatient.identity?.fullName} has been added to your patient list!`);
      document.getElementById("foundPatientCard").style.display = "none";
      document.getElementById("searchVmedId").value = "";
      foundPatient = null; foundPatientId = null;
    } catch (e) {
      showMsg("error", "Failed to link patient: " + e.message);
    } finally {
      addBtn.disabled    = false;
      addBtn.textContent = "Confirm & Add Patient";
    }
  });
}

// ── CONSULTATION ──────────────────────────────────────────────
async function initConsultation(data) {
  const linkedPatients = data?.linkedPatients || [];
  const patientSelect  = document.getElementById("consultPatient");
  const msgEl          = document.getElementById("consultMsg");
  let medCount = 1;

  function showMsg(type, text) {
    if (!msgEl) return;
    msgEl.className     = `alert ${type}`;
    msgEl.textContent   = text;
    msgEl.style.display = "block";
    msgEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Populate patient dropdown
  if (patientSelect) {
    patientSelect.innerHTML = `<option value="">— Select a patient —</option>`;
    if (linkedPatients.length === 0) {
      const opt       = document.createElement("option");
      opt.disabled    = true;
      opt.textContent = "No patients linked yet";
      patientSelect.appendChild(opt);
    } else {
      const snaps = await Promise.all(
        linkedPatients.map(pid =>
          getDoc(doc(db, "users", pid)).catch(() => null)
        )
      );
      snaps.forEach(snap => {
        if (!snap || !snap.exists()) return;
        const d         = snap.data();
        const opt       = document.createElement("option");
        opt.value       = snap.id;
        opt.textContent = `${d.identity?.fullName || "Unknown"} — ${d.vmedId || ""}`;
        patientSelect.appendChild(opt);
      });
    }
  }

  // Set today's date
  const dateEl = document.getElementById("visitDate");
  if (dateEl) dateEl.value = new Date().toLocaleDateString("en-IN",
    { day: "2-digit", month: "short", year: "numeric" });

  // Add medication row
  window.addMedRow = () => {
    medCount++;
    const container = document.getElementById("medsContainer");
    if (!container) return;
    const row     = document.createElement("div");
    row.className = "med-row";
    row.id        = `med-row-${medCount}`;
    row.innerHTML = `
      <div class="form-group">
        <label>Medicine name</label>
        <input type="text" class="med-name" placeholder="e.g. Paracetamol 500mg"/>
      </div>
      <div class="form-group">
        <label>Dosage</label>
        <input type="text" class="med-dosage" placeholder="e.g. 1 tablet"/>
      </div>
      <div class="form-group">
        <label>Frequency</label>
        <input type="text" class="med-freq" placeholder="e.g. Twice daily"/>
      </div>
      <div class="form-group">
        <label>Duration</label>
        <input type="text" class="med-duration" placeholder="e.g. 5 days"/>
      </div>
      <button class="med-remove" onclick="window.removeMedRow(${medCount})">×</button>`;
    container.appendChild(row);
  };

  window.removeMedRow = id => { document.getElementById(`med-row-${id}`)?.remove(); };

  // Submit handler
  document.getElementById("submitConsultBtn")?.addEventListener("click", async () => {

    const patientId  = patientSelect?.value;
    const reason     = document.getElementById("visitReason")?.value.trim();
    const diagnosis  = document.getElementById("visitDiagnosis")?.value.trim();
    const notes      = document.getElementById("visitNotes")?.value.trim();
    const submitBtn  = document.getElementById("submitConsultBtn");
    const doctorId   = window.currentDoctorId;
    const doctorData = window.currentDoctorData;

    // Debug — all inside handler, not at module scope
    console.log("Doctor UID     :", doctorId);
    console.log("Patient UID    :", patientId);
    console.log("linkedPatients :", doctorData?.linkedPatients);
    console.log("Is linked      :", (doctorData?.linkedPatients || []).includes(patientId));

    if (!doctorId) {
      showMsg("error", "Doctor session not loaded. Please refresh the page and try again.");
      return;
    }
    if (!patientId) { showMsg("error", "Please select a patient.");           return; }
    if (!reason)    { showMsg("error", "Please enter the reason for visit."); return; }

    // Collect medications
    const medications       = [];
    const prescriptionNames = [];
    document.querySelectorAll(".med-row").forEach(row => {
      const name = row.querySelector(".med-name")?.value.trim();
      if (!name) return;
      const dosage    = row.querySelector(".med-dosage")?.value.trim()   || "";
      const frequency = row.querySelector(".med-freq")?.value.trim()     || "";
      const duration  = row.querySelector(".med-duration")?.value.trim() || "";
      medications.push({
        name, dosage, frequency, duration,
        prescribedBy: doctorData?.identity?.fullName || "Doctor",
        active:  true,
        addedAt: new Date().toISOString()
      });
      prescriptionNames.push(`${name}${dosage ? " " + dosage : ""}`);
    });

    const visitRecord = {
      id:            Date.now().toString() + Math.random().toString(36).substr(2, 5),
      date:          new Date().toLocaleDateString("en-IN",
                       { day: "2-digit", month: "short", year: "numeric" }),
      reason,
      diagnosis:     diagnosis || "",
      notes:         notes     || "",
      doctorName:    doctorData?.identity?.fullName           || "Unknown",
      doctorSpec:    doctorData?.doctorData?.specializations  || "",
      doctorVmedId:  doctorData?.vmedId                       || "",
      prescriptions: prescriptionNames
    };

    // We send two separate updateDoc requests to respect strict Firebase rules
    // that may evaluate `hasOnly(["visits"])` independently from `hasOnly(["medications"])`.
    submitBtn.disabled    = true;
    submitBtn.textContent = "Saving…";

    try {
      const patientRef = doc(db, "users", patientId);
      
      // 🕵️ DEBUGGING: Let's fetch the actual live DB version of the doctor so we can see
      // exactly what the Firebase Rules are seeing when they evaluate `isDoctorLinked`
      const doctorLiveSnap = await getDoc(doc(db, "users", doctorId));
      if (doctorLiveSnap.exists()) {
        const liveData = doctorLiveSnap.data();
        console.warn("🔐 RULE DEBUG - Live Doctor Role:", liveData.role);
        console.warn("🔐 RULE DEBUG - Live Doctor linkedPatients:", liveData.linkedPatients);
      }

      console.log("Executing strict update for visits array...");
      await updateDoc(patientRef, { visits: arrayUnion(visitRecord) });

      if (medications.length > 0) {
        console.log("Executing strict update for medications array...");
        await updateDoc(patientRef, { medications: arrayUnion(...medications) });
      }

      showMsg("success", "Consultation saved! Visit and prescriptions added to patient's profile.");

      // Reset form
      if (patientSelect) patientSelect.value = "";
      ["visitReason", "visitDiagnosis", "visitNotes"].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = "";
      });
      document.querySelectorAll(".med-row:not(#med-row-1)").forEach(r => r.remove());
      document.querySelectorAll(".med-name,.med-dosage,.med-freq,.med-duration")
        .forEach(el => { el.value = ""; });
      medCount = 1;

    } catch (e) {
      console.error("Consultation save error:", e);
      if (e.code === "permission-denied") {
        showMsg("error",
          "Permission denied. Ensure this patient is linked and Firestore rules are published.");
      } else {
        showMsg("error", "Failed to save: " + e.message);
      }
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = "Save Consultation";
    }
  });
}

// ── ADD DOCUMENT ──────────────────────────────────────────────
async function initAddDocument(data) {
  const linkedPatients = data?.linkedPatients || [];
  const patientSelect = document.getElementById("docPatientSelect");
  const msgEl = document.getElementById("addDocMsg");
  const submitBtn = document.getElementById("submitDocBtn");

  function showMsg(type, text) {
    if (!msgEl) return;
    msgEl.className = `alert ${type}`;
    msgEl.textContent = text;
    msgEl.style.display = "block";
    msgEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // Populate patient dropdown
  if (patientSelect) {
    patientSelect.innerHTML = `<option value="">— Select a patient —</option>`;
    if (linkedPatients.length === 0) {
      const opt = document.createElement("option");
      opt.disabled = true;
      opt.textContent = "No patients linked yet";
      patientSelect.appendChild(opt);
    } else {
      const snaps = await Promise.all(
        linkedPatients.map(pid => getDoc(doc(db, "users", pid)).catch(() => null))
      );
      snaps.forEach(snap => {
        if (!snap || !snap.exists()) return;
        const d = snap.data();
        const opt = document.createElement("option");
        opt.value = snap.id;
        opt.textContent = `${d.identity?.fullName || "Unknown"} — ${d.vmedId || ""}`;
        patientSelect.appendChild(opt);
      });
    }
  }

  submitBtn?.addEventListener("click", async () => {
    const patientId = patientSelect?.value;
    const title = document.getElementById("docTitle")?.value.trim();
    const type = document.getElementById("docType")?.value;
    const url = document.getElementById("docUrl")?.value.trim();
    const description = document.getElementById("docDescription")?.value.trim();

    const doctorId = window.currentDoctorId;
    const doctorData = window.currentDoctorData;

    if (!doctorId) {
      showMsg("error", "Doctor session not loaded. Please refresh.");
      return;
    }
    if (!patientId) { showMsg("error", "Please select a patient."); return; }
    if (!title) { showMsg("error", "Please enter a document title."); return; }
    if (!type) { showMsg("error", "Please select a document type."); return; }
    if (!url) { showMsg("error", "Please provide a valid document URL."); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    const docRecord = {
      id: "doc_" + Date.now().toString() + Math.random().toString(36).substr(2, 5),
      title,
      type,
      externalUrl: url,
      description: description || "",
      addedBy: doctorData?.identity?.fullName || "Doctor",
      date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
      addedAt: new Date().toISOString()
    };

    try {
      const patientRef = doc(db, "users", patientId);
      await updateDoc(patientRef, { documents: arrayUnion(docRecord) });
      showMsg("success", "Document saved successfully to the patient's profile.");

      // Reset form
      if (patientSelect) patientSelect.value = "";
      document.getElementById("docTitle").value = "";
      document.getElementById("docType").value = "";
      document.getElementById("docUrl").value = "";
      document.getElementById("docDescription").value = "";
    } catch (e) {
      console.error("Add document error:", e);
      if (e.code === "permission-denied") {
        showMsg("error", "Permission denied. Ensure your Firestore rules allow 'documents' updates.");
      } else {
        showMsg("error", "Failed to save: " + e.message);
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save Document to Patient Profile";
    }
  });
}

// ── CONSULTATION HISTORY ──────────────────────────────────────
async function initHistory(data) {
  const linkedPatients = data?.linkedPatients || [];
  const list    = document.getElementById("historyList");
  const empty   = document.getElementById("historyEmpty");
  const spinner = document.getElementById("historySpinner");
  if (!list) return;

  if (linkedPatients.length === 0) {
    if (empty) empty.style.display = "block";
    return;
  }

  if (spinner) spinner.style.display = "block";

  const doctorName = data?.identity?.fullName || "";
  const firstName  = doctorName.split(" ")[0]?.toLowerCase() || "";
  const allVisits  = [];

  for (const pid of linkedPatients) {
    try {
      const snap = await getDoc(doc(db, "users", pid));
      if (!snap.exists()) continue;
      const pd          = snap.data();
      const patientName = pd.identity?.fullName || "Unknown";
      const patientVmed = pd.vmedId             || "--";
      (pd.visits || []).forEach(v => {
        if (!v.doctorName) return;
        if (firstName && !v.doctorName.toLowerCase().includes(firstName)) return;
        allVisits.push({ ...v, patientName, patientVmed, patientId: pid });
      });
    } catch (e) { console.warn("history fetch error", pid, e); }
  }

  if (spinner) spinner.style.display = "none";

  if (allVisits.length === 0) {
    if (empty) empty.style.display = "block";
    return;
  }
  if (empty) empty.style.display = "none";

  allVisits.sort((a, b) => new Date(b.date) - new Date(a.date));

  window._currentVisits = allVisits;

  const statsEl = document.getElementById("historyStats");
  if (statsEl) {
    statsEl.textContent =
      `${allVisits.length} consultation${allVisits.length !== 1 ? "s" : ""} recorded`;
  }

  list.innerHTML = allVisits.map((v, i) => `
    <div class="history-card">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px">
        <div>
          <div class="history-patient-name">👤 ${escHtml(v.patientName)}</div>
          <div class="history-meta">${escHtml(v.patientVmed)} · ${v.date || "--"}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button onclick="window._editConsultation(${i})" style="background:var(--surface-2);border:1px solid var(--border);color:var(--accent);padding:4px 10px;border-radius:6px;font-size:12px;cursor:pointer;">Edit</button>
          <span class="patient-tag tag-active" style="flex-shrink:0">
            ${escHtml(v.reason || "Consultation")}
          </span>
        </div>
      </div>
      ${v.diagnosis
        ? `<div style="font-size:13px;color:var(--ink);margin-top:8px"><strong>Diagnosis:</strong> ${escHtml(v.diagnosis)}</div>`
        : ""}
      ${v.notes
        ? `<div style="font-size:13px;color:var(--muted);margin-top:4px">${escHtml(v.notes)}</div>`
        : ""}
      ${v.prescriptions?.length
        ? `<div class="visit-pills" style="margin-top:8px">
             ${v.prescriptions.map(p => `<span class="visit-pill">💊 ${escHtml(p)}</span>`).join("")}
           </div>`
        : ""}
    </div>`).join("");

  window._editConsultation = (index) => {
    const v = window._currentVisits[index];
    if (!v) return;
    const modal = document.getElementById("editConsultModal");
    if (!modal) return;
    
    document.getElementById("editConsultPatientName").textContent = `Patient: ${v.patientName} (${v.patientVmed}) - ${v.date}`;
    document.getElementById("editVisitReason").value = v.reason || "";
    document.getElementById("editVisitDiagnosis").value = v.diagnosis || "";
    document.getElementById("editVisitNotes").value = v.notes || "";
    
    document.getElementById("editConsultMsg").style.display = "none";
    
    const saveBtn = document.getElementById("saveEditConsultBtn");
    saveBtn.onclick = async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
      try {
        const patientRef = doc(db, "users", v.patientId);
        const snap = await getDoc(patientRef);
        if (!snap.exists()) throw new Error("Patient not found");
        const pd = snap.data();
        let updatedVisits = [...(pd.visits || [])];
        
        const vIndex = updatedVisits.findIndex(existing => {
          if (v.id && existing.id === v.id) return true;
          return existing.date === v.date && existing.reason === v.reason && existing.notes === v.notes && existing.diagnosis === v.diagnosis;
        });
        
        if (vIndex === -1) throw new Error("Original visit record not found.");
        
        updatedVisits[vIndex] = {
          ...updatedVisits[vIndex],
          reason: document.getElementById("editVisitReason").value.trim(),
          diagnosis: document.getElementById("editVisitDiagnosis").value.trim(),
          notes: document.getElementById("editVisitNotes").value.trim()
        };
        
        await updateDoc(patientRef, { visits: updatedVisits });
        
        const msg = document.getElementById("editConsultMsg");
        msg.className = "alert success";
        msg.textContent = "Consultation updated successfully!";
        msg.style.display = "block";
        
        setTimeout(() => {
          modal.style.display = "none";
          loadPage("history");
        }, 1500);
      } catch (e) {
        console.error(e);
        const msg = document.getElementById("editConsultMsg");
        msg.className = "alert error";
        msg.textContent = "Error: " + e.message;
        msg.style.display = "block";
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Changes";
      }
    };
    modal.style.display = "flex";
  };
}

// ── AI CHAT (Doctor mode) ─────────────────────────────────────
function initAIChat(data, initialPatientId = null) {
  if (!data) return;
  const input      = document.getElementById("aiInput");
  const chat       = document.getElementById("aiChat");
  const sendBtn    = document.getElementById("aiSendBtn");
  const pSelect    = document.getElementById("aiPatientSelect");
  const ddContainer = document.getElementById("reportDropdownContainer");
  const checklist  = document.getElementById("aiReportChecklist");
  const countEl    = document.getElementById("selectedCount");

  if (!input || !chat || !sendBtn || !pSelect) return;

  const doctorPayload = {
    vmedId:   data.vmedId,
    role:     "doctor",
    identity: { fullName: data.identity?.fullName },
    doctorData: { specializations: data.doctorData?.specializations },
    patientCount: (data.linkedPatients || []).length,
  };

  let selectedPatientData = null;

  // 1. Populate Patients dropdown
  const linkedPatients = data.linkedPatients || [];
  (async () => {
    pSelect.innerHTML = `<option value="">— General Reference —</option>`;
    const snaps = await Promise.all(linkedPatients.map(pid => getDoc(doc(db, "users", pid)).catch(() => null)));
    snaps.forEach(snap => {
      if (snap?.exists()) {
        const d = snap.data();
        const opt = document.createElement("option");
        opt.value = snap.id;
        opt.textContent = `${d.identity?.fullName || "Unknown"} — ${d.vmedId || ""}`;
        if (initialPatientId && snap.id === initialPatientId) opt.selected = true;
        pSelect.appendChild(opt);
      }
    });

    // If pre-selected, trigger change manually
    if (initialPatientId) {
      pSelect.dispatchEvent(new Event("change"));
    }
  })();

  // 2. Handle Patient Selection Change
  pSelect.addEventListener("change", async () => {
    const pid = pSelect.value;
    if (!pid) {
      selectedPatientData = null;
      ddContainer.style.display = "none";
      return;
    }

    pSelect.disabled = true;
    try {
      const snap = await getDoc(doc(db, "users", pid));
      if (snap.exists()) {
        selectedPatientData = { uid: pid, ...snap.data() };
        renderReportDropdown(selectedPatientData.documents || []);
        ddContainer.style.display = "flex";
      }
    } catch (e) {
      console.error("Fetch patient error:", e);
    } finally {
      pSelect.disabled = false;
    }
  });

  function renderReportDropdown(docs) {
    if (!checklist) return;
    if (docs.length === 0) {
      checklist.innerHTML = `<p style="font-size:11px; color:var(--muted); margin:4px 8px;">No reports found for this patient.</p>`;
      if (countEl) countEl.textContent = "No Reports Available";
      return;
    }
    checklist.innerHTML = docs.map((d, i) => `
      <div class="dropdown-item" onclick="var cb=this.querySelector('input'); cb.checked=!cb.checked; cb.dispatchEvent(new Event('change', {bubbles:true}));">
        <input type="checkbox" class="ai-doc-cb" value="${i}" checked onclick="event.stopPropagation()">
        <span>${escHtml(d.title)}</span>
      </div>`).join("");
    
    checklist.addEventListener("change", () => updateReportCount(docs.length));
    updateReportCount(docs.length);
  }

  function updateReportCount(total) {
    if (!countEl) return;
    const checked = document.querySelectorAll(".ai-doc-cb:checked").length;
    countEl.textContent = checked === 0 ? "No Reports Selected" : (checked === total ? "All Reports (Default)" : `${checked} Reports Selected`);
  }

  const chatHistory = [];

  // 3. Send Message
  async function send(overrideMsg) {
    const text = overrideMsg || input.value.trim();
    if (!text) return;

    // Hide quick prompts on first interaction
    const promptArea = document.getElementById("quickPrompts");
    if (promptArea) promptArea.style.display = "none";

    // Build patient context if selected
    let patientPayload = null;
    if (selectedPatientData) {
      const selectedIndices = Array.from(document.querySelectorAll(".ai-doc-cb"))
        .filter(cb => cb.checked).map(cb => parseInt(cb.value));
      const filteredDocs = (selectedPatientData.documents || []).filter((_, i) => selectedIndices.includes(i));
      
      patientPayload = {
        vmedId: selectedPatientData.vmedId,
        identity: selectedPatientData.identity,
        patientData: selectedPatientData.patientData,
        medications: selectedPatientData.medications,
        visits: selectedPatientData.visits,
        documents: filteredDocs
      };
    }

    if (!overrideMsg) {
      chat.insertAdjacentHTML("beforeend", `<div class="ai-msg user"><div class="bubble">${escHtml(text)}</div></div>`);
      input.value = "";
    }
    chat.scrollTop = chat.scrollHeight;

    const typing = document.createElement("div");
    typing.className = "ai-msg ai";
    typing.innerHTML = `<div class="bubble" style="color:var(--muted)">Thinking…</div>`;
    chat.appendChild(typing);
    chat.scrollTop = chat.scrollHeight;

    sendBtn.disabled = true;

    try {
      const res = await fetch(`${API_BASE}/api/ai/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          doctor:  doctorPayload,
          patient: patientPayload,
          history: chatHistory,
          lang:    "en",
        })
      });

      if (!res.ok) throw new Error("Server error");
      const json = await res.json();
      typing.remove();

      const reply = json.reply || "";
      chatHistory.push({ role: "user", text });
      chatHistory.push({ role: "model", text: reply });
      if (chatHistory.length > 20) chatHistory.splice(0, 2);

      chat.insertAdjacentHTML("beforeend", `<div class="ai-msg ai"><div class="bubble">${parseMd(reply)}</div></div>`);
    } catch (err) {
      typing.remove();
      chat.insertAdjacentHTML("beforeend", `<div class="ai-msg ai"><div class="bubble" style="color:var(--danger)">⚠️ Error: ${err.message}</div></div>`);
    } finally {
      sendBtn.disabled = false;
      chat.scrollTop   = chat.scrollHeight;
    }
  }

  sendBtn.onclick = () => send();
  input.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); send(); } };
}

// ── SETTINGS ──────────────────────────────────────────────────
function initSettings(data) {
  if (!data) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || "--"; };

  set("detailName",   data.identity?.fullName);
  set("detailFather", data.identity?.fatherName);
  set("detailGender", data.identity?.gender);
  set("detailDob",    data.identity?.dob);
  set("detailEmail",  data.contact?.email);
  set("detailPhone",  data.contact?.phone);
  set("detailAbha",   data.identity?.abha);
  set("detailSpec",   data.doctorData?.specializations);
  set("detailSince",  data.doctorData?.practisingSince);
  set("detailQual",   data.doctorData?.qualification);

  const aadhaar = data.identity?.aadhaar;
  set("detailAadhaar", aadhaar ? "XXXX-XXXX-" + aadhaar.slice(-4) : "--");

  const dmBtn = document.getElementById("settingsDarkBtn");
  if (dmBtn) {
    const isDark = document.documentElement.classList.contains("dark");
    dmBtn.textContent = isDark ? "☀️ Switch to light mode" : "🌙 Switch to dark mode";
    dmBtn.onclick = () => {
      toggleDark();
      dmBtn.textContent = document.documentElement.classList.contains("dark")
        ? "☀️ Switch to light mode" : "🌙 Switch to dark mode";
    };
  }

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
}

async function changePassword() {
  const { updatePassword, EmailAuthProvider, reauthenticateWithCredential }
    = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js");
  const curr = document.getElementById("currPass")?.value;
  const newp = document.getElementById("newPass")?.value;
  const conf = document.getElementById("confPass")?.value;
  if (newp !== conf)   { alert("Passwords don't match"); return; }
  if (newp.length < 8) { alert("Minimum 8 characters");  return; }
  try {
    const user = auth.currentUser;
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, curr));
    await updatePassword(user, newp);
    alert("Password updated!");
    const m = document.getElementById("passwordModal");
    if (m) { m.classList.remove("open"); m.style.display = "none"; }
  } catch (e) { alert(e.message); }
}

// ── UTILS ─────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseMd(text) {
  if (!text) return "";
  return text
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm,  "<h3>$1</h3>")
    .replace(/^## (.+)$/gm,   "<h3>$1</h3>")
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g,     "<strong>$1</strong>")
    .replace(/^[ \t]{2,}[\*\-] (.+)$/gm, "<li style='margin-left:20px'>$1</li>")
    .replace(/^[\*\-] (.+)$/gm,          "<li>$1</li>")
    .replace(/^\d+\. (.+)$/gm,           "<li>$1</li>")
    .replace(/(<li[\s\S]*?<\/li>\n?)+/g,
      m => `<ul style="margin:6px 0 6px 18px;padding:0">${m}</ul>`)
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, " ")
    .replace(/(<\/(?:ul|h3|h4)>)(<br>)+/g, "$1");
}

// ── GLOBALS ───────────────────────────────────────────────────
window.loadPage      = loadPage;
window.loadSection   = loadSection;
window.toggleSidebar = toggleSidebar;
window.handleLogout  = handleLogout;

// ── BOOT ──────────────────────────────────────────────────────
(async () => {
  const data = await window.doctorDataReady;
  if (!data) {
    console.warn("No doctor data — redirecting to login");
    window.location.replace("../login/login.html");
    return;
  }
  loadPage("home");
})();
