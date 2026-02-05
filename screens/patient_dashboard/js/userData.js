import { auth, db } from "../../../js/firebase.js"; 
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.vmedUser = null; 

onAuthStateChanged(auth, async (user) => {
    if (user) {
        const docRef = doc(db, "users", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            window.vmedUser = docSnap.data();
            updateDashboardUI(); 
        }
    } else {
        window.location.href = "../login/login.html";
    }
});

export function updateDashboardUI() {
    const data = window.vmedUser;
    if (!data) return;

    // Sidebar
    setText("userName", data.identity.fullName);
    setText("userVmed", data.vmedId);

    // If main content isn't loaded yet, stop here
    if (!document.getElementById("detailName")) return;

    // Main Content
    setText("greetingText", `Welcome back, ${data.identity.fullName.split(' ')[0]} 👋`);
    setText("detailName", data.identity.fullName);
    setText("detailFatherName", data.identity.fatherName);
    setText("detailGender", data.identity.gender);
    setText("detailDob", data.identity.dob);
    setText("detailEmail", data.contact.email);
    setText("detailPhone", data.contact.phone);
    
    const aadhaar = data.identity.aadhaar;
    setText("detailAadhaar", aadhaar ? `•••• •••• ${aadhaar.slice(-4)}` : "Not Linked");
    setText("detailAbha", data.identity.abha || "Not Generated");
}

// ONLY ONE COPY OF THIS FUNCTION
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}