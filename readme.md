# 📸 Telegram Media Uploader

Upload large photos and videos from local folders directly to Telegram groups using the MTProto protocol. Handles files of any size (tested up to 16 GB) by automatically splitting them into parts, with resume support so interrupted uploads pick up where they left off.

## ✨ Features

- **No file size limit** — files larger than 1.95 GB are automatically split and uploaded as parts
- **Resume support** — re-running the script skips already-uploaded files via `uploaded.json`
- **Parallel chunk uploads** — multiple chunks sent simultaneously for faster uploads
- **Audio-aware splitting** — automatically detects whether a video has an audio track before splitting (fixes DJI Mini / drone footage with no audio stream)
- **Flood-wait handling** — GramJS automatically backs off and retries on Telegram rate limits
- **Progress bar** — real-time per-file upload progress with bytes transferred
- **Multi-folder support** — configure multiple trips/groups in one `.env` file

## 📦 Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- [ffmpeg](https://ffmpeg.org/download.html) installed and available in your PATH (required for splitting large videos)
- A Telegram account (not a bot — MTProto user account required)
- Telegram API credentials from [my.telegram.org](https://my.telegram.org)

## 🚀 Setup

### 1. Clone and install

```bash
git clone https://github.com/yourusername/telegram-media-uploader.git
cd telegram-media-uploader
npm install
```

### 2. Get Telegram API credentials

1. Go to [my.telegram.org](https://my.telegram.org) and log in
2. Click **API development tools**
3. Create a new application — note down your **API ID** and **API Hash**

### 3. Get your group/channel Chat IDs

The easiest way is to forward a message from your target group to [@userinfobot](https://t.me/userinfobot) or use a bot like [@RawDataBot](https://t.me/RawDataBot) — it will show the chat ID. Group IDs are usually negative numbers like `-1001234567890`.

Alternatively, add [@getidsbot](https://t.me/getidsbot) to your group temporarily.

### 4. Create your `.env` file

```bash
cp .env.example .env
```

Then edit `.env` with your values:

```env
API_ID=12345678
API_HASH=abcdef1234567890abcdef1234567890

# Chat IDs of your Telegram groups (negative number for groups/channels)
BALI_CHAT_ID=-1001234567890
THAILAND_CHAT_ID=-1009876543210

# Absolute paths to your media folders
BALI_FOLDER=F:\Bali trip footage
THAILAND_FOLDER=F:\Thailand trip footage
```

> **Tip:** You can rename `bali` / `thailand` to anything you like — just update both the `.env` keys and the `CONFIG.groups` / `CONFIG.folders` keys in `uploader.js`.

### 5. Run

```bash
npm start
```

On first run you'll be prompted to enter your phone number, a Telegram OTP, and optionally your 2FA password. The session is saved to `session.txt` so you won't need to log in again.

## ⚙️ Configuration

All tuning options are at the top of `uploader.js` in the `CONFIG` object:

| Option | Default | Description |
|--------|---------|-------------|
| `maxFileSize` | 1.95 GB | Files larger than this are split before uploading. Keep below 2 GB. |
| `parallelChunks` | `2` | Chunks uploaded simultaneously within one file. Increase to `4`–`6` for faster uploads on a good connection. |
| `parallelFiles` | `1` | Files uploaded simultaneously. Increase to `2` once your account's rate limit has cooled down. |
| `delayBetween` | `1000` ms | Delay between files/parts to reduce flood-wait risk. |

### Tuning for speed

If you're seeing no flood-wait messages and uploads are fast, try:
- `parallelChunks: 4` — good first bump
- `parallelChunks: 6` — if your upload bandwidth allows
- `parallelFiles: 2` — only after the account has been idle for a day (heavy uploading leaves a rate-limit cooldown)

If you're seeing `Sleeping for Xs on flood wait` constantly, reduce `parallelChunks` to `1` and wait a few hours.

## 📁 Adding more trips/folders

Edit `uploader.js` to add more entries:

```js
// In CONFIG:
groups: {
  bali:     process.env.BALI_CHAT_ID,
  thailand: process.env.THAILAND_CHAT_ID,
  japan:    process.env.JAPAN_CHAT_ID,   // ← add this
},
folders: {
  bali:     process.env.BALI_FOLDER,
  thailand: process.env.THAILAND_FOLDER,
  japan:    process.env.JAPAN_FOLDER,    // ← and this
},
```

And add the corresponding values to your `.env`.

## 📂 File structure

```
telegram-media-uploader/
├── uploader.js       # Main script
├── package.json
├── .env              # Your credentials (never commit this)
├── .env.example      # Template for .env
├── session.txt       # Saved Telegram session (auto-created, never commit)
├── uploaded.json     # Resume log — tracks every uploaded file/part
└── temp_parts/       # Temporary split video parts (auto-cleaned after upload)
```

## 🔁 Resuming interrupted uploads

If the script is interrupted (power cut, crash, Ctrl+C), just run `npm start` again. It reads `uploaded.json` and skips everything already successfully uploaded. Parts of a file that were mid-upload will be re-uploaded from the beginning of that part.

## ⚠️ Important notes

- **Free Telegram accounts** can upload up to ~2 GB per file part (4000 parts × 512 KB). The script auto-detects this limit.
- **Telegram Premium** users get 8000 parts — you can increase `maxFileSize` to ~3.9 GB if you have Premium.
- Large video files are sent as **documents** (not native videos) to avoid Telegram's photo/video dimension restrictions. They will still be playable in Telegram.
- The script uses your **personal Telegram account** via MTProto, not a bot. Do not share your `session.txt` or `.env` with anyone.
- If you accidentally expose your `session.txt`, terminate all sessions immediately from **Telegram Settings → Devices → Terminate all other sessions**.

## 🛠️ Troubleshooting

| Problem | Fix |
|---------|-----|
| `ffmpeg: command not found` | Install ffmpeg and make sure it's in your PATH |
| `FILE_PARTS_INVALID` | File size calculation issue — the script uses raw MTProto to avoid this, ensure you're on the latest version |
| `PHOTO_INVALID_DIMENSIONS` | Fixed — panoramic JPGs are sent as documents automatically |
| `Failed to set value '0:a:0'` | Fixed — script probes for audio stream before splitting |
| Constant flood-wait on startup | Reduce `parallelChunks` to `1`, wait a few hours for rate limit to cool |
| Upload stuck at 0% | Check your internet connection; GramJS will auto-reconnect and retry |

## 📊 Check upload progress

To see how much data has been uploaded so far, save this as `check.js` and run `node check.js`:

```js
const data = JSON.parse(require('fs').readFileSync('uploaded.json'));
const trips = {};
for (const [key, val] of Object.entries(data)) {
  const trip = key.split('::')[0];
  if (!trips[trip]) trips[trip] = { size: 0, count: 0 };
  trips[trip].size += val.size || 0;
  trips[trip].count++;
}
for (const [trip, info] of Object.entries(trips)) {
  console.log(trip + ':', (info.size / 1024**3).toFixed(2), 'GB,', info.count, 'parts');
}
const total = Object.values(data).reduce((s, v) => s + (v.size || 0), 0);
console.log('Total:', (total / 1024**3).toFixed(2), 'GB');
```

## 📄 License

MIT