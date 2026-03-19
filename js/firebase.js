import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCGSBUI1tix0tDNPuZdUjnQ042_FtTl9I4",
  authDomain: "vmed-id.firebaseapp.com",
  projectId: "vmed-id",
  storageBucket: "vmed-id.firebasestorage.app",
  messagingSenderId: "50757215248",
  appId: "1:50757215248:web:3e0e61b4b9e123014a1695"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };