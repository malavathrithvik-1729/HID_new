import { auth, db } from "../../../../js/firebase.js";

import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ===============================
   GLOBAL USER STATE (FIX)
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

    // BASIC INFO
    const nameEl = document.getElementById("userName");
    const vmedEl = document.getElementById("userVmed");

    if (nameEl) nameEl.textContent = currentUserData.identity?.fullName || "Patient";
    if (vmedEl) vmedEl.textContent = currentUserData.patientData?.vmedId || "VMED-ID";

    // HISTORY PAGE (SAFE CALL)
    renderHistory(currentUserData.documents || []);

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

  // If not on History page, do nothing
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
