/* =========================================================
   Ward Round SOAP Dictation – app.js
   Pure client-side. No backend required.
   API key stored in localStorage (browser only).
========================================================= */

'use strict';

/* ───── DOM refs ───── */
const statusBar        = document.getElementById('statusBar');
const statusText       = document.getElementById('statusText');
const apiKeyInput      = document.getElementById('apiKeyInput');
const saveKeyBtn       = document.getElementById('saveKeyBtn');
const clearKeyBtn      = document.getElementById('clearKeyBtn');
const apiKeyStatus     = document.getElementById('apiKeyStatus');
const modelSelect      = document.getElementById('modelSelect');
const customModelInput = document.getElementById('customModelInput');
const modelStatus      = document.getElementById('modelStatus');
const recordBtn        = document.getElementById('recordBtn');
const micIcon          = document.getElementById('micIcon');
const stopIcon         = document.getElementById('stopIcon');
const micLabel         = document.getElementById('micLabel');
const languageSelect   = document.getElementById('languageSelect');
const rawInput         = document.getElementById('rawInput');
const processBtn       = document.getElementById('processBtn');
const processBtnText   = document.getElementById('processBtnText');
const processBtnSpinner= document.getElementById('processBtnSpinner');
const clearBtn         = document.getElementById('clearBtn');
const copySoapBtn      = document.getElementById('copySoapBtn');
const copyRawBtn       = document.getElementById('copyRawBtn');
const downloadBtn      = document.getElementById('downloadBtn');
const soapSections     = document.getElementById('soapSections');
const soapFallback     = document.getElementById('soapFallback');
const soapPlaceholder  = document.getElementById('soapPlaceholder');
const soapS            = document.getElementById('soapS');
const soapO            = document.getElementById('soapO');
const soapA            = document.getElementById('soapA');
const soapP            = document.getElementById('soapP');

/* ───── State ───── */
let isRecording      = false;
let recognition      = null;
let sessionBaseText  = '';   // Text that was already in the box before recording starts
let finalTranscript  = '';   // Final text from the current recording session only
let lastSoapRaw      = '';

const IS_ANDROID = /Android/i.test(navigator.userAgent);

let deferredInstallPrompt = null;
const installAppBtn = document.getElementById('installAppBtn');

function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// Show the button on normal Android Chrome pages as a helpful guide.
// The real install prompt is only available after Chrome fires beforeinstallprompt.
window.addEventListener('load', () => {
  if (installAppBtn && IS_ANDROID && !isStandaloneApp()) {
    installAppBtn.style.display = 'inline-flex';
  }
});

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (installAppBtn) {
    installAppBtn.textContent = 'Install app';
    installAppBtn.style.display = 'inline-flex';
  }
});

if (installAppBtn) {
  installAppBtn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) {
      setStatus('If Chrome only creates a shortcut, wait 30 seconds, refresh once, then use Chrome menu → Install app. If still unavailable, clear site data and remove the old shortcut.', 'info');
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installAppBtn.style.display = 'none';
  });
}

window.addEventListener('appinstalled', () => {
  setStatus('App installed on this device.', 'ok');
  if (installAppBtn) installAppBtn.style.display = 'none';
});

const STORAGE_KEY   = 'wardRound_geminiKey';
const STORAGE_MODEL = 'wardRound_geminiModel';
const DEFAULT_MODEL = 'gemini-2.5-flash';

/* =========================================================
   STATUS BAR
========================================================= */
function setStatus(msg, type = 'idle') {
  statusText.textContent = msg;
  statusBar.className = 'status-bar status-' + type;
}

/* =========================================================
   API KEY
========================================================= */
function loadSavedKey() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    apiKeyInput.value = saved;
    apiKeyStatus.textContent = '✓ Key loaded from browser storage.';
    apiKeyStatus.style.color = 'var(--green)';
  }
}

