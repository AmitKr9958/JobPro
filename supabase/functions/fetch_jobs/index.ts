import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s=200) => new Response(JSON.stringify(b), {status:s, headers:{...cors,"Content-Type":"application/json"}});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", {headers:cors});
  if (req.method !== "POST") return json({error:"POST required"},405);
  if (!req.headers.get("Authorization")) return json({error:"Authentication required"},401);

  const body = await req.json().catch(() => ({}));
  const q = encodeURIComponent(String(body.query || "Power BI"));
  const location = encodeURIComponent(String(body.location || "Delhi"));
  const country = String(body.country || "in").toLowerCase();

  const results: any[] = [];

  try {
    const adzunaKey = Deno.env.get("ADZUNA_APP_KEY");
    const adzunaId = Deno.env.get("ADZUNA_APP_ID");
    if (adzunaId && adzunaKey) {
      const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/1?app_id=${adzunaId}&app_key=${adzunaKey}&results_per_page=30&what=${q}&where=${location}&content-type=application/json`;
      const r = await fetch(url);
      if (r.ok) {
        const d = await r.json();
        for (const j of d.results || []) results.push({source:"adzuna",external_id:String(j.id),title:j.title,company:j.company?.display_name||"",location:j.location?.display_name||"",description:j.description||"",url:j.redirect_url,posted_at:j.created});
      }
    }
  } catch {}

  try {
    const r = await fetch(`https://remotive.com/api/remote-jobs?search=${q}`);
    if (r.ok) {
      const d = await r.json();
      for (const j of (d.jobs || []).slice(0,30)) results.push({source:"remotive",external_id:String(j.id),title:j.title,company:j.company_name||"",location:j.candidate_required_location||"Remote",description:j.description||"",url:j.url,posted_at:j.publication_date});
    }
  } catch {}

  return json({jobs: results});
});
