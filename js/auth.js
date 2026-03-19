import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection, query, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export async function signupUser(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function loginWithVMEDId(vmedId, password) {
  const q = query(collection(db, "users"), where("vmedId", "==", vmedId));
  const snap = await getDocs(q);
  if (snap.empty) throw new Error("Invalid V-Med ID. Please check and try again.");
  const docSnap = snap.docs[0];
  const userData = docSnap.data();
  const email = userData.contact?.email;
  if (!email) throw new Error("No email linked to this V-Med ID.");
  const cred = await signInWithEmailAndPassword(auth, email, password);
  if (cred.user.uid !== docSnap.id) throw new Error("Account mismatch. Contact support.");
  return { user: cred.user, role: userData.role, status: userData.status };
}