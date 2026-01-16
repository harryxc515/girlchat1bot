import { MongoClient } from "mongodb";

let client;
let db;

export async function connectDB() {
  const uri = process.env.MONGO_URI;
  const dbName = process.env.DB_NAME || "botdb";

  if (!uri) {
    console.log("⚠️ MONGO_URI not found, running without DB (RAM mode).");
    return null;
  }

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);

  console.log("✅ MongoDB Connected");
  return db;
}

export function getDB() {
  return db;
}

export async function getChatSettings(chatId) {
  if (!db) return { enabled: true };

  const col = db.collection("settings");
  const data = await col.findOne({ chatId });
  return data || { chatId, enabled: true };
}

export async function setChatEnabled(chatId, enabled) {
  if (!db) return { chatId, enabled };

  const col = db.collection("settings");
  await col.updateOne(
    { chatId },
    { $set: { chatId, enabled } },
    { upsert: true }
  );
  return { chatId, enabled };
}

export async function addWarning(userId, chatId) {
  if (!db) return { warns: 1 };

  const col = db.collection("warnings");
  const res = await col.findOneAndUpdate(
    { userId, chatId },
    { $inc: { warns: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return res.value;
}

export async function resetWarnings(userId, chatId) {
  if (!db) return { warns: 0 };

  const col = db.collection("warnings");
  await col.deleteOne({ userId, chatId });
  return { warns: 0 };
}

export async function getWarnings(userId, chatId) {
  if (!db) return { warns: 0 };

  const col = db.collection("warnings");
  return (await col.findOne({ userId, chatId })) || { warns: 0 };
}
