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

chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
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
