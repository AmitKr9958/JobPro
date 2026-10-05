// JobFill Pro - Content Script
// Robust form field detection + autofill + floating button

(function () {
  "use strict";

  // ====================== FIELD MAPPING ======================
  // Maps profile keys to arrays of keywords/patterns found in name/id/placeholder/label/aria
  const FIELD_MAP = {
    fullName: [
      "fullname", "full_name", "full-name", "name", "yourname", "your_name",
      "applicantname", "candidate_name", "legalname", "displayname"
    ],
    firstName: [
      "firstname", "first_name", "first-name", "fname", "givenname", "given_name",
      "forename"
    ],
    lastName: [
      "lastname", "last_name", "last-name", "lname", "surname", "familyname",
      "family_name"
    ],
    email: [
      "email", "e-mail", "emailaddress", "email_address", "mail", "useremail",
      "contactemail"
    ],
    phone: [
      "phone", "telephone", "mobile", "cellphone", "cell", "phonenumber",
      "phone_number", "tel", "contactnumber", "mobilephone"
    ],
    linkedin: [
      "linkedin", "linked-in", "linkedinurl", "linkedin_url", "linkedinprofile",
      "linkedin_profile", "li_url"
    ],
    github: [
      "github", "githuburl", "github_url", "githubprofile", "git"
    ],
    portfolio: [
      "portfolio", "website", "personalwebsite", "personal_website", "site",
      "web", "homepage", "url", "personalurl", "portfoliourl"
    ],
    currentTitle: [
      "currenttitle", "current_title", "jobtitle", "job_title", "title",
      "position", "currentposition", "role", "designation"
    ],
    currentCompany: [
      "currentcompany", "current_company", "company", "employer", "organization",
      "organisation", "currentemployer", "workplace"
    ],
    yearsExperience: [
      "experience", "yearsofexperience", "years_of_experience", "years",
      "exp", "totalexperience", "workexperience", "yoe"
    ],
    education: [
      "education", "degree", "university", "college", "school", "highestdegree",
      "qualification"
    ],
    skills: [
      "skills", "skill", "technicalskills", "keyskills", "competencies"
    ],
    salaryExpectation: [
      "salary", "expectedsalary", "salaryexpectation", "compensation",
      "desiredsalary", "pay", "wage", "ctc", "expectedctc"
    ],
    address: [
      "address", "street", "streetaddress", "addressline1", "address1",
      "mailingaddress", "homeaddress"
    ],
    city: ["city", "town", "locality"],
    state: ["state", "province", "region"],
    zip: ["zip", "zipcode", "postal", "postcode", "postalcode"],
    country: ["country", "nation"],
    coverLetter: [
      "coverletter", "cover_letter", "cover-letter", "letter", "message",
      "additionalinfo", "comments", "why", "motivation"
    ],
    resumeText: [
      "resume", "cv", "summary", "about", "bio", "profile", "description",
      "experience description"
    ]
  };

  // Extra patterns for first/last name split from fullName
  function splitFullName(fullName) {
    if (!fullName) return { first: "", last: "" };
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return { first: parts[0], last: "" };
    return {
      first: parts[0],
      last: parts.slice(1).join(" ")
    };
  }

  // ====================== HELPERS ======================
  function normalize(str) {
    return (str || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();
  }

  function getLabelText(el) {
    // Try associated label
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) return label.textContent || "";
    }
    // Parent label
    const parentLabel = el.closest("label");
    if (parentLabel) return parentLabel.textContent || "";

    // Aria-labelledby
    if (el.getAttribute("aria-labelledby")) {
      const ids = el.getAttribute("aria-labelledby").split(/\s+/);
      return ids.map(id => {
        const node = document.getElementById(id);
        return node ? node.textContent : "";
      }).join(" ");
    }

    // Nearby text (previous sibling or parent text)
    let prev = el.previousElementSibling;
    if (prev && (prev.tagName === "LABEL" || prev.tagName === "SPAN" || prev.tagName === "DIV")) {
      return prev.textContent || "";
    }

    // Placeholder as fallback
    return el.placeholder || el.getAttribute("aria-label") || "";
  }

  function scoreField(el, keywords) {
    const candidates = [
      el.name,
      el.id,
      el.placeholder,
      el.getAttribute("aria-label"),
      el.getAttribute("autocomplete"),
      getLabelText(el)
    ].map(normalize);

    let score = 0;
    for (const kw of keywords) {
      const nkw = normalize(kw);
      for (const c of candidates) {
        if (!c) continue;
        if (c === nkw) score += 10;
        else if (c.includes(nkw) || nkw.includes(c)) score += 5;
      }
    }
    return score;
  }

  function isVisible(el) {
    if (!el.offsetParent && el.type !== "hidden") return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function isFillable(el) {
    const tag = el.tagName.toLowerCase();
    if (tag === "textarea") return true;
    if (tag === "select") return true;
    if (tag === "input") {
      const type = (el.type || "text").toLowerCase();
      return ["text", "email", "tel", "url", "number", "search", "password"].includes(type) || type === "";
    }
    // contenteditable
    if (el.isContentEditable) return true;
    return false;
  }

  // ====================== CORE AUTOFILL ======================
  async function getActiveProfile() {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "getActiveProfile" }, (response) => {
        resolve(response?.profile || null);
      });
    });
  }

  async function autofillPage(options = {}) {
    // Respect user setting when not explicitly passed
    let fillOnlyEmpty = options.fillOnlyEmpty;
    if (fillOnlyEmpty === undefined) {
      const data = await new Promise(r => chrome.storage.local.get(["settings"], r));
      fillOnlyEmpty = data.settings?.fillOnlyEmpty !== false;
    }
    const profile = await getActiveProfile();
    if (!profile) {
      showToast("No active profile found. Open the extension popup to create one.");
      return { filled: 0 };
    }

    const nameParts = splitFullName(profile.fullName || "");

    // Build value map
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
      coverLetter: (profile.coverLetterTemplate || "")
        .replace(/\{\{name\}\}/gi, profile.fullName || "")
        .replace(/\{\{company\}\}/gi, "") // user can edit later
        .replace(/\{\{role\}\}/gi, "")
        .replace(/\{\{skills\}\}/gi, profile.skills || ""),
      resumeText: profile.resumeText || ""
    };

    const inputs = Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']"))
      .filter(el => isFillable(el) && isVisible(el));

    let filledCount = 0;
    const usedFields = new Set();

    // Score and match
    for (const [fieldKey, keywords] of Object.entries(FIELD_MAP)) {
      if (!values[fieldKey]) continue;

      let bestEl = null;
      let bestScore = 0;

      for (const el of inputs) {
        if (usedFields.has(el)) continue;
        const score = scoreField(el, keywords);
        if (score > bestScore) {
          bestScore = score;
          bestEl = el;
        }
      }

      if (bestEl && bestScore >= 5) {
        if (fillOnlyEmpty && bestEl.value && bestEl.value.trim() !== "") {
          // skip already filled
        } else {
          fillElement(bestEl, values[fieldKey]);
          usedFields.add(bestEl);
          filledCount++;
        }
      }
    }

    // Special handling for common full-name fields that expect first+last separately
    // (already handled via firstName/lastName mapping)

    // Log to history
    chrome.runtime.sendMessage({
      action: "logApplication",
      url: location.href,
      title: document.title,
      profileName: profile.name
    });

    showToast(`Filled ${filledCount} field${filledCount !== 1 ? "s" : ""} ✓`);
    return { filled: filledCount };
  }

  function fillElement(el, value) {
    if (!value) return;

    const tag = el.tagName.toLowerCase();

    if (tag === "select") {
      // Try to match option by text or value
      const options = Array.from(el.options);
      const match = options.find(o =>
        normalize(o.text) === normalize(value) ||
        normalize(o.value) === normalize(value) ||
        normalize(o.text).includes(normalize(value))
      );
      if (match) {
        el.value = match.value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      return;
    }

    if (el.isContentEditable) {
      el.focus();
      el.textContent = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    // Standard input / textarea
    el.focus();
    el.value = value;

    // Trigger events that most frameworks listen to
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }

  // ====================== FLOATING BUTTON ======================
  let floatingBtn = null;
  let isDragging = false;
  let dragOffset = { x: 0, y: 0 };

  function createFloatingButton() {
    if (document.getElementById("jobfill-pro-fab")) return;

    floatingBtn = document.createElement("div");
    floatingBtn.id = "jobfill-pro-fab";
    floatingBtn.innerHTML = `
      <div class="jfp-fab-inner" title="JobFill Pro - Click to Autofill (or Ctrl+Shift+F)">
        <span class="jfp-icon">⚡</span>
        <span class="jfp-label">Fill</span>
      </div>
    `;
    document.body.appendChild(floatingBtn);

    // Position (remember last position)
    chrome.storage.local.get(["fabPosition"], (data) => {
      if (data.fabPosition) {
        floatingBtn.style.left = data.fabPosition.left;
        floatingBtn.style.top = data.fabPosition.top;
        floatingBtn.style.right = "auto";
        floatingBtn.style.bottom = "auto";
      }
    });

    // Click to autofill
    floatingBtn.querySelector(".jfp-fab-inner").addEventListener("click", async (e) => {
      if (isDragging) return;
      e.preventDefault();
      e.stopPropagation();
      floatingBtn.classList.add("jfp-loading");
      await autofillPage();
      floatingBtn.classList.remove("jfp-loading");
    });

    // Drag support
    floatingBtn.addEventListener("mousedown", startDrag);
    floatingBtn.addEventListener("touchstart", startDrag, { passive: false });
  }

  function startDrag(e) {
    if (e.target.closest(".jfp-fab-inner") && e.type === "mousedown") {
      // allow click
    }
    isDragging = false;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const rect = floatingBtn.getBoundingClientRect();
    dragOffset.x = clientX - rect.left;
    dragOffset.y = clientY - rect.top;

    const onMove = (ev) => {
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

      // Save position
      chrome.storage.local.set({
        fabPosition: {
          left: floatingBtn.style.left,
          top: floatingBtn.style.top
        }
      });

      setTimeout(() => { isDragging = false; }, 50);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("touchend", onUp);
  }

  function removeFloatingButton() {
    const btn = document.getElementById("jobfill-pro-fab");
    if (btn) btn.remove();
  }

  // ====================== TOAST ======================
  function showToast(msg) {
    let toast = document.getElementById("jobfill-pro-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "jobfill-pro-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add("jfp-show");
    setTimeout(() => toast.classList.remove("jfp-show"), 2500);
  }

  // ====================== MESSAGE LISTENER ======================
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "triggerAutofill") {
      autofillPage().then(result => sendResponse(result));
      return true;
    }
    if (message.action === "toggleFab") {
      if (message.show) createFloatingButton();
      else removeFloatingButton();
    }
  });

  // ====================== INIT ======================
  function init() {
    chrome.storage.local.get(["settings"], (data) => {
      const settings = data.settings || { showFloatingButton: true };
      if (settings.showFloatingButton !== false) {
        // Delay a bit so page settles
        setTimeout(createFloatingButton, 800);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
