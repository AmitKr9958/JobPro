// JobPro Side Panel v2.1

const $ = (s) => document.querySelector(s);

let profiles = [];
let activeProfileId = "default";
let settings = {};

async function load() {
  const data = await chrome.storage.local.get(["profiles", "activeProfileId", "settings"]);
  profiles = data.profiles || [];
  activeProfileId = data.activeProfileId || "default";
  settings = data.settings || {};
  renderProfiles();
  renderPreview();
  renderHistory();
  renderQuickAnswers();
  autoExtractJD();
}

function getActive() {
  return profiles.find(p => p.id === activeProfileId) || profiles[0];
}

function renderProfiles() {
  const sel = $("#profileSelect");
  sel.innerHTML = profiles.map(p =>
    `<option value="${p.id}" ${p.id === activeProfileId ? "selected" : ""}>${p.name || "Unnamed"}</option>`
  ).join("");
}

function renderPreview() {
  const p = getActive();
  if (!p) return;
  $("#profilePreview").innerHTML = `
    <div><strong>${escape(p.fullName || "—")}</strong></div>
    <div>${escape(p.email || "")} ${p.phone ? "· " + escape(p.phone) : ""}</div>
    <div>${escape(p.currentTitle || "")} ${p.currentCompany ? " @ " + escape(p.currentCompany) : ""}</div>
  `;
}

function renderHistory() {
  const list = $("#historyList");
  const history = settings.history || [];
  if (!history.length) {
    list.innerHTML = `<li style="color:#94a3b8;font-style:italic">No applications yet</li>`;
    return;
  }
  list.innerHTML = history.slice(0, 12).map(h => {
    const d = new Date(h.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    const score = h.matchScore != null ? ` · ${h.matchScore}%` : "";
    return `<li>
      <div class="title">${escape(h.role || h.title || h.url)}</div>
      <div class="meta">${escape(h.company || "")}${score} · ${d}</div>
    </li>`;
  }).join("");
}

function renderQuickAnswers() {
  const p = getActive();
  const box = $("#quickAnswers");
  if (!p) return;
  const items = [
    ["Work Auth", p.workAuthorization],
    ["Relocate", p.willingToRelocate],
    ["Notice", p.noticePeriod],
    ["Salary", p.salaryExpectation],
    ["Years Exp", p.yearsExperience]
  ].filter(([, v]) => v);
  box.innerHTML = items.map(([k, v]) =>
    `<div class="qa-item"><strong>${k}:</strong> ${escape(v)}</div>`
  ).join("") || `<div style="color:#94a3b8">Add answers in profile editor</div>`;
}

function escape(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function computeMatchScore(jdText, profile) {
  if (!jdText || !profile) return { score: 0, missing: [], matched: [] };
  const jd = jdText.toLowerCase();
  const skills = (Array.isArray(profile.skills) ? profile.skills : (profile.skills || "").split(",")).map(s => s.trim().toLowerCase()).filter(Boolean);
  const matched = [];
  const missing = [];
  for (const skill of skills) {
    if (jd.includes(skill)) matched.push(skill);
    else missing.push(skill);
  }
  const totalRelevant = matched.length + Math.min(missing.length, 8);
  const score = totalRelevant === 0 ? 55 : Math.round((matched.length / totalRelevant) * 100);
  return { score: Math.min(98, Math.max(15, score)), matched, missing: missing.slice(0, 6) };
}

function updateMatchUI(result) {
  $("#matchScore").textContent = result.score + "%";
  $("#matchFill").style.width = result.score + "%";
  let detail = "";
  if (result.matched.length) detail += `Matched: ${result.matched.slice(0, 4).join(", ")}`;
  if (result.missing.length) detail += (detail ? " · " : "") + `Gaps: ${result.missing.slice(0, 3).join(", ")}`;
  $("#matchDetails").textContent = detail || "Paste or auto-extract JD then Analyze";
}

async function autoExtractJD() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    const res = await chrome.tabs.sendMessage(tab.id, { action: "extractJD" });
    if (res?.jd && res.jd.length > 200) {
      $("#jdText").value = res.jd;
      const result = computeMatchScore(res.jd, getActive());
      updateMatchUI(result);
    }
  } catch (_) {
    // page may not have content script yet
  }
}

