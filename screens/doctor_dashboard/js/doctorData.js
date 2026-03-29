import { auth, db } from "../../../js/firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.currentDoctorData = null;
window.currentDoctorId   = null;

// A Promise<data|null> that resolves once Firebase Auth fires AND
// the Firestore doc is fetched. dashboard.js awaits this before
// loading any section — eliminates setTimeout race conditions.
window.doctorDataReady = new Promise(resolve => {
  onAuthStateChanged(auth, async user => {
    if (!user) return resolve(null);
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) return resolve(null);

      const data = snap.data();
      window.currentDoctorData = data;
      window.currentDoctorId   = user.uid;

      console.log("✅ Doctor loaded:", user.uid, data.identity?.fullName);

      // Populate sidebar
      const el   = id => document.getElementById(id);
      const name = data.identity?.fullName || "Doctor";

      if (el("sidebarName")) el("sidebarName").textContent = "Dr. " + name.split(" ")[0];
      if (el("sidebarVmed")) el("sidebarVmed").textContent = data.vmedId || "VMED-d-...";

      if (el("doctorAvatar")) {
        const parts = name.trim().split(" ");
        el("doctorAvatar").textContent = parts.length >= 2
          ? (parts[0][0] + parts[1][0]).toUpperCase()
          : parts[0].slice(0, 2).toUpperCase();
      }

      resolve(data);
    } catch (e) {
      console.error("doctorData load error:", e);
      resolve(null);
    }
  });
});