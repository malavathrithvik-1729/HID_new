import { auth, db } from "../../../js/firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc, getDoc, updateDoc, arrayUnion,
  collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const API_BASE = "http://localhost:3000";

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

    if (pageName === "home")         initHome(data);
    if (pageName === "patients")     initPatients(data);
    if (pageName === "add_patient")  initAddPatient(data);
    if (pageName === "consultation") initConsultation(data);
    if (pageName === "history")      initHistory(data);
    if (pageName === "ai")           initAIChat(data);
    if (pageName === "settings")     initSettings(data);

  } catch (e) {
    console.error("loadPage error:", e);
    const content2 = document.getElementById("content");
    if (content2) {
      content2.innerHTML =
        `<div class="section-wrap"><p style="color:var(--danger)">Error loading section: ${e.message}</p></div>`;
    }
  }
}

function loadSection(btn, page) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  if (btn) btn.classList.add("active");
  loadPage(page);
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
        <div class="patient-card" onclick="window._showPatientDetail('${p.id}')">
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

  window._showPatientDetail = async (patientId) => {
    const p = allPatients.find(x => x.id === patientId);
    if (!p) return;
    const modal = document.getElementById("patientModal");
    if (!modal) return;

    const name     = p.identity?.fullName || "Unknown";
    const initials = name.trim().split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();

    const nameEl = document.getElementById("modalPatientName");
    if (nameEl) nameEl.textContent = name;
    const vmedEl = document.getElementById("modalPatientVmed");
    if (vmedEl) vmedEl.textContent = p.vmedId || "--";
    const avatarEl = document.getElementById("modalPatientAvatar");
    if (avatarEl) avatarEl.textContent = initials;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val || "--"; };
    set("modalGender", p.identity?.gender);
    set("modalDob",    p.identity?.dob);
    set("modalBlood",  p.patientData?.bloodGroup);
    set("modalEmail",  p.contact?.email);
    set("modalPhone",  p.contact?.phone);
    set("modalAbha",   p.identity?.abha);

    const vList  = document.getElementById("modalVisitList");
    const visits = p.visits || [];
    if (vList) {
      vList.innerHTML = visits.length === 0
        ? `<p style="font-size:13px;color:var(--muted)">No visits recorded yet.</p>`
        : [...visits].reverse().map(v => `
            <div class="visit-card" style="margin-bottom:10px">
              <div class="visit-header">
                <h4>${escHtml(v.reason || "Consultation")}</h4>
                <span class="visit-date">${v.date || ""}</span>
              </div>
              ${v.diagnosis ? `<div class="visit-detail"><strong>Diagnosis:</strong> ${escHtml(v.diagnosis)}</div>` : ""}
              ${v.notes     ? `<div class="visit-detail">${escHtml(v.notes)}</div>` : ""}
              ${v.prescriptions?.length
                ? `<div class="visit-pills">${v.prescriptions.map(pr =>
                    `<span class="visit-pill">💊 ${escHtml(pr)}</span>`).join("")}</div>`
                : ""}
            </div>`).join("");
    }

    const mList = document.getElementById("modalMedList");
    const meds  = p.medications || [];
    if (mList) {
      mList.innerHTML = meds.length === 0
        ? `<p style="font-size:13px;color:var(--muted)">No medications on file.</p>`
        : meds.map(m => `
            <div style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
              <span>💊</span>
              <div>
                <strong style="font-size:14px;color:var(--ink)">${escHtml(m.name)}</strong><br>
                <span style="font-size:12px;color:var(--muted)">${escHtml(m.dosage || "")} ${escHtml(m.frequency || "")}</span>
              </div>
              <span class="patient-tag ${m.active !== false ? "tag-active" : ""}" style="margin-left:auto">
                ${m.active !== false ? "Active" : "Done"}
              </span>
            </div>`).join("");
    }

    const dList = document.getElementById("modalDocList");
    const docs  = p.documents || [];
    if (dList) {
      dList.innerHTML = docs.length === 0
        ? `<p style="font-size:13px;color:var(--muted)">No documents uploaded.</p>`
        : docs.map(d => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
              <span style="font-size:14px;color:var(--ink)">📄 ${escHtml(d.title || "Document")}</span>
              <a href="${d.externalUrl}" target="_blank" style="font-size:12px;color:var(--accent);text-decoration:none">View</a>
            </div>`).join("");
    }

    modal.classList.add("open");
    modal.style.display = "flex";
  };
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
      const q    = query(collection(db, "users"), where("vmedId", "==", vmedId));
      const snap = await getDocs(q);
      if (snap.empty) { showMsg("error", "No patient found with this V-Med ID."); return; }
      const docSnap = snap.docs[0];
      const pData   = docSnap.data();
      if (pData.role !== "patient") { showMsg("error", "This V-Med ID does not belong to a patient."); return; }
      foundPatient   = pData;
      foundPatientId = docSnap.id;
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
function initAIChat(data) {
  const input   = document.getElementById("aiInput");
  const chat    = document.getElementById("aiChat");
  const sendBtn = document.getElementById("aiSendBtn");
  if (!input || !chat || !sendBtn) return;

  const doctorPayload = data ? {
    vmedId:   data.vmedId,
    role:     "doctor",
    identity: {
      fullName: data.identity?.fullName,
      gender:   data.identity?.gender,
    },
    doctorData: {
      specializations: data.doctorData?.specializations,
      qualification:   data.doctorData?.qualification,
      practisingSince: data.doctorData?.practisingSince,
    },
    patientCount: (data.linkedPatients || []).length,
  } : null;

  const chatHistory = [];

  async function send(overrideMsg) {
    const text = overrideMsg || input.value.trim();
    if (!text) return;

    if (!overrideMsg) {
      chat.insertAdjacentHTML("beforeend",
        `<div class="ai-msg user"><div class="bubble">${escHtml(text)}</div></div>`);
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
          history: chatHistory,
          lang:    "en",
        })
      });

      if (!res.ok) {
        let errMsg = `Server error ${res.status}`;
        try { const j = await res.json(); errMsg = j.error || errMsg; } catch {}
        throw new Error(errMsg);
      }

      const json = await res.json();
      typing.remove();

      if (json.error) {
        chat.insertAdjacentHTML("beforeend",
          `<div class="ai-msg ai"><div class="bubble" style="color:var(--danger,#c0392b)">⚠️ ${escHtml(json.error)}</div></div>`);
        return;
      }

      const reply = json.reply || "";
      chatHistory.push({ role: "user",  text });
      chatHistory.push({ role: "model", text: reply });
      if (chatHistory.length > 20) chatHistory.splice(0, 2);

      chat.insertAdjacentHTML("beforeend",
        `<div class="ai-msg ai"><div class="bubble">${parseMd(reply)}</div></div>`);

      const trimmed = reply.trimEnd();
      if (trimmed.length > 200 && !/[.!?:]$/.test(trimmed)) {
        const cont = document.createElement("div");
        cont.id = "aiContinueBtn";
        cont.style.cssText = "text-align:center;margin:8px 0";
        cont.innerHTML = `<button onclick="window._aiContinue()"
          style="padding:7px 20px;background:var(--accent);color:#fff;border:none;
                 border-radius:20px;font-family:'Outfit',sans-serif;font-size:13px;cursor:pointer">
          Continue
        </button>`;
        chat.appendChild(cont);
      }

    } catch (err) {
      typing.remove();
      console.error("Doctor AI error:", err);
      const msg = err.message || "";
      let userMsg;
      if (msg.includes("Failed to fetch") || msg.includes("ERR_CONNECTION_REFUSED")) {
        userMsg = `⚠️ Cannot reach the AI server at <code>${API_BASE}</code>. Run <code>node server.js</code> in the backend folder.`;
      } else if (msg.includes("503")) {
        userMsg = "⚠️ Gemini is temporarily unavailable. Please try again in a moment.";
      } else {
        userMsg = `⚠️ ${escHtml(msg) || "AI service unavailable. Please ensure the backend server is running."}`;
      }
      chat.insertAdjacentHTML("beforeend",
        `<div class="ai-msg ai"><div class="bubble" style="color:var(--danger,#c0392b);line-height:1.8">${userMsg}</div></div>`);
    } finally {
      sendBtn.disabled = false;
      chat.scrollTop   = chat.scrollHeight;
    }
  }

  window._aiContinue = () => {
    document.getElementById("aiContinueBtn")?.remove();
    send("Please continue your previous response from where you left off.");
  };

  sendBtn.onclick = () => send();
  input.addEventListener("keydown", e => {
    if (e.key === "Enter") { e.preventDefault(); send(); }
  });
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