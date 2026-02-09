function initAIChat() {
  const input = document.getElementById("aiInput");
  const chat = document.getElementById("aiChat");
  const sendBtn = document.getElementById("aiSendBtn");

  function formatAIText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") // bold
    .replace(/\*(.*?)\*/g, "<em>$1</em>")             // italic
    .replace(/\n/g, "<br>");                          // new lines
}

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

// 🔑 expose for SPA
window.initAIChat = initAIChat;
