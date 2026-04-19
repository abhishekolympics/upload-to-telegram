// import "dotenv/config";
// import fs from "fs";
// import path from "path";
// import readline from "readline";
// import crypto from "crypto";
// import { execSync, spawnSync } from "child_process";
// import { fileURLToPath } from "url";
// import { TelegramClient, Api } from "telegram";
// import { StringSession } from "telegram/sessions/index.js";

// const __dirname = path.dirname(fileURLToPath(import.meta.url));

// // ─── CONFIG ──────────────────────────────────────────────────────────────────
// const CONFIG = {
//   apiId:   parseInt(process.env.API_ID),
//   apiHash: process.env.API_HASH,
//   groups: {
//     bali:     process.env.BALI_CHAT_ID,
//     thailand: process.env.THAILAND_CHAT_ID,
//   },
//   folders: {
//     bali:     process.env.BALI_FOLDER     || "E:\\Bali trip footage",
//     thailand: process.env.THAILAND_FOLDER || "F:\\Thailand trip footage",
//   },
//   sessionFile:    path.join(__dirname, "session.txt"),
//   uploadedLog:    path.join(__dirname, "uploaded.json"),
//   tempDir:        path.join(__dirname, "temp_parts"),
//   delayBetween:   1000,
//   maxFileSize:    1.95 * 1024 * 1024 * 1024, // 1.95 GB

//   // ── Parallelism ──
//   // How many chunks to upload simultaneously within one file.
//   // 4 is a safe starting point; try 6–8 if your connection is fast.
//   parallelChunks: 2,

//   // How many files to upload simultaneously.
//   // Keep at 2; going higher will cause heavy flood-wait spam.
//   parallelFiles:  1,
// };

// const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
// const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi", ".mkv", ".m4v", ".3gp"]);

// // ─── HELPERS ─────────────────────────────────────────────────────────────────

// function log(msg, kind = "info") {
//   const icons = { info: "ℹ️ ", success: "✅", error: "❌", warn: "⚠️ ", upload: "📤", split: "✂️ " };
//   const time = new Date().toLocaleTimeString();
//   console.log(`[${time}] ${icons[kind] || "•"} ${msg}`);
// }

// function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// function formatBytes(b) {
//   if (b < 1024)       return b + " B";
//   if (b < 1024 ** 2)  return (b / 1024).toFixed(1) + " KB";
//   if (b < 1024 ** 3)  return (b / 1024 ** 2).toFixed(1) + " MB";
//   return (b / 1024 ** 3).toFixed(2) + " GB";
// }

// // Serialised write — only one pending write at a time to avoid corruption
// let _savePending = false;
// let _saveQueued  = null;
// function loadUploaded() {
//   if (!fs.existsSync(CONFIG.uploadedLog)) return {};
//   try { return JSON.parse(fs.readFileSync(CONFIG.uploadedLog, "utf8")); }
//   catch { return {}; }
// }
// function saveUploaded(data) {
//   // Write synchronously — fast enough and avoids any race
//   fs.writeFileSync(CONFIG.uploadedLog, JSON.stringify(data, null, 2));
// }

// function getFilesFromFolder(folder) {
//   if (!fs.existsSync(folder)) { fs.mkdirSync(folder, { recursive: true }); return []; }
//   return fs.readdirSync(folder)
//     .filter(f => {
//       if (f.startsWith("._")) return false;
//       const ext = path.extname(f).toLowerCase();
//       return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext);
//     })
//     .map(f => path.join(folder, f));
// }

// function loadSession() {
//   if (fs.existsSync(CONFIG.sessionFile))
//     return fs.readFileSync(CONFIG.sessionFile, "utf8").trim();
//   return "";
// }
// function saveSession(s) { fs.writeFileSync(CONFIG.sessionFile, s); }

// async function prompt(q) {
//   const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
//   return new Promise(resolve => rl.question(q, a => { rl.close(); resolve(a.trim()); }));
// }

// // ─── FFMPEG SPLIT ────────────────────────────────────────────────────────────

// function getVideoDuration(filePath) {
//   const result = spawnSync("ffprobe", [
//     "-v", "error",
//     "-show_entries", "format=duration",
//     "-of", "default=noprint_wrappers=1:nokey=1",
//     filePath,
//   ], { encoding: "utf8" });
//   return parseFloat(result.stdout.trim());
// }

