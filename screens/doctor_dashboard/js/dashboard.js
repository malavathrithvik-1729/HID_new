/* =========================================================
   DOCTOR DASHBOARD — SPA Controller
   ========================================================= */

/* =========================================================
   LOAD SECTION
   ========================================================= */
async function loadPage(pageName) {
  const content = document.getElementById("content");
  if (!content) return;

  try {
    console.log(`📂 Loading section: ${pageName}`);
    const res = await fetch(`sections/${pageName}.html`);
    if (!res.ok) throw new Error("Section not found");
    const html = await res.text();
    content.innerHTML = html;

    // Section-specific hooks
    if (pageName === "home") initHome();
    if (pageName === "ai" && window.initDoctorAI) window.initDoctorAI();
    if (pageName === "settings" && window.initDoctorSettings) window.initDoctorSettings();

  } catch (err) {
    console.error("Load page error:", err);
    content.innerHTML = `<p style='color:red;padding:20px'>Error loading section.</p>`;
  }
}

/* =========================================================
   HOME INIT — greet doctor
   ========================================================= */
function initHome() {
  const greet = document.getElementById("greetDoctor");
  if (!greet) return;

  const data = window.currentDoctorData;
  const name = data?.identity?.fullName || "Doctor";
  const hour = new Date().getHours();
  const timeGreet = hour < 12 ? "Good Morning" : hour < 17 ? "Good Afternoon" : "Good Evening";

  greet.textContent = `${timeGreet}, Dr. ${name.split(" ")[0]} 👋`;
}

/* =========================================================
   SIDEBAR TOGGLE
   ========================================================= */
function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (sidebar) sidebar.classList.toggle("collapsed");
}

/* =========================================================
   LOAD SECTION + ACTIVE STATE
   ========================================================= */
function loadSection(button, page) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  if (button) button.classList.add("active");
  loadPage(page);
}

/* =========================================================
   DEFAULT LOAD
   ========================================================= */
function initDashboard() {
  const homeBtn = document.querySelector(".nav-item[data-page='home']");
  if (homeBtn) homeBtn.classList.add("active");
  loadPage("home");
}

/* =========================================================
   AI CHAT
   ========================================================= */
function parseMarkdown(text) {
  return text
    .replace(/^### \*\*(.*?)\*\*/gm, '<h3>$1</h3>')
    .replace(/^### (.*?)$/gm, '<h3>$1</h3>')
    .replace(/^#### \*\*(.*?)\*\*/gm, '<h4>$1</h4>')
    .replace(/^#### (.*?)$/gm, '<h4>$1</h4>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>(\n|$))+/gs, match => `<ul>${match}</ul>`)
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, ' ');
}

function initDoctorAI() {
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

    chat.insertAdjacentHTML("beforeend", `
      <div class="ai-message user">
        <div class="bubble">${text}</div>
      </div>`);
    input.value = "";
    chat.scrollTop = chat.scrollHeight;

    const typing = document.createElement("div");
    typing.className = "ai-message ai";
    typing.innerHTML = `<div class="bubble">Typing…</div>`;
    chat.appendChild(typing);
    chat.scrollTop = chat.scrollHeight;

    try {
      const res = await fetch("http://localhost:3000/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });

      const data = await res.json();
      typing.remove();

      const html = parseMarkdown(data.reply);
      chat.insertAdjacentHTML("beforeend", `
        <div class="ai-message ai">
          <div class="bubble ai-formatted">${html}</div>
        </div>`);
      chat.scrollTop = chat.scrollHeight;

    } catch (err) {
      console.error("AI error:", err);
      typing.remove();
      chat.insertAdjacentHTML("beforeend", `
        <div class="ai-message ai">
          <div class="bubble">⚠️ AI service unavailable. Please try again.</div>
        </div>`);
      chat.scrollTop = chat.scrollHeight;
    }
  };

  // Enter key support
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") sendBtn.click();
  });
}

/* =========================================================
   EXPOSE GLOBALS
   ========================================================= */
window.loadPage     = loadPage;
window.loadSection  = loadSection;
window.toggleSidebar = toggleSidebar;
window.initDoctorAI = initDoctorAI;

/* =========================================================
   INIT
   ========================================================= */
initDashboard();