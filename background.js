// JobFill Pro - Background Service Worker (Manifest V3)

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // Initialize default profile on first install
    const defaultProfile = {
      id: "default",
      name: "General",
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
      resumeFileName: "",
      // resume PDF is stored separately as base64 if needed
    };

    chrome.storage.local.set({
      profiles: [defaultProfile],
      activeProfileId: "default",
      settings: {
        showFloatingButton: true,
        fillOnlyEmpty: true,
        darkMode: false,
        history: []
      }
    });
  }
});

// Handle keyboard shortcut
chrome.commands.onCommand.addListener((command) => {
  if (command === "autofill") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "triggerAutofill" });
      }
    });
  }
});

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getActiveProfile") {
    chrome.storage.local.get(["profiles", "activeProfileId"], (data) => {
      const profiles = data.profiles || [];
      const activeId = data.activeProfileId || "default";
      const profile = profiles.find(p => p.id === activeId) || profiles[0];
      sendResponse({ profile });
    });
    return true; // async
  }

  if (message.action === "logApplication") {
    chrome.storage.local.get(["settings"], (data) => {
      const settings = data.settings || { history: [] };
      const entry = {
        url: message.url,
        title: message.title,
        timestamp: Date.now(),
        profileName: message.profileName
      };
      settings.history = [entry, ...(settings.history || [])].slice(0, 50); // keep last 50
      chrome.storage.local.set({ settings });
    });
  }
});
