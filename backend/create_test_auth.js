
import fetch from "node-fetch";

const API_KEY = "AIzaSyCGSBUI1tix0tDNPuZdUjnQ042_FtTl9I4"; 
const SIGNUP_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${API_KEY}`;

const usersToCreate = [
  { email: "dr.mehta@vmed.test", password: "TestPass123!", role: "doctor", name: "Arjun Mehta" },
  { email: "rahul.v@vmed.test", password: "TestPass123!", role: "patient", name: "Rahul Verma" },
  { email: "aditi.r@vmed.test", password: "TestPass123!", role: "patient", name: "Aditi Rao" },
  { email: "vikram.s@vmed.test", password: "TestPass123!", role: "patient", name: "Vikram Singh" },
  { email: "meera.i@vmed.test", password: "TestPass123!", role: "patient", name: "Meera Iyer" },
  { email: "rohan.d@vmed.test", password: "TestPass123!", role: "patient", name: "Rohan Das" },
];

async function createAuthUser(user) {
  console.log(`Creating Auth user: ${user.email}...`);
  const res = await fetch(SIGNUP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: user.email,
      password: user.password,
      returnSecureToken: true
    })
  });
  const data = await res.json();
  if (data.error) {
    if (data.error.message === "EMAIL_EXISTS") {
      console.log(`User ${user.email} already exists. Finding UID...`);
      // Note: We can't easily find UID via REST without admin key or signing in.
      // But we can try signing in.
      const loginUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
      const loginRes = await fetch(loginUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, password: user.password, returnSecureToken: true })
      });
      const loginData = await loginRes.json();
      return loginData.localId;
    }
    throw new Error(data.error.message);
  }
  return data.localId;
}

async function run() {
  const results = [];
  for (const u of usersToCreate) {
    try {
      const uid = await createAuthUser(u);
      results.push({ ...u, uid });
      console.log(`✅ ${u.email} -> ${uid}`);
    } catch (e) {
      console.error(`❌ Failed for ${u.email}: ${e.message}`);
    }
  }
  console.log("\n--- COPY THIS JSON FOR NEXT STEP ---");
  console.log(JSON.stringify(results, null, 2));
}

run();
