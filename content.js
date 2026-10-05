// JobPro - cross-page autofill engine
// Plain JavaScript. No backend or AI calls in this phase.

(function () {
  "use strict";

  const FIELD_MAP = {
    fullName: ["full name", "fullname", "your name", "applicant name", "candidate name", "legal name", "display name", "name", "applicant", "candidate"],
    firstName: ["first name", "firstname", "fname", "given name", "forename", "given-name"],
    lastName: ["last name", "lastname", "lname", "surname", "family name", "family-name"],
    email: ["email", "e-mail", "email address", "emailaddress", "mail", "user email", "contact email"],
    phone: ["phone", "telephone", "mobile", "cell phone", "phone number", "tel", "contact number", "mobile phone", "mobile-number"],
    linkedin: ["linkedin", "linkedin url", "linkedin profile", "linked in"],
    github: ["github", "github url", "github profile"],
    portfolio: ["portfolio", "personal website", "personal site", "website", "homepage", "portfolio url"],
    currentTitle: ["current title", "job title", "jobtitle", "current position", "position", "role", "designation", "organization-title"],
    currentCompany: ["current company", "current employer", "company", "employer", "organization", "organisation", "workplace", "organization-name"],
    yearsExperience: ["years experience", "years of experience", "total experience", "work experience", "experience", "yoe"],
    education: ["education", "degree", "university", "college", "school", "highest degree", "qualification"],
    skills: ["skills", "technical skills", "key skills", "competencies"],
    salaryExpectation: ["salary", "expected salary", "salary expectation", "compensation", "desired salary", "ctc", "expected ctc"],
    address: ["address", "street", "street address", "address line 1", "mailing address", "home address", "street-address", "address1", "address-line-1"],
    city: ["city", "town", "locality", "address-level2"],
    state: ["state", "province", "region", "address-level1"],
    zip: ["zip", "zip code", "postal", "postcode", "postal code", "postal-code"],
    country: ["country", "nation", "country-name"],
    coverLetter: ["cover letter", "coverletter", "additional information", "comments", "motivation", "why do you want", "message"],
    gender: ["gender", "sex"],
    eeo: ["eeo", "equal employment opportunity", "self identification"],
    resumeText: ["resume", "cv", "summary", "about", "bio", "profile", "description", "experience description"],
    workAuthorization: ["work authorization", "authorized to work", "legally authorized", "right to work"],
    sponsorship: ["sponsorship", "require sponsorship", "visa sponsorship", "need sponsorship"],
    relocation: ["relocation", "willing to relocate", "relocate"],
    noticePeriod: ["notice period", "availability", "available to start", "start date"]
  };

  const ANSWER_KEYS = ["workAuthorization", "sponsorship", "relocation", "noticePeriod", "gender", "eeo", "availableStartDate"];
  const MULTI_FILL = new Set(["fullName", "firstName", "lastName", "email", "phone"]);
  const URL_KEYS = new Set(["linkedin", "github", "portfolio"]);
  const FILLED = [];
  let observerArmed = false;
  let observerTimer = null;
  let floatingBtn = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  function splitFullName(fullName) {
    const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
    return { first: parts[0] || "", last: parts.slice(1).join(" ") };
  }

  function tokens(value) {
    return String(value || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
  }

  function tokenPhraseMatch(candidate, keyword) {
    const c = tokens(candidate);
    const k = tokens(keyword);
    if (!c.length || !k.length) return false;
    if (k.length === 1 && k[0].length <= 3) return c.length === 1 && c[0] === k[0];
    for (let i = 0; i <= c.length - k.length; i++) {
      if (k.every((part, n) => c[i + n] === part)) return true;
    }
    return false;
  }

  function normalize(value) {
    return tokens(value).join(" ");
  }

  function getLabelText(el) {
    if (el.id) {
      const label = Array.from(document.querySelectorAll("label")).find(x => x.htmlFor === el.id);
      if (label) return label.textContent || "";
    }
    const parent = el.closest("label");
    if (parent) return parent.textContent || "";
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      return labelledBy.split(/\s+/).map(id => {
        const node = document.getElementById(id);
        return node ? node.textContent : "";
      }).join(" ");
    }
    const fieldset = el.closest("fieldset");
    const legend = fieldset && fieldset.querySelector("legend");
    if (legend) return legend.textContent || "";
    let prev = el.previousElementSibling;
    if (prev && /^(LABEL|SPAN|DIV|P)$/.test(prev.tagName)) return prev.textContent || "";
    return el.getAttribute("aria-label") || el.placeholder || "";
  }

  function getFieldDescriptors(el) {
    const fieldset = el.closest("fieldset");
    const legend = fieldset && fieldset.querySelector("legend")?.textContent;
    const autocomplete = el.getAttribute("autocomplete") || "";
    const describedBy = (el.getAttribute("aria-describedby") || "").split(/\\s+/).filter(Boolean)
      .map(id => document.getElementById(id)?.textContent || "").join(" ");
    const parentText = el.parentElement?.textContent || "";
    return [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute("aria-label"),
      autocomplete,
      getLabelText(el),
      legend,
      describedBy,
      parentText.slice(0, 500)
    ].filter(Boolean);
  }

  function semanticHint(el) {
    const text = normalize(getLabelText(el) + " " + (el.name || "") + " " + (el.id || ""));
    if (tokenPhraseMatch(text, "linkedin")) return "linkedin";
    if (tokenPhraseMatch(text, "github")) return "github";
    if (tokenPhraseMatch(text, "portfolio") || tokenPhraseMatch(text, "website") || tokenPhraseMatch(text, "personal site")) return "portfolio";
    return "";
  }

  function scoreField(el, keywords, fieldKey) {
    const hint = semanticHint(el);
    if (URL_KEYS.has(fieldKey) && hint && hint !== fieldKey) return 0;
    if (fieldKey === "fullName") {
      const descriptorText = normalize(getFieldDescriptors(el).join(" "));
      if (["first name", "last name", "given name", "family name", "surname", "confirm name"].some(x => tokenPhraseMatch(descriptorText, x))) return 0;
    }
    const descriptors = getFieldDescriptors(el);
    let score = 0;
    for (const keyword of keywords) {
      for (const descriptor of descriptors) {
        if (tokenPhraseMatch(descriptor, keyword)) {
          score += normalize(descriptor) === normalize(keyword) ? 12 : 7;
        }
      }
    }
    const type = (el.type || "").toLowerCase();
    const autocomplete = normalize(el.getAttribute("autocomplete") || "");
    if (fieldKey === "email" && (type === "email" || autocomplete === "email")) score += 10;
    if (fieldKey === "phone" && (type === "tel" || autocomplete === "tel" || autocomplete === "tel-national")) score += 10;
    if (fieldKey === "firstName" && (autocomplete === "given name" || autocomplete === "given-name")) score += 10;
    if (fieldKey === "lastName" && (autocomplete === "family name" || autocomplete === "family-name")) score += 10;
    if (fieldKey === "fullName" && autocomplete === "name") score += 10;
    if (fieldKey === "address" && autocomplete.includes("street")) score += 10;
    if (fieldKey === "city" && autocomplete.includes("address-level2")) score += 10;
    if (fieldKey === "state" && autocomplete.includes("address-level1")) score += 10;
    if (fieldKey === "zip" && autocomplete.includes("postal-code")) score += 10;
    if (fieldKey === "country" && autocomplete.includes("country")) score += 10;
    if (fieldKey === "currentCompany" && autocomplete === "organization") score += 9;
    if (fieldKey === "currentTitle" && autocomplete === "organization-title") score += 9;
    if (URL_KEYS.has(fieldKey) && type === "url" && !hint) score += 2;
    return score;
  }

  function isHiddenByAncestor(el) {
    let node = el;
    while (node && node.nodeType === 1) {
      if (node.hidden || node.getAttribute("aria-hidden") === "true") return true;
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return true;
      node = node.parentElement;
    }
    return false;
  }

  function isInSearchArea(el) {
    if (el.closest('form[role="search"], header, nav, [role="banner"], [role="navigation"]')) return true;
    return false;
  }

  function isFillable(el) {
    const tag = (el.tagName || "").toLowerCase();
    if (isInSearchArea(el)) return false;
    if (tag === "textarea" || tag === "select") return !isHiddenByAncestor(el);
    if (el.isContentEditable) return !isHiddenByAncestor(el);
    if (tag !== "input") return false;
    const type = (el.type || "text").toLowerCase();
    if (["hidden", "search", "password", "file", "submit", "button", "reset", "image"].includes(type)) return false;
    return !isHiddenByAncestor(el);
  }

  function getRoots(root) {
    const roots = [root];
    const elements = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (const node of elements) {
      if (node.shadowRoot && node.shadowRoot.mode === "open") roots.push(...getRoots(node.shadowRoot));
    }
    return roots;
  }

  function allElements(selector) {
    const found = [];
    for (const root of getRoots(document)) {
      if (root.querySelectorAll) found.push(...root.querySelectorAll(selector));
    }
    return Array.from(new Set(found));
  }

  function readJobInfo() {
    let role = "";
    let company = "";

    const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || "");
        const list = Array.isArray(data) ? data : [data];
        const posting = list.find(x => x && (x["@type"] === "JobPosting" || (Array.isArray(x["@type"]) && x["@type"].includes("JobPosting"))));
        if (posting) {
          role = posting.title || role;
          company = posting.hiringOrganization?.name || company;
          if (role || company) break;
        }
      } catch (_) {}
    }

    if (!role) {
      const og = document.querySelector('meta[property="og:title"]');
      role = og?.content || "";
    }
    if (!role) role = document.querySelector("h1")?.textContent?.trim() || "";

    if (!company) {
      const title = document.title || "";
      const source = role || title;
      const match = source.match(/(.+?)\s+(?:at|@)\s+(.+)$/i) || source.match(/^(.+?)\s+[-|–]\s+(.+)$/);
      if (match) {
        role = role || match[1].trim();
        company = match[2].trim();
      }
    }

    return { role: role.trim(), company: company.trim() };
  }

  function getProfileAnswer(profile, key) {
    const answers = profile.answers || {};
    return profile[key] ?? answers[key] ?? "";
  }

  function buildValues(profile, job) {
    const nameParts = splitFullName(profile.fullName);
    const template = profile.coverLetterTemplate || "";
    const values = {
      fullName: profile.fullName || "",
      firstName: nameParts.first,
      lastName: nameParts.last,
      email: profile.email || "",
      phone: profile.phone || "",
      linkedin: profile.linkedin || "",
      github: profile.github || "",
      portfolio: profile.portfolio || "",
      currentTitle: profile.currentTitle || "",
      currentCompany: profile.currentCompany || "",
      yearsExperience: profile.yearsExperience || "",
      education: profile.education || "",
      skills: profile.skills || "",
      salaryExpectation: profile.salaryExpectation || "",
      address: profile.address || "",
      city: profile.city || "",
      state: profile.state || "",
      zip: profile.zip || "",
      country: profile.country || "",
      workAuthorization: getProfileAnswer(profile, "workAuthorization"),
      sponsorship: getProfileAnswer(profile, "sponsorship"),
      relocation: getProfileAnswer(profile, "relocation"),
      noticePeriod: getProfileAnswer(profile, "noticePeriod"),
      gender: getProfileAnswer(profile, "gender"),
      eeo: getProfileAnswer(profile, "eeo"),
      availableStartDate: getProfileAnswer(profile, "availableStartDate"),
      coverLetter: template
        .replace(/\{\{name\}\}/gi, profile.fullName || "")
        .replace(/\{\{skills\}\}/gi, profile.skills || "")
        .replace(/\{\{company\}\}/gi, job.company || "{{company}}")
        .replace(/\{\{role\}\}/gi, job.role || "{{role}}"),
      resumeText: profile.resumeText || ""
    };
    return values;
  }

  function isEmpty(el) {
    if (el.type === "checkbox" || el.type === "radio") return !el.checked;
    if (el.tagName.toLowerCase() === "select") return !el.value;
    return !String(el.value ?? el.textContent ?? "").trim();
  }

  function nativeSetValue(el, value) {
    const tag = el.tagName.toLowerCase();
    if (tag === "select") {
      const target = normalize(value);
      const option = Array.from(el.options).find(o => {
        const text = normalize(o.text), optValue = normalize(o.value);
        return text === target || optValue === target || tokenPhraseMatch(text, value) ||
          (target.length > 2 && (text.includes(target) || target.includes(text)));
      });
      if (!option) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      if (setter) setter.call(el, option.value); else el.value = option.value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }

    const proto = tag === "textarea" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value); else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("keyup", { bubbles: true }));
    return true;
  }

  function optionText(el) {
    const label = getLabelText(el);
    if (label) return label;
    return el.value || "";
  }

  function answerRadioOrCheckbox(el, answer, fieldKey) {
    if (!answer) return false;
    const wanted = normalize(answer);
    const option = normalize(optionText(el));
    if (!option) return false;

    const direct = option === wanted || tokenPhraseMatch(option, wanted) || tokenPhraseMatch(wanted, option);
    const yesNo = /^(yes|no|true|false)$/i.test(String(answer)) && option === wanted;
    if (!direct && !yesNo) return false;

    const old = { checked: el.checked, value: el.value };
    el.checked = true;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    FILLED.push({ el, fieldKey, confidence: 0.95, old, label: getLabelText(el) || el.value || fieldKey });
    return true;
  }

  async function fillCustomDropdown(el, value, record) {
    if (!value) return false;
    const before = el.textContent || el.getAttribute("aria-valuetext") || "";
    try {
      el.click();
      await new Promise(r => setTimeout(r, 80));
      const options = allElements('[role="option"], [data-value], li[role="option"]');
      const match = options.find(o => {
        const text = normalize(o.textContent || o.getAttribute("aria-label") || o.getAttribute("data-value"));
        return text === normalize(value) || tokenPhraseMatch(text, value);
      });
      if (!match) return false;
      match.click();
      record.oldText = before;
      record.confidence = 0.86;
      return true;
    } catch (_) {
      return false;
    }
  }

  function fillElement(el, value, fieldKey, confidence) {
    if (value === "" || value == null) return false;
    const tag = (el.tagName || "").toLowerCase();
    const type = (el.type || "").toLowerCase();
    const old = {
      value: el.value,
      checked: el.checked,
      textContent: el.textContent
    };

    if (type === "radio" || type === "checkbox") return answerRadioOrCheckbox(el, value, fieldKey);
    if (tag === "select") {
      const ok = nativeSetValue(el, value);
      if (ok) FILLED.push({ el, fieldKey, confidence, old, label: getLabelText(el) || el.name || fieldKey });
      return ok;
    }
    if (el.isContentEditable) {
      el.focus();
      el.textContent = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      el.focus();
      nativeSetValue(el, value);
    }
    FILLED.push({ el, fieldKey, confidence, old, label: getLabelText(el) || el.name || el.id || fieldKey });
    return true;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function storeAndAttachResume(input, profile) {
    const base64 = profile.resumeFileBase64;
    if (!base64 || !input || input.type !== "file") return false;
    try {
      const comma = base64.indexOf(",");
      const meta = comma > -1 ? base64.slice(0, comma) : "";
      const data = comma > -1 ? base64.slice(comma + 1) : base64;
      const mime = (meta.match(/data:([^;]+)/) || [])[1] || "application/pdf";
      const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0));
      const blob = new Blob([bytes], { type: mime });
      const file = new File([blob], profile.resumeFileName || "resume.pdf", { type: mime });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      FILLED.push({ el: input, fieldKey: "resumeFile", confidence: 0.99, old: { files: input.files }, label: "Resume upload" });
      return true;
    } catch (_) {
      return false;
    }
  }

  function findCandidates(inputs, fieldKey, keywords) {
    return inputs
      .map(el => ({ el, score: scoreField(el, keywords, fieldKey) }))
      .filter(x => x.score >= 7)
      .sort((a, b) => b.score - a.score);
  }

  function getAnswerElements(fieldKey, answer) {
    if (!answer) return [];
    return allElements('input[type="radio"], input[type="checkbox"]').filter(el => {
      if (isInSearchArea(el) || isHiddenByAncestor(el)) return false;
      const descriptors = getFieldDescriptors(el);
      return descriptors.some(d => FIELD_MAP[fieldKey]?.some(k => tokenPhraseMatch(d, k))) ||
        tokenPhraseMatch(getLabelText(el), fieldKey);
    });
  }

  async function autofillPage(options = {}) {
    const fillOnlyEmpty = options.fillOnlyEmpty !== false;
    const profile = options.profile || await getActiveProfile();
    if (!profile) {
      showToast("No active profile found. Open JobFill Pro and create a profile.");
      return { filled: 0 };
    }

    FILLED.length = 0;
    const job = readJobInfo();
    const values = buildValues(profile, job);
    const inputs = allElements("input, textarea, select, [contenteditable='true']").filter(isFillable);
    const used = new Set();
    let filled = 0;

    for (const [fieldKey, keywords] of Object.entries(FIELD_MAP)) {
      const value = values[fieldKey];
      if (!value) continue;
      const candidates = findCandidates(inputs, fieldKey, keywords).filter(x => !used.has(x.el));
      const limit = MULTI_FILL.has(fieldKey) ? candidates.length : 1;

      for (const candidate of candidates.slice(0, limit)) {
        if (fillOnlyEmpty && !isEmpty(candidate.el)) continue;
        if (candidate.el.type === "radio" || candidate.el.type === "checkbox") {
          if (answerRadioOrCheckbox(candidate.el, value, fieldKey)) {
            used.add(candidate.el);
            filled++;
          }
        } else {
          const ok = fillElement(candidate.el, value, fieldKey, Math.min(0.99, candidate.score / 20));
          if (ok) {
            used.add(candidate.el);
            filled++;
          }
        }
      }
    }

    // Explicit answer groups such as Gender / EEO are intentionally opt-in from profile.answers.
    for (const key of ["gender", "eeo"]) {
      const answer = values[key];
      if (!answer) continue;
      const elements = getAnswerElements(key, answer);
      for (const el of elements) {
        if (answerRadioOrCheckbox(el, answer, key)) {
          filled++;
          break;
        }
      }
    }

    // Custom comboboxes.
    const combos = allElements('[role="combobox"], [aria-haspopup="listbox"]').filter(el => !isHiddenByAncestor(el));
    for (const combo of combos) {
      const fieldKey = Object.keys(FIELD_MAP).find(key => scoreField(combo, FIELD_MAP[key], key) >= 7);
      if (!fieldKey || !values[fieldKey] || combo.getAttribute("aria-disabled") === "true") continue;
      const record = { el: combo, fieldKey, confidence: 0.86, oldText: combo.textContent || "" };
      if (await fillCustomDropdown(combo, values[fieldKey], record)) {
        FILLED.push({ ...record, label: getLabelText(combo) || fieldKey });
        filled++;
      }
    }

    // Date inputs: use a stored ISO date answer only when the field itself is date-like.
    for (const input of inputs.filter(el => el.tagName.toLowerCase() === "input" && el.type === "date")) {
      const key = ["availableStartDate", "noticePeriod"].find(k => values[k]);
      if (!key || (fillOnlyEmpty && !isEmpty(input))) continue;
      if (scoreField(input, FIELD_MAP.noticePeriod, "noticePeriod") >= 7 || tokenPhraseMatch(getLabelText(input), "start date")) {
        if (fillElement(input, values[key], key, 0.9)) filled++;
      }
    }

    // Resume file upload.
    for (const input of allElements('input[type="file"]').filter(el => !isHiddenByAncestor(el))) {
      const label = normalize(getLabelText(input));
      if (tokenPhraseMatch(label, "resume") || tokenPhraseMatch(label, "cv") || input.accept?.toLowerCase().includes("pdf")) {
        if (await storeAndAttachResume(input, profile)) filled++;
      }
    }

    const placeholders = [values.coverLetter, values.currentCompany, values.currentTitle].some(v => String(v).includes("{{company}}") || String(v).includes("{{role}}"));
    if (placeholders) showToast("Company or job title was not found; placeholder kept for review.");

    if (filled > 0) {
      chrome.runtime.sendMessage({
        action: "logApplication",
        url: location.href,
        title: document.title,
        profileName: profile.name,
        filledCount: filled
      });
      showReviewOverlay();
    } else {
      showToast("No empty matching fields found.");
    }
    observerArmed = true;
    return { filled, job };
  }

  async function getActiveProfile() {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({ action: "getActiveProfile" }, response => resolve(response?.profile || null));
    });
  }

  function showReviewOverlay() {
    let box = document.getElementById("jobfill-pro-review");
    if (box) box.remove();
    box = document.createElement("div");
    box.id = "jobfill-pro-review";
    Object.assign(box.style, {
      position: "fixed", top: "16px", right: "16px", width: "340px", maxHeight: "70vh",
      overflow: "auto", zIndex: "2147483647", background: "#fff", color: "#111827",
      border: "1px solid #d1d5db", borderRadius: "12px", boxShadow: "0 12px 32px rgba(0,0,0,.25)",
      padding: "12px", font: "13px Arial, sans-serif"
    });

    const title = document.createElement("div");
    title.innerHTML = "<strong>JobFill Pro review</strong><div style='margin:4px 0 10px;color:#6b7280'>Check filled fields. Undo anything you do not want.</div>";
    box.appendChild(title);

    for (const [index, item] of FILLED.entries()) {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:8px;align-items:center;border-top:1px solid #eee;padding:8px 0";
      const label = document.createElement("span");
      label.style.flex = "1";
      label.textContent = item.label + " · " + Math.round((item.confidence || 0) * 100) + "%";
      const undo = document.createElement("button");
      undo.textContent = "Undo";
      undo.onclick = () => {
        restoreFilled(item);
        row.remove();
        if (!box.querySelector("button[data-close]") && !box.querySelector("div[data-row]")) return;
      };
      row.append(label, undo);
      box.appendChild(row);
    }

    const close = document.createElement("button");
    close.textContent = "Close";
    close.dataset.close = "1";
    close.style.cssText = "margin-top:8px;width:100%;padding:7px;border:0;border-radius:7px;background:#eef2ff;cursor:pointer";
    close.onclick = () => box.remove();
    box.appendChild(close);
    document.body.appendChild(box);
  }

  function restoreFilled(item) {
    const el = item.el;
    if (!el) return;
    if (item.fieldKey === "resumeFile") {
      try { el.value = ""; } catch (_) {}
      return;
    }
    if (el.type === "radio" || el.type === "checkbox") {
      el.checked = item.old.checked;
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
    if (el.isContentEditable) {
      el.textContent = item.old.textContent || "";
      return;
    }
    if (item.oldText != null) {
      el.textContent = item.oldText;
      return;
    }
    const tag = el.tagName.toLowerCase();
    const proto = tag === "textarea" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, item.old.value || ""); else el.value = item.old.value || "";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function showToast(message) {
    let toast = document.getElementById("jobfill-pro-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "jobfill-pro-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("jfp-show");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove("jfp-show"), 3000);
  }

  function createFloatingButton() {
    if (document.getElementById("jobfill-pro-fab") || !document.body) return;
    floatingBtn = document.createElement("div");
    floatingBtn.id = "jobfill-pro-fab";
    floatingBtn.innerHTML = '<div class="jfp-fab-inner" title="JobFill Pro - Autofill"><span class="jfp-icon">⚡</span><span class="jfp-label">Fill</span></div>';
    document.body.appendChild(floatingBtn);
    chrome.storage.local.get(["fabPosition"], data => {
      if (data.fabPosition) {
        floatingBtn.style.left = data.fabPosition.left;
        floatingBtn.style.top = data.fabPosition.top;
        floatingBtn.style.right = "auto";
        floatingBtn.style.bottom = "auto";
      }
    });
    floatingBtn.querySelector(".jfp-fab-inner").addEventListener("click", async e => {
      if (isDragging) return;
      e.preventDefault();
      e.stopPropagation();
      floatingBtn.classList.add("jfp-loading");
      await autofillPage();
      floatingBtn.classList.remove("jfp-loading");
    });
    floatingBtn.addEventListener("mousedown", startDrag);
    floatingBtn.addEventListener("touchstart", startDrag, { passive: false });
  }

  function startDrag(e) {
    isDragging = false;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = floatingBtn.getBoundingClientRect();
    dragOffset.x = clientX - rect.left;
    dragOffset.y = clientY - rect.top;

    const onMove = ev => {
      isDragging = true;
      const x = (ev.touches ? ev.touches[0].clientX : ev.clientX) - dragOffset.x;
      const y = (ev.touches ? ev.touches[0].clientY : ev.clientY) - dragOffset.y;
      floatingBtn.style.left = Math.max(0, Math.min(window.innerWidth - 60, x)) + "px";
      floatingBtn.style.top = Math.max(0, Math.min(window.innerHeight - 60, y)) + "px";
      floatingBtn.style.right = "auto";
      floatingBtn.style.bottom = "auto";
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onUp);
      chrome.storage.local.set({ fabPosition: { left: floatingBtn.style.left, top: floatingBtn.style.top } });
      setTimeout(() => { isDragging = false; }, 50);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
  }

  function removeFloatingButton() {
    document.getElementById("jobfill-pro-fab")?.remove();
  }

  function armMutationObserver() {
    if (window.__jobfillProObserver) return;
    const hasFormControl = node => {
      if (!node || node.nodeType !== 1) return false;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(node.tagName)) return true;
      if (node.matches?.('[role="combobox"]')) return true;
      return Boolean(node.querySelector?.('input, textarea, select, [role="combobox"]'));
    };
    const observer = new MutationObserver(mutations => {
      if (!observerArmed || observerTimer) return;
      if (!mutations.some(m => Array.from(m.addedNodes).some(hasFormControl))) return;
      observerTimer = setTimeout(async () => {
        observerTimer = null;
        await autofillPage();
      }, 500);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__jobfillProObserver = observer;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "triggerAutofill") {
      autofillPage().then(result => sendResponse(result));
      return true;
    }
    if (message.action === "getJobInfo") {
      sendResponse(readJobInfo());
      return true;
    }
    if (message.action === "extractJD") {
      const text = document.body?.innerText || "";
      sendResponse({ jd: text.replace(/\s+/g, " ").trim().slice(0, 12000) });
      return true;
    }
    if (message.action === "toggleFab") {
      if (message.show) createFloatingButton();
      else removeFloatingButton();
    }
  });

  function init() {
    armMutationObserver();
    chrome.storage.local.get(["settings"], data => {
      if ((data.settings || {}).showFloatingButton !== false) setTimeout(createFloatingButton, 800);
    });
  }

  // Small test hook used only by /tests; no production dependency.
  window.__jobfillProTest = { autofillPage, scoreField, tokenPhraseMatch, readJobInfo, buildValues };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
