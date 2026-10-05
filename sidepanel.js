// JobPro Side Panel

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
    <div><strong>${p.fullName || "—"}</strong></div>
    <div>${p.email || ""} ${p.phone ? "· " + p.phone : ""}</div>
    <div>${p.currentTitle || ""} ${p.currentCompany ? " @ " + p.currentCompany : ""}</div>
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

// Match score (simple but effective keyword + skill overlap)
function computeMatchScore(jdText, profile) {
  if (!jdText || !profile) return { score: 0, missing: [], matched: [] };

  const jd = jdText.toLowerCase();
  const skills = (profile.skills || []).map(s => s.toLowerCase());
  const keywords = [
    ...(profile.skills || []),
    profile.currentTitle,
    profile.currentCompany,
    ...(profile.workHistory || []).flatMap(w => [w.title, w.company])
  ].filter(Boolean).map(s => s.toLowerCase());

  const matched = [];
  const missing = [];

  // Skill matches
  for (const skill of skills) {
    if (jd.includes(skill)) matched.push(skill);
    else missing.push(skill);
  }

  // Extra common tech keywords from JD
  const common = ["python", "javascript", "react", "node", "java", "aws", "sql", "typescript", "docker", "kubernetes", "machine learning", "ai"];
  for (const c of common) {
    if (jd.includes(c) && !matched.includes(c) && !skills.includes(c)) {
      // job asks for it but profile doesn't list it
      if (!missing.includes(c)) missing.push(c);
    }
  }

  const totalRelevant = matched.length + Math.min(missing.length, 8);
  const score = totalRelevant === 0 ? 50 : Math.round((matched.length / totalRelevant) * 100);
  return { score: Math.min(98, Math.max(12, score)), matched, missing: missing.slice(0, 6) };
}

function updateMatchUI(result) {
  $("#matchScore").textContent = result.score + "%";
  $("#matchFill").style.width = result.score + "%";
  let detail = "";
  if (result.matched.length) detail += `Matched: ${result.matched.slice(0, 4).join(", ")}`;
  if (result.missing.length) detail += (detail ? " · " : "") + `Missing: ${result.missing.slice(0, 3).join(", ")}`;
  $("#matchDetails").textContent = detail || "Paste JD and click Analyze";
}

// Events
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
      alert("Open a job application page first.");
    }
    $("#autofillBtn").innerHTML = "<span>⚡</span> Autofill Application";
  });

  $("#analyzeBtn").addEventListener("click", () => {
    const jd = $("#jdText").value.trim();
    const p = getActive();
    const result = computeMatchScore(jd, p);
    updateMatchUI(result);
  });

  $("#tailorBtn").addEventListener("click", async () => {
    const jd = $("#jdText").value.trim();
    if (!jd) {
      alert("Paste the job description first.");
      return;
    }
    const p = getActive();
    if (!p?.resumeText && !p?.fullName) {
      alert("Add your resume text or profile details first.");
      return;
    }

    $("#tailorBtn").textContent = "Generating...";
    const system = "You are an expert resume writer. Rewrite the resume to be highly tailored for the job description. Keep it truthful, ATS-friendly, use strong action verbs, and highlight matching skills. Return only the tailored resume text.";
    const prompt = `Job Description:\n${jd.slice(0, 3000)}\n\nCurrent Resume / Profile:\nName: ${p.fullName}\nTitle: ${p.currentTitle}\nSkills: ${(p.skills || []).join(", ")}\n\nResume Text:\n${(p.resumeText || "").slice(0, 4000)}\n\nProduce a tailored resume.`;

    const res = await chrome.runtime.sendMessage({
      action: "aiComplete",
      system,
      prompt,
      maxTokens: 1500
    });

    $("#tailorBtn").innerHTML = "<span>✨</span> AI Tailor Resume";
    if (res.error) {
      alert("AI Error: " + res.error + "\n\nAdd a free Groq API key in Settings (console.groq.com)");
      return;
    }

    // Show result in a simple way
    const win = window.open("", "_blank", "width=700,height=800");
    win.document.write(`<pre style="font-family:system-ui;padding:20px;white-space:pre-wrap">${res.text}</pre>`);
  });

  $("#coverBtn").addEventListener("click", async () => {
    const jd = $("#jdText").value.trim();
    const p = getActive();
    let company = "", role = "";
    // Try extract from page title via content script later; for now use JD
    const system = "Write a concise, professional cover letter (under 250 words). Be specific and enthusiastic.";
    const prompt = `Write a cover letter for this job.\n\nCandidate: ${p.fullName}, ${p.currentTitle} at ${p.currentCompany}. Skills: ${(p.skills||[]).join(", ")}\n\nJob Description:\n${jd.slice(0, 2500)}`;

    $("#coverBtn").textContent = "Generating...";
    const res = await chrome.runtime.sendMessage({ action: "aiComplete", system, prompt, maxTokens: 800 });
    $("#coverBtn").innerHTML = "<span>📝</span> Generate Cover Letter";

    if (res.error) {
      alert("AI Error: " + res.error);
      return;
    }
    const win = window.open("", "_blank", "width=600,height=700");
    win.document.write(`<pre style="font-family:system-ui;padding:20px;white-space:pre-wrap">${res.text}</pre>`);
  });

  $("#settingsBtn").addEventListener("click", () => {
    chrome.runtime.openOptionsPage?.() || alert("Open the extension popup → Settings to add your AI API key (Groq is free).");
  });

  $("#refreshBtn").addEventListener("click", load);
});
