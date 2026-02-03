/* =========================================================
   FIREBASE IMPORTS
   ========================================================= */
import { auth, db } from "./firebase.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================================================
   VMED ID GENERATOR
   ========================================================= */
function generateVMEDId(role, fullName) {
  const roleMap = {
    patient: "p",
    doctor: "d",
    government: "g"
  };

  const roleLetter = roleMap[role];
  if (!roleLetter) {
    throw new Error("Invalid role for VMED ID generation");
  }

  const namePart = fullName
    .toLowerCase()
    .replace(/\s+/g, "");

  const numberPart = Math.floor(100 + Math.random() * 900);

  return `VMED-${roleLetter}-${namePart}-${numberPart}`;
}

/* =========================================================
   SAVE PATIENT APPLICATION
   (DOCUMENT URLs STORED IN FIRESTORE)
   ========================================================= */
async function savePatientApplication(user, formData) {
  const userRef = doc(db, "users", user.uid);

  const data = {
    uid: user.uid,
    vmedId: generateVMEDId("patient", formData.fullName),
    role: "patient",
    status: "pending",
    createdAt: serverTimestamp(),

    contact: {
      email: formData.email || "",
      phone: formData.phone || ""
    },

    identity: {
      fullName: formData.fullName,
      fatherName: formData.fatherName,
      gender: formData.gender,
      dob: formData.dob,
      aadhaar: formData.aadhaar,
      abha: formData.abha,
      address: formData.address
    },

    patientData: {
      occupation: formData.occupation || ""
    },

    // ✅ DOCUMENT REFERENCES (GOOGLE DRIVE URLs)
    documents: Array.isArray(formData.documents)
      ? formData.documents
      : []
  };

  await setDoc(userRef, data);
}

/* =========================================================
   SAVE DOCTOR APPLICATION
   (CERTIFICATE URLs STORED IN FIRESTORE)
   ========================================================= */
async function saveDoctorApplication(user, formData) {
  const userRef = doc(db, "users", user.uid);

  const data = {
    uid: user.uid,
    vmedId: generateVMEDId("doctor", formData.fullName),
    role: "doctor",
    status: "pending",
    createdAt: serverTimestamp(),

    contact: {
      email: formData.email || "",
      phone: formData.phone || ""
    },

    identity: {
      fullName: formData.fullName,
      fatherName: formData.fatherName,
      gender: formData.gender,
      dob: formData.dob,
      aadhaar: formData.aadhaar,
      abha: formData.abha,
      address: formData.address
    },

    doctorData: {
      specializations: formData.specializations,
      practisingSince: formData.practisingSince
    },

    // ✅ CERTIFICATE REFERENCES (GOOGLE DRIVE URLs)
    documents: Array.isArray(formData.documents)
      ? formData.documents
      : []
  };

  await setDoc(userRef, data);
}

/* =========================================================
   EXPORTS
   ========================================================= */
export {
  savePatientApplication,
  saveDoctorApplication,
  generateVMEDId
};