// function hasAudioStream(filePath) {
//   const r = spawnSync("ffprobe", [
//     "-v", "error", "-select_streams", "a",
//     "-show_entries", "stream=index", "-of", "csv=p=0", filePath,
//   ], { encoding: "utf8" });
//   return r.stdout.trim().length > 0;
// }

// function splitVideo(filePath, fileName) {
//   if (!fs.existsSync(CONFIG.tempDir)) fs.mkdirSync(CONFIG.tempDir, { recursive: true });

//   const baseName       = path.basename(fileName, path.extname(fileName));
//   const ext            = path.extname(fileName);
//   const outputPattern  = path.join(CONFIG.tempDir, `${baseName}_part%03d${ext}`);
//   const fileSize       = fs.statSync(filePath).size;
//   const duration       = getVideoDuration(filePath);
//   const numParts       = Math.ceil(fileSize / CONFIG.maxFileSize);
//   const segmentSeconds = Math.floor(duration / numParts);
//   const hasAudio       = hasAudioStream(filePath);

//   log(`Duration: ${duration.toFixed(1)}s | splitting into ${numParts} parts of ~${segmentSeconds}s each${hasAudio ? "" : " (no audio)"}`, "split");

//   const mapArgs = hasAudio ? ["-map", "0:v:0", "-map", "0:a:0"] : ["-map", "0:v:0"];

//   const result = spawnSync("ffmpeg", [
//     "-i", filePath,
//     ...mapArgs,
//     "-c", "copy",
//     "-f", "segment",
//     "-segment_time", String(segmentSeconds),
//     "-reset_timestamps", "1",
//     "-y",
//     outputPattern,
//   ], { stdio: "inherit" });

//   if (result.status !== 0) throw new Error(`ffmpeg failed with exit code ${result.status}`);

//   const parts = fs.readdirSync(CONFIG.tempDir)
//     .filter(f => f.startsWith(`${baseName}_part`) && f.endsWith(ext))
//     .sort()
//     .map(f => path.join(CONFIG.tempDir, f));

//   log(`Split into ${parts.length} parts: ${parts.map(p => formatBytes(fs.statSync(p).size)).join(", ")}`, "split");
//   return parts;
// }

// function cleanupParts(parts) {
//   for (const p of parts) { if (fs.existsSync(p)) fs.unlinkSync(p); }
// }

// // ─── UPLOAD FILE (parallel chunked) ─────────────────────────────────────────

// const VALID_PART_SIZES = [524288, 262144, 131072, 65536, 32768, 16384, 8192, 4096, 2048, 1024];

// function choosePartSize(fileSize, maxParts) {
//   for (const ps of VALID_PART_SIZES) {
//     if (Math.ceil(fileSize / ps) <= maxParts) return ps;
//   }
//   return 524288;
// }

// async function uploadFile(client, chatId, filePath, fileName, fileSize, maxParts, label = "") {
//   const ext     = path.extname(fileName).toLowerCase();
//   const isVideo = VIDEO_EXTS.has(ext);
//   const isBig   = fileSize > 10 * 1024 * 1024;

//   const PART_SIZE  = choosePartSize(fileSize, maxParts);
//   const totalParts = Math.ceil(fileSize / PART_SIZE);
//   const concurrency = CONFIG.parallelChunks;

//   log(`${label}chunk: ${formatBytes(PART_SIZE)} | parts: ${totalParts}/${maxParts} | parallel: ${concurrency}`);

//   const fileId   = BigInt("0x" + crypto.randomBytes(8).toString("hex"));
//   const uploaded = new Array(totalParts).fill(false);
//   let   lastPct  = -1;

//   // Progress renderer — reads from `uploaded` array
//   function renderProgress(partsUploaded) {
//     const pct    = Math.floor((partsUploaded / totalParts) * 100);
//     if (pct === lastPct) return;
//     lastPct = pct;
//     const filled = Math.floor(pct / 5);
//     const bar    = "█".repeat(filled) + "░".repeat(20 - filled);
//     const done   = Math.min(partsUploaded * PART_SIZE, fileSize);
//     process.stdout.write(
//       `\r${label}  [${bar}] ${pct}%  ${formatBytes(done)} / ${formatBytes(fileSize)}   `
//     );
//   }

//   // Upload a single chunk with retry
//   async function uploadChunk(part) {
//     const chunkSize = Math.min(PART_SIZE, fileSize - part * PART_SIZE);
//     const buffer    = Buffer.alloc(chunkSize);
//     const fd = fs.openSync(filePath, "r");
//     fs.readSync(fd, buffer, 0, chunkSize, part * PART_SIZE);
//     fs.closeSync(fd);

