const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { JSDOM } = require("jsdom");

const ROOT = path.resolve(__dirname, "..");
const contentJs = fs.readFileSync(path.join(ROOT, "content.js"), "utf8");

const profile = {
  name: "Test",
  fullName: "Amit Kumar",
  email: "amit@example.com",
  phone: "+91 9876543210",
  linkedin: "",
  github: "https://github.com/AmitKr9958",
  portfolio: "https://example.com/portfolio",
  currentTitle: "Power BI Developer",
  currentCompany: "Acme Analytics",
  yearsExperience: "10",
  education: "B.Tech",
  skills: "Power BI, SQL, Excel",
  city: "Delhi",
  state: "Delhi",
  coverLetterTemplate: "Dear {{company}}, I am applying for {{role}} with {{skills}}.",
  resumeText: "Power BI developer with SQL and Excel experience.",
  answers: {
    workAuthorization: "Yes",
    sponsorship: "No",
    relocation: "Yes",
    noticePeriod: "30 days",
    gender: "Prefer not to say",
    eeo: "Decline to answer",
    availableStartDate: "2026-11-01"
  }
};

async function load(file) {
  const html = fs.readFileSync(path.join(__dirname, file), "utf8");
  const dom = new JSDOM(html, { url: "https://example.test/jobs/1", runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;

  window.chrome = {
    runtime: {
      sendMessage(message, callback) { if (message.action === "getActiveProfile") callback({ profile }); else callback?.({}); },
      onMessage: { addListener() {} }
    },
    storage: {
      local: {
        get(keys, callback) { callback({ settings: { showFloatingButton: false, fillOnlyEmpty: true } }); },
        set() {}
      }
    }
  };

  window.eval(contentJs);
  const api = window.__jobfillProTest;
  assert(api, "test hook missing");

  if (file === "workday.html") {
    const box = window.document.getElementById("companyBox");
    window.document.querySelectorAll('[role="option"]').forEach(option => {
      option.addEventListener("click", () => { box.textContent = option.textContent; });
    });
  }

  if (file === "react.html") {
    const email = window.document.getElementById("email");
    const proto = window.HTMLInputElement.prototype;
    const valueDescriptor = Object.getOwnPropertyDescriptor(proto, "value");
    Object.defineProperty(email, "value", {
      get() { return valueDescriptor.get.call(email); },
      set() { throw new Error("direct assignment blocked"); },
      configurable: true
    });
    const host = window.document.getElementById("shadow-host");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = '<label for="shadowPhone">Phone</label><input id="shadowPhone" name="phone">';
  }

  return { dom, window, api };
}

(async () => {
  const cases = [
    ["greenhouse.html", async ({window, api}) => {
      const result = await api.autofillPage({ profile, fillOnlyEmpty: true });
      assert(result.filled >= 4);
      assert.strictEqual(window.document.getElementById("first_name").value, "Amit");
      assert.strictEqual(window.document.getElementById("last_name").value, "Kumar");
      assert.strictEqual(window.document.getElementById("confirm_email").value, profile.email);
      assert.strictEqual(window.document.getElementById("state").value, "Delhi");
      assert.strictEqual(window.document.getElementById("statement").value, "");
    }],
    ["lever.html", async ({window, api}) => {
      const result = await api.autofillPage({ profile, fillOnlyEmpty: true });
      assert(result.filled >= 2);
      assert.strictEqual(window.document.querySelector('input[name="auth"][value="Yes"]').checked, true);
      assert.strictEqual(window.document.querySelector('input[name="relocate"]').checked, true);
    }],
    ["workday.html", async ({window, api}) => {
      await api.autofillPage({ profile, fillOnlyEmpty: true });
      assert.strictEqual(window.document.getElementById("city").value, "Delhi");
      assert.strictEqual(window.document.getElementById("companyBox").textContent.trim(), "Acme Analytics");
    }],
    ["ashby.html", async ({window, api}) => {
      await api.autofillPage({ profile, fillOnlyEmpty: true });
      assert.strictEqual(window.document.getElementById("li").value, "");
      assert.strictEqual(window.document.getElementById("portfolio").value, profile.portfolio);
      assert.strictEqual(window.document.getElementById("email2").value, profile.email);
    }],
    ["plain.html", async ({window, api}) => {
      await api.autofillPage({ profile, fillOnlyEmpty: true });
      assert.strictEqual(window.document.getElementById("siteSearch").value, "");
      assert.strictEqual(window.document.getElementById("password").value, "");
      assert.strictEqual(window.document.getElementById("city").value, "Delhi");
      assert.strictEqual(window.document.getElementById("ethnicity").value, "");
      assert.strictEqual(window.document.getElementById("state").value, "Delhi");
      assert.strictEqual(window.document.getElementById("statement").value, "");
    }],
    ["autocomplete.html", async ({window, api}) => {
      await api.autofillPage({ profile, fillOnlyEmpty: true });
      assert.strictEqual(window.document.getElementById("given").value, "Amit");
      assert.strictEqual(window.document.getElementById("family").value, "Kumar");
      assert.strictEqual(window.document.getElementById("mail").value, profile.email);
      assert.strictEqual(window.document.getElementById("tel").value, profile.phone);
      assert.strictEqual(window.document.getElementById("addr").value, "");
      assert.strictEqual(window.document.getElementById("town").value, "Delhi");
      assert.strictEqual(window.document.getElementById("region").value, "Delhi");
      assert.strictEqual(window.document.getElementById("postal").value, "");
      assert.strictEqual(window.document.getElementById("nation").value, "");
      assert.strictEqual(window.document.getElementById("org").value, profile.currentCompany);
      assert.strictEqual(window.document.getElementById("title").value, profile.currentTitle);
      assert.strictEqual(window.document.getElementById("auth").value, "Yes");
    }],
    ["date-and-file.html", async ({window, api}) => {
      await api.autofillPage({ profile, fillOnlyEmpty: true });
      assert.strictEqual(window.document.getElementById("start").value, profile.answers.availableStartDate);
      assert.strictEqual(window.document.getElementById("notice").value, "");
    }],
    ["react.html", async ({window, api}) => {
      await api.autofillPage({ profile, fillOnlyEmpty: true });
      assert.strictEqual(window.document.getElementById("name").value, profile.fullName);
      assert.strictEqual(window.document.getElementById("email").value, profile.email);
      assert.strictEqual(window.document.getElementById("role").value, profile.currentTitle);
      assert.strictEqual(window.document.getElementById("cover").value.includes("React Corp"), true);
      const shadowPhone = window.document.querySelector("#shadow-host").shadowRoot.getElementById("shadowPhone");
      assert.strictEqual(shadowPhone.value, profile.phone);
    }]
  ];

  for (const [file, test] of cases) {
    const ctx = await load(file);
    await test(ctx);
    ctx.dom.window.close();
    console.log("PASS", file);
  }
  console.log("All Phase 1 autofill tests passed.");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
