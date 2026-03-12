import { auth, db } from "../../../../js/firebase.js";

import {
  doc,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  signOut,
  updateEmail,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* =========================
   WAIT UNTIL SETTINGS LOADS
========================= */

function waitForElement(id) {
  return new Promise(resolve => {
    const check = setInterval(() => {
      const el = document.getElementById(id);
      if (el) {
        clearInterval(check);
        resolve(el);
      }
    }, 100);
  });
}

/* =========================
   INIT SETTINGS
========================= */

async function initSettings() {

  const logoutBtn = await waitForElement("logoutBtn");

  const detailEmail = document.getElementById("detailEmail");
  const detailPhone = document.getElementById("detailPhone");
  const detailAadhaar = document.getElementById("detailAadhaar");

  const passwordModal = document.getElementById("passwordModal");
  const changePasswordBtn = document.getElementById("changePasswordBtn");
  const cancelPasswordBtn = document.getElementById("cancelPasswordBtn");
  const savePasswordBtn = document.getElementById("savePasswordBtn");

  const currentPasswordInput = document.getElementById("currentPassword");
  const newPasswordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  function maskAadhaar(aadhaar) {
    if (!aadhaar) return "--";
    return "XXXX-XXXX-" + aadhaar.slice(-4);
  }

  /* =========================
     LOAD USER DATA
  ========================= */
  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      window.location.href = "../../../../index.html";
      return;
    }

    const userRef = doc(db, "patients", user.uid);
    const snapshot = await getDoc(userRef);

    if (!snapshot.exists()) return;

    const data = snapshot.data();

    document.getElementById("detailName").textContent = data.fullName || "--";
    document.getElementById("detailFatherName").textContent = data.fatherName || "--";
    document.getElementById("detailGender").textContent = data.gender || "--";
    document.getElementById("detailDob").textContent = data.dob || "--";
    detailEmail.textContent = data.email || "--";
    detailPhone.textContent = data.phone || "--";
    detailAadhaar.textContent = maskAadhaar(data.aadhaar);
    document.getElementById("detailAbha").textContent = data.abha || "--";
  });

  /* =========================
     EDIT EMAIL / PHONE
  ========================= */
  document.addEventListener("click", async (event) => {

    const button = event.target.closest(".edit-btn");
    if (!button) return;

    const field = button.dataset.field;
    const user = auth.currentUser;
    if (!user) return;

    const userRef = doc(db, "patients", user.uid);

    try {

      if (field === "email") {
        const newEmail = prompt("Enter new email:", detailEmail.textContent);
        if (!newEmail) return;

        await updateEmail(user, newEmail);
        await updateDoc(userRef, { email: newEmail });
        detailEmail.textContent = newEmail;
      }

      if (field === "phone") {
        const newPhone = prompt("Enter new phone:", detailPhone.textContent);
        if (!newPhone) return;

        await updateDoc(userRef, { phone: newPhone });
        detailPhone.textContent = newPhone;
      }

      alert("Updated successfully ✅");

    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  });

  /* =========================
     PASSWORD MODAL
  ========================= */
  changePasswordBtn.addEventListener("click", () => {
    passwordModal.style.display = "flex";
  });

  cancelPasswordBtn.addEventListener("click", () => {
    passwordModal.style.display = "none";
  });

  savePasswordBtn.addEventListener("click", async () => {

    const user = auth.currentUser;
    if (!user) return;

    const currentPassword = currentPasswordInput.value;
    const newPassword = newPasswordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (newPassword !== confirmPassword) {
      alert("Passwords do not match");
      return;
    }

    try {
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );

      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);

      alert("Password updated successfully 🔒");
      passwordModal.style.display = "none";

    } catch (error) {
      console.error(error);
      alert(error.message);
    }
  });

  /* =========================
     LOGOUT
  ========================= */
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "../../../../index.html";
  });

}

/* =========================
   START WHEN SETTINGS LOADED
========================= */

initSettings();