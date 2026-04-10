import { db } from "./firebase.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function generateVMEDId(role, fullName) {
  const roleMap = { patient: "p", doctor: "d", government: "g" };
  const letter = roleMap[role];
  const name = fullName.toLowerCase().replace(/\s+/g, "").slice(0, 10);
  const num = Math.floor(1000 + Math.random() * 9000);
  return `VMED-${letter}-${name}-${num}`;
}

export async function savePatientApplication(user, data) {
  const vmedId = generateVMEDId("patient", data.fullName);
  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    vmedId,
    role: "patient",
    status: "active",
    createdAt: serverTimestamp(),
    contact: { email: data.email || "", phone: data.phone || "" },
    identity: {
      fullName: data.fullName,
      fatherName: data.fatherName,
      gender: data.gender,
      dob: data.dob,
      aadhaar: data.aadhaar,
      abha: data.abha,
      address: data.address
    },
    patientData: { occupation: data.occupation || "", bloodGroup: data.bloodGroup || "" },
    documents: Array.isArray(data.documents) ? data.documents : [],
    vitals: {},
    medications: [],
    visits: []
  });
  await setDoc(doc(db, "vmedIndex", vmedId), {
    uid: user.uid,
    email: data.email || "",
    role: "patient",
    status: "active",
    vmedId,
    updatedAt: serverTimestamp()
  });
}

export async function saveDoctorApplication(user, data) {
  const vmedId = generateVMEDId("doctor", data.fullName);
  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    vmedId,
    role: "doctor",
    status: "active",
    createdAt: serverTimestamp(),
    contact: { email: data.email || "", phone: data.phone || "" },
    identity: {
      fullName: data.fullName,
      fatherName: data.fatherName,
      gender: data.gender,
      dob: data.dob,
      aadhaar: data.aadhaar,
      abha: data.abha,
      address: data.address
    },
    doctorData: {
      specializations: data.specializations,
      practisingSince: data.practisingSince,
      qualification: data.qualification || ""
    },
    documents: Array.isArray(data.documents) ? data.documents : [],
    patients: []
  });
  await setDoc(doc(db, "vmedIndex", vmedId), {
    uid: user.uid,
    email: data.email || "",
    role: "doctor",
    status: "active",
    vmedId,
    updatedAt: serverTimestamp()
  });
}

export { generateVMEDId };
