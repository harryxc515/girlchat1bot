import "dotenv/config";
import { Telegraf } from "telegraf";
import { config } from "./config.js";
import {
  connectDB,
  getChatSettings,
  setChatEnabled,
  getWarnings,
  resetWarnings
} from "./database.js";
import { antiSpam } from "./antiSpam.js";

const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OWNER_ID = Number(process.env.OWNER_ID || 0);
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID;

if (!BOT_TOKEN) {
  console.log("❌ BOT_TOKEN missing");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.log("❌ OPENAI_API_KEY missing");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);
const memory = new Map();

const SYSTEM_PROMPT = `
You are an advanced Telegram AI assistant.
Rules:
- Reply fast, short, smart.
- Use Hinglish if user uses Hinglish.
- No "thinking..." messages.
- Be friendly and helpful.
`;

async function askAI(messages) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: config.temperature,
      max_tokens: config.maxTokens
    })
  });

  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || "❌ No reply.";
}

async function logToChannel(ctx, text) {
  if (!LOG_CHANNEL_ID) return;
  try {
    await ctx.telegram.sendMessage(LOG_CHANNEL_ID, text);
  } catch {}
}

function isOwner(ctx) {
  return OWNER_ID && ctx.from.id === OWNER_ID;
}

await connectDB();

bot.start((ctx) =>
  ctx.reply("🤖 Advanced AI Bot Online ✅\nType anything to chat 😄")
);

bot.command("status", async (ctx) => {
  const settings = await getChatSettings(ctx.chat.id);
  ctx.reply(
    `📊 Bot Status\n\n✅ Enabled: ${settings.enabled}\n👤 Chat: ${
      ctx.chat.title || "Private"
    }`
  );
});

bot.command("on", async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("❌ Only Owner can use this.");
  await setChatEnabled(ctx.chat.id, true);
  ctx.reply("✅ Bot Enabled in this chat.");
});

bot.command("off", async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("❌ Only Owner can use this.");
  await setChatEnabled(ctx.chat.id, false);
  ctx.reply("🚫 Bot Disabled in this chat.");
});

bot.command("resetwarn", async (ctx) => {
  if (!isOwner(ctx)) return ctx.reply("❌ Only Owner can use this.");
  const replyUser = ctx.message.reply_to_message?.from;
  if (!replyUser)
    return ctx.reply("Reply to a user message to reset warnings.");

  await resetWarnings(replyUser.id, ctx.chat.id);
  ctx.reply("✅ Warnings reset.");
});

bot.command("warns", async (ctx) => {
  const replyUser = ctx.message.reply_to_message?.from;
  if (!replyUser) return ctx.reply("Reply to a user message to check warnings.");

  const w = await getWarnings(replyUser.id, ctx.chat.id);
  ctx.reply(`⚠️ Warnings: ${w.warns || 0}/3`);
});

bot.on("text", async (ctx) => {
  const chatId = ctx.chat.id;
  const userId = ctx.from.id;
  const text = ctx.message.text;

  const settings = await getChatSettings(chatId);
  if (!settings.enabled) return;

  if (ctx.chat.type !== "private" && config.groupReplyOnlyTag) {
    const me = await bot.telegram.getMe();
    const tag = `@${me.username}`;
    if (!text.includes(tag) && !ctx.message.reply_to_message) return;
  }

  const blocked = await antiSpam(ctx, config);
  if (blocked) return;

  const key = `${chatId}:${userId}`;
  const history = memory.get(key) || [];
  const shortHistory = history.slice(-config.memoryLimit);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...shortHistory,
    { role: "user", content: text }
  ];

  try {
    const reply = await askAI(messages);

    memory.set(key, [
      ...shortHistory,
      { role: "user", content: text },
      { role: "assistant", content: reply }
    ]);

    await ctx.reply(reply);

    await logToChannel(
      ctx,
      `📩 Chat: ${ctx.chat.title || "Private"}\n👤 User: ${
        ctx.from.username || ctx.from.first_name
      }\n💬 Msg: ${text}\n🤖 Reply: ${reply}`
    );
  } catch (e) {
    console.log("AI Error:", e.message);
    ctx.reply("❌ Error aa gaya 😅");
  }
});

bot.launch();
console.log("🚀 Advanced AI Bot Running...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
