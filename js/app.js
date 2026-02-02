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
   FILE UPLOAD HELPER (DISABLED — MANUAL DOCUMENTS ONLY)
   ========================================================= */
async function uploadFile() {
  // ❌ Firebase Storage removed
  // ✅ Documents are added manually via Firestore console
  return "";
}

/* =========================================================
   SAVE PATIENT APPLICATION
   ========================================================= */
async function savePatientApplication(user, formData) {
  const userRef = doc(db, "users", user.uid);

  // ❌ Uploads disabled → empty placeholders
  const bloodReportURL = "";
  const allergyReportURL = "";
  const surgeryReportURL = "";
  const medicationReportURL = "";

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
        bloodReport: bloodReportURL,
        allergyReport: allergyReportURL,
        surgeryReport: surgeryReportURL,
        medicationReport: medicationReportURL
      }
    }

    // documents will be added manually later
  };

  await setDoc(userRef, data);
}

/* =========================================================
   SAVE DOCTOR APPLICATION
   ========================================================= */
async function saveDoctorApplication(user, formData) {
  const userRef = doc(db, "users", user.uid);

  // ❌ Uploads disabled → empty placeholders
  const certificateURL = "";
  const extraCertificateURLs = [];

  const data = {
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
      practisingSince: formData.practisingSince,
      certificates: {
        main: certificateURL,
        additional: extraCertificateURLs
      }
    }

    // certificates verified & inserted manually by admin
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
