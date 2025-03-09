const { App, ExpressReceiver } = require('@slack/bolt');
const express = require('express');
const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
const OpenAI = require('openai');

// Access Secret Manager
const secretClient = new SecretManagerServiceClient();
const projectId = process.env.PROJECT_ID;

async function accessSecret(name) {
  try {
    const [version] = await secretClient.accessSecretVersion({
      name: `projects/${projectId}/secrets/${name}/versions/latest`,
    });
    return version.payload.data.toString('utf8');
  } catch (error) {
    console.error(`❌ Error retrieving secret ${name}:`, error);
    return null;
  }
}

async function getChatGPTResponse(userMessage, apiKey) {
  try {
    const openai = new OpenAI({ apiKey });

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful Slack workspace assistant.' },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 500
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('❌ Error with OpenAI API:', error);
    return 'Sorry, I couldn’t generate a response.';
  }
}

async function startApp() {
  const botToken = await accessSecret('bot-token');
  const signingSecret = await accessSecret('client-signing-secret');
  const openAiKey = await accessSecret('api-key');

  if (!botToken || !signingSecret || !openAiKey) {
    console.error('❌ Missing required secrets.');
    process.exit(1);
  }

  // Use ExpressReceiver to customize routes
  const receiver = new ExpressReceiver({
    signingSecret: signingSecret,
  });

  const app = new App({
    token: botToken,
    receiver: receiver,
  });

  // Respond to messages
  app.message(async ({ message, say }) => {
    if (message.subtype && message.subtype === 'bot_message') return; // skip bot messages
    console.log('🔹 Message received:', message.text);
    await say('Thinking... 🤔');

    const aiResponse = await getChatGPTResponse(message.text, openAiKey);
    console.log('🤖 AI response:', aiResponse);
    await say(aiResponse);
  });

  // Create Express app
  const expressApp = express();
  expressApp.use(receiver.app);

  // Handle Slack Challenge Verification for Event Subscriptions
  expressApp.post('/slack/events', express.json(), (req, res) => {
    if (req.body && req.body.type === 'url_verification') {
      console.log('✅ URL verification challenge received');
      return res.status(200).send(req.body.challenge);
    }
  });

  const PORT = process.env.PORT || 8080;
  expressApp.get('/', (req, res) => res.send('Slack AI Assistant is running! 🚀'));

  expressApp.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
  });
}

startApp();
