import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MODEL = "gemini-2.5-flash";
const MAX_TEXT = 18000;

function cleanText(value: unknown, max = MAX_TEXT) {
  return String(value ?? "").slice(0, max);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Authentication required" }, 401);

  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return json({ error: "GEMINI_API_KEY is not configured" }, 503);

  try {
    const body = await req.json();
    const action = cleanText(body.action, 40);
    const input = body.input ?? {};

    const prompt = action === "answer_question"
      ? `Answer this job application question using only the supplied profile/resume context. Return only the answer.
Question: ${cleanText(input.question, 2000)}
Profile/resume context:
${cleanText(input.context)}`
      : action === "tailor_resume"
      ? `Tailor the supplied resume for the supplied job. Preserve truthful facts; never invent employers, dates, skills, degrees, metrics or certifications. Return concise sections: summary, skills_to_emphasize, experience_edits.
Job:
${cleanText(input.job)}
Resume:
${cleanText(input.resume)}`
      : action === "cover_letter"
      ? `Write a concise professional cover letter for this job using only the supplied resume facts. Do not invent information.
Job:
${cleanText(input.job)}
Resume:
${cleanText(input.resume)}`
      : action === "match_score"
      ? `Score this candidate against this job from 0 to 100. Return JSON only with keys score, strengths, gaps, reason. Never invent facts.
Job:
${cleanText(input.job)}
Candidate:
${cleanText(input.resume)}`
      : "";

    if (!prompt) return json({ error: "Unsupported action" }, 400);

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1400 }
      })
    });

    const data = await response.json();
    if (!response.ok) return json({ error: data?.error?.message || "Gemini request failed" }, response.status);
    const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
    return json({ action, result: text });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Invalid request" }, 400);
  }
});