//     const MAX_RETRIES = 5;
//     for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
//       try {
//         if (isBig) {
//           await client.invoke(new Api.upload.SaveBigFilePart({
//             fileId, filePart: part, fileTotalParts: totalParts, bytes: buffer,
//           }));
//         } else {
//           await client.invoke(new Api.upload.SaveFilePart({
//             fileId, filePart: part, bytes: buffer,
//           }));
//         }
//         return; // success
//       } catch (err) {
//         if (attempt === MAX_RETRIES) throw err;
//         const wait = attempt * 2000;
//         await sleep(wait);
//       }
//     }
//   }

//   // Sliding-window concurrent chunk uploader
//   let partsUploaded = 0;
//   let nextPart      = 0;
//   const inFlight    = new Set();

//   async function runNext() {
//     while (nextPart < totalParts && inFlight.size < concurrency) {
//       const part = nextPart++;
//       const p = uploadChunk(part).then(() => {
//         uploaded[part] = true;
//         partsUploaded++;
//         inFlight.delete(p);
//         renderProgress(partsUploaded);
//         return runNext(); // fill the slot
//       });
//       inFlight.add(p);
//     }
//   }

//   // Seed the initial batch and wait for all to finish
//   await runNext();
//   // Drain: wait for all in-flight
//   while (inFlight.size > 0) {
//     await Promise.race([...inFlight]);
//   }

//   process.stdout.write("\r" + " ".repeat(80) + "\r");

//   const inputFile = isBig
//     ? new Api.InputFileBig({ id: fileId, parts: totalParts, name: fileName })
//     : new Api.InputFile({ id: fileId, parts: totalParts, name: fileName, md5Checksum: "" });

//   const media = isVideo
//     ? new Api.InputMediaUploadedDocument({
//         file: inputFile,
//         mimeType: "video/mp4",
//         attributes: [
//           new Api.DocumentAttributeFilename({ fileName }),
//           new Api.DocumentAttributeVideo({ supportsStreaming: true, duration: 0, w: 1920, h: 1080 }),
//         ],
//       })
//     : new Api.InputMediaUploadedDocument({
//         file: inputFile,
//         mimeType: "image/jpeg",
//         attributes: [ new Api.DocumentAttributeFilename({ fileName }) ],
//       });

//   await client.invoke(new Api.messages.SendMedia({
//     peer:     chatId,
//     media,
//     message:  "",
//     randomId: BigInt("0x" + crypto.randomBytes(8).toString("hex")),
//   }));
// }

// // ─── UPLOAD ONE ENTRY (handles splitting) ────────────────────────────────────

// async function uploadEntry(client, chatId, filePath, fileName, fileSize, maxParts, uploaded, key, label = "") {
//   const ext     = path.extname(fileName).toLowerCase();
//   const isVideo = VIDEO_EXTS.has(ext);

//   if (isVideo && fileSize > CONFIG.maxFileSize) {
//     log(`${label}File is ${formatBytes(fileSize)} — splitting into <1.95GB parts`, "split");
//     let parts = [];
//     try {
//       parts = splitVideo(filePath, fileName);

//       for (let p = 0; p < parts.length; p++) {
//         const partPath = parts[p];
//         const partName = path.basename(partPath);
//         const partSize = fs.statSync(partPath).size;
//         const partKey  = `${key}__part${p + 1}`;

//         if (uploaded[partKey]) {
//           log(`${label}  Part ${p+1}/${parts.length} already uploaded: ${partName}`, "warn");
//           continue;
//         }

//         log(`${label}  Uploading part ${p+1}/${parts.length}: ${partName} (${formatBytes(partSize)})`, "upload");
//         await uploadFile(client, chatId, partPath, partName, partSize, maxParts, `${label}  `);
//         uploaded[partKey] = { uploadedAt: new Date().toISOString(), size: partSize };
//         saveUploaded(uploaded);
//         log(`${label}  Part ${p+1}/${parts.length} done: ${partName}`, "success");

//         if (p < parts.length - 1) await sleep(CONFIG.delayBetween);
//       }

//       uploaded[key] = { uploadedAt: new Date().toISOString(), size: fileSize, parts: parts.length };
//       saveUploaded(uploaded);

//     } finally {
//       cleanupParts(parts);
//     }

//   } else {
//     await uploadFile(client, chatId, filePath, fileName, fileSize, maxParts, label);
//     uploaded[key] = { uploadedAt: new Date().toISOString(), size: fileSize };
//     saveUploaded(uploaded);
//   }
// }

