import { auth } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

export async function logoutUser() {
  try {
    await signOut(auth);
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace("../login/login.html");
  } catch (error) {
    console.error("Logout failed:", error);
    window.location.replace("../login/login.html");
  }
}
