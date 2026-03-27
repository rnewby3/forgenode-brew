# /brew — Fellow Aiden Profile Generator

Mobile-optimized web app for generating Fellow Aiden brew profiles. Paste a coffee product URL, get a brew.link in seconds.

## Stack

- **Frontend**: Single HTML file, no framework, mobile-first dark UI
- **Backend**: Vercel Edge Function (`/api/brew.js`) — proxies Anthropic API + brew-link-generator server-side (no CORS issues)
- **Domain**: `forgenode.dev` → Vercel

## Setup

### 1. Clone & push to GitHub

```bash
git init
git add .
git commit -m "initial"
gh repo create forgenode-brew --private --push
```

### 2. Deploy to Vercel

```bash
npm i -g vercel
vercel
```

Or connect the GitHub repo in the Vercel dashboard for auto-deploys on push.

### 3. Add environment variable

In Vercel dashboard → Project → Settings → Environment Variables:

```
ANTHROPIC_API_KEY = sk-ant-...
```

### 4. Point forgenode.dev to Vercel

In Vercel dashboard → Project → Settings → Domains → Add `forgenode.dev`

Then in your DNS registrar, add:
```
A     @    76.76.21.21
CNAME www  cname.vercel-dns.com
```

Done. `forgenode.dev` → mobile brew profile generator.

## Usage

1. Open `forgenode.dev` on your phone
2. Paste a roaster product URL (or enter details manually)
3. Tap **Generate brew profile**
4. Tap **Open in Fellow App** → imports directly to your Aiden

## Taste adjustment

After brewing, use the feedback buttons (Too bitter, Too sour, etc.) to regenerate an adjusted profile with a new brew.link.

## Grinder

Calibrated for **DF64 Gen2** (0–90 dial, filter range 50–90).
