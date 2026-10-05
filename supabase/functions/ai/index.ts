import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
const clean=(v:unknown,max=18000)=>String(v??"").slice(0,max);
async function hash(value:string){const b=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function sb(url:string,key:string,path:string,options:RequestInit={}){return fetch(url+"/rest/v1/"+path,{...options,headers:{"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json",...(options.headers||{})}})}
serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required"},405);
 const auth=req.headers.get("Authorization"); if(!auth)return json({error:"Authentication required"},401);
 const openrouter=Deno.env.get("OPENROUTER_API_KEY"), url=Deno.env.get("SUPABASE_URL"), service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!openrouter||!url||!service)return json({error:"AI server configuration is incomplete"},503);
 let body:any; try{body=await req.json()}catch{return json({error:"Invalid JSON"},400)}
 const action=clean(body.action,40), input=body.input||{};
 const jwt=auth.replace(/^Bearer\s+/i,""); let userId="";
 try{userId=JSON.parse(atob(jwt.split(".")[1].replace(/-/g,"+").replace(/_/g,"/"))).sub}catch{}
 if(!userId)return json({error:"Invalid session"},401);
 const cacheKey=await hash(JSON.stringify({action,input}));
 const cached=await sb(url,service,`jobpro_ai_cache?select=result&user_id=eq.${encodeURIComponent(userId)}&cache_key=eq.${cacheKey}&limit=1`);
 const cachedRows=await cached.json().catch(()=>[]);
 if(cached.ok&&cachedRows?.[0])return json({action,result:cachedRows[0].result,cached:true});
 const since=new Date(Date.now()-86400000).toISOString();
 const countRes=await sb(url,service,`jobpro_ai_cache?select=id&user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(since)}&limit=21`);
 const countRows=await countRes.json().catch(()=>[]);
 if((countRows||[]).length>=20)return json({error:"Daily AI limit reached. Try again tomorrow."},429);
 let prompt="";
 if(action==="answer_question")prompt=`Answer this job application question using only the supplied profile/resume context. Return only the answer. Question: ${clean(input.question,2000)} Context: ${clean(JSON.stringify(input.context))}`;
 else if(action==="tailor_resume")prompt=`Tailor the supplied resume for the supplied job. Preserve truthful facts; never invent employers, dates, skills, degrees, metrics or certifications. Return concise sections: summary, skills_to_emphasize, experience_edits. Job: ${clean(JSON.stringify(input.job))} Resume: ${clean(JSON.stringify(input.resume))}`;
 else if(action==="cover_letter")prompt=`Write a concise professional cover letter for this job using only supplied resume facts. Do not invent information. Job: ${clean(JSON.stringify(input.job))} Resume: ${clean(JSON.stringify(input.resume))}`;
 else if(action==="match_score")prompt=`Score this candidate against this job from 0 to 100. Return JSON only with keys score, strengths, gaps, reason. Never invent facts. Job: ${clean(JSON.stringify(input.job))} Candidate: ${clean(JSON.stringify(input.resume))}`;
 else return json({error:"Unsupported action"},400);
 const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+openrouter,"HTTP-Referer":"https://github.com/AmitKr9958/JobPro","X-Title":"JobPro"},body:JSON.stringify({model:"openrouter/free",messages:[{role:"user",content:prompt}],temperature:.2,max_tokens:1400})});
 const d=await r.json().catch(()=>({})); if(!r.ok)return json({error:d?.error?.message||"OpenRouter request failed"},r.status);
 const result=d?.choices?.[0]?.message?.content||"";
 await sb(url,service,"jobpro_ai_cache",{method:"POST",headers:{"Prefer":"resolution=merge-duplicates"},body:JSON.stringify({user_id:userId,cache_key:cacheKey,action,result})});
 return json({action,result,cached:false});
});