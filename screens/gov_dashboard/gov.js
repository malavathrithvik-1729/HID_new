import { auth, db } from "../../js/firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

window.showTab = function(btn, tabId) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  
  const overviewTab = document.getElementById('overviewTab');
  const usersTab = document.getElementById('usersTab');
  
  if (tabId === 'overview') {
    if (overviewTab) overviewTab.style.display = 'block';
    if (usersTab) usersTab.style.display = 'none';
  } else if (tabId === 'users') {
    if (overviewTab) overviewTab.style.display = 'none';
    if (usersTab) usersTab.style.display = 'block';
  }
};

window.handleLogout = async function() {
  await signOut(auth);
  window.location.replace("../login/login.html");
};

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      const uData = userSnap.data();
      const nameEl = document.getElementById("govName");
      const vmedEl = document.getElementById("govVmed");
      if (nameEl) nameEl.textContent = uData.identity?.fullName || "Government Official";
      if (vmedEl) vmedEl.textContent = uData.vmedId || "VMED-g-official";
    }

    // Load statistics
    const usersSnap = await getDocs(collection(db, "users"));
    let patients = 0;
    let doctors = 0;
    const usersList = [];

    usersSnap.forEach(d => {
      const u = d.data();
      if (u.role === 'patient') patients++;
      if (u.role === 'doctor') doctors++;
      usersList.push(u);
    });

    const totalUsersEl = document.getElementById("totalUsersCount");
    const totalPatientsEl = document.getElementById("totalPatientsCount");
    const totalDoctorsEl = document.getElementById("totalDoctorsCount");
    
    if (totalUsersEl) totalUsersEl.textContent = usersSnap.size;
    if (totalPatientsEl) totalPatientsEl.textContent = patients;
    if (totalDoctorsEl) totalDoctorsEl.textContent = doctors;

    // Render Users Table / List
    const listContainer = document.getElementById("usersListContainer");
    if (listContainer) {
      listContainer.innerHTML = usersList.map(u => `
        <div class="user-row">
          <div class="user-avatar" style="background:${u.role === 'doctor' ? '#1a4a8a' : '#1a6b4a'}">
            ${(u.identity?.fullName || u.vmedId || 'U').charAt(0).toUpperCase()}
          </div>
          <div class="user-info">
            <strong>${u.identity?.fullName || 'User'} (${u.vmedId || 'No ID'})</strong>
            <span>${u.contact?.email || 'No email'}</span>
          </div>
          <span class="role-badge ${u.role === 'doctor' ? 'role-doctor' : 'role-patient'}">
            ${(u.role || 'user').toUpperCase()}
          </span>
        </div>
      `).join('');
    }
  } catch (e) {
    console.error("Gov dashboard error:", e);
  }
});
