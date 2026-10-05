// JobPro background service worker.
const DEFAULT_PROFILE = {
  id:"default", name:"General", fullName:"", email:"", phone:"", linkedin:"", github:"", portfolio:"",
  currentTitle:"", currentCompany:"", yearsExperience:"", education:"", skills:"", salaryExpectation:"",
  address:"", city:"", state:"", zip:"", country:"",
  coverLetterTemplate:"Dear Hiring Manager,\n\nI am excited to apply for the {{role}} position at {{company}}.\n\nBest regards,\n{{name}}",
  resumeText:"", resumeFileName:"", resumeFileBase64:"", answers:{}
};

chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === "install") {
    chrome.storage.local.set({
      profiles:[DEFAULT_PROFILE],
      activeProfileId:"default",
      applications:[],
      savedAnswers:[],
      settings:{showFloatingButton:true,fillOnlyEmpty:true,history:[]}
    });
  }
});

chrome.commands?.onCommand.addListener(command => {
  chrome.tabs.query({active:true,currentWindow:true}, tabs => {
    const tab = tabs[0];
    if (!tab?.id) return;
    if (command === "autofill") chrome.tabs.sendMessage(tab.id,{action:"triggerAutofill"}).catch(()=>{});
    if (command === "open-sidepanel" && chrome.sidePanel?.open) chrome.sidePanel.open({tabId:tab.id}).catch(()=>{});
  });
});

function normalizeProfile(profile) {
  const p = profile || {};
  const answers = {...(p.answers || {})};
  if (!answers.workAuthorization && p.workAuthorization) answers.workAuthorization = p.workAuthorization;
  if (!answers.relocation && (p.relocation || p.willingToRelocate)) answers.relocation = p.relocation || p.willingToRelocate;
  if (!answers.noticePeriod && p.noticePeriod) answers.noticePeriod = p.noticePeriod;
  return {
    ...p,
    skills: Array.isArray(p.skills) ? p.skills.join(", ") : (p.skills || ""),
    resumeFileBase64: p.resumeFileBase64 || p.resumeBase64 || "",
    resumeFileName: p.resumeFileName || "",
    answers
  };
}

const AI_SAFE_LIMIT = 18000;
function sanitizeAiText(value, max=2000) {
  return String(value ?? "")
    .replace(/(?:\+?91[-\s.]?)?[6-9]\d{9}\b/g, "[REDACTED_PHONE]")
    .replace(/\b\d{12}\b/g, "[REDACTED_ID]")
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, "[REDACTED_ID]")
    .replace(/\b(?:INR|Rs\.?|₹)\s*[\d,]+(?:\.\d+)?\s*(?:LPA|L|lakhs?|k)?\b/gi, "[REDACTED_COMPENSATION]")
    .replace(/\b(?:salary|ctc|compensation|pay|package)\s*[:=-]?\s*[^\n]{0,100}/gi, "[REDACTED_COMPENSATION]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]")
    .replace(/\b(?:address|street|road|sector|flat|house|pin code|postal code)\s*[:=-]?\s*[^\n]{0,120}/gi, "[REDACTED_ADDRESS]")
    .slice(0, max);
}

async function getAuthSession() {
  return new Promise(resolve => chrome.storage.local.get(["authSession"], data => resolve(data.authSession || null)));
}

