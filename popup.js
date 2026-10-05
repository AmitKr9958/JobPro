// JobFill Pro - Popup Script

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let profiles = [];
let activeProfileId = "default";
let settings = { showFloatingButton: true, fillOnlyEmpty: true, history: [] };
let editingId = null;

// ====================== INIT ======================
document.addEventListener("DOMContentLoaded", async () => {
  await loadData();
  renderProfileSelect();
  updatePreview();
  bindEvents();
  renderHistory();
});

async function loadData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["profiles", "activeProfileId", "settings"], (data) => {
      profiles = data.profiles || [];
      activeProfileId = data.activeProfileId || (profiles[0]?.id || "default");
      settings = data.settings || { showFloatingButton: true, fillOnlyEmpty: true, history: [] };

      // Ensure at least one profile
      if (profiles.length === 0) {
        profiles = [createEmptyProfile("General")];
        activeProfileId = profiles[0].id;
        saveProfiles();
      }
      resolve();
    });
  });
}

function createEmptyProfile(name = "New Profile") {
  return {
    id: "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7),
    name,
    fullName: "",
    email: "",
    phone: "",
    linkedin: "",
    github: "",
    portfolio: "",
    currentTitle: "",
    currentCompany: "",
    yearsExperience: "",
    education: "",
    skills: "",
    salaryExpectation: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    country: "",
    coverLetterTemplate: "Dear Hiring Manager,\n\nI am excited to apply for the {{role}} position at {{company}}. With my background in {{skills}}, I am confident I can contribute effectively to your team.\n\nLooking forward to the opportunity to discuss how my experience aligns with your needs.\n\nBest regards,\n{{name}}",
    resumeText: "",
    resumeFileName: ""
  };
}

function saveProfiles() {
  chrome.storage.local.set({ profiles, activeProfileId });
}

function saveSettings() {
  chrome.storage.local.set({ settings });
}

// ====================== RENDER ======================
function renderProfileSelect() {
  const select = $("#profileSelect");
  select.innerHTML = "";
  profiles.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name || "Unnamed";
    if (p.id === activeProfileId) opt.selected = true;
    select.appendChild(opt);
  });
}

function getActiveProfile() {
  return profiles.find((p) => p.id === activeProfileId) || profiles[0];
}

function updatePreview() {
  const p = getActiveProfile();
  if (!p) return;
  $("#previewName").textContent = p.fullName || "—";
  $("#previewEmail").textContent = p.email || "—";
  $("#previewPhone").textContent = p.phone || "—";
  $("#previewLinkedin").textContent = p.linkedin || "—";
}

