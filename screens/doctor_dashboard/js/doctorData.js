/* =========================================================
   DOCTOR DATA — Fetch from Firestore & expose globally
   ========================================================= */
import { auth, db } from "../../../js/firebase.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================================================
   GLOBAL DOCTOR STATE
   ========================================================= */
window.currentDoctorData = null;

/* =========================================================
   FETCH & POPULATE
   ========================================================= */
export async function loadDoctorData() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) return;

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists()) return;

        const data = snap.data();
        window.currentDoctorData = data;

        // Sidebar — name
        const fullName = data.identity?.fullName || "Doctor";
        const nameEl = document.getElementById("sidebarDoctorName");
        if (nameEl) nameEl.textContent = "Dr. " + fullName;

        // Sidebar — vmed id
        const vmedEl = document.getElementById("sidebarVmedId");
        if (vmedEl) vmedEl.textContent = data.vmedId || "VMED-d-...";

        // Sidebar — initials avatar
        const initialsEl = document.getElementById("doctorInitials");
        if (initialsEl) {
          const parts = fullName.trim().split(" ");
          const initials = parts.length >= 2
            ? parts[0][0] + parts[1][0]
            : parts[0].slice(0, 2);
          initialsEl.textContent = initials.toUpperCase();
        }

        resolve(data);
      } catch (err) {
        console.error("Doctor data error:", err);
        resolve(null);
      }
    });
  });
}

/* =========================================================
   AUTO-INIT
   ========================================================= */
loadDoctorData();