import { updateDashboardUI } from "./userData.js";

async function loadPage(pageName) {
    const contentArea = document.getElementById("content");
    if (!contentArea) return;

    try {
        console.log(`📂 Loading: ${pageName}`);
        const response = await fetch(`sections/${pageName}.html`);
        if (!response.ok) throw new Error("Section not found");
        const html = await response.text();

        contentArea.innerHTML = html;
        
        // Sync data after HTML loads
        updateDashboardUI();

    } catch (error) {
        console.error("Load Page Error:", error);
        contentArea.innerHTML = "<p>Error loading section.</p>";
    }
}

// 🔥 CRITICAL: Make the function global so index.html can see it
window.loadPage = loadPage;

// Load home by default
loadPage('home');