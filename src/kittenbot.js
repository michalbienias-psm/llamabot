const { App, ExpressReceiver } = require("@slack/bolt");
const express = require("express");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
const OpenAI = require("openai");

const secretClient = new SecretManagerServiceClient();
const projectId = process.env.PROJECT_ID;
const PORT = process.env.PORT || 8080;

/**
 * Helper to access GCP secrets.
 */
async function accessSecret(name) {
  const [version] = await secretClient.accessSecretVersion({
    name: `projects/${projectId}/secrets/${name}/versions/latest`,
  });
  return version.payload.data.toString("utf8");
}

/**
 * Get AI response from OpenAI.
 */
async function getChatGPTResponse(userMessage, apiKey) {
  const openai = new OpenAI({ apiKey });
  const response = await openai.chat.completions.create({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: "You are a helpful assistant in a Slack workspace." },
      { role: "user", content: userMessage }
    ],
    temperature: 0.7,
    max_tokens: 500,
  });
  return response.choices[0].message.content;
}

/**
 * Initialize Slack Bolt App
 */
async function init() {
  const botToken = await accessSecret("bot-token");
  const signingSecret = await accessSecret("client-signing-secret");
  const openAiKey = await accessSecret("api-key");

  const receiver = new ExpressReceiver({
    signingSecret: signingSecret,
    endpoints: "/slack/events",
  });

  const app = new App({
    token: botToken,
    receiver: receiver,
  });

  // Message handler
  app.message(async ({ message, say }) => {
    console.log("Received message:", message.text);
    await say("Thinking... 🤔");
    const aiResponse = await getChatGPTResponse(message.text, openAiKey);
    await say(aiResponse);
  });

  // Challenge handler (optional – most ExpressReceivers handle this automatically)
  receiver.router.post("/slack/events", express.json(), (req, res) => {
    if (req.body.type === "url_verification") {
      return res.status(200).send(req.body.challenge);
    }
  });

  // Start express server
  receiver.app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
  });
}

init();