function renderHistory() {
  const list = $("#historyList");
  const history = settings.history || [];
  if (history.length === 0) {
    list.innerHTML = '<li class="empty">No history yet</li>';
    return;
  }
  list.innerHTML = history
    .slice(0, 15)
    .map((h) => {
      const date = new Date(h.timestamp).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
      return `<li>
        <div class="title">${escapeHtml(h.title || h.url)}</div>
        <div class="meta">${escapeHtml(h.profileName || "")} · ${date}</div>
      </li>`;
    })
    .join("");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ====================== VIEWS ======================
function showView(viewId) {
  ["mainView", "editView", "settingsView"].forEach((id) => {
    $(`#${id}`).classList.toggle("hidden", id !== viewId);
  });
}

// ====================== EVENTS ======================
function bindEvents() {
  // Profile switch
  $("#profileSelect").addEventListener("change", (e) => {
    activeProfileId = e.target.value;
    saveProfiles();
    updatePreview();
  });

  // Autofill button
  $("#autofillBtn").addEventListener("click", async () => {
    const btn = $("#autofillBtn");
    btn.disabled = true;
    btn.innerHTML = '<span class="btn-icon">⏳</span> Filling...';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab");

      // Ensure content script is ready, then trigger
      const result = await chrome.tabs.sendMessage(tab.id, { action: "triggerAutofill" });
      // Optional: show count
    } catch (err) {
      // Content script may not be injected yet on some pages (chrome:// etc.)
      console.warn(err);
      alert("Could not autofill this page. Make sure you are on a regular webpage (not chrome:// or extension pages).");
    }

    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">⚡</span> Autofill This Page';
  });

  // New profile
  $("#newProfileBtn").addEventListener("click", () => {
    editingId = null;
    fillForm(createEmptyProfile("New Profile"));
    $("#editTitle").textContent = "New Profile";
    showView("editView");
  });

  // Edit profile
  $("#editProfileBtn").addEventListener("click", () => {
    const p = getActiveProfile();
    if (!p) return;
    editingId = p.id;
    fillForm(p);
    $("#editTitle").textContent = "Edit Profile";
    showView("editView");
  });

  // Delete profile
  $("#deleteProfileBtn").addEventListener("click", () => {
    if (profiles.length <= 1) {
      alert("You need at least one profile.");
      return;
    }
    if (!confirm("Delete this profile?")) return;
    profiles = profiles.filter((p) => p.id !== activeProfileId);
    activeProfileId = profiles[0].id;
    saveProfiles();
    renderProfileSelect();
    updatePreview();
  });

  // Back / Cancel
  $("#backBtn").addEventListener("click", () => showView("mainView"));
  $("#cancelEditBtn").addEventListener("click", () => showView("mainView"));

  // Save profile
  $("#profileForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const data = readForm();
    if (editingId) {
      const idx = profiles.findIndex((p) => p.id === editingId);
      if (idx >= 0) profiles[idx] = { ...profiles[idx], ...data, id: editingId };
    } else {
      profiles.push(data);
      activeProfileId = data.id;
    }
    saveProfiles();
    renderProfileSelect();
    updatePreview();
    showView("mainView");
  });

  // Settings
  $("#settingsBtn").addEventListener("click", () => {
    $("#settingFab").checked = settings.showFloatingButton !== false;
    $("#settingEmptyOnly").checked = settings.fillOnlyEmpty !== false;
    renderHistory();
    showView("settingsView");
  });

  $("#settingsBackBtn").addEventListener("click", () => showView("mainView"));

  $("#settingFab").addEventListener("change", (e) => {
    settings.showFloatingButton = e.target.checked;
    saveSettings();
    // Notify current tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: "toggleFab",
          show: settings.showFloatingButton
        }).catch(() => {});
      }
    });
  });

  $("#settingEmptyOnly").addEventListener("change", (e) => {
    settings.fillOnlyEmpty = e.target.checked;
    saveSettings();
  });

  // Export
  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ profiles, activeProfileId }, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jobfill-pro-profiles.json";
    a.click();
    URL.revokeObjectURL(url);
  });

  // Import
  $("#importBtn").addEventListener("click", () => $("#importFile").click());
  $("#importFile").addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (Array.isArray(data.profiles)) {
          profiles = data.profiles;
          activeProfileId = data.activeProfileId || profiles[0]?.id;
          saveProfiles();
          renderProfileSelect();
          updatePreview();
          alert("Profiles imported successfully!");
          showView("mainView");
        } else {
          alert("Invalid file format.");
        }
      } catch {
        alert("Could not parse JSON file.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
}

// ====================== FORM HELPERS ======================
function fillForm(p) {
  $("#profileId").value = p.id || "";
  $("#f_name").value = p.name || "";
  $("#f_fullName").value = p.fullName || "";
  $("#f_email").value = p.email || "";
  $("#f_phone").value = p.phone || "";
  $("#f_linkedin").value = p.linkedin || "";
  $("#f_github").value = p.github || "";
  $("#f_portfolio").value = p.portfolio || "";
  $("#f_currentTitle").value = p.currentTitle || "";
  $("#f_currentCompany").value = p.currentCompany || "";
  $("#f_yearsExperience").value = p.yearsExperience || "";
  $("#f_salaryExpectation").value = p.salaryExpectation || "";
  $("#f_education").value = p.education || "";
  $("#f_skills").value = p.skills || "";
  $("#f_address").value = p.address || "";
  $("#f_city").value = p.city || "";
  $("#f_state").value = p.state || "";
  $("#f_zip").value = p.zip || "";
  $("#f_country").value = p.country || "";
  $("#f_resumeText").value = p.resumeText || "";
  $("#f_coverLetterTemplate").value = p.coverLetterTemplate || "";
}

function readForm() {
  return {
    id: $("#profileId").value || createEmptyProfile().id,
    name: $("#f_name").value.trim() || "Unnamed",
    fullName: $("#f_fullName").value.trim(),
    email: $("#f_email").value.trim(),
    phone: $("#f_phone").value.trim(),
    linkedin: $("#f_linkedin").value.trim(),
    github: $("#f_github").value.trim(),
    portfolio: $("#f_portfolio").value.trim(),
    currentTitle: $("#f_currentTitle").value.trim(),
    currentCompany: $("#f_currentCompany").value.trim(),
    yearsExperience: $("#f_yearsExperience").value.trim(),
    salaryExpectation: $("#f_salaryExpectation").value.trim(),
    education: $("#f_education").value.trim(),
    skills: $("#f_skills").value.trim(),
    address: $("#f_address").value.trim(),
    city: $("#f_city").value.trim(),
    state: $("#f_state").value.trim(),
    zip: $("#f_zip").value.trim(),
    country: $("#f_country").value.trim(),
    resumeText: $("#f_resumeText").value.trim(),
    coverLetterTemplate: $("#f_coverLetterTemplate").value.trim(),
    resumeFileName: ""
  };
}