// // ─── FETCH MAX PARTS ─────────────────────────────────────────────────────────

// async function fetchMaxParts(client) {
//   try {
//     const result = await client.invoke(new Api.help.GetAppConfig({ hash: 0 }));
//     const items  = result?.config?.value || [];
//     let def = 4000, premium = 8000;
//     for (const item of items) {
//       if (item.key === "upload_max_fileparts_default") def     = Number(item.value?.value ?? def);
//       if (item.key === "upload_max_fileparts_premium") premium = Number(item.value?.value ?? premium);
//     }
//     log(`Telegram limits — default: ${def} parts, premium: ${premium} parts`);
//     return def;
//   } catch {
//     log("Could not fetch app config, using 4000 parts default.", "warn");
//     return 4000;
//   }
// }

// // ─── PARALLEL FILE QUEUE ─────────────────────────────────────────────────────

// // Processes `items` with at most `concurrency` tasks running simultaneously.
// // `fn(item)` must return a Promise.
// async function parallelQueue(items, concurrency, fn) {
//   const results = [];
//   let i = 0;
//   const inFlight = new Set();

//   async function runNext() {
//     while (i < items.length && inFlight.size < concurrency) {
//       const idx  = i++;
//       const item = items[idx];
//       const p = fn(item, idx).then(r => {
//         results[idx] = { ok: true,  value: r };
//         inFlight.delete(p);
//         return runNext();
//       }).catch(err => {
//         results[idx] = { ok: false, error: err };
//         inFlight.delete(p);
//         return runNext();
//       });
//       inFlight.add(p);
//     }
//   }

//   await runNext();
//   while (inFlight.size > 0) await Promise.race([...inFlight]);
//   return results;
// }

// // ─── MAIN ─────────────────────────────────────────────────────────────────────

// async function run() {
//   console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
//   console.log("  📸  Telegram Media Uploader (MTProto)");
//   console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

//   if (!CONFIG.apiId || !CONFIG.apiHash) {
//     log("Set API_ID and API_HASH in your .env file.", "error");
//     process.exit(1);
//   }

//   const client = new TelegramClient(
//     new StringSession(loadSession()),
//     CONFIG.apiId, CONFIG.apiHash,
//     { connectionRetries: 5 }
//   );

//   // await client.start({
//   //   phoneNumber: async () => await prompt("📱 Phone number (with country code e.g. +91...): "),
//   //   password:    async () => await prompt("🔑 2FA password (press Enter if none): "),
//   //   phoneCode:   async () => await prompt("📨 OTP Telegram sent you: "),
//   //   onError:     err  => log("Auth error: " + err.message, "error"),
//   // });

//   await client.connect();

//   if (!await client.isUserAuthorized()) {
//     await client.start({
//       phoneNumber: async () => await prompt("📱 Phone number (with country code e.g. +91...): "),
//       password:    async () => await prompt("🔑 2FA password (press Enter if none): "),
//       phoneCode:   async () => await prompt("📨 OTP Telegram sent you: "),
//       onError:     err  => log("Auth error: " + err.message, "error"),
//     });
//     saveSession(client.session.save());
//     log("Logged in! Session saved.", "success");
//   } else {
//     log("Resumed existing session.", "success");
//   }

//   saveSession(client.session.save());
//   log("Logged in! Session saved.", "success");

//   const maxParts = await fetchMaxParts(client);
//   const uploaded = loadUploaded();

//   // Shared counters — accessed from concurrent tasks, safe because JS is single-threaded
//   let totalUploaded = 0, totalSkipped = 0, totalFailed = 0;

//   for (const [trip, folder] of Object.entries(CONFIG.folders)) {
//     const chatId = CONFIG.groups[trip];
//     const files  = getFilesFromFolder(folder);

//     log(`\n📁 ${trip.toUpperCase()} — ${files.length} media files in ${folder}`);
//     if (!files.length) { log("No files found. Check folder path in .env.", "warn"); continue; }

//     // Build the work list (skip already-uploaded files up front)
//     const work = files.map((filePath, i) => ({
//       filePath,
//       fileName: path.basename(filePath),
//       fileSize: fs.statSync(filePath).size,
//       index: i,
//       total: files.length,
//     }));

//     await parallelQueue(work, CONFIG.parallelFiles, async (item) => {
//       const { filePath, fileName, fileSize, index, total } = item;
//       const key   = `${trip}::${fileName}`;
//       const label = `[${index+1}/${total}] `;

