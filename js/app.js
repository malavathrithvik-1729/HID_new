import { db } from "./firebase.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function generateVMEDId(role, fullName) {
  const roleMap = { patient: "p", doctor: "d", government: "g" };
  const letter = roleMap[role] || "u";
  const name = fullName.toLowerCase().replace(/\s+/g, "").slice(0, 10);
  const num = Math.floor(1000 + Math.random() * 9000);
  return `VMED-${letter}-${name}-${num}`;
}

export async function savePatientApplication(user, data) {
  const vmedId = generateVMEDId("patient", data.fullName);

  // ── Step 1: Write the full user profile ──────────────────────────
  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    vmedId,
    role: "patient",
    status: "active",
    createdAt: serverTimestamp(),

    contact: {
      email: data.email || "",
      phone: data.phone || ""
    },

    identity: {
      fullName:   data.fullName   || "",
      fatherName: data.fatherName || "",
      gender:     data.gender     || "",
      dob:        data.dob        || "",
      aadhaar:    data.aadhaar    || "",
      abha:       data.abha       || "",
      address:    data.address    || ""
    },

    patientData: {
      occupation:  data.occupation  || "",
      bloodGroup:  data.bloodGroup  || "",
      conditions:  ""
    },

    // ── Pre-initialize all arrays so dashboard reads work correctly ──
    documents:         Array.isArray(data.documents) ? data.documents : [],
    vitalsHistory:     [],   // Required for vitals tracking & arrayUnion writes
    medications:       [],
    visits:            [],
    emergencyContacts: [],   // Required by SOS & Settings pages
    familyMembers:     [],   // Required by Family Link page
    familyLinks:       [],   // Required by health score calculation
    linkedDoctors:     [],   // Required by home stats & doctor dashboard
    isDonor:           false, // Required by Blood Donor page
    healthScore:       {}    // Pre-init to avoid null checks on first load
  });

  // ── Step 2: Write the public lookup index (used by login) ─────────
  // NOTE: vmedIndex must be written AFTER the users doc so getRole()
  // in security rules can resolve the user's role correctly.
  await setDoc(doc(db, "vmedIndex", vmedId), {
    uid:    user.uid,
    email:  data.email || "",
    // Also store inside contact{} so both lookup paths in auth.js work
    contact: { email: data.email || "" },
    role:   "patient",
    status: "active",
    vmedId,
    updatedAt: serverTimestamp()
  });

  return vmedId;
}

export async function saveDoctorApplication(user, data) {
  const vmedId = generateVMEDId("doctor", data.fullName);

  await setDoc(doc(db, "users", user.uid), {
    uid: user.uid,
    vmedId,
    role: "doctor",
    status: "active",
    createdAt: serverTimestamp(),

    contact: {
      email: data.email || "",
      phone: data.phone || ""
    },

    identity: {
      fullName:   data.fullName   || "",
      fatherName: data.fatherName || "",
      gender:     data.gender     || "",
      dob:        data.dob        || "",
      aadhaar:    data.aadhaar    || "",
      abha:       data.abha       || "",
      address:    data.address    || ""
    },

    doctorData: {
      specializations:  data.specializations  || "",
      practisingSince:  data.practisingSince  || "",
      qualification:    data.qualification    || ""
    },

    documents: Array.isArray(data.documents) ? data.documents : [],
    linkedPatients: []
  });

  await setDoc(doc(db, "vmedIndex", vmedId), {
    uid:    user.uid,
    email:  data.email || "",
    contact: { email: data.email || "" },
    role:   "doctor",
    status: "active",
    vmedId,
    updatedAt: serverTimestamp()
  });

  return vmedId;
}

export { generateVMEDId };
