import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// Fetch Airtable Data
export const fetchAirtableData = async () => {
  const url = `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${process.env.AIRTABLE_TABLE_NAME}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.AIRTABLE_API_KEY}` },
  });
  const data = await response.json();
  return data.records;
};

// Generate Refined Details (Initial 6 questions)
export const getRefinedDetails = async (userInput, timeline, budget, options) => {
  const opts = Array.isArray(options) ? options : [];
  const promptData = opts.length > 0
    ? opts.map(item =>
        `Service: ${item.fields.picklist_id}, Subservice: ${item.fields.values_label}, Deliverable: ${item.fields.Deliverables}`
      ).join("\n")
    : "// no option values provided";

  const prompt = `
You are a friendly and encouraging project planning assistant.

First, greet the user warmly and ask them to describe their business idea or project goal. 
Then, ask up to 6 smart, relevant, and supportive follow-up questions to clarify their idea:
- Tailor your questions to the type of project they described.
- Make the user feel guided and understood.
- End with: What is your top priority — quality, speed, or affordability?

User described their idea as: "${userInput}"
Timeline: ${timeline}
Budget: ${budget}

Respond only with numbered questions like:
1. ...
2. ...
3. ...
  `;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPEN_AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    const result = await response.json();
    console.log("OpenAI Response (getRefinedDetails):", JSON.stringify(result, null, 2));

    if (!result.choices || !result.choices[0] || !result.choices[0].message) {
      throw new Error("Invalid OpenAI response");
    }

    const questionsText = result.choices[0].message.content;
    return questionsText.split(/\n\d+\.\s*/).filter(Boolean);

  } catch (err) {
    console.error("Error in getRefinedDetails:", err.message);
    return ["Sorry, I couldn’t generate the follow-up questions. Please try again later."];
  }
};

// Ask one follow-up question at a time
export const getNextQuestion = async (
  userInput,
  timeline,
  budget,
  previousAnswers,
  options
) => {
  const answers = Array.isArray(previousAnswers) ? previousAnswers : [];
  if (answers.length >= 5) {
    return "DONE";
  }
  const opts = Array.isArray(options) ? options : [];

  const history = answers.length
    ? answers.map(
        (qa, idx) => `Q${idx + 1}: ${qa.question}\nA${idx + 1}: ${qa.answer}`
      ).join("\n")
    : "";

  const prompt = `You are a friendly project planning assistant. Ask only one high-level, strategic follow-up question at a time to clarify the project. Focus on the user's goals, vision, target audience, and what they want to achieve — not how they plan to implement it. Do not ask about features, technologies, design specifics, or post-launch support. Stop after 5 meaningful questions, or sooner if you already understand the project. When ready, respond with only the word DONE. If the user's last answer was unclear or nonsense, politely ask them to clarify or rephrase.\n\nProject idea: ${userInput}\nTimeline: ${timeline}\nBudget: ${budget}${history ? `\nConversation so far:\n${history}` : ""}\nNext question:`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPEN_AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    const result = await response.json();
    console.log("OpenAI Response (getNextQuestion):", JSON.stringify(result, null, 2));

    if (!result.choices || !result.choices[0] || !result.choices[0].message) {
      throw new Error("Invalid OpenAI response");
    }

    return result.choices[0].message.content.trim();

  } catch (err) {
    console.error("Error generating next question:", err.message);
    return "Sorry, I ran into an issue generating the next question. Please try again later.";
  }
};

// Normalize and format timeline
const normalizeTime = (duration) => {
  const units = { day: 1, days: 1, week: 7, weeks: 7, month: 30, months: 30, year: 365, years: 365 };
  const match = duration.toLowerCase().match(/(\d+(\.\d+)?)(\s*)(day|days|week|weeks|month|months|year|years)/);
  if (!match) return 21;
  const [, value,, , unit] = match;
  return Math.round(parseFloat(value) * units[unit]);
};

const formatTime = (days) => {
  if (days < 7) return `${days} days`;
  if (days < 30) return `${Math.floor(days / 7)} weeks`;
  if (days < 365) return `${Math.floor(days / 30)} months`;
  return `${Math.floor(days / 365)} years`;
};

// Generate project breakdown from answers
export const generateBriefsFromProject = async (
  userInput,
  options,
  timeline,
  budget,
  extraAnswers,
  feedbackNote = ""
) => {
  const opts = Array.isArray(options) ? options : [];
  const promptData = opts.length > 0
    ? opts.map(item =>
        `Service: ${item.fields.picklist_id}, Subservice: ${item.fields.values_label}, Deliverable: ${item.fields.Deliverables}`
      ).join("\n")
    : "// no option values provided";

  const context = extraAnswers.map(entry => `${entry.question} ${entry.answer}`).join("\n");
  const feedback = feedbackNote
    ? `User requested the following changes or feedback: ${feedbackNote}. Please update the plan accordingly and return the full JSON again.`
    : "";
  const totalDays = normalizeTime(timeline);

  const prompt = `
You are a helpful and friendly project scoping assistant.

Given the project idea, total budget, and timeline, create a breakdown into logical steps.
Each step must include:
- step
- briefName
- briefDescription (tied clearly to overall project goal)
- service
- subservice
- deliverables
- timeline (in days, weeks, or months — whole numbers only)
- estimatedCost
- overallProjectDescription

Return also:
- projectName
- projectDescription
- totalProjectTimeline
- totalBudget

⛔️ Constraints:
1. The **total of all step durations** must **exactly equal** ${formatTime(totalDays)} (${totalDays} days).
2. The **total of all costs** must **exactly match** ${budget}.
3. Do not skip days. Do not leave unused budget.
4. Use a mix of weeks and days if helpful — no decimals.
5. Combine steps if necessary to make it feasible.
6. Your response must contain a "steps" array with at least 2 to 7 logical steps.
7. For each step, select the most fitting:
   - service
   - subservice
   - deliverables
   from the allowed list below based on what makes the most sense for that task.

Allowed values:
${promptData}

Additional context:
${context}
${feedback}

User input: ${userInput}

Respond first in this JSON structure:
{
  projectName: "...",
  projectDescription: "...",
  totalProjectTimeline: "...",
  totalBudget: "...",
  steps: [ { ... }, { ... }, ... ]
}

Do NOT include markdown, explanations, or headers.
After the JSON, ask: Would you like to finalize this plan or make more edits?
  `;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPEN_AI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    const result = await response.json();
    console.log("OpenAI Response (generateBriefsFromProject):", JSON.stringify(result, null, 2));

    if (!result.choices || !result.choices[0] || !result.choices[0].message) {
      throw new Error("Invalid OpenAI response");
    }

    return result.choices[0].message.content;

  } catch (err) {
    console.error("Error generating briefs:", err.message);
    return "Sorry, I couldn't generate the project breakdown. Please try again later.";
  }
};
