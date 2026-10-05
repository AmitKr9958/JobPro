// JobPro background service worker.
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === "install") {
    const profile = {id:"default",name:"General",fullName:"",email:"",phone:"",linkedin:"",github:"",portfolio:"",currentTitle:"",currentCompany:"",yearsExperience:"",education:"",skills:"",salaryExpectation:"",address:"",city:"",state:"",zip:"",country:"",coverLetterTemplate:"Dear Hiring Manager,\n\nI am excited to apply for the {{role}} position at {{company}}.\n\nBest regards,\n{{name}}",resumeText:"",resumeFileName:"",resumeFileBase64:"",answers:{}};
    chrome.storage.local.set({profiles:[profile],activeProfileId:"default",applications:[],savedAnswers:[],settings:{showFloatingButton:true,fillOnlyEmpty:true,history:[]}});
  }
});
chrome.commands?.onCommand.addListener(command => {
  if (command==="autofill") chrome.tabs.query({active:true,currentWindow:true},tabs=>tabs[0]&&chrome.tabs.sendMessage(tabs[0].id,{action:"triggerAutofill"}).catch(()=>{}));\n  if (command==="open-sidepanel" && chrome.sidePanel?.open) chrome.tabs.query({active:true,currentWindow:true},tabs=>tabs[0]?.id&&chrome.sidePanel.open({tabId:tabs[0].id}).catch(()=>{}));
});
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message.action==="getActiveProfile"){
    chrome.storage.local.get(["profiles","activeProfileId"],data=>{const ps=data.profiles||[];sendResponse({profile:ps.find(p=>p.id===(data.activeProfileId||"default"))||ps[0]});});
    return true;
  }
  if(message.action==="logApplication" && Number(message.filledCount)>0){
    chrome.storage.local.get(["settings"],data=>{const settings=data.settings||{history:[]};settings.history=[{url:message.url,title:message.title,timestamp:Date.now(),profileName:message.profileName},...(settings.history||[])].slice(0,50);chrome.storage.local.set({settings});});
  }
});
