# JobPro – AI Job Autofill (Jobright-style)

Open-source Chrome extension inspired by **Jobright Autofill**.

One-click form filling + AI resume tailoring + match score for Greenhouse, Lever, Ashby, Workday, LinkedIn Easy Apply and thousands of ATS platforms.

## Features (v2.0)

| Feature | Status |
|---------|--------|
| One-click Autofill | ✅ |
| Floating action button | ✅ |
| Keyboard shortcut (`Ctrl+Shift+F`) | ✅ |
| **Side Panel** (`Ctrl+Shift+J`) | ✅ |
| Multiple profiles | ✅ |
| Smart field detection | ✅ |
| Match Score (keyword + skills) | ✅ |
| AI Resume Tailor (your API key) | ✅ |
| AI Cover Letter | ✅ |
| Application tracker / history | ✅ |
| Cover letter templates | ✅ |
| Export / Import profiles | ✅ |
| Local-first + optional AI | ✅ |

## Supported AI Providers (bring your own key)

- **Groq** (recommended – free & fast) → https://console.groq.com
- OpenAI
- Google Gemini

## Installation

1. Clone or download this repo
2. Go to `chrome://extensions`
3. Enable **Developer mode**
4. Click **Load unpacked** → select this folder
5. Pin the extension

## Quick Start

1. Open the extension popup → **Edit Profile** → fill your details + paste resume text
2. (Optional) Open Settings and paste a free Groq API key for AI features
3. Go to any job application page
4. Press `Ctrl+Shift+J` to open the **Side Panel**
5. Paste the job description → click **Analyze Match**
6. Click **Autofill Application** or use the floating ⚡ button / `Ctrl+Shift+F`

## Keyboard Shortcuts

- `Ctrl+Shift+F` / `Cmd+Shift+F` → Autofill current page
- `Ctrl+Shift+J` / `Cmd+Shift+J` → Open Side Panel

## How it compares to Jobright

Jobright is a full commercial platform (job matching feed, account system, Orion agent, insider connections, paid credits).

**JobPro** focuses on the core high-value pieces that actually save time when applying:

- Extremely fast autofill
- Side panel workflow
- AI tailoring with *your* API key (no monthly credit limits)
- Completely private / local storage

You keep full control and can improve the selectors for any ATS you use most.

## Project Structure

```
jobfill-pro/
├── manifest.json
├── background.js          # Service worker + AI proxy
├── content.js             # Form detection + floating button
├── content.css
├── popup.html / .js / .css
├── sidepanel.html / .js / .css
├── icons/
└── README.md
```

## License

MIT – personal and commercial use allowed.
