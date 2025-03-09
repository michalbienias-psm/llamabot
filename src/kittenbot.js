const express = require("express");
const { App, ExpressReceiver } = require("@slack/bolt");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
const OpenAI = require("openai");

// Load secrets from Google Secret Manager
const secretClient = new SecretManagerServiceClient();
const projectId = process.env.PROJECT_ID; // add fallback if needed

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

async function getChatGPTResponse(userMessage, apiKey) {
  try {
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: "You are a helpful assistant in a Slack workspace." },
        { role: "user", content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error("❌ Error with OpenAI API:", error);
    return "Sorry, I couldn't generate a response.";
  }
}

async function startBot() {
  const slackSigningSecret = await accessSecret("client-signing-secret");
  const slackBotToken = await accessSecret("bot-token");
  const openAIkey = await accessSecret("api-key");

  if (!slackSigningSecret || !slackBotToken || !openAIkey) {
    console.error("❌ Missing required secrets. Exiting...");
    process.exit(1);
  }

  // Create a custom receiver for HTTP mode
  const receiver = new ExpressReceiver({
    signingSecret: slackSigningSecret,
    endpoints: "/slack/events", // Slack will send POST requests here
  });

  const app = new App({
    token: slackBotToken,
    receiver,
  });

  // Listen to all messages
  app.message(async ({ message, say }) => {
    console.log("🔹 Received message:", message.text);
    await say("Thinking... 🤔");

    const aiResponse = await getChatGPTResponse(message.text, openAIkey);
    console.log("🤖 AI Response:", aiResponse);

    await say(aiResponse);
  });

  // Start Express app
  const expressApp = require("express")();
  expressApp.use(receiver.app);

  const PORT = process.env.PORT || 8080;
  expressApp.get("/", (req, res) => res.send("Slack AI Assistant is running... 🚀"));
  expressApp.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
  });
}

startBot();
