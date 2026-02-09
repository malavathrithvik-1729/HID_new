import { auth, db } from "../../../../js/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ===============================
   GLOBAL USER STATE
================================ */
let currentUserData = null;

/* ===============================
   FETCH + UPDATE UI
================================ */
export async function updateDashboardUI() {
  const user = auth.currentUser;
  if (!user) return;

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return;

    currentUserData = snap.data();

    /* ===============================
       SIDEBAR BASIC INFO
    ================================ */
    const nameEl = document.getElementById("userName");
    const vmedEl = document.getElementById("userVmed");

    if (nameEl) {
      nameEl.textContent = currentUserData.identity?.fullName || "Patient";
    }

    // 🔧 FIX: vmedId is at ROOT level
    if (vmedEl) {
      vmedEl.textContent = currentUserData.vmedId || "VMED-ID";
    }

    /* ===============================
       HISTORY PAGE
    ================================ */
    renderHistory(currentUserData.documents || []);

    /* ===============================
       SETTINGS PAGE
    ================================ */
    renderSettings(currentUserData);

  } catch (err) {
    console.error("Dashboard UI Error:", err);
  }
}

/* ===============================
   HISTORY RENDER
================================ */
function renderHistory(documents = []) {
  const list = document.getElementById("historyList");
  const empty = document.getElementById("historyEmpty");

  // If not on History page, do nothing (SPA safe)
  if (!list || !empty) return;

  list.innerHTML = "";

  if (!documents.length) {
    empty.classList.remove("hidden");
    return;
  }

  empty.classList.add("hidden");

  documents.forEach(docItem => {
    const card = document.createElement("div");
    card.className = "history-card";

    card.innerHTML = `
      <div class="history-icon">📄</div>
      <div class="history-content">
        <strong>${docItem.title || "Medical Report"}</strong>
        <div class="muted">Type: ${docItem.type || "document"}</div>
      </div>
      <a href="${docItem.externalUrl}" target="_blank" class="history-link">
        View
      </a>
    `;

    list.appendChild(card);
  });
}

/* ===============================
   SETTINGS RENDER (READ-ONLY)
================================ */
function renderSettings(data) {
  const bindings = {
    detailName: data.identity?.fullName,
    detailFatherName: data.identity?.fatherName,
    detailGender: data.identity?.gender,
    detailDob: data.identity?.dob,
    detailEmail: data.contact?.email,
    detailPhone: data.contact?.phone,
    detailAadhaar: data.identity?.aadhaar,
    detailAbha: data.identity?.abha
  };

  Object.entries(bindings).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = value || "--";
    }
  });
}
