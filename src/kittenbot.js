const { Botkit } = require('botkit');
const {
  SlackAdapter,
  SlackEventMiddleware,
} = require('botbuilder-adapter-slack');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const axios = require('axios');

// OpenAI API Configuration
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const MODEL_NAME = "gpt-3.5-turbo"; // Cheapest model

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
    return version.payload.data.toString('utf8');
  } catch (error) {
    console.error(`Error retrieving secret ${name}:`, error);
    return null;
  }
}

/**
 * Function to get AI response from OpenAI API.
 */
async function getChatGPTResponse(userMessage, apiKey) {
  try {
    const response = await axios.post(
      OPENAI_API_URL,
      {
        model: MODEL_NAME,
        messages: [
          { role: "system", content: "You are a helpful assistant in a Slack workspace." },
          { role: "user", content: userMessage }
        ],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.choices[0].message.content; // Extract AI response
  } catch (error) {
    console.error("Error with OpenAI API:", error.response ? error.response.data : error.message);
    return "Sorry, I couldn't generate a response.";
  }
}

/**
 * Initialize AI-powered Kittenbot with secrets from Secret Manager.
 */
async function kittenbotInit() {
  const openAiKey = await accessSecret('api-key');
  const slackSigningSecret = await accessSecret('client-signing-secret');
  const slackBotToken = await accessSecret('bot-token');

  if (!openAiKey || !slackSigningSecret || !slackBotToken) {
    console.error("Missing required secrets. Exiting...");
    process.exit(1);
  }

  const adapter = new SlackAdapter({
    clientSigningSecret: slackSigningSecret,
    botToken: slackBotToken,
  });

  adapter.use(new SlackEventMiddleware());

  const controller = new Botkit({
    webhook_uri: '/api/messages',
    adapter: adapter,
  });

  controller.ready(() => {
    controller.hears(
      ['.*'], // Listen to all messages
      ['message', 'direct_message'],
      async (bot, message) => {
        await bot.reply(message, "Thinking... 🤔");

        // Get AI-generated response from OpenAI
        const aiResponse = await getChatGPTResponse(message.text, openAiKey);

        // Send response back to Slack
        await bot.reply(message, aiResponse);
      }
    );
  });

  console.log("Kittenbot (GPT-3.5 AI) is running with Secret Manager! 🔐");
}

kittenbotInit();