//       if (uploaded[key]) {
//         log(`${label}Already uploaded: ${fileName}`, "warn");
//         totalSkipped++;
//         return;
//       }

//       log(`${label}Uploading: ${fileName} (${formatBytes(fileSize)})`, "upload");
//       try {
//         await uploadEntry(client, chatId, filePath, fileName, fileSize, maxParts, uploaded, key, label);
//         log(`${label}Done: ${fileName}`, "success");
//         totalUploaded++;
//       } catch (err) {
//         process.stdout.write("\r" + " ".repeat(80) + "\r");
//         log(`${label}Failed: ${fileName} — ${err.message}`, "error");
//         totalFailed++;
//       }
//     });
//   }

//   console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
//   log(`Uploaded: ${totalUploaded} | Skipped: ${totalSkipped} | Failed: ${totalFailed}`);
//   console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

//   await client.disconnect();
// }

// run().catch(err => { log("Fatal: " + err.message, "error"); process.exit(1); });











import "dotenv/config";
import fs from "fs";
import path from "path";
import readline from "readline";
import crypto from "crypto";
import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CONFIG = {
  apiId:   parseInt(process.env.API_ID),
  apiHash: process.env.API_HASH,
  groups: {
    bali:     process.env.BALI_CHAT_ID,
    thailand: process.env.THAILAND_CHAT_ID,
  },
  folders: {
    bali:     process.env.BALI_FOLDER     || "E:\\Bali trip footage",
    thailand: process.env.THAILAND_FOLDER || "E:\\Thailand trip footage",
  },
  sessionFile:    path.join(__dirname, "session.txt"),
  uploadedLog:    path.join(__dirname, "uploaded.json"),
  tempDir:        path.join(__dirname, "temp_parts"),
  delayBetween:   1000,
  maxFileSize:    1.95 * 1024 * 1024 * 1024, // 1.95 GB

  // ── Parallelism ──
  // How many chunks to upload simultaneously within one file.
  // 4 is a safe starting point; try 6–8 if your connection is fast.
  parallelChunks: 2,

  // How many files to upload simultaneously.
  // Keep at 2; going higher will cause heavy flood-wait spam.
  parallelFiles:  1,
};

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi", ".mkv", ".m4v", ".3gp"]);

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function log(msg, kind = "info") {
  const icons = { info: "ℹ️ ", success: "✅", error: "❌", warn: "⚠️ ", upload: "📤", split: "✂️ " };
  const time = new Date().toLocaleTimeString();
  console.log(`[${time}] ${icons[kind] || "•"} ${msg}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatBytes(b) {
  if (b < 1024)       return b + " B";
  if (b < 1024 ** 2)  return (b / 1024).toFixed(1) + " KB";
  if (b < 1024 ** 3)  return (b / 1024 ** 2).toFixed(1) + " MB";
  return (b / 1024 ** 3).toFixed(2) + " GB";
}

// Serialised write — only one pending write at a time to avoid corruption
let _savePending = false;
let _saveQueued  = null;
function loadUploaded() {
  if (!fs.existsSync(CONFIG.uploadedLog)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG.uploadedLog, "utf8")); }
  catch { return {}; }
}
function saveUploaded(data) {
  // Write synchronously — fast enough and avoids any race
  fs.writeFileSync(CONFIG.uploadedLog, JSON.stringify(data, null, 2));
}

function getFilesFromFolder(folder) {
  if (!fs.existsSync(folder)) { fs.mkdirSync(folder, { recursive: true }); return []; }
  return fs.readdirSync(folder)
    .filter(f => {
      if (f.startsWith("._")) return false;
      const ext = path.extname(f).toLowerCase();
      return IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext);
    })
    .map(f => path.join(folder, f));
}

function loadSession() {
  if (fs.existsSync(CONFIG.sessionFile))
    return fs.readFileSync(CONFIG.sessionFile, "utf8").trim();
  return "";
}
function saveSession(s) { fs.writeFileSync(CONFIG.sessionFile, s); }

async function prompt(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(q, a => { rl.close(); resolve(a.trim()); }));
}

// ─── FFMPEG SPLIT ────────────────────────────────────────────────────────────

function getVideoDuration(filePath) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ], { encoding: "utf8" });
  return parseFloat(result.stdout.trim());
}

function hasAudioStream(filePath) {
  const r = spawnSync("ffprobe", [
    "-v", "error", "-select_streams", "a",
    "-show_entries", "stream=index", "-of", "csv=p=0", filePath,
  ], { encoding: "utf8" });
  return r.stdout.trim().length > 0;
}

function splitVideo(filePath, fileName) {
  if (!fs.existsSync(CONFIG.tempDir)) fs.mkdirSync(CONFIG.tempDir, { recursive: true });

  const baseName       = path.basename(fileName, path.extname(fileName));
  const ext            = path.extname(fileName);
  const outputPattern  = path.join(CONFIG.tempDir, `${baseName}_part%03d${ext}`);
  const fileSize       = fs.statSync(filePath).size;
  const duration       = getVideoDuration(filePath);
  const numParts       = Math.ceil(fileSize / CONFIG.maxFileSize);
  const segmentSeconds = Math.floor(duration / numParts);
  const hasAudio       = hasAudioStream(filePath);

  log(`Duration: ${duration.toFixed(1)}s | splitting into ${numParts} parts of ~${segmentSeconds}s each${hasAudio ? "" : " (no audio)"}`, "split");

  const mapArgs = hasAudio ? ["-map", "0:v:0", "-map", "0:a:0"] : ["-map", "0:v:0"];

  const result = spawnSync("ffmpeg", [
    "-i", filePath,
    ...mapArgs,
    "-c", "copy",
    "-f", "segment",
    "-segment_time", String(segmentSeconds),
    "-reset_timestamps", "1",
    "-y",
    outputPattern,
  ], { stdio: "inherit" });

  if (result.status !== 0) throw new Error(`ffmpeg failed with exit code ${result.status}`);

  const parts = fs.readdirSync(CONFIG.tempDir)
    .filter(f => f.startsWith(`${baseName}_part`) && f.endsWith(ext))
    .sort()
    .map(f => path.join(CONFIG.tempDir, f));

  log(`Split into ${parts.length} parts: ${parts.map(p => formatBytes(fs.statSync(p).size)).join(", ")}`, "split");
  return parts;
}

function cleanupParts(parts) {
  for (const p of parts) { if (fs.existsSync(p)) fs.unlinkSync(p); }
}

// ─── UPLOAD FILE (parallel chunked) ─────────────────────────────────────────

const VALID_PART_SIZES = [524288, 262144, 131072, 65536, 32768, 16384, 8192, 4096, 2048, 1024];

function choosePartSize(fileSize, maxParts) {
  for (const ps of VALID_PART_SIZES) {
    if (Math.ceil(fileSize / ps) <= maxParts) return ps;
  }
  return 524288;
}

async function uploadFile(client, chatId, filePath, fileName, fileSize, maxParts, label = "") {
  const ext     = path.extname(fileName).toLowerCase();
  const isVideo = VIDEO_EXTS.has(ext);
  const isBig   = fileSize > 10 * 1024 * 1024;

  const PART_SIZE  = choosePartSize(fileSize, maxParts);
  const totalParts = Math.ceil(fileSize / PART_SIZE);
  const concurrency = CONFIG.parallelChunks;

  log(`${label}chunk: ${formatBytes(PART_SIZE)} | parts: ${totalParts}/${maxParts} | parallel: ${concurrency}`);

  const fileId   = BigInt("0x" + crypto.randomBytes(8).toString("hex"));
  const uploaded = new Array(totalParts).fill(false);
  let   lastPct  = -1;

  // Progress renderer — reads from `uploaded` array
  function renderProgress(partsUploaded) {
    const pct    = Math.floor((partsUploaded / totalParts) * 100);
    if (pct === lastPct) return;
    lastPct = pct;
    const filled = Math.floor(pct / 5);
    const bar    = "█".repeat(filled) + "░".repeat(20 - filled);
    const done   = Math.min(partsUploaded * PART_SIZE, fileSize);
    process.stdout.write(
      `\r${label}  [${bar}] ${pct}%  ${formatBytes(done)} / ${formatBytes(fileSize)}   `
    );
  }

  // Upload a single chunk with retry
  async function uploadChunk(part) {
    const chunkSize = Math.min(PART_SIZE, fileSize - part * PART_SIZE);
    const buffer    = Buffer.alloc(chunkSize);
    const fd = fs.openSync(filePath, "r");
    fs.readSync(fd, buffer, 0, chunkSize, part * PART_SIZE);
    fs.closeSync(fd);

    const MAX_RETRIES = 5;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (isBig) {
          await client.invoke(new Api.upload.SaveBigFilePart({
            fileId, filePart: part, fileTotalParts: totalParts, bytes: buffer,
          }));
        } else {
          await client.invoke(new Api.upload.SaveFilePart({
            fileId, filePart: part, bytes: buffer,
          }));
        }
        return; // success
      } catch (err) {
        if (attempt === MAX_RETRIES) throw err;
        const wait = attempt * 2000;
        await sleep(wait);
      }
    }
  }

  // Sliding-window concurrent chunk uploader
  let partsUploaded = 0;
  let nextPart      = 0;
  const inFlight    = new Set();

  async function runNext() {
    while (nextPart < totalParts && inFlight.size < concurrency) {
      const part = nextPart++;
      const p = uploadChunk(part).then(() => {
        uploaded[part] = true;
        partsUploaded++;
        inFlight.delete(p);
        renderProgress(partsUploaded);
        return runNext(); // fill the slot
      });
      inFlight.add(p);
    }
  }

  // Seed the initial batch and wait for all to finish
  await runNext();
  // Drain: wait for all in-flight
  while (inFlight.size > 0) {
    await Promise.race([...inFlight]);
  }

  process.stdout.write("\r" + " ".repeat(80) + "\r");

  const inputFile = isBig
    ? new Api.InputFileBig({ id: fileId, parts: totalParts, name: fileName })
    : new Api.InputFile({ id: fileId, parts: totalParts, name: fileName, md5Checksum: "" });

  const media = isVideo
    ? new Api.InputMediaUploadedDocument({
        file: inputFile,
        mimeType: "video/mp4",
        attributes: [
          new Api.DocumentAttributeFilename({ fileName }),
          new Api.DocumentAttributeVideo({ supportsStreaming: true, duration: 0, w: 1920, h: 1080 }),
        ],
      })
    : new Api.InputMediaUploadedDocument({
        file: inputFile,
        mimeType: "image/jpeg",
        attributes: [ new Api.DocumentAttributeFilename({ fileName }) ],
      });

  await client.invoke(new Api.messages.SendMedia({
    peer:     chatId,
    media,
    message:  "",
    randomId: BigInt("0x" + crypto.randomBytes(8).toString("hex")),
  }));
}

// ─── UPLOAD ONE ENTRY (handles splitting) ────────────────────────────────────

async function uploadEntry(client, chatId, filePath, fileName, fileSize, maxParts, uploaded, key, label = "") {
  const ext     = path.extname(fileName).toLowerCase();
  const isVideo = VIDEO_EXTS.has(ext);

  if (isVideo && fileSize > CONFIG.maxFileSize) {
    log(`${label}File is ${formatBytes(fileSize)} — splitting into <1.95GB parts`, "split");
    let parts = [];
    try {
      parts = splitVideo(filePath, fileName);

      for (let p = 0; p < parts.length; p++) {
        const partPath = parts[p];
        const partName = path.basename(partPath);
        const partSize = fs.statSync(partPath).size;
        const partKey  = `${key}__part${p + 1}`;

        if (uploaded[partKey]) {
          log(`${label}  Part ${p+1}/${parts.length} already uploaded: ${partName}`, "warn");
          continue;
        }

        log(`${label}  Uploading part ${p+1}/${parts.length}: ${partName} (${formatBytes(partSize)})`, "upload");
        await uploadFile(client, chatId, partPath, partName, partSize, maxParts, `${label}  `);
        uploaded[partKey] = { uploadedAt: new Date().toISOString(), size: partSize };
        saveUploaded(uploaded);
        log(`${label}  Part ${p+1}/${parts.length} done: ${partName}`, "success");

        if (p < parts.length - 1) await sleep(CONFIG.delayBetween);
      }

      uploaded[key] = { uploadedAt: new Date().toISOString(), size: fileSize, parts: parts.length };
      saveUploaded(uploaded);

    } finally {
      cleanupParts(parts);
    }

  } else {
    await uploadFile(client, chatId, filePath, fileName, fileSize, maxParts, label);
    uploaded[key] = { uploadedAt: new Date().toISOString(), size: fileSize };
    saveUploaded(uploaded);
  }
}

// ─── FETCH MAX PARTS ─────────────────────────────────────────────────────────

async function fetchMaxParts(client) {
  try {
    const result = await client.invoke(new Api.help.GetAppConfig({ hash: 0 }));
    const items  = result?.config?.value || [];
    let def = 4000, premium = 8000;
    for (const item of items) {
      if (item.key === "upload_max_fileparts_default") def     = Number(item.value?.value ?? def);
      if (item.key === "upload_max_fileparts_premium") premium = Number(item.value?.value ?? premium);
    }
    log(`Telegram limits — default: ${def} parts, premium: ${premium} parts`);
    return def;
  } catch {
    log("Could not fetch app config, using 4000 parts default.", "warn");
    return 4000;
  }
}

// ─── PARALLEL FILE QUEUE ─────────────────────────────────────────────────────

// Processes `items` with at most `concurrency` tasks running simultaneously.
// `fn(item)` must return a Promise.
async function parallelQueue(items, concurrency, fn) {
  const results = [];
  let i = 0;
  const inFlight = new Set();

  async function runNext() {
    while (i < items.length && inFlight.size < concurrency) {
      const idx  = i++;
      const item = items[idx];
      const p = fn(item, idx).then(r => {
        results[idx] = { ok: true,  value: r };
        inFlight.delete(p);
        return runNext();
      }).catch(err => {
        results[idx] = { ok: false, error: err };
        inFlight.delete(p);
        return runNext();
      });
      inFlight.add(p);
    }
  }

  await runNext();
  while (inFlight.size > 0) await Promise.race([...inFlight]);
  return results;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function run() {
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  📸  Telegram Media Uploader (MTProto)");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (!CONFIG.apiId || !CONFIG.apiHash) {
    log("Set API_ID and API_HASH in your .env file.", "error");
    process.exit(1);
  }

  const client = new TelegramClient(
    new StringSession(loadSession()),
    CONFIG.apiId, CONFIG.apiHash,
    { connectionRetries: 5 }
  );

  await client.connect();
  await sleep(1000); // give session time to restore before auth check

  const sessionStr = loadSession();
  log(`Session string length: ${sessionStr.length}`, "info");
  log(`Session preview: ${sessionStr.substring(0, 30)}...`, "info");

  let authorized = false;
  try {
    authorized = await client.isUserAuthorized();
    log(`isUserAuthorized returned: ${authorized}`, "info");
  } catch (e) {
    log(`isUserAuthorized threw: ${e.message}`, "error");
  }

  if (!authorized) {
    // Session missing or expired — do full login
    log("No valid session found, logging in...", "warn");
    await client.start({
      phoneNumber: async () => await prompt("📱 Phone number (with country code e.g. +91...): "),
      password:    async () => await prompt("🔑 2FA password (press Enter if none): "),
      phoneCode:   async () => await prompt("📨 OTP Telegram sent you: "),
      onError:     err  => log("Auth error: " + err.message, "error"),
    });
    saveSession(client.session.save());
    log("Logged in! Session saved.", "success");
  } else {
    log("Resumed existing session.", "success");
  }

  const maxParts = await fetchMaxParts(client);
  const uploaded = loadUploaded();

  // Shared counters — accessed from concurrent tasks, safe because JS is single-threaded
  let totalUploaded = 0, totalSkipped = 0, totalFailed = 0;

  for (const [trip, folder] of Object.entries(CONFIG.folders)) {
    const chatId = CONFIG.groups[trip];
    const files  = getFilesFromFolder(folder);

    log(`\n📁 ${trip.toUpperCase()} — ${files.length} media files in ${folder}`);
    if (!files.length) { log("No files found. Check folder path in .env.", "warn"); continue; }

    // Build the work list (skip already-uploaded files up front)
    const work = files.map((filePath, i) => ({
      filePath,
      fileName: path.basename(filePath),
      fileSize: fs.statSync(filePath).size,
      index: i,
      total: files.length,
    }));

    await parallelQueue(work, CONFIG.parallelFiles, async (item) => {
      const { filePath, fileName, fileSize, index, total } = item;
      const key   = `${trip}::${fileName}`;
      const label = `[${index+1}/${total}] `;

      if (uploaded[key]) {
        log(`${label}Already uploaded: ${fileName}`, "warn");
        totalSkipped++;
        return;
      }

      log(`${label}Uploading: ${fileName} (${formatBytes(fileSize)})`, "upload");
      try {
        await uploadEntry(client, chatId, filePath, fileName, fileSize, maxParts, uploaded, key, label);
        log(`${label}Done: ${fileName}`, "success");
        totalUploaded++;
      } catch (err) {
        process.stdout.write("\r" + " ".repeat(80) + "\r");
        log(`${label}Failed: ${fileName} — ${err.message}`, "error");
        totalFailed++;
      }
    });
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log(`Uploaded: ${totalUploaded} | Skipped: ${totalSkipped} | Failed: ${totalFailed}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  await client.disconnect();
}

run().catch(err => { log("Fatal: " + err.message, "error"); process.exit(1); });