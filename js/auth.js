import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

export async function signupUser(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function loginWithVMEDId(vmedId, password) {
  const indexSnap = await getDoc(doc(db, "vmedIndex", vmedId));
  if (!indexSnap.exists()) throw new Error("Invalid V-Med ID. Please check and try again.");
  const userData = indexSnap.data();
  const email = userData.contact?.email;
  const resolvedEmail = email || userData.email;
  if (!resolvedEmail) throw new Error("No email linked to this V-Med ID.");
  const cred = await signInWithEmailAndPassword(auth, resolvedEmail, password);
  if (userData.uid && cred.user.uid !== userData.uid) throw new Error("Account mismatch. Contact support.");
  return { user: cred.user, role: userData.role, status: userData.status };
}
