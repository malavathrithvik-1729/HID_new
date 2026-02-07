import { updateDashboardUI } from "./userData.js";

/* ===============================
   LOAD SECTION CONTENT
================================ */
async function loadPage(pageName) {
  const contentArea = document.getElementById("content");
  if (!contentArea) return;

  try {
    console.log(`📂 Loading section: ${pageName}`);

    const response = await fetch(`sections/${pageName}.html`);
    if (!response.ok) throw new Error("Section not found");

    const html = await response.text();
    contentArea.innerHTML = html;

    // Sync user data after content loads
    updateDashboardUI();

  } catch (error) {
    console.error("Load Page Error:", error);
    contentArea.innerHTML =
      "<p style='color:red'>Error loading section.</p>";
  }
}

/* ===============================
   SIDEBAR TOGGLE
================================ */
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  sidebar.classList.toggle("collapsed");
}

/* ===============================
   LOAD SECTION + ACTIVE STATE
================================ */
function loadSection(button, page) {
  // Remove active class from all nav items
  document.querySelectorAll(".nav-item").forEach(btn =>
    btn.classList.remove("active")
  );

  // Set active on clicked item
  if (button) {
    button.classList.add("active");
  }

  // Load the page
  loadPage(page);
}

/* ===============================
   DEFAULT LOAD (HOME)
================================ */
function initDashboard() {
  // Highlight Home by default
  const homeBtn = document.querySelector(
    ".nav-item[data-page='home']"
  );
  if (homeBtn) {
    homeBtn.classList.add("active");
  }

  loadPage("home");
}

/* ===============================
   MAKE FUNCTIONS GLOBAL
================================ */
window.loadPage = loadPage;
window.loadSection = loadSection;
window.toggleSidebar = toggleSidebar;

/* ===============================
   INIT
================================ */
initDashboard();
