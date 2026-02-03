import { auth, db } from "../../js/firebase.js";
import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* =========================================================
   FETCH USER DATA & UPDATE SIDEBAR + GREETING
   ========================================================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Not logged in → redirect
    window.location.href = "../login/login.html";
    return;
  }

  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
      alert("User record not found.");
      return;
    }

    const data = snap.data();

    // Sidebar elements
    const nameEl = document.getElementById("userName");
    const vmedEl = document.getElementById("userVmed");

    if (nameEl) {
      nameEl.innerText = data.identity?.fullName || "Patient";
    }

    if (vmedEl) {
      vmedEl.innerText = data.vmedId || "VMED-XXXX";
    }

    // Greeting
    updateGreeting(data.identity?.fullName || "Patient");

  } catch (err) {
    console.error("Failed to load user data:", err);
    alert("Unable to load user data.");
  }
});

/* =========================================================
   GREETING (WISHES)
   ========================================================= */
function updateGreeting(name) {
  const greetingEl = document.getElementById("greetingText");
  if (!greetingEl) return;

  const hour = new Date().getHours();
  let wish = "Hello";

  if (hour >= 5 && hour < 12) wish = "Good Morning";
  else if (hour >= 12 && hour < 17) wish = "Good Afternoon";
  else wish = "Good Evening";

  greetingEl.innerText = `${wish}, ${name} 👋`;
}
