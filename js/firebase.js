// Firebase core
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

// Firebase services
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCGSBUI1tix0tDNPuZdUjnQ042_FtTl9I4",
  authDomain: "vmed-id.firebaseapp.com",
  projectId: "vmed-id",
  storageBucket: "vmed-id.firebasestorage.app",
  messagingSenderId: "50757215248",
  appId: "1:50757215248:web:3e0e61b4b9e123014a1695"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Export for use in other files
export { auth, db, storage };
