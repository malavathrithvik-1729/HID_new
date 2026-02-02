// =========================================================
// FIREBASE CORE
// =========================================================
import { initializeApp } from
"https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

// =========================================================
// FIREBASE SERVICES (ALLOWED ONLY)
// =========================================================
import { getAuth } from
"https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { getFirestore } from
"https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// =========================================================
// FIREBASE CONFIGURATION
// =========================================================
const firebaseConfig = {
  apiKey: "AIzaSyCGSBUI1tix0tDNPuZdUjnQ042_FtTl9I4",
  authDomain: "vmed-id.firebaseapp.com",
  projectId: "vmed-id",
  messagingSenderId: "50757215248",
  appId: "1:50757215248:web:3e0e61b4b9e123014a1695"
};

// =========================================================
// INITIALIZE FIREBASE
// =========================================================
const app = initializeApp(firebaseConfig);

// =========================================================
// INITIALIZE SERVICES
// =========================================================
const auth = getAuth(app);
const db = getFirestore(app);

// =========================================================
// EXPORTS (STRICT & SAFE)
// =========================================================
export { auth, db };
