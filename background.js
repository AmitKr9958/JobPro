// JobPro v2 – Background Service Worker (Jobright-style)

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    const defaultProfile = {
      id: "default",
      name: "Main Profile",
      fullName: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      linkedin: "",
      github: "",
      portfolio: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      country: "United States",
      currentTitle: "",
      currentCompany: "",
      yearsExperience: "",
      salaryExpectation: "",
      noticePeriod: "",
      workAuthorization: "Authorized to work in the US",
      willingToRelocate: "Yes",
      workHistory: [],
      education: [],
      skills: [],
      customAnswers: {},
      resumeText: "",
      resumeFileName: "",
      resumeBase64: "",
      coverLetterTemplate: "Dear Hiring Manager,\n\nI am excited to apply for the {{role}} position at {{company}}. With my experience in {{skills}}, I am confident I would be a strong addition to your team.\n\nI look forward to discussing how my background can contribute to {{company}}.\n\nBest regards,\n{{name}}"
    };

    chrome.storage.local.set({
      profiles: [defaultProfile],
      activeProfileId: "default",
      settings: {
        showFloatingButton: true,
        fillOnlyEmpty: true,
        autoOpenSidePanel: true,
        aiProvider: "groq",
        aiApiKey: "",
        history: []
      }
    });
  }

  if (chrome.sidePanel) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === "autofill") {
    chrome.tabs.sendMessage(tab.id, { action: "triggerAutofill" }).catch(() => {});
  }

  if (command === "open-sidepanel" && chrome.sidePanel) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (e) {}
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getActiveProfile") {
    chrome.storage.local.get(["profiles", "activeProfileId"], (data) => {
      const profiles = data.profiles || [];
      const activeId = data.activeProfileId || "default";
      const profile = profiles.find(p => p.id === activeId) || profiles[0] || null;
      sendResponse({ profile });
    });
    return true;
  }

  if (message.action === "getSettings") {
    chrome.storage.local.get(["settings"], (data) => {
      sendResponse({ settings: data.settings || {} });
    });
    return true;
  }

  if (message.action === "logApplication") {
    chrome.storage.local.get(["settings"], (data) => {
      const settings = data.settings || { history: [] };
      const entry = {
        id: Date.now().toString(),
        url: message.url,
        title: message.title || "",
        company: message.company || "",
        role: message.role || "",
        matchScore: message.matchScore || null,
        timestamp: Date.now(),
        profileName: message.profileName || ""
      };
      settings.history = [entry, ...(settings.history || [])].slice(0, 100);
      chrome.storage.local.set({ settings });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.action === "openSidePanel") {
    if (chrome.sidePanel && sender.tab?.id) {
      chrome.sidePanel.open({ tabId: sender.tab.id })
        .then(() => sendResponse({ ok: true }))
        .catch(err => sendResponse({ ok: false, error: String(err) }));
      return true;
    }
  }

  if (message.action === "aiComplete") {
    handleAIComplete(message).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

async function handleAIComplete({ prompt, system, maxTokens = 1200 }) {
  const data = await chrome.storage.local.get(["settings"]);
  const settings = data.settings || {};
  const apiKey = settings.aiApiKey;
  const provider = settings.aiProvider || "groq";

  if (!apiKey) {
    return { error: "No AI API key set. Open Settings and add your free Groq / OpenAI / Gemini key." };
  }

  try {
    if (provider === "groq") {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            { role: "user", content: prompt }
          ],
          max_tokens: maxTokens,
          temperature: 0.35
        })
      });
      const json = await res.json();
      if (json.error) return { error: json.error.message };
      return { text: json.choices?.[0]?.message?.content || "" };
    }

    if (provider === "openai") {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            { role: "user", content: prompt }
          ],
          max_tokens: maxTokens,
          temperature: 0.35
        })
      });
      const json = await res.json();
      if (json.error) return { error: json.error.message };
      return { text: json.choices?.[0]?.message?.content || "" };
    }

    if (provider === "gemini") {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: (system ? system + "\n\n" : "") + prompt }] }],
            generationConfig: { maxOutputTokens: maxTokens, temperature: 0.35 }
          })
        }
      );
      const json = await res.json();
      if (json.error) return { error: json.error.message };
      return { text: json.candidates?.[0]?.content?.parts?.[0]?.text || "" };
    }

    return { error: "Unknown AI provider" };
  } catch (err) {
    return { error: err.message };
  }
}
