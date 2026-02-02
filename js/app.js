/* =========================================================
   FIREBASE IMPORTS
   ========================================================= */
import { auth, db, storage } from "./firebase.js";

import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

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
   FILE UPLOAD HELPER (USED BY BOTH PATIENT & DOCTOR)
   ========================================================= */
async function uploadFile(userId, file, folder) {
  if (!file) return "";

  const fileRef = ref(storage, `${folder}/${userId}/${file.name}`);
  await uploadBytes(fileRef, file);
  return await getDownloadURL(fileRef);
}

/* =========================================================
   SAVE PATIENT APPLICATION
   ========================================================= */
async function savePatientApplication(user, formData) {
  const userRef = doc(db, "users", user.uid);

  // Mandatory upload
  const bloodReportURL = await uploadFile(
    user.uid,
    formData.bloodReport,
    "patient_reports"
  );

  // Optional uploads
  const allergyReportURL = await uploadFile(
    user.uid,
    formData.allergyReport,
    "patient_reports"
  );

  const surgeryReportURL = await uploadFile(
    user.uid,
    formData.surgeryReport,
    "patient_reports"
  );

  const medicationReportURL = await uploadFile(
    user.uid,
    formData.medicationReport,
    "patient_reports"
  );

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
  };

  await setDoc(userRef, data);
}

/* =========================================================
   SAVE DOCTOR APPLICATION
   ========================================================= */
async function saveDoctorApplication(user, formData) {
  const userRef = doc(db, "users", user.uid);

  // Mandatory certificate
  const certificateURL = await uploadFile(
    user.uid,
    formData.certificate,
    "doctor_certificates"
  );

  // Optional extra certificates
  let extraCertificateURLs = [];
  if (formData.extraCertificates && formData.extraCertificates.length > 0) {
    for (const file of formData.extraCertificates) {
      const url = await uploadFile(
        user.uid,
        file,
        "doctor_certificates"
      );
      extraCertificateURLs.push(url);
    }
  }

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
