import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function protectRoute(expectedRole) {
  onAuthStateChanged(auth, async (user) => {
    // No user at all → go to login
    if (!user) {
      window.location.replace("../login/login.html");
      return;
    }

    try {
      const snap = await getDoc(doc(db, "users", user.uid));

      // User doc missing entirely → account not fully created → go to login
      if (!snap.exists()) {
        await auth.signOut();
        window.location.replace("../login/login.html");
        return;
      }

      const data = snap.data();

      // Wrong role for this page
      if (data.role !== expectedRole) {
        alert("Unauthorized access. You will be redirected.");
        window.location.replace("../login/login.html");
      }

    } catch (e) {
      console.error("Route guard error:", e);

      // ⚠️ ONLY force-logout on an explicit permission denial.
      // Network errors or transient Firebase errors should NOT kick
      // the user out — they may just have poor connectivity.
      if (e.code === "permission-denied" || e.code === "unauthenticated") {
        await auth.signOut();
        window.location.replace("../login/login.html");
      }
      // Otherwise: silently allow the user to stay. The page's own
      // data-loading logic will show an appropriate error message.
    }
  });
}