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

    // 🔑 AI SPA HOOK (ONLY ADDITION)
    if (pageName === "ai" && window.initAIChat) {
      window.initAIChat();
    }

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
function initAIChat() {
  const input = document.getElementById("aiInput");
  const chat = document.getElementById("aiChat");
  const sendBtn = document.getElementById("aiSendBtn");

  if (!input || !chat || !sendBtn) {
    console.warn("AI elements not found");
    return;
  }

  sendBtn.onclick = async () => {
    const text = input.value.trim();
    if (!text) return;

    // User message
    chat.insertAdjacentHTML(
      "beforeend",
      `<div class="ai-message user">
        <div class="bubble">${text}</div>
      </div>`
    );

    input.value = "";
    chat.scrollTop = chat.scrollHeight;

    // Typing indicator
    const typing = document.createElement("div");
    typing.className = "ai-message ai";
    typing.innerHTML = `<div class="bubble">Typing…</div>`;
    chat.appendChild(typing);

    try {
      const res = await fetch("http://localhost:3000/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });

      const data = await res.json();
      typing.remove();

      chat.insertAdjacentHTML(
        "beforeend",
        `<div class="ai-message ai">
          <div class="bubble">${data.reply}</div>
        </div>`
      );

      chat.scrollTop = chat.scrollHeight;

    } catch (err) {
      console.error("AI error:", err);
      typing.remove();

      chat.insertAdjacentHTML(
        "beforeend",
        `<div class="ai-message ai">
          <div class="bubble">
            AI service is unavailable right now.
          </div>
        </div>`
      );
    }
  };
}

/* ===============================
   🔑 EXPOSE FOR SPA (IMPORTANT)
================================ */
window.initAIChat = initAIChat;

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
