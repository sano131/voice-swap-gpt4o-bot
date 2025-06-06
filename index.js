require("dotenv").config();
const express = require("express");
const fs = require("fs");
const fetch = require("node-fetch");
const { google } = require("googleapis");
const OpenAI = require("openai");
const { Client, middleware } = require("@line/bot-sdk");

const app = express();
const port = process.env.PORT || 3000;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const lineConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};
const lineClient = new Client(lineConfig);

app.post("/webhook", middleware(lineConfig), async (req, res) => {
  const events = req.body.events;

  await Promise.all(
    events.map(async (event) => {
      try {
        if (event.type !== "message" || event.message.type !== "audio") return;

        const messageId = event.message.id;
        const audioUrl = `https://api-data.line.me/v2/bot/message/${messageId}/content`;

        const audioResponse = await fetch(audioUrl, {
          headers: { Authorization: `Bearer ${lineConfig.channelAccessToken}` },
        });

        const audioBuffer = await audioResponse.buffer();
        const tempPath = "./temp.m4a";
        fs.writeFileSync(tempPath, audioBuffer);

        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(tempPath),
          model: "whisper-1",
        });

        const originalText = transcription.text;

        const summaryCompletion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            { role: "system", content: "あなたはプロの通訳者兼議事録作成者です。" },
            { role: "user", content: `以下の日本語音声の内容を英訳し、議事録用に簡潔にまとめてください：\n\n${originalText}` },
          ],
        });

        const summary = summaryCompletion.choices[0].message.content;

        await lineClient.replyMessage(event.replyToken, {
          type: "text",
          text: `🎤 音声認識：\n${originalText}\n\n📄 翻訳＆要約：\n${summary}`,
        });

        fs.unlinkSync(tempPath);
      } catch (err) {
        console.error("Error:", err);
      }
    })
  );

  res.status(200).send("OK");
});

app.listen(port, () => {
  console.log("Voice-Swap GPT-4o Bot is running on port", port);
});
