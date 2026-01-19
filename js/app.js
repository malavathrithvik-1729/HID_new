
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

  // Normalize name
  const namePart = fullName
    .toLowerCase()
    .replace(/\s+/g, "");

  // Random number (can be improved later)
  const numberPart = Math.floor(100 + Math.random() * 900);

  return `VMED-${roleLetter}-${namePart}-${numberPart}`;
}

import { auth, db } from "./firebase.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =========================================================
   SAVE PATIENT APPLICATION
   ========================================================= */
async function savePatientApplication(user, formData) {
  const userRef = doc(db, "users", user.uid);

  const data = {
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
      occupation: formData.occupation || "",
      reports: {
        bloodReport: "pending_upload",
        allergyReport: "optional",
        surgeryReport: "optional",
        medicationReport: "optional"
      }
    }
  };

  await setDoc(userRef, data);
}

/* =========================================================
   SAVE DOCTOR APPLICATION
   ========================================================= */
async function saveDoctorApplication(user, formData) {
  const userRef = doc(db, "users", user.uid);

  const data = {
    role: "doctor",
    status: "pending",
    createdAt: serverTimestamp(),
    vmedId: generateVMEDId("doctor", formData.fullName),

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
      practisingSince: formData.practisingSince,
      certificates: "pending_upload"
    }
  };

  await setDoc(userRef, data);
}

/* =========================================================
   EXPORT
   ========================================================= */
export {
  savePatientApplication,
  saveDoctorApplication,
  generateVMEDId
};
