# Ward Round SOAP Dictation PWA

A browser-based ward round dictation app that converts spoken or typed clinical notes into structured SOAP notes using the Gemini API.

## This full version includes

- Android PWA support with manifest, service worker, and app icons
- No confusing sample button
- Android dictation fix to reduce repeated words
- Gemini API key saved locally in the browser
- Model selector for Gemini 2.5 Flash, Flash-Lite, Pro, Gemini 3 preview models, or a custom model name
- SOAP output with copy and `.txt` download

## Upload to GitHub Pages

Upload all files and folders to the repository root:

```text
index.html
style.css
app.js
manifest.webmanifest
manifest.json
sw.js
pwa-check.html
icons/icon-192.png
icons/icon-512.png
README.md
```

Then enable GitHub Pages from Settings → Pages → Deploy from branch → main → root.

## Android install check

Open `pwa-check.html` from the GitHub Pages URL. Manifest and service worker should show OK.

If Chrome still opens with an address bar, delete the old shortcut and clear site data:

Chrome → Settings → Site settings → All sites → your GitHub Pages site → Clear data.

Then reopen the site and use Chrome menu → Install app.

## Important clinical note

AI-generated notes must be checked and verified by a clinician before use in patient documentation.
