import { auth, db } from "../../../js/firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

window.currentPatientData = null;
window.currentUserId = null;

// This promise resolves ONLY after Firebase auth + Firestore fetch both complete
window.patientDataReady = new Promise(resolve => {
  onAuthStateChanged(auth, async user => {
    if (!user) { resolve(null); return; }
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) { resolve(null); return; }
      const data = snap.data();
      window.currentPatientData = data;
      window.currentUserId = user.uid;

      // Update sidebar immediately
      const name = data.identity?.fullName || "Patient";
      const $ = id => document.getElementById(id);
      if ($("sidebarName")) $("sidebarName").textContent = name;
      if ($("sidebarVmed"))  $("sidebarVmed").textContent  = data.vmedId || "VMED-p-...";
      if ($("avatarEl")) {
        const parts = name.trim().split(" ");
        $("avatarEl").textContent = parts.length >= 2
          ? (parts[0][0] + parts[1][0]).toUpperCase()
          : parts[0].slice(0, 2).toUpperCase();
      }
      resolve(data);
    } catch(e) {
      console.error("userData error:", e);
      resolve(null);
    }
  });
});