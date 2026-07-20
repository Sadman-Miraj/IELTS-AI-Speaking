# IELTS Speaking Practice App

AI-powered IELTS Speaking mock exam with a real examiner voice, speech recognition, and band score feedback.

---

## Prerequisites

- [Node.js 18+](https://nodejs.org) installed on your computer
- A free [Anthropic API key](https://console.anthropic.com)
- A free [Vercel account](https://vercel.com) (for deployment)
- [Git](https://git-scm.com) installed

---

## Step 1 — Set up the project locally

```bash
# 1. Download and enter the project folder
cd ielts-next

# 2. Install dependencies
npm install

# 3. Copy the environment file
cp .env.local.example .env.local
```

---

## Step 2 — Add your Anthropic API key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up / log in → click **API Keys** → **Create Key**
3. Copy the key (starts with `sk-ant-...`)
4. Open `.env.local` and paste it:

```
ANTHROPIC_API_KEY=sk-ant-your-actual-key-here
```

---

## Step 3 — Run locally to test

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in **Chrome**.
Allow microphone access when prompted. Try a full exam!

---

## Step 4 — Deploy to Vercel (free, shareable link)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy (first time — follow the prompts)
vercel

# Answer the prompts:
#  Set up and deploy? → Y
#  Which scope? → your account
#  Link to existing project? → N
#  Project name? → ielts-speaking-app
#  Directory? → ./   (just press Enter)
```

After deploying, Vercel will ask you to add environment variables:

```bash
vercel env add ANTHROPIC_API_KEY
# Paste your sk-ant-... key and press Enter
# Select: Production, Preview, Development → press A to select all

# Redeploy with the environment variable
vercel --prod
```

Vercel gives you a live URL like:
**https://ielts-ai-speaking.vercel.app/**

Share this link with anyone — it works on desktop Chrome and Android Chrome.

---

## Step 5 — Install as Android app (optional)

1. Open the Vercel URL in **Chrome on Android**
2. Tap the **3-dot menu** → **Add to Home screen**
3. Tap **Add** — it installs like a native app, no App Store needed!

---

## Project Structure

```
ielts-next/
├── app/
│   ├── api/
│   │   └── claude/
│   │       └── route.js      ← Secure API proxy (API key stays on server)
│   ├── layout.jsx             ← Root HTML layout
│   └── page.jsx               ← Entry point
├── components/
│   └── IELTSApp.jsx           ← Full app (all screens + exam logic)
├── public/
│   └── manifest.json          ← PWA manifest for Android install
├── .env.local                 ← Your API key (never commit this!)
├── .env.local.example         ← Template
├── .gitignore
├── next.config.mjs
├── package.json
└── README.md
```

---

## How the API proxy works

The app never exposes your Anthropic API key to the browser.
All AI calls go through `app/api/claude/route.js` — a server-side route
that attaches your secret key before forwarding to Anthropic.

Browser → `/api/claude` (your server) → `api.anthropic.com` (Anthropic)

---

## Microphone note

Speech recognition requires **Google Chrome** (desktop or Android).
It does **not** work in Safari, Firefox, or other browsers.
Users must allow microphone access when the browser prompts them.

---

## Need help?

If you get stuck, open an issue or re-upload this project to Claude and ask!