async function answerQuestionsWithAI(message, sendResponse) {
  const session = await getAuthSession();
  if (!session?.access_token) {
    sendResponse({ answers: [], requiresLogin: true });
    return;
  }
  const settings = await new Promise(resolve => chrome.storage.local.get(["settings"], data => resolve(data.settings || {})));
  if (settings.aiConsent !== true) {
    sendResponse({ answers: [], requiresConsent: true });
    return;
  }

  const questions = Array.isArray(message.questions) ? message.questions.slice(0, 8).map(q => ({
    fieldKey: sanitizeAiText(q?.fieldKey, 80),
    question: sanitizeAiText(q?.question, 1200)
  })) : [];
  const context = {
    currentTitle: sanitizeAiText(message.context?.currentTitle, 300),
    currentCompany: sanitizeAiText(message.context?.currentCompany, 300),
    yearsExperience: sanitizeAiText(message.context?.yearsExperience, 50),
    education: sanitizeAiText(message.context?.education, 500),
    skills: sanitizeAiText(message.context?.skills, 3000),
    resumeText: sanitizeAiText(message.context?.resumeText, 12000),
    job: {
      role: sanitizeAiText(message.context?.job?.role, 300),
      company: sanitizeAiText(message.context?.job?.company, 300)
    }
  };

  try {
    const response = await fetch("https://kbsksavehfedjskpengb.supabase.co/functions/v1/ai", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": "sb_publishable_5nLLO3E5hD9x9Yv6yF8WuA_Hwia_8Qc",
        "Authorization": "Bearer " + session.access_token
      },
      body: JSON.stringify({
        action: "answer_question",
        input: {
          question: questions.map((q, i) => (i + 1) + ". [" + q.fieldKey + "] " + q.question).join("\n"),
          context
        }
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      sendResponse({ answers: [], error: data?.error || "AI request failed" });
      return;
    }
    const raw = String(data?.result || "");
    const answers = [];
    for (const q of questions) {
      const marker = "[" + q.fieldKey + "]";
      const start = raw.indexOf(marker);
      if (start >= 0) {
        const next = raw.indexOf("\n", start + marker.length);
        answers.push({ fieldKey: q.fieldKey, question: q.question, answer: raw.slice(start + marker.length, next < 0 ? raw.length : next).replace(/^[:\-\s]+/, "").trim().slice(0, 1000) });
      }
    }
    await new Promise(resolve => chrome.storage.local.get(["savedAnswers"], data => {
      const existing = data.savedAnswers || [];
      for (const a of answers) {
        if (!a.answer) continue;
        const questionHash = btoa(unescape(encodeURIComponent(a.question))).replace(/[^a-zA-Z0-9]/g, "").slice(0, 80);
        existing.unshift({ question_hash: questionHash, question: a.question, answer: a.answer, updated_at: new Date().toISOString() });
      }
      const dedup = [];
      const seen = new Set();
      for (const a of existing) {
        if (seen.has(a.question_hash)) continue;
        seen.add(a.question_hash);
        dedup.push(a);
      }
      chrome.storage.local.set({ savedAnswers: dedup.slice(0, 100) }, resolve);
    }));
    sendResponse({ answers });
  } catch (error) {
    sendResponse({ answers: [], error: error?.message || "AI request failed" });
  }
}

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message.action==="answerQuestionsWithAI"){ answerQuestionsWithAI(message,sendResponse); return true; }
  if(message.action==="getActiveProfile"){
    chrome.storage.local.get(["profiles","activeProfileId"],data=>{
      const ps=data.profiles||[];
      const raw=ps.find(p=>p.id===(data.activeProfileId||"default"))||ps[0];
      sendResponse({profile:normalizeProfile(raw)});
    });
    return true;
  }

  if(message.action==="logApplication" && Number(message.filledCount)>0){
    chrome.storage.local.get(["settings"],data=>{
      const settings=data.settings||{history:[]};
      settings.history=[{
        url:message.url,title:message.title,timestamp:Date.now(),
        profileName:message.profileName,filledCount:Number(message.filledCount)||0
      },...(settings.history||[])].slice(0,50);
      chrome.storage.local.set({settings});
    });
    return true;
  }

  if(message.action==="getSettings"){
    chrome.storage.local.get(["settings"],data=>sendResponse({settings:data.settings||{}}));
    return true;
  }

  if(message.action==="setSetting"){
    chrome.storage.local.get(["settings"],data=>{
      const settings={...(data.settings||{}),[message.key]:message.value};
      chrome.storage.local.set({settings},()=>sendResponse({ok:true}));
    });
    return true;
  }
});