saveKeyBtn.addEventListener('click', () => {
  const key = apiKeyInput.value.trim();
  if (!key) {
    apiKeyStatus.textContent = 'Please paste your Gemini API key first.';
    apiKeyStatus.style.color = 'var(--red)';
    return;
  }
  localStorage.setItem(STORAGE_KEY, key);
  apiKeyStatus.textContent = '✓ Key saved to browser storage.';
  apiKeyStatus.style.color = 'var(--green)';
});

clearKeyBtn.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  apiKeyInput.value = '';
  apiKeyStatus.textContent = 'Key cleared.';
  apiKeyStatus.style.color = 'var(--ink-3)';
});

/* =========================================================
   MODEL SELECTION
========================================================= */
function cleanModelName(value) {
  return (value || '').trim().replace(/^models\//, '');
}

function modelOptionExists(modelName) {
  if (!modelSelect) return false;
  return Array.from(modelSelect.options).some(opt => opt.value === modelName);
}

function updateModelStatus() {
  if (!modelStatus) return;
  const model = getSelectedModel();
  modelStatus.textContent = 'Current model: ' + model;
  modelStatus.style.color = 'var(--ink-3)';
}

function loadSavedModel() {
  if (!modelSelect) return;

  const saved = cleanModelName(localStorage.getItem(STORAGE_MODEL) || DEFAULT_MODEL);

  if (modelOptionExists(saved)) {
    modelSelect.value = saved;
    if (customModelInput) {
      customModelInput.value = '';
      customModelInput.style.display = 'none';
    }
  } else {
    modelSelect.value = 'custom';
    if (customModelInput) {
      customModelInput.value = saved;
      customModelInput.style.display = '';
    }
  }

  updateModelStatus();
}

function getSelectedModel() {
  if (!modelSelect) return DEFAULT_MODEL;

  let model = modelSelect.value === 'custom'
    ? cleanModelName(customModelInput?.value)
    : cleanModelName(modelSelect.value);

  if (!model) model = DEFAULT_MODEL;
  return model;
}

if (modelSelect) {
  modelSelect.addEventListener('change', () => {
    if (modelSelect.value === 'custom') {
      if (customModelInput) {
        customModelInput.style.display = '';
        customModelInput.focus();
      }
    } else {
      if (customModelInput) customModelInput.style.display = 'none';
      localStorage.setItem(STORAGE_MODEL, getSelectedModel());
    }
    updateModelStatus();
  });
}

if (customModelInput) {
  customModelInput.addEventListener('input', () => {
    if (modelSelect?.value === 'custom') {
      localStorage.setItem(STORAGE_MODEL, getSelectedModel());
      updateModelStatus();
    }
  });
}

/* =========================================================
   SPEECH RECOGNITION
========================================================= */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function normalizeTranscript(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function joinTranscript(existingText, newText) {
  return normalizeTranscript([existingText, newText].filter(Boolean).join(' '));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function setupRecognition() {
  if (!SpeechRecognition) {
    recordBtn.disabled = true;
    micLabel.textContent = 'Not supported – type manually';
    setStatus('Speech recognition requires Google Chrome. Please type manually.', 'error');
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous     = true;
  // Android Chrome may resend interim/final speech chunks.
  // On Android, use final results only to avoid repeated words.
  recognition.interimResults = !IS_ANDROID;
  recognition.lang           = languageSelect.value;

  recognition.onstart = () => {
    isRecording = true;
    recordBtn.classList.add('recording');
    micIcon.style.display = 'none';
    stopIcon.style.display = '';
    micLabel.textContent = 'Listening… tap to stop';
    setStatus('Microphone active. Speak clearly.', 'info');
  };

  recognition.onresult = (event) => {
    // Rebuild the transcript from the recognition results instead of blindly appending.
    // This prevents Android Chrome from duplicating phrases such as "pesakit pesakit pesakit".
    const finalParts = [];
    const interimParts = [];

    for (let i = 0; i < event.results.length; i++) {
      const t = (event.results[i][0].transcript || '').trim();
      if (!t) continue;

      if (event.results[i].isFinal) {
        finalParts.push(t);
      } else {
        interimParts.push(t);
      }
    }

    finalTranscript = normalizeTranscript(finalParts.join(' '));
    const liveText = normalizeTranscript([finalTranscript, ...interimParts].join(' '));
    rawInput.value = joinTranscript(sessionBaseText, liveText);
  };

  recognition.onerror = (event) => {
    const msgs = {
      'not-allowed'   : 'Microphone permission denied. Please allow microphone access in your browser.',
      'no-speech'     : 'No speech detected. Please speak louder or type manually.',
      'audio-capture' : 'No microphone found. Check your device.',
      'network'       : 'Network error during speech recognition. Try again or type manually.',
    };
    setStatus(msgs[event.error] || 'Speech error: ' + event.error + '. Type manually.', 'error');
    stopRecordingUI();
  };

  recognition.onend = () => {
    stopRecordingUI();
    if (!rawInput.value.trim()) {
      setStatus('No speech captured. Try again or type manually.', 'idle');
    }
  };
}

function startRecording() {
  try {
    // Keep existing text as a base, then add only the new recording session text.
    sessionBaseText = normalizeTranscript(rawInput.value);
    finalTranscript = '';
    recognition.lang = languageSelect.value;
    recognition.start();
  } catch (e) {
    setStatus('Could not start microphone: ' + e.message, 'error');
    stopRecordingUI();
  }
}

function stopRecording() {
  try { recognition.stop(); } catch (_) {}
  stopRecordingUI();
}

function stopRecordingUI() {
  isRecording = false;
  recordBtn.classList.remove('recording');
  micIcon.style.display = '';
  stopIcon.style.display = 'none';
  micLabel.textContent = 'Tap to dictate';
}

recordBtn.addEventListener('click', () => {
  if (!recognition) {
    setStatus('Speech recognition not available. Please type manually.', 'error');
    return;
  }
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
    setStatus('Recording stopped.', 'idle');
  }
});

languageSelect.addEventListener('change', () => {
  if (recognition) recognition.lang = languageSelect.value;
});

/* =========================================================
   CLEAR
========================================================= */
clearBtn.addEventListener('click', () => {
  if (isRecording) stopRecording();
  sessionBaseText = '';
  finalTranscript = '';
  rawInput.value  = '';
  lastSoapRaw     = '';
  showSoapPlaceholder();
  setStatus('Cleared. Ready.', 'idle');
});

/* =========================================================
   SOAP DISPLAY HELPERS
========================================================= */
function showSoapPlaceholder() {
  soapPlaceholder.style.display = '';
  soapSections.style.display    = 'none';
  soapFallback.style.display    = 'none';
  soapFallback.value            = '';
}

function showSoapParsed(text) {
  /* Try to parse SOAP sections */
  const extract = (label) => {
    const patterns = [
      new RegExp(label + '[:\\s]+(.*?)(?=\\n(?:Subjective|Objective|Assessment|Plan)[:\\s]|$)', 'is'),
      new RegExp('\\*\\*' + label + '\\*\\*[:\\s]*(.*?)(?=\\n\\*\\*(?:Subjective|Objective|Assessment|Plan)\\*\\*|$)', 'is'),
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m && m[1].trim()) return m[1].trim();
    }
    return null;
  };

  const s = extract('Subjective');
  const o = extract('Objective');
  const a = extract('Assessment');
  const p = extract('Plan');

  if (s && o && a && p) {
    soapS.textContent = s;
    soapO.textContent = o;
    soapA.textContent = a;
    soapP.textContent = p;
    soapSections.style.display = '';
    soapFallback.style.display = 'none';
    soapPlaceholder.style.display = 'none';
  } else {
    /* Fallback: raw textarea */
    soapFallback.value = text;
    soapFallback.style.display = '';
    soapSections.style.display = 'none';
    soapPlaceholder.style.display = 'none';
  }
}

/* =========================================================
   GENERATE SOAP NOTE (Gemini API, direct from browser)
========================================================= */
processBtn.addEventListener('click', processSOAP);

async function processSOAP() {
  if (isRecording) {
    stopRecording();
    await delay(300);
  }

  const transcript = rawInput.value.trim();
  if (transcript.length < 3) {
    setStatus('Please dictate or type a clinical note first.', 'error');
    return;
  }

  const apiKey = (apiKeyInput.value.trim() || localStorage.getItem(STORAGE_KEY) || '').trim();
  if (!apiKey) {
    setStatus('No API key found. Please paste your Gemini API key above first.', 'error');
    return;
  }

  /* UI: loading */
  processBtn.disabled        = true;
  recordBtn.disabled         = true;
  processBtnText.textContent = 'Generating…';
  processBtnSpinner.style.display = '';
  setStatus('Sending to Gemini AI…', 'busy');

  const prompt = `
You are an expert medical scribe.

Task:
Convert the raw ward round dictation below into a clear clinical SOAP note.

Important rules:
1. Use only information given in the dictation.
2. Do not invent diagnosis, medication, dose, investigation, or management.
3. If information is unclear, write "Unclear from dictation".
4. If a section has no information, write "Not mentioned".
5. Use concise professional clinical wording.
6. The final note must be checked by the clinician before use.

Use these EXACT headings followed by a colon and newline:

Subjective:
Objective:
Assessment:
Plan:

Raw dictation:
"""${transcript}"""
`.trim();

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, topP: 0.8, maxOutputTokens: 1200 },
  };

  const selectedModel = getSelectedModel();

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(selectedModel) +
    ':generateContent';

  try {
    const res = await fetch(url, {
      method : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body   : JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = data?.error?.message || ('HTTP ' + res.status);
      throw new Error(msg);
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    if (!text) {
      throw new Error('Empty response from Gemini. Check your API key or try again.');
    }

    lastSoapRaw = text;
    showSoapParsed(text);
    setStatus('SOAP note generated using ' + selectedModel + '. Please review before use.', 'ok');

  } catch (err) {
    setStatus('Error: ' + err.message, 'error');
    console.error('[SOAP] Gemini error:', err);
  } finally {
    processBtn.disabled        = false;
    recordBtn.disabled         = false;
    processBtnText.textContent = 'Generate';
    processBtnSpinner.style.display = 'none';
  }
}

/* =========================================================
   COPY / DOWNLOAD
========================================================= */
function getSoapText() {
  if (soapSections.style.display !== 'none') {
    return [
      'Subjective:\n' + soapS.textContent,
      'Objective:\n'  + soapO.textContent,
      'Assessment:\n' + soapA.textContent,
      'Plan:\n'       + soapP.textContent,
    ].join('\n\n');
  }
  return soapFallback.value;
}

async function copyToClipboard(text, successMsg) {
  if (!text.trim()) { setStatus('Nothing to copy.', 'error'); return; }
  try {
    await navigator.clipboard.writeText(text);
    setStatus(successMsg, 'ok');
  } catch {
    setStatus('Copy failed – please select and copy manually.', 'error');
  }
}

copySoapBtn.addEventListener('click', () => {
  copyToClipboard(getSoapText(), 'SOAP note copied to clipboard.');
});

copyRawBtn.addEventListener('click', () => {
  copyToClipboard(rawInput.value, 'Raw text copied to clipboard.');
});

downloadBtn.addEventListener('click', () => {
  const soap = getSoapText();
  if (!soap.trim()) { setStatus('No SOAP note to download yet.', 'error'); return; }
  const ts   = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const blob = new Blob([soap], { type: 'text/plain' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'SOAP_Note_' + ts + '.txt';
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus('Downloaded SOAP note as .txt file.', 'ok');
});

/* =========================================================
   INIT
========================================================= */
loadSavedKey();
loadSavedModel();
setupRecognition();
showSoapPlaceholder();
