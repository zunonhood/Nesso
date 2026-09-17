import {createServer} from "node:http";
import {readFile,writeFile,mkdir,stat} from "node:fs/promises";
import {extname,join,normalize} from "node:path";
import {randomUUID} from "node:crypto";
import {parseRepository,github,buildAssessment,fingerprint} from "./lib/assessment.mjs";

const port=Number(process.env.PORT||4173),host=process.env.HOST||"127.0.0.1",root=process.cwd();
const rescueFile=join(root,".data","rescues.json");
const types={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".svg":"image/svg+xml",".png":"image/png",".webp":"image/webp"};
function json(res,status,value){res.writeHead(status,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"});res.end(JSON.stringify(value))}
async function body(req){let value="";for await(const chunk of req){value+=chunk;if(value.length>20000)throw Error("Request is too large")}return JSON.parse(value||"{}")}
async function load(){try{return JSON.parse(await readFile(rescueFile,"utf8"))}catch{return[]}}
async function save(items){await mkdir(join(root,".data"),{recursive:true});await writeFile(rescueFile,JSON.stringify(items,null,2))}
async function assess(repositoryUrl){
 const parsed=parseRepository(repositoryUrl),base=`/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`,repo=await github(base);
 const results=await Promise.allSettled([github(`${base}/commits?per_page=10`),github(`${base}/contributors?per_page=20`),github(`${base}/issues?state=open&per_page=100`),github(`${base}/releases?per_page=1`)]);
 const value=result=>result.status==="fulfilled"?result.value:[],assessment=buildAssessment(repo,value(results[0]),value(results[1]),value(results[2]),value(results[3])[0]);
 const rescue={id:randomUUID(),createdAt:new Date().toISOString(),repository:{fullName:repo.full_name,url:repo.html_url,description:repo.description,defaultBranch:repo.default_branch,pushedAt:repo.pushed_at},assessment,chainProof:null};
 rescue.fingerprint=fingerprint(rescue);const items=await load();items.unshift(rescue);await save(items.slice(0,100));return rescue;
}
async function api(req,res,path){
 if(req.method==="GET"&&path==="/api/health")return json(res,200,{ok:true,service:"nesso",chainId:4663});
 if(req.method==="GET"&&path==="/api/rescues")return json(res,200,{rescues:(await load()).slice(0,20)});
 if(req.method==="POST"&&path==="/api/assess"){try{return json(res,201,await assess((await body(req)).repositoryUrl))}catch(error){return json(res,400,{error:error.message||"Assessment failed"})}}
 if(req.method==="POST"&&/^\/api\/rescues\/[\w-]+\/proof$/.test(path)){try{
  const id=path.split("/")[3],{txHash,wallet}=await body(req);
  if(!/^0x[a-fA-F0-9]{64}$/.test(txHash||"")||!/^0x[a-fA-F0-9]{40}$/.test(wallet||""))throw Error("Invalid chain proof");
  const items=await load(),item=items.find(entry=>entry.id===id);if(!item)throw Error("Rescue not found");
  item.chainProof={txHash,wallet,chainId:4663,publishedAt:new Date().toISOString()};await save(items);return json(res,200,item);
 }catch(error){return json(res,400,{error:error.message||"Could not save proof"})}}
 return json(res,404,{error:"Not found"});
}
createServer(async(req,res)=>{try{
 const path=decodeURIComponent(new URL(req.url,`http://${req.headers.host}`).pathname);if(path.startsWith("/api/"))return await api(req,res,path);
 const safe=normalize(path).replace(/^(\.\.[/\\])+/,"");let file=join(root,safe==="/"
 ?"index.html":safe);if(!file.startsWith(root))throw Error("Invalid path");if((await stat(file)).isDirectory())file=join(file,"index.html");
 res.writeHead(200,{"Content-Type":types[extname(file)]||"application/octet-stream"});res.end(await readFile(file));
}catch{res.writeHead(404,{"Content-Type":"text/plain"});res.end("Not found")}}).listen(port,host,()=>console.log(`Nesso is running at http://${host}:${port}`));
