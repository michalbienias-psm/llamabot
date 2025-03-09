// Slack AI Assistant - Refactored for Events API HTTP Mode

const { App, ExpressReceiver } = require("@slack/bolt");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
const OpenAI = require("openai");
const express = require("express");

// Initialize Google Secret Manager Client
const secretClient = new SecretManagerServiceClient();
const projectId = process.env.PROJECT_ID;

// Function to access secrets from Google Secret Manager
async function accessSecret(name) {
  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${projectId}/secrets/${name}/versions/latest`,
    });
    return version.payload.data.toString("utf8");
  } catch (error) {
    console.error(`❌ Error retrieving secret ${name}:`, error);
    return null;
  }
}

// Function to get AI response from OpenAI API
async function getChatGPTResponse(userMessage, apiKey) {
  try {
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant in a Slack workspace." },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 500,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("❌ Error with OpenAI API:", error);
    return "Sorry, I couldn't generate a response.";
  }
}

// Main bot startup function
async function startBot() {
  const slackBotToken = await accessSecret("bot-token");
  const slackSigningSecret = await accessSecret("client-signing-secret");
  const openAIKey = await accessSecret("api-key");

  if (!slackBotToken || !slackSigningSecret || !openAIKey) {
    console.error("❌ Missing one or more required secrets. Exiting...");
    process.exit(1);
  }

  // Create ExpressReceiver for HTTP-based Events API
  const receiver = new ExpressReceiver({
    signingSecret: slackSigningSecret,
  });

  const app = new App({
    token: slackBotToken,
    receiver: receiver,
  });

  // Message handler
  app.message(async ({ message, say }) => {
    console.log("🔹 Received message:", message.text);
    await say("Thinking... 🤔");
    const aiResponse = await getChatGPTResponse(message.text, openAIKey);
    console.log("🤖 AI Response:", aiResponse);
    await say(aiResponse);
  });

  // Custom route to handle challenge verification
  const expressApp = receiver.app;
  expressApp.post("/slack/events", express.json(), (req, res, next) => {
    if (req.body && req.body.type === "url_verification") {
      console.log("✅ Slack challenge verification received");
      return res.status(200).send(req.body.challenge);
    }
    next();
  });

  // Optional base GET endpoint
  const PORT = process.env.PORT || 8080;
  expressApp.get("/", (req, res) => {
    res.send("Slack AI Assistant is running... 🚀");
  });

  expressApp.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
  });
}

startBot();
