// get-chat-id.js
// Run this ONCE to find the Chat IDs of your groups.
// 1. Add your bot to both Telegram groups as admin
// 2. Send any message in each group
// 3. Run: node get-chat-id.js
// 4. Copy the chat IDs into your .env file

import https from "https";
import "dotenv/config";

const token = process.env.BOT_TOKEN;
if (!token || token === "YOUR_BOT_TOKEN_HERE") {
  console.error("❌  Set BOT_TOKEN in your .env file first.");
  process.exit(1);
}

https.get(`https://api.telegram.org/bot${token}/getUpdates`, (res) => {
  let data = "";
  res.on("data", (c) => (data += c));
  res.on("end", () => {
    const json = JSON.parse(data);
    if (!json.ok || json.result.length === 0) {
      console.log("⚠️  No updates found. Make sure you:");
      console.log("   1. Added the bot to both groups as admin");
      console.log("   2. Sent at least one message in each group");
      return;
    }

    const seen = new Set();
    console.log("\n📋  Groups / Chats found:\n");
    for (const update of json.result) {
      const chat = update.message?.chat || update.channel_post?.chat;
      if (chat && !seen.has(chat.id)) {
        seen.add(chat.id);
        console.log(`  Title : ${chat.title || chat.username || "Private"}`);
        console.log(`  Type  : ${chat.type}`);
        console.log(`  ID    : ${chat.id}`);
        console.log("  ─────────────────────────────");
      }
    }
    console.log("\nCopy the IDs above into your .env file.\n");
  });
});