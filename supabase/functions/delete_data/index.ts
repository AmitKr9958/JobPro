import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type"};
const json=(b:unknown,s=200)=>new Response(JSON.stringify(b),{status:s,headers:{...cors,"Content-Type":"application/json"}});
serve(async req=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json({error:"POST required"},405);
 const auth=req.headers.get("Authorization"); if(!auth)return json({error:"Authentication required"},401);
 const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return json({error:"Server configuration missing"},503);
 const headers={"apikey":key,"Authorization":"Bearer "+key,"Content-Type":"application/json"};
 const jwt=auth.replace(/^Bearer\s+/i,"");
 let payload:any={}; try{payload=JSON.parse(atob(jwt.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")))}catch{}
 const userId=payload.sub; if(!userId)return json({error:"Invalid session"},401);
 for(const table of ["saved_answers","applications","resumes","profiles","ai_cache"]){
   const r=await fetch(url+"/rest/v1/"+table+"?user_id=eq."+encodeURIComponent(userId),{method:"DELETE",headers});
   if(!r.ok)return json({error:"Could not delete "+table},500);
 }
 const objects=await fetch(url+"/storage/v1/object/list/resumes",{method:"POST",headers,body:JSON.stringify({prefix:userId,limit:1000})}).then(r=>r.ok?r.json():[]);
 for(const o of objects||[]){await fetch(url+"/storage/v1/object/resumes/"+encodeURIComponent(userId+"/"+o.name),{method:"DELETE",headers});}
 return json({deleted:true});
});