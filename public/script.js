// script.js
const chatLog = document.getElementById("chat-log");
const form = document.getElementById("chat-form");
const input = document.getElementById("user-input");

let projectInput = "";
let timelineInput = "";
let budgetInput = "";
let followUpAnswers = [];
let stage = 0;
let currentQuestion = "";

const appendMessage = (sender, text) => {
  const messageDiv = document.createElement("div");
  messageDiv.className = "chat-message";
  messageDiv.innerHTML = `<strong>${sender}:</strong> ${text}`;
  chatLog.appendChild(messageDiv);
  chatLog.scrollTop = chatLog.scrollHeight;
};

const isValidAnswer = (text) => {
  const trimmed = text.trim();
  if (trimmed.length < 2) return false;
  if (/^[0-9]+$/.test(trimmed)) return false;
  if (/^[a-zA-Z]{4,}$/.test(trimmed) && !/[aeiou]/i.test(trimmed)) return false;
  return true;
};

// Greet the user when the page loads
appendMessage(
  "🤖 AI",
  "Hello! Tell me your project or idea and I'll help you break them down to different tasks and briefs!"
);

const renderBreakdown = (data) => {
  try {
    const parsed = typeof data === "string" ? JSON.parse(data) : data;

    console.log("🔍 Raw AI Breakdown Response:", parsed);

    const briefContainer = document.getElementById("brief-container");
    if (!briefContainer) throw new Error("brief-container div not found in HTML");

    briefContainer.innerHTML = ""; // clear old output

    const projectSection = document.createElement("div");
    projectSection.className = "brief-breakdown";

    const title = document.createElement("h2");
    title.textContent = parsed.projectName || "Untitled Project";
    projectSection.appendChild(title);

    const desc = document.createElement("p");
    desc.innerHTML = `<strong>Description:</strong> ${parsed.projectDescription || "-"}`;
    projectSection.appendChild(desc);

    const timeline = document.createElement("p");
    timeline.innerHTML = `<strong>Timeline:</strong> ${parsed.totalProjectTimeline || "-"}`;
    projectSection.appendChild(timeline);

    const budget = document.createElement("p");
    budget.innerHTML = `<strong>Budget:</strong> ${parsed.totalBudget || "-"}`;
    projectSection.appendChild(budget);

    briefContainer.appendChild(projectSection);

    // ✅ Updated to support all possible key names from AI
    const steps = parsed.steps || parsed.briefs || parsed.Briefs || [];
    if (!Array.isArray(steps) || steps.length === 0) {
      const errorNote = document.createElement("p");
      errorNote.style.color = "red";
      errorNote.textContent = "⚠️ No briefs (steps) found in the AI response.";
      briefContainer.appendChild(errorNote);
      return;
    }

    steps.forEach((step, idx) => {
      const card = document.createElement("div");
      card.className = "brief-card";
      card.innerHTML = `
        <h3>${step.step || idx + 1}: ${step.briefName || "Untitled Step"}</h3>
        <p><strong>Brief Description:</strong> ${step.briefDescription || "-"}</p>
        <p><strong>Service:</strong> ${step.service || "-"}</p>
        <p><strong>Subservice:</strong> ${step.subservice || "-"}</p>
        <p><strong>Deliverables:</strong> ${Array.isArray(step.deliverables) ? step.deliverables.join(", ") : step.deliverables || "-"}</p>
        <p><strong>Timeline:</strong> ${step.timeline || "-"}</p>
        <p><strong>Cost:</strong> ${step.estimatedCost || "-"}</p>
        <p><strong>Overall Project Description:</strong> ${step.overallProjectDescription || parsed.projectDescription || "-"}</p>
      `;
      briefContainer.appendChild(card);
    });

  } catch (err) {
    console.error("❌ Failed to parse and render breakdown:", err);
  }
};

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = input.value.trim();
  if (!message) return;

  appendMessage("🧠 You", message);
  input.value = "";

  if (stage === 0) {
    projectInput = message;
    appendMessage("🤖 AI", "Let's align on your project scope. What's your ideal project timeline?");
    stage = 1;
  } else if (stage === 1) {
    timelineInput = message;
    appendMessage("🤖 AI", "Great! Now, what's your estimated total budget for this project?");
    stage = 2;
  } else if (stage === 2) {
    budgetInput = message;
    appendMessage("🤖 AI", "Awesome, thinking of the best questions to clarify your project...");
    const res = await fetch("/api/get-next-question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userInput: projectInput,
        projectTimeline: timelineInput,
        projectBudget: budgetInput,
        answers: followUpAnswers,
      }),
    });
    const data = await res.json();
    currentQuestion = data.question;
    stage = 3;
    appendMessage("🤖 AI", currentQuestion);
  } else if (stage === 3) {
    if (!isValidAnswer(message)) {
      appendMessage("🤖 AI", "I didn't quite get that. Could you please rephrase?");
      return;
    }
    followUpAnswers.push({ question: currentQuestion, answer: message });
    const res = await fetch("/api/get-next-question", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userInput: projectInput,
        projectTimeline: timelineInput,
        projectBudget: budgetInput,
        answers: followUpAnswers,
      }),
    });
    const data = await res.json();
    if (data.done) {
      appendMessage("🤖 AI", "Generating your project breakdown... This may take a few seconds.");
      const resBrief = await fetch("/api/get-briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInput: projectInput,
          projectTimeline: timelineInput,
          projectBudget: budgetInput,
          answers: followUpAnswers,
        }),
      });
      const briefData = await resBrief.json();
      appendMessage("🤖 AI", "Here's your project breakdown:");
      renderBreakdown(briefData.breakdown);
      stage = 4;
      appendMessage("🤖 AI", "Would you like to finalize this plan or make more edits?");
    } else {
      currentQuestion = data.question;
      appendMessage("🤖 AI", currentQuestion);
    }
  } else if (stage === 4) {
    if (/finalize/i.test(message) || /i'm satisfied/i.test(message)) {
      appendMessage("🤖 AI", "Great! Finalizing your plan. Thank you!");
      stage = 5;
    } else {
      appendMessage("🤖 AI", "Updating your plan as requested...");
      const res = await fetch("/api/update-briefs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userInput: projectInput,
          projectTimeline: timelineInput,
          projectBudget: budgetInput,
          answers: followUpAnswers,
          feedback: message,
        }),
      });
      const data = await res.json();
      renderBreakdown(data.breakdown);
      appendMessage("🤖 AI", "Would you like to finalize this plan or make more edits?");
    }
  } else {
    appendMessage("🤖 AI", "Conversation ended. Refresh to start over.");
  }
});