document.addEventListener("DOMContentLoaded", () => {
  load();

  $("#profileSelect").addEventListener("change", (e) => {
    activeProfileId = e.target.value;
    chrome.storage.local.set({ activeProfileId });
    renderPreview();
    renderQuickAnswers();
  });

  $("#autofillBtn").addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return;
    $("#autofillBtn").textContent = "Filling...";
    try {
      await chrome.tabs.sendMessage(tab.id, { action: "triggerAutofill" });
    } catch {
      alert("Open a normal job application page first (not chrome:// pages).");
    }
    $("#autofillBtn").innerHTML = "<span>⚡</span> Autofill Application";
  });

  $("#analyzeBtn").addEventListener("click", () => {
    const jd = $("#jdText").value.trim();
    const result = computeMatchScore(jd, getActive());
    updateMatchUI(result);
  });

  $("#tailorBtn").addEventListener("click", async () => {
    const jd = $("#jdText").value.trim();
    if (!jd) { alert("Paste or auto-extract the job description first."); return; }
    const p = getActive();
    if (!p?.resumeText && !p?.fullName) { alert("Add your resume text in the profile first."); return; }

    $("#tailorBtn").textContent = "Generating...";
    const system = "You are an expert resume writer. Produce an ATS-friendly tailored resume for the job. Keep facts truthful. Use strong action verbs. Return only the resume text.";
    const prompt = `Job Description:\n${jd.slice(0, 3500)}\n\nCandidate: ${p.fullName}\nCurrent Title: ${p.currentTitle}\nSkills: ${(Array.isArray(p.skills) ? p.skills : [p.skills]).join(", ")}\n\nBase Resume:\n${(p.resumeText || "").slice(0, 4500)}\n\nWrite a tailored resume.`;

    const res = await chrome.runtime.sendMessage({ action: "aiComplete", system, prompt, maxTokens: 1600 });
    $("#tailorBtn").innerHTML = "<span>✨</span> AI Tailor Resume";

    if (res.error) {
      alert("AI Error: " + res.error + "\n\nAdd a free Groq key: console.groq.com → Settings in the extension.");
      return;
    }
    const w = window.open("", "_blank", "width=720,height=820");
    w.document.write(`<pre style="font-family:system-ui;padding:24px;white-space:pre-wrap;line-height:1.5">${res.text}</pre>`);
  });

  $("#coverBtn").addEventListener("click", async () => {
    const jd = $("#jdText").value.trim();
    const p = getActive();
    $("#coverBtn").textContent = "Generating...";
    const system = "Write a concise professional cover letter (max 220 words). Specific and enthusiastic.";
    const prompt = `Candidate: ${p.fullName}, ${p.currentTitle} at ${p.currentCompany}. Skills: ${(Array.isArray(p.skills)?p.skills:[p.skills]).join(", ")}\n\nJob:\n${jd.slice(0, 2800)}\n\nWrite the cover letter.`;
    const res = await chrome.runtime.sendMessage({ action: "aiComplete", system, prompt, maxTokens: 700 });
    $("#coverBtn").innerHTML = "<span>📝</span> Generate Cover Letter";
    if (res.error) { alert("AI Error: " + res.error); return; }
    const w = window.open("", "_blank", "width=620,height=700");
    w.document.write(`<pre style="font-family:system-ui;padding:24px;white-space:pre-wrap;line-height:1.5">${res.text}</pre>`);
  });

  $("#settingsBtn").addEventListener("click", () => {
    alert("Open the extension popup (click the JobPro icon) → Settings to add your free Groq / OpenAI / Gemini API key.");
  });

  $("#refreshBtn").addEventListener("click", () => {
    load();
  });
});
