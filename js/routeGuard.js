import { auth, db } from "./firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export function protectRoute(expectedRole) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.replace("../login/login.html"); return; }
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists()) { await auth.signOut(); window.location.replace("../login/login.html"); return; }
      const data = snap.data();
      if (data.role !== expectedRole) {
        alert("Unauthorized access.");
        window.location.replace("../login/login.html");
      }
    } catch (e) {
      await auth.signOut();
      window.location.replace("../login/login.html");
    }
  });
}