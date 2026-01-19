import { auth } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

/* =========================================================
   SIGNUP: Create Firebase Auth account
   Called after OTP + Create Password page
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
   LOGIN: Email + Password
   ========================================================= */
async function loginUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    console.log("Login successful:", userCredential.user.uid);
    return userCredential.user;

  } catch (error) {
    console.error("Login error:", error.message);
    throw error;
  }
}

/* =========================================================
   EXPORT FUNCTIONS
   ========================================================= */
export { signupUser, loginUser };
