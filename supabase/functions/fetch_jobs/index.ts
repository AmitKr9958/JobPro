import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required"},405);
 const auth=req.headers.get("Authorization"); if(!auth)return json({error:"Authentication required"},401);
 const body=await req.json().catch(()=>({})),q=encodeURIComponent(String(body.query||"Power BI")),location=encodeURIComponent(String(body.location||"Delhi")),country=String(body.country||"in").toLowerCase();
 const jobpro_jobs:any[]=[];
 const adzunaId=Deno.env.get("ADZUNA_APP_ID"),adzunaKey=Deno.env.get("ADZUNA_APP_KEY");
 if(adzunaId&&adzunaKey){try{const r=await fetch(`https://api.adzuna.com/v1/api/jobpro_jobs/${country}/search/1?app_id=${adzunaId}&app_key=${adzunaKey}&results_per_page=30&what=${q}&where=${location}&content-type=application/json`);if(r.ok){const d=await r.json();for(const j of d.results||[])jobpro_jobs.push({source:"adzuna",external_id:String(j.id),title:j.title,company:j.company?.display_name||"",location:j.location?.display_name||"",description:j.description||"",url:j.redirect_url,posted_at:j.created});}}catch{}}
 try{const r=await fetch(`https://remotive.com/api/remote-jobpro_jobs?search=${q}`);if(r.ok){const d=await r.json();for(const j of (d.jobpro_jobs||[]).slice(0,30))jobpro_jobs.push({source:"remotive",external_id:String(j.id),title:j.title,company:j.company_name||"",location:j.candidate_required_location||"Remote",description:j.description||"",url:j.url,posted_at:j.publication_date});}}catch{}
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(url&&key&&jobpro_jobs.length){await fetch(url+"/rest/v1/jobpro_jobs?on_conflict=source,external_id",{method:"POST",headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json","Prefer":"resolution=merge-duplicates"},body:JSON.stringify(jobpro_jobs)}).catch(()=>{});}
 return json({jobpro_jobs});
});