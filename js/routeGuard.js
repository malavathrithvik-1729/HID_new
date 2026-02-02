/* =========================================================
   ROUTE GUARD
   Protects dashboards based on:
   - Firebase Auth
   - Firestore role verification
   ========================================================= */

import { auth, db } from "./firebase.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================================================
   MAIN GUARD FUNCTION
   expectedRole: "patient" | "doctor" | "government"
   ========================================================= */
export function protectRoute(expectedRole) {
  onAuthStateChanged(auth, async (user) => {
    // ❌ Not logged in
    if (!user) {
      redirectToLogin();
      return;
    }

    try {
      const userRef = doc(db, "users", user.uid);
      const snap = await getDoc(userRef);

      // ❌ No Firestore record
      if (!snap.exists()) {
        await auth.signOut();
        redirectToLogin();
        return;
      }

      const data = snap.data();

      // ❌ Role mismatch
      if (data.role !== expectedRole) {
        redirectToUnauthorized();
        return;
      }

      // ✅ Access allowed
      console.log("Route access granted:", expectedRole);

    } catch (error) {
      console.error("Route guard error:", error);
      await auth.signOut();
      redirectToLogin();
    }
  });
}

/* =========================================================
   REDIRECT HELPERS
   ========================================================= */
function redirectToLogin() {
  window.location.replace("../login/login.html");
}

function redirectToUnauthorized() {
  alert("Unauthorized access. Redirecting...");
  window.location.replace("../login/login.html");
}
