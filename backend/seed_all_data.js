
import fetch from "node-fetch";

const API_KEY = "AIzaSyCGSBUI1tix0tDNPuZdUjnQ042_FtTl9I4";
const LOGIN_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
const FIRESTORE_URL = "https://firestore.googleapis.com/v1/projects/vmed-id/databases/(default)/documents";

const testUsers = [
  {
    "email": "dr.mehta@vmed.test",
    "password": "TestPass123!",
    "role": "doctor",
    "name": "Arjun Mehta",
    "uid": "Dn2GHzPnKYRxZVw5AIvd34erfQL2",
    "vmedId": "VMED-d-arjunmeht-1101",
    "identity": { "fullName": "Arjun Mehta", "dob": "1978-05-20", "gender": "Male", "bloodGroup": "O+", "aadhaar": "999988887777", "abha": "91-1111-2222-3333" }
  },
  {
    "email": "rahul.v@vmed.test",
    "password": "TestPass123!",
    "role": "patient",
    "name": "Rahul Verma",
    "uid": "O0JbcFulJwgoyqT17h8ssnKdlb52",
    "vmedId": "VMED-p-rahulverm-2202",
    "identity": { "fullName": "Rahul Verma", "dob": "1992-03-15", "gender": "Male", "bloodGroup": "O+", "aadhaar": "123412341234", "abha": "91-1234-5678-0001" }
  },
  {
    "email": "aditi.r@vmed.test",
    "password": "TestPass123!",
    "role": "patient",
    "name": "Aditi Rao",
    "uid": "fPVpW2WoMDNwXBiQJ2AcNcxP1P02",
    "vmedId": "VMED-p-aditirao-3303",
    "identity": { "fullName": "Aditi Rao", "dob": "1996-07-22", "gender": "Female", "bloodGroup": "B+", "aadhaar": "223344556677", "abha": "91-2233-4455-0002" }
  },
  {
    "email": "vikram.s@vmed.test",
    "password": "TestPass123!",
    "role": "patient",
    "name": "Vikram Singh",
    "uid": "dFDBl4cg42bwHusDGxOFGzfaa7L2",
    "vmedId": "VMED-p-vikramsin-4404",
    "identity": { "fullName": "Vikram Singh", "dob": "1972-11-10", "gender": "Male", "bloodGroup": "A-", "aadhaar": "334455667788", "abha": "91-3344-5566-0003" }
  },
  {
    "email": "meera.i@vmed.test",
    "password": "TestPass123!",
    "role": "patient",
    "name": "Meera Iyer",
    "uid": "2D3vxDvy8zXHzjKWHBris0ZVeTD3",
    "vmedId": "VMED-p-meeraiyer-5505",
    "identity": { "fullName": "Meera Iyer", "dob": "1984-09-05", "gender": "Female", "bloodGroup": "AB+", "aadhaar": "445566778899", "abha": "91-4455-6677-0004" }
  },
  {
    "email": "rohan.d@vmed.test",
    "password": "TestPass123!",
    "role": "patient",
    "name": "Rohan Das",
    "uid": "Ht37wGd91aZAD8GCTXZLwONfjER2",
    "vmedId": "VMED-p-rohandas-6606",
    "identity": { "fullName": "Rohan Das", "dob": "2002-12-30", "gender": "Male", "bloodGroup": "O-", "aadhaar": "556677889900", "abha": "91-5566-7788-0005" }
  }
];

async function seedUser(u) {
  console.log(`Signing in as ${u.email}...`);
  const loginRes = await fetch(LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: u.email, password: u.password, returnSecureToken: true })
  });
  const authData = await loginRes.json();
  if (!authData.idToken) throw new Error("Login failed");

  const idToken = authData.idToken;

  // 1. Create User Document
  const userDocRef = `users/${u.uid}`;
  const userDocBody = {
    fields: {
      uid: { stringValue: u.uid },
      vmedId: { stringValue: u.vmedId },
      role: { stringValue: u.role },
      status: { stringValue: "active" },
      contact: { mapValue: { fields: { email: { stringValue: u.email }, phone: { stringValue: "+91 99887 76655" } } } },
      identity: { mapValue: { fields: { 
        fullName: { stringValue: u.identity.fullName },
        dob: { stringValue: u.identity.dob },
        gender: { stringValue: u.identity.gender },
        aadhaar: { stringValue: u.identity.aadhaar },
        abha: { stringValue: u.identity.abha },
        address: { stringValue: "Test Address, Bangalore" },
        fatherName: { stringValue: "S. " + u.identity.fullName.split(' ')[1] }
      } } }
    }
  };

  if (u.role === "patient") {
    userDocBody.fields.patientData = { mapValue: { fields: { bloodGroup: { stringValue: u.identity.bloodGroup }, occupation: { stringValue: "Testing" } } } };
    userDocBody.fields.documents = { arrayValue: { values: [] } };
    userDocBody.fields.medications = { arrayValue: { values: [] } };
    userDocBody.fields.visits = { arrayValue: { values: [] } };
    userDocBody.fields.vitals = { mapValue: { fields: {} } };
  } else {
    userDocBody.fields.doctorData = { mapValue: { fields: { specializations: { stringValue: "Cardiology" }, practisingSince: { stringValue: "2010" }, qualification: { stringValue: "MBBS, MD" } } } };
    userDocBody.fields.patients = { arrayValue: { values: [] } };
  }

  console.log(`Creating user doc for ${u.name}...`);
  await fetch(`${FIRESTORE_URL}/users/${u.uid}?updateMask.fieldPaths=uid&updateMask.fieldPaths=vmedId&updateMask.fieldPaths=role&updateMask.fieldPaths=status&updateMask.fieldPaths=contact&updateMask.fieldPaths=identity&updateMask.fieldPaths=patientData&updateMask.fieldPaths=doctorData&updateMask.fieldPaths=documents&updateMask.fieldPaths=medications&updateMask.fieldPaths=visits&updateMask.fieldPaths=patients&updateMask.fieldPaths=vitals`, {
    method: "PATCH", // Use PATCH to create/update
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify(userDocBody)
  });

  // 2. Create V-Med Index
  console.log(`Creating index doc for ${u.vmedId}...`);
  const indexDocBody = {
    fields: {
      uid: { stringValue: u.uid },
      email: { stringValue: u.email },
      role: { stringValue: u.role },
      status: { stringValue: "active" },
      vmedId: { stringValue: u.vmedId }
    }
  };
  await fetch(`${FIRESTORE_URL}/vmedIndex/${u.vmedId}?updateMask.fieldPaths=uid&updateMask.fieldPaths=email&updateMask.fieldPaths=role&updateMask.fieldPaths=status&updateMask.fieldPaths=vmedId`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` },
    body: JSON.stringify(indexDocBody)
  });
}

async function run() {
  for (const u of testUsers) {
    try {
      await seedUser(u);
      console.log(`✅ Success for ${u.name}`);
    } catch (e) {
      console.error(`❌ Error for ${u.name}: ${e.message}`);
    }
  }
}

run();
