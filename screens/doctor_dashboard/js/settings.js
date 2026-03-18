/* =========================================================
   DOCTOR SETTINGS
   ========================================================= */
import { auth, db } from "../../../js/firebase.js";
import {
  signOut,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* =========================================================
   INIT — fetch fresh from Firestore, don't rely on window
   ========================================================= */
async function initDoctorSettings() {
  const user = await new Promise(resolve => {
    onAuthStateChanged(auth, resolve);
  });

  if (!user) return;

  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) return;

  const data = snap.data();

  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val || "--";
  };

  set("detailName",       data.identity?.fullName);
  set("detailFatherName", data.identity?.fatherName);
  set("detailGender",     data.identity?.gender);
  set("detailDob",        data.identity?.dob);
  set("detailEmail",      data.contact?.email);
  set("detailPhone",      data.contact?.phone);
  set("detailSpec",       data.doctorData?.specializations);
  set("detailSince",      data.doctorData?.practisingSince);
  set("detailVmed",       data.vmedId);

  const aadhaar = data.identity?.aadhaar;
  set("detailAadhaar", aadhaar ? "XXXX-XXXX-" + aadhaar.slice(-4) : "--");

  // Logout
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    sessionStorage.clear();
    await signOut(auth);
    window.location.replace("../login/login.html");
  });

  // Change password
  const modal     = document.getElementById("passwordModal");
  document.getElementById("changePasswordBtn")?.addEventListener("click", () => {
    modal.style.display = "flex";
  });
  document.getElementById("cancelPasswordBtn")?.addEventListener("click", () => {
    modal.style.display = "none";
  });
  document.getElementById("savePasswordBtn")?.addEventListener("click", async () => {
    const curr = document.getElementById("currentPassword").value;
    const next = document.getElementById("newPassword").value;
    const conf = document.getElementById("confirmPassword").value;

    if (next !== conf) { alert("Passwords do not match"); return; }

    try {
      const cred = EmailAuthProvider.credential(user.email, curr);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, next);
      alert("Password updated successfully 🔒");
      modal.style.display = "none";
    } catch (err) {
      alert(err.message);
    }
  });
}

/* =========================================================
   AUTO-RUN when this module loads (section just rendered)
   ========================================================= */
initDoctorSettings();