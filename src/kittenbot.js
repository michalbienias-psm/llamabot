// Use CommonJS-style require() instead of import
const { App } = require("@slack/bolt");
const { SecretManagerServiceClient } = require("@google-cloud/secret-manager");
const OpenAI = require("openai");

// Initialize Google Secret Manager Client
const secretClient = new SecretManagerServiceClient();
const projectId = process.env.PROJECT_ID;

/**
 * Function to access secrets from Google Secret Manager.
 */
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

/**
 * Function to get AI response from OpenAI API.
 */
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

/**
 * Initialize the Slack Bot using Bolt.js.
 */
async function startBot() {
  const slackAppToken = await accessSecret("app-token");
  const slackBotToken = await accessSecret("bot-token");
  const openAIkey = await accessSecret("api-key");
  if (!slackAppToken || !slackBotToken) {
    console.error("❌ Missing required Slack tokens. Exiting...");
    process.exit(1);
  }

  const app = new App({
    token: slackBotToken,
    appToken: slackAppToken,
    socketMode: true, // ✅ No need for webhook, uses WebSocket
  });

  // Listen to all messages
  app.message(async ({ message, say }) => {
    console.log("🔹 Received message:", message.text);
    await say("Thinking... 🤔");

    const aiResponse = await getChatGPTResponse(message.text, openAIkey);
    console.log("🤖 AI Response:", aiResponse);

    await say(aiResponse);
  });

  // Start Slack bot
  await app.start();
  console.log("🚀 Slack AI Assistant is running with Bolt.js!");
}

startBot();
