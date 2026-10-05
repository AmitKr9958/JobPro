# JobFill Pro – Instant Job Application Autofill

A fast, private, offline-first Chrome extension (Manifest V3) for personal use. Fill job application forms in 1 click or with a keyboard shortcut.

## Features

- **One-click / keyboard autofill** (`Ctrl+Shift+F` / `Cmd+Shift+F`)
- **Floating action button** on every page (draggable, can be hidden)
- **Multiple profiles** (Software Engineer, Data Analyst, etc.)
- Smart field detection using name, id, placeholder, aria-label, labels, and heuristics
- Works on LinkedIn Easy Apply, Greenhouse, Lever, Workday, Ashby, BambooHR, company career pages, and most other forms
- Cover letter templates with placeholders (`{{name}}`, `{{company}}`, `{{role}}`, `{{skills}}`)
- Plain-text resume storage for quick pasting
- Export / Import profiles as JSON
- Application history (last 50)
- Only fills empty fields (configurable)
- Zero tracking, fully local storage

## Installation (Unpacked)

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `jobfill-pro` folder
5. Pin the extension for easy access

## First-time Setup

1. Click the extension icon
2. Click **Edit Profile** (or **+ New**)
3. Fill in your details (name, email, phone, LinkedIn, etc.)
4. Optionally paste a plain-text version of your resume and customize the cover letter template
5. Save

You can create multiple profiles and switch between them instantly.

## How to Use

### Method 1 – Floating Button
- A purple “⚡ Fill” button appears on pages.
- Click it to autofill the current form.
- Drag it anywhere you like.

### Method 2 – Popup
- Click the extension icon → big **Autofill This Page** button.

### Method 3 – Keyboard
- Press `Ctrl+Shift+F` (Windows/Linux) or `Cmd+Shift+F` (Mac).

## Customizing Field Detection

The detection logic lives in `content.js` inside the `FIELD_MAP` object.

Example:
```js
email: [
  "email", "e-mail", "emailaddress", "email_address", "mail", ...
]
```

Add more keywords if a site uses unusual field names. Higher-scoring matches are preferred.

## Permissions

- `storage` – save your profiles locally
- `activeTab` + `scripting` – inject autofill on the current tab
- `<all_urls>` – so it works on any job site (you can restrict this later if desired)

No data ever leaves your browser.

## Optional: AI Tailoring

The current version uses clean templates. If you later want AI:

1. Add an API key field in settings
2. Call any LLM (OpenAI, Groq, Gemini, local Ollama, etc.) with the job description + your resume text
3. Put the generated text into the cover letter / summary fields

The structure is ready for that extension.

## File Structure

```
jobfill-pro/
├── manifest.json
├── background.js          # Service worker + shortcut handling
├── content.js             # Form detection, autofill, floating button
├── content.css
├── popup.html
├── popup.js
├── popup.css
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Tips for Maximum Speed

1. Keep 2–3 profiles ready (different seniority / role focus)
2. Pre-fill the most common fields so 80–90% of forms need zero typing
3. Use the floating button + keyboard shortcut for true 1-second applies
4. After filling, quickly scan for any site-specific questions the detector missed

## License

Personal use. Do whatever you want with it.
