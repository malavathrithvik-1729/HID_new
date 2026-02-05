import { auth, db } from "./firebase.js";

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================================================
   SIGNUP: Create Firebase Auth account
   (Used after OTP + Create Password)
   ========================================================= */
async function signupUser(email, password) {
  try {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    console.log("Signup successful:", userCredential.user.uid);
    return userCredential.user;

  } catch (error) {
    console.error("Signup error:", error.message);
    throw error;
  }
}

/* =========================================================
   LOGIN USING VMED ID + PASSWORD
   ========================================================= */
async function loginWithVMEDId(vmedId, password) {
  try {
    // 1️⃣ Find Firestore document using VMED ID
    const q = query(
      collection(db, "users"),
      where("vmedId", "==", vmedId)
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      throw new Error("Invalid V-Med ID");
    }

    // 🔑 IMPORTANT: capture document + UID
    const docSnap = snapshot.docs[0];
    const userData = docSnap.data();
    const firestoreUid = docSnap.id;

    const email = userData.contact?.email;
    const role = userData.role;

    if (!email) {
      throw new Error("Email not linked with this V-Med ID");
    }

    // 2️⃣ Login with Firebase Auth
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    // 🔐 SAFETY CHECK (CRITICAL)
    if (userCredential.user.uid !== firestoreUid) {
      throw new Error("Account mismatch. Please contact support.");
    }

    return {
      user: userCredential.user,
      role
    };

  } catch (error) {
    console.error("Login error:", error.message);
    throw error;
  }
}


/* =========================================================
   EXPORT FUNCTIONS
   ========================================================= */
export {
  signupUser,
  loginWithVMEDId
};
