import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import { fetchAirtableData, generateBriefsFromProject, getRefinedDetails, getNextQuestion } from "./index.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

app.post("/api/get-next-question", async (req, res) => {
  const { userInput, projectTimeline, projectBudget, answers } = req.body;
  try {
    const options = await fetchAirtableData();
    const question = await getNextQuestion(userInput, projectTimeline, projectBudget, answers || [], options);
    if (question.trim().toUpperCase() === "DONE") {
      res.json({ done: true });
    } else {
      res.json({ question });
    }
  } catch (err) {
    console.error("❌ Error generating next question:", err);
    res.status(500).json({ error: "Failed to generate next question" });
  }
});

const parseJsonSafely = (data) => {
  try {
    return typeof data === "string" ? JSON.parse(data) : data;
  } catch (e) {
    const match = data.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw e;
  }
};

app.post("/api/get-briefs", async (req, res) => {
  const { userInput, projectTimeline, projectBudget, answers } = req.body;
  try {
    const options = await fetchAirtableData();
    const breakdown = await generateBriefsFromProject(
      userInput,
      options,
      projectTimeline,
      projectBudget,
      answers
    );

    let parsedBreakdown;
    try {
      parsedBreakdown = parseJsonSafely(breakdown);
    } catch (e) {
      console.error("❌ Failed to parse breakdown:", e);
      return res.status(500).json({ error: "Invalid breakdown format." });
    }

    res.json({ breakdown: parsedBreakdown });
  } catch (err) {
    console.error("❌ Error generating breakdown:", err);
    res.status(500).json({ error: "Failed to generate breakdown" });
  }
});

app.post("/api/update-briefs", async (req, res) => {
  const { userInput, projectTimeline, projectBudget, answers, feedback } = req.body;
  try {
    const options = await fetchAirtableData();
    const breakdown = await generateBriefsFromProject(
      userInput,
      options,
      projectTimeline,
      projectBudget,
      answers,
      feedback
    );

    let parsedBreakdown;
    try {
      parsedBreakdown = parseJsonSafely(breakdown);
    } catch (e) {
      console.error("❌ Failed to parse breakdown:", e);
      return res.status(500).json({ error: "Invalid breakdown format." });
    }

    res.json({ breakdown: parsedBreakdown });
  } catch (err) {
    console.error("❌ Error updating breakdown:", err);
    res.status(500).json({ error: "Failed to update breakdown" });
  }
});

app.listen(3000, () => {
  console.log("🚀 Server running at http://localhost:3000");
});
