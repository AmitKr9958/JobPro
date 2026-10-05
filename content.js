// JobPro v2.1 – High-reliability content script
// Strong ATS support: Greenhouse, Lever, Ashby, Workday, LinkedIn, iCIMS, etc.

(function () {
  "use strict";

  const FIELD_MAP = {
    fullName: ["fullname", "full_name", "full-name", "name", "applicantname", "candidate_name", "legalname", "displayname", "yourname"],
    firstName: ["firstname", "first_name", "first-name", "fname", "givenname", "given_name", "forename", "preferredfirst"],
    lastName: ["lastname", "last_name", "last-name", "lname", "surname", "familyname", "family_name", "preferredlast"],
    email: ["email", "e-mail", "emailaddress", "email_address", "mail", "useremail", "contactemail", "emailid"],
    phone: ["phone", "telephone", "mobile", "cellphone", "cell", "phonenumber", "phone_number", "tel", "contactnumber", "mobilephone", "primaryphone"],
    linkedin: ["linkedin", "linked-in", "linkedinurl", "linkedin_url", "linkedinprofile", "li_url", "linkedinlink"],
    github: ["github", "githuburl", "github_url", "githubprofile", "git", "gitlab"],
    portfolio: ["portfolio", "website", "personalwebsite", "personal_website", "site", "homepage", "personalurl", "portfoliourl", "web"],
    currentTitle: ["currenttitle", "current_title", "jobtitle", "job_title", "title", "position", "currentposition", "role", "designation", "mostrecenttitle"],
    currentCompany: ["currentcompany", "current_company", "company", "employer", "organization", "organisation", "currentemployer", "workplace", "mostrecentcompany"],
    yearsExperience: ["experience", "yearsofexperience", "years_of_experience", "years", "exp", "totalexperience", "workexperience", "yoe", "yearsexp"],
    education: ["education", "degree", "university", "college", "school", "highestdegree", "qualification", "highesteducation"],
    skills: ["skills", "skill", "technicalskills", "keyskills", "competencies", "expertise"],
    salaryExpectation: ["salary", "expectedsalary", "salaryexpectation", "compensation", "desiredsalary", "pay", "wage", "ctc", "expectedctc", "desiredcompensation"],
    address: ["address", "street", "streetaddress", "addressline1", "address1", "mailingaddress", "homeaddress", "street1"],
    city: ["city", "town", "locality", "municipality"],
    state: ["state", "province", "region", "stateprovince"],
    zip: ["zip", "zipcode", "postal", "postcode", "postalcode", "zip_code"],
    country: ["country", "nation", "countryregion"],
    coverLetter: ["coverletter", "cover_letter", "cover-letter", "letter", "message", "additionalinfo", "comments", "why", "motivation", "additionalinformation"],
    resumeText: ["resume", "cv", "summary", "about", "bio", "profile", "description", "experiencedescription", "professionalsummary"],
    workAuthorization: ["workauthorization", "work_authorization", "authorized", "legallyauthorized", "eligible", "sponsorship", "visa", "citizenship", "workpermit"],
    willingToRelocate: ["relocate", "relocation", "willingtorelocate", "open to relocate"],
    noticePeriod: ["notice", "noticeperiod", "notice_period", "availability", "startdate", "when can you start", "earlieststart"]
  };

  function normalize(str) {
    return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
  }

  function getAssociatedText(el) {
    const texts = [];
    if (el.id) {
      try {
        const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (label) texts.push(label.textContent);
      } catch (_) {}
    }
    const parentLabel = el.closest("label");
    if (parentLabel) texts.push(parentLabel.textContent);
    if (el.getAttribute("aria-labelledby")) {
      el.getAttribute("aria-labelledby").split(/\s+/).forEach(id => {
        const node = document.getElementById(id);
        if (node) texts.push(node.textContent);
      });
    }
    if (el.getAttribute("aria-label")) texts.push(el.getAttribute("aria-label"));
    if (el.placeholder) texts.push(el.placeholder);
    if (el.name) texts.push(el.name);
    if (el.id) texts.push(el.id);
    if (el.getAttribute("data-testid")) texts.push(el.getAttribute("data-testid"));
    if (el.getAttribute("autocomplete")) texts.push(el.getAttribute("autocomplete"));

    let prev = el.previousElementSibling;
    for (let i = 0; i < 3 && prev; i++) {
      if (["LABEL", "SPAN", "DIV", "P", "LEGEND"].includes(prev.tagName)) texts.push(prev.textContent);
      prev = prev.previousElementSibling;
    }

    const parent = el.closest("div, fieldset, li, tr");
    if (parent && parent !== document.body) {
      const clone = parent.cloneNode(true);
      clone.querySelectorAll("input, textarea, select, button").forEach(n => n.remove());
      const t = (clone.textContent || "").trim().slice(0, 140);
      if (t) texts.push(t);
    }
    return texts.join(" ");
  }

  function scoreField(el, keywords) {
    const blob = normalize(getAssociatedText(el));
    let score = 0;
    for (const kw of keywords) {
      const nkw = normalize(kw);
      if (!nkw) continue;
      if (blob === nkw) score += 12;
      else if (blob.includes(nkw)) score += 6;
      else if (nkw.length > 4 && blob.includes(nkw.slice(0, Math.ceil(nkw.length * 0.75)))) score += 3;
    }
    const ac = (el.getAttribute("autocomplete") || "").toLowerCase();
    if (ac.includes("email") && keywords.some(k => k.includes("email"))) score += 8;
    if (ac.includes("tel") && keywords.some(k => k.includes("phone"))) score += 8;
    if (ac.includes("given-name") && keywords.some(k => k.includes("first"))) score += 8;
    if (ac.includes("family-name") && keywords.some(k => k.includes("last"))) score += 8;
    return score;
  }

  function isVisible(el) {
    if (el.disabled) return false;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || parseFloat(style.opacity) === 0) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isFillable(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea" || tag === "select") return true;
    if (tag === "input") {
      const type = (el.type || "text").toLowerCase();
      return ["text", "email", "tel", "url", "number", "search", "password", "date"].includes(type) || type === "";
    }
    return !!el.isContentEditable;
  }

  function splitFullName(fullName) {
    if (!fullName) return { first: "", last: "" };
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return { first: parts[0], last: "" };
    return { first: parts[0], last: parts.slice(1).join(" ") };
  }

  function buildValues(profile) {
    const nameParts = splitFullName(profile.fullName || "");
    const skillsStr = Array.isArray(profile.skills) ? profile.skills.join(", ") : (profile.skills || "");
    return {
      fullName: profile.fullName || "",
      firstName: profile.firstName || nameParts.first,
      lastName: profile.lastName || nameParts.last,
      email: profile.email || "",
      phone: profile.phone || "",
      linkedin: profile.linkedin || "",
      github: profile.github || "",
      portfolio: profile.portfolio || "",
      currentTitle: profile.currentTitle || "",
      currentCompany: profile.currentCompany || "",
      yearsExperience: profile.yearsExperience || "",
      education: profile.educationText || "",
      skills: skillsStr,
      salaryExpectation: profile.salaryExpectation || "",
      address: profile.address || "",
      city: profile.city || "",
      state: profile.state || "",
      zip: profile.zip || "",
      country: profile.country || "",
      coverLetter: (profile.coverLetterTemplate || "")
        .replace(/\{\{name\}\}/gi, profile.fullName || "")
        .replace(/\{\{company\}\}/gi, "")
        .replace(/\{\{role\}\}/gi, "")
        .replace(/\{\{skills\}\}/gi, skillsStr),
      resumeText: profile.resumeText || "",
      workAuthorization: profile.workAuthorization || "",
      willingToRelocate: profile.willingToRelocate || "",
      noticePeriod: profile.noticePeriod || ""
    };
  }

  function fillElement(el, value) {
    if (value === undefined || value === null || value === "") return false;
    const tag = el.tagName.toLowerCase();

    if (tag === "select") {
      const options = Array.from(el.options);
      const nval = normalize(String(value));
      let match = options.find(o => normalize(o.text) === nval || normalize(o.value) === nval);
      if (!match) match = options.find(o => normalize(o.text).includes(nval) || nval.includes(normalize(o.text)));
      if (match) {
        el.value = match.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
      return false;
    }

    if (el.isContentEditable) {
      el.focus();
      el.textContent = value;
      el.dispatchEvent(new InputEvent("input", { bubbles: true }));
      return true;
    }

    el.focus();
    const setter = tag === "textarea"
      ? Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set
      : Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;

    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    return true;
  }

  function fillRadiosAndChecks(values) {
    const pairs = [
      { key: "workAuthorization", yesWords: ["yes", "authorized", "citizen", "permanent", "eligible"], noWords: ["no", "sponsor"] },
      { key: "willingToRelocate", yesWords: ["yes", "willing", "open"], noWords: ["no"] }
    ];
    document.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach(input => {
      if (!isVisible(input)) return;
      const text = normalize(getAssociatedText(input) + " " + (input.value || ""));
      for (const pair of pairs) {
        const val = (values[pair.key] || "").toLowerCase();
        if (!val) continue;
        const wantsYes = pair.yesWords.some(w => val.includes(w));
        if (wantsYes && pair.yesWords.some(w => text.includes(w)) && !input.checked) {
          input.click();
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    });
  }

  async function autofillPage() {
    const profile = await new Promise(r => chrome.runtime.sendMessage({ action: "getActiveProfile" }, res => r(res?.profile || null)));
    if (!profile) {
      showToast("No profile found. Open JobPro and create one.");
      return { filled: 0 };
    }

    const settings = await new Promise(r => chrome.runtime.sendMessage({ action: "getSettings" }, res => r(res?.settings || {})));
    const fillOnlyEmpty = settings.fillOnlyEmpty !== false;
    const values = buildValues(profile);

    const inputs = Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']"))
      .filter(el => isFillable(el) && isVisible(el));

    let filledCount = 0;
    const used = new Set();

    for (const [fieldKey, keywords] of Object.entries(FIELD_MAP)) {
      if (!values[fieldKey]) continue;
      let best = null, bestScore = 0;
      for (const el of inputs) {
        if (used.has(el)) continue;
        const score = scoreField(el, keywords);
        if (score > bestScore) { bestScore = score; best = el; }
      }
      if (best && bestScore >= 5) {
        const current = (best.value || best.textContent || "").trim();
        if (fillOnlyEmpty && current) { used.add(best); continue; }
        if (fillElement(best, values[fieldKey])) { used.add(best); filledCount++; }
      }
    }

    fillRadiosAndChecks(values);

    if (profile.resumeBase64 && profile.resumeFileName) {
      attachResume(profile);
    }

    chrome.runtime.sendMessage({
      action: "logApplication",
      url: location.href,
      title: document.title,
      profileName: profile.name
    });

    showToast(`Filled ${filledCount} field${filledCount !== 1 ? "s" : ""} ✓`);
    return { filled: filledCount };
  }

  function attachResume(profile) {
    try {
      const b64 = profile.resumeBase64.split(",").pop();
      const byteChars = atob(b64);
      const byteNumbers = new Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
      const file = new File([new Uint8Array(byteNumbers)], profile.resumeFileName || "resume.pdf", {
        type: profile.resumeFileName?.toLowerCase().endsWith(".pdf") ? "application/pdf" : "application/octet-stream"
      });

      const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')).filter(isVisible);
      for (const input of fileInputs) {
        const label = normalize(getAssociatedText(input));
        if (label.includes("resume") || label.includes("cv") || label.includes("attach") || label.includes("upload") || fileInputs.length === 1) {
          const dt = new DataTransfer();
          dt.items.add(file);
          input.files = dt.files;
          input.dispatchEvent(new Event("change", { bubbles: true }));
          input.dispatchEvent(new Event("input", { bubbles: true }));
          showToast("Resume attached ✓");
          break;
        }
      }
    } catch (e) {
      console.warn("Resume attach failed", e);
    }
  }

  function extractJobDescription() {
    const selectors = [
      "[data-testid='job-description']", ".job-description", "#job-description",
      ".description", ".jobDescription", "[class*='job-description']",
      "[class*='JobDescription']", "article", "[role='main']"
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.innerText || "").trim();
        if (text.length > 300) return text.slice(0, 8000);
      }
    }
    let best = "";
    document.querySelectorAll("div, section, article").forEach(el => {
      if (el.querySelector("input, textarea, select")) return;
      const t = (el.innerText || "").trim();
      if (t.length > best.length && t.length < 15000) best = t;
    });
    return best.slice(0, 8000);
  }

  // Floating button
  let floatingBtn = null, isDragging = false;

  function createFloatingButton() {
    if (document.getElementById("jobpro-fab")) return;
    floatingBtn = document.createElement("div");
    floatingBtn.id = "jobpro-fab";
    floatingBtn.innerHTML = `<div class="jfp-fab-inner" title="JobPro – Autofill (Ctrl+Shift+F)"><span class="jfp-icon">⚡</span><span class="jfp-label">Fill</span></div>`;
    document.body.appendChild(floatingBtn);

    chrome.storage.local.get(["fabPosition"], (data) => {
      if (data.fabPosition) {
        floatingBtn.style.left = data.fabPosition.left;
        floatingBtn.style.top = data.fabPosition.top;
        floatingBtn.style.right = "auto";
        floatingBtn.style.bottom = "auto";
      }
    });

    floatingBtn.querySelector(".jfp-fab-inner").addEventListener("click", async (e) => {
      if (isDragging) return;
      e.preventDefault(); e.stopPropagation();
      floatingBtn.classList.add("jfp-loading");
      await autofillPage();
      floatingBtn.classList.remove("jfp-loading");
    });

    let startX, startY, origX, origY;
    floatingBtn.addEventListener("mousedown", (e) => {
      isDragging = false;
      startX = e.clientX; startY = e.clientY;
      const rect = floatingBtn.getBoundingClientRect();
      origX = rect.left; origY = rect.top;
      const onMove = (ev) => {
        if (Math.abs(ev.clientX - startX) > 4 || Math.abs(ev.clientY - startY) > 4) isDragging = true;
        floatingBtn.style.left = Math.max(0, Math.min(window.innerWidth - 70, origX + ev.clientX - startX)) + "px";
        floatingBtn.style.top = Math.max(0, Math.min(window.innerHeight - 70, origY + ev.clientY - startY)) + "px";
        floatingBtn.style.right = "auto"; floatingBtn.style.bottom = "auto";
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        chrome.storage.local.set({ fabPosition: { left: floatingBtn.style.left, top: floatingBtn.style.top } });
        setTimeout(() => { isDragging = false; }, 30);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }

  function showToast(msg) {
    let toast = document.getElementById("jobpro-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "jobpro-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("jfp-show");
    setTimeout(() => toast.classList.remove("jfp-show"), 2600);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "triggerAutofill") {
      autofillPage().then(r => sendResponse(r));
      return true;
    }
    if (message.action === "extractJD") {
      sendResponse({ jd: extractJobDescription(), title: document.title, url: location.href });
      return true;
    }
    if (message.action === "toggleFab") {
      if (message.show) createFloatingButton();
      else document.getElementById("jobpro-fab")?.remove();
    }
  });

  function init() {
    chrome.storage.local.get(["settings"], (data) => {
      if (data.settings?.showFloatingButton !== false) setTimeout(createFloatingButton, 600);
    });
    const observer = new MutationObserver(() => {
      if (!document.getElementById("jobpro-fab")) {
        chrome.storage.local.get(["settings"], (data) => {
          if (data.settings?.showFloatingButton !== false) createFloatingButton();
        });
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
