const APP={contractAddress:""};
const RH={chainId:"0x1237",chainName:"Robinhood Chain",nativeCurrency:{name:"Ether",symbol:"ETH",decimals:18},rpcUrls:["https://rpc.mainnet.chain.robinhood.com"],blockExplorerUrls:["https://robinhoodchain.blockscout.com"]};
const $=selector=>document.querySelector(selector),$$=selector=>document.querySelectorAll(selector);
const walletButton=$("#walletButton"),walletLabel=$("#walletLabel"),walletMenu=$("#walletMenu"),walletMenuAddress=$("#walletMenuAddress"),walletNetworkLabel=$("#walletNetworkLabel"),modal=$("#rescueModal"),repoInput=$("#repoInput"),toast=$("#toast");
const form=$("#rescueForm"),progress=$("#scanProgress"),result=$("#rescueResult"),scanButton=$("#scanButton"),proofButton=$("#publishProofButton");
let timer,currentRescue=null,currentAccount=null;
function notify(message,type="info"){toast.textContent=message;toast.dataset.type=type;toast.classList.add("show");clearTimeout(timer);timer=setTimeout(()=>toast.classList.remove("show"),4200)}
const short=value=>value.slice(0,6)+"…"+value.slice(-4),escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
const STATIC_MODE=location.hostname.endsWith(".github.io");
async function githubBrowser(path){
 const response=await fetch("https://api.github.com"+path,{headers:{Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28"}});
 if(response.status===404)throw Error("Repository was not found or is not public");
 if(response.status===403||response.status===429)throw Error("GitHub public API limit reached. Please try again later");
 if(!response.ok)throw Error("GitHub returned "+response.status);return response.json();
}
function parseRepoUrl(value){
 let url;try{url=new URL(String(value||"").trim())}catch{throw Error("Enter a valid GitHub repository URL")}
 if(!["github.com","www.github.com"].includes(url.hostname.toLowerCase()))throw Error("Only public github.com repositories are supported");
 const parts=url.pathname.split("/").filter(Boolean),owner=parts[0],rawRepo=parts[1]||"",repo=rawRepo.toLowerCase().endsWith(".git")?rawRepo.slice(0,-4):rawRepo;
 if(!owner||!repo||parts.length!==2||!/^[A-Za-z0-9_.-]+$/.test(owner)||!/^[A-Za-z0-9_.-]+$/.test(repo))throw Error("Use a URL like github.com/owner/repository");
 return{owner,repo};
}
const monthsSinceBrowser=date=>Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/2629746000));
function browserAssessment(repo,commits,contributors,issues,release){
 const silenceMonths=monthsSinceBrowser(repo.pushed_at),issueOnly=issues.filter(item=>!item.pull_request),total=contributors.reduce((sum,item)=>sum+(item.contributions||0),0),topShare=total?Math.round(((contributors[0]?.contributions||0)/total)*100):100;
 let risk=8+Math.min(38,silenceMonths*3)+Math.min(22,Math.floor(repo.open_issues_count/5))+(topShare>=80?18:topShare>=60?10:3)+(repo.archived?15:0)-Math.min(12,commits.length*2);
 risk=Math.max(4,Math.min(96,risk));const health=100-risk,status=health<35?"critical":health<65?"stranded":"stable",plan=[];
 if(silenceMonths>=6)plan.push({title:"Restore the release line",reason:"No repository push for "+silenceMonths+" months",type:"release"});
 if(repo.open_issues_count>=20)plan.push({title:"Triage the maintenance backlog",reason:repo.open_issues_count+" open issues and pull requests",type:"triage"});
 if(topShare>=70)plan.push({title:"Reduce maintainer concentration",reason:"Top visible contributor represents "+topShare+"% of sampled contributions",type:"governance"});
 if(!release)plan.push({title:"Create a reproducible first release",reason:"No published GitHub release was found",type:"release"});
 if(!plan.length)plan.push({title:"Protect current project health",reason:"Automate dependency review and release verification",type:"maintenance"});
 return{health,risk,status,silenceMonths,topContributorShare:topShare,signals:{stars:repo.stargazers_count,forks:repo.forks_count,openWork:repo.open_issues_count,watchers:repo.subscribers_count,contributorsSampled:contributors.length,recentCommits:commits.length,openIssuesSampled:issueOnly.length,openPullRequestsSampled:issues.length-issueOnly.length,lastRelease:release?.tag_name||null,license:repo.license?.spdx_id||"Unknown",language:repo.language||"Unknown"},plan:plan.slice(0,3)};
}
async function sha256(value){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return[...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,"0")).join("")}
function browserRescues(){try{return JSON.parse(localStorage.getItem("nesso_rescues")||"[]")}catch{return[]}}
function saveBrowserRescues(items){localStorage.setItem("nesso_rescues",JSON.stringify(items.slice(0,100)))}
async function browserAssess(repositoryUrl){
 const parsed=parseRepoUrl(repositoryUrl),base="/repos/"+encodeURIComponent(parsed.owner)+"/"+encodeURIComponent(parsed.repo),repo=await githubBrowser(base);
 const settled=await Promise.allSettled([githubBrowser(base+"/commits?per_page=10"),githubBrowser(base+"/contributors?per_page=20"),githubBrowser(base+"/issues?state=open&per_page=100"),githubBrowser(base+"/releases?per_page=1")]),value=result=>result.status==="fulfilled"?result.value:[];
 const assessment=browserAssessment(repo,value(settled[0]),value(settled[1]),value(settled[2]),value(settled[3])[0]),createdAt=new Date().toISOString(),id=crypto.randomUUID(),rescue={id,createdAt,repository:{fullName:repo.full_name,url:repo.html_url,description:repo.description,defaultBranch:repo.default_branch,pushedAt:repo.pushed_at},assessment,chainProof:null};
 rescue.fingerprint=await sha256(JSON.stringify({id,repo:repo.full_name,health:assessment.health,createdAt}));const items=browserRescues();items.unshift(rescue);saveBrowserRescues(items);return rescue;
}
async function pagesApi(path,options={}){
 if(path==="/api/health")return{ok:true,service:"nesso-pages",chainId:4663};
 if(path==="/api/rescues")return{rescues:browserRescues().slice(0,20)};
 if(path==="/api/assess"&&options.method==="POST")return browserAssess(JSON.parse(options.body||"{}").repositoryUrl);
 if(path.startsWith("/api/rescues/")&&path.endsWith("/proof")&&options.method==="POST"){const id=path.split("/")[3],proof=JSON.parse(options.body||"{}"),items=browserRescues(),item=items.find(entry=>entry.id===id);if(!item)throw Error("Rescue not found");item.chainProof={txHash:proof.txHash,wallet:proof.wallet,chainId:4663,publishedAt:new Date().toISOString()};saveBrowserRescues(items);return item}
 throw Error("Not found");
}
async function api(path,options={}){if(STATIC_MODE)return pagesApi(path,options);const response=await fetch(path,{...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||("Request failed ("+response.status+")"));return data}
function closeWalletMenu(){walletMenu.hidden=true;walletButton.setAttribute("aria-expanded","false")}
function setWallet(account,chainId){
 currentAccount=account||null;const connected=Boolean(currentAccount),correctChain=String(chainId||"").toLowerCase()===RH.chainId;
 walletButton.classList.toggle("connected",connected);walletButton.classList.toggle("wrong-network",connected&&!correctChain);
 walletLabel.textContent=connected?short(currentAccount):"Connect wallet";walletMenuAddress.textContent=connected?currentAccount:"—";
 $("#walletExplorerLink").href=connected?RH.blockExplorerUrls[0]+"/address/"+currentAccount:RH.blockExplorerUrls[0];
 walletNetworkLabel.textContent=correctChain?"Robinhood Chain":"Wrong network";$(".wallet-network").classList.toggle("wrong",connected&&!correctChain);$("#switchNetworkButton").hidden=!connected||correctChain;
 if(!connected)closeWalletMenu();
}
async function ensureRobinhood(){
 const chainId=await window.ethereum.request({method:"eth_chainId"});if(String(chainId).toLowerCase()===RH.chainId)return;
 try{await window.ethereum.request({method:"wallet_switchEthereumChain",params:[{chainId:RH.chainId}]})}
 catch(error){if(error.code!==4902)throw error;await window.ethereum.request({method:"wallet_addEthereumChain",params:[RH]})}
}
async function connect(){
 if(!window.ethereum){notify("Install MetaMask or another EVM browser wallet","error");window.open("https://metamask.io/download/","_blank","noopener");throw Error("Wallet unavailable")}
 if(currentAccount){await ensureRobinhood();setWallet(currentAccount,RH.chainId);return currentAccount}
 walletButton.disabled=true;walletButton.classList.add("loading");walletLabel.textContent="Connecting…";
 try{const accounts=await window.ethereum.request({method:"eth_requestAccounts"});if(!accounts[0])throw Error("No wallet account selected");await ensureRobinhood();const chainId=await window.ethereum.request({method:"eth_chainId"});setWallet(accounts[0],chainId);sessionStorage.removeItem("nesso_wallet_disconnected");notify("Wallet connected · Robinhood Chain");return accounts[0]}
 finally{walletButton.disabled=false;walletButton.classList.remove("loading");if(!currentAccount)walletLabel.textContent="Connect wallet"}
}
function initContractAddress(){
 const address=APP.contractAddress.trim(),label=$("#contractAddress"),button=$("#copyCaButton");if(!address)return;
 label.textContent=address;button.disabled=false;button.textContent="COPY CA";$("#contractArea").classList.add("live");
 button.addEventListener("click",async()=>{await navigator.clipboard.writeText(address);button.textContent="COPIED";notify("Contract address copied");setTimeout(()=>button.textContent="COPY CA",1800)});
}function showStage(name){form.hidden=name!=="form";progress.hidden=name!=="progress";result.hidden=name!=="result"}
function openModal(project=""){modal.classList.add("open");modal.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";showStage("form");if(project)repoInput.value=`https://github.com/nesso-rescue/${project.toLowerCase()}`;setTimeout(()=>repoInput.focus(),100)}
function closeModal(){modal.classList.remove("open");modal.setAttribute("aria-hidden","true");document.body.style.overflow=""}
function renderResult(rescue){
 currentRescue=rescue;const a=rescue.assessment,s=a.signals;
 $("#resultStatus").textContent=a.status.toUpperCase();$("#resultStatus").className=a.status;
 $("#resultRepo").textContent=rescue.repository.fullName;$("#resultRepoLink").href=rescue.repository.url;$("#resultHealth").textContent=a.health;
 $("#resultSignals").innerHTML=`<div><span>LAST PUSH</span><b>${a.silenceMonths} MO</b></div><div><span>OPEN WORK</span><b>${s.openWork.toLocaleString()}</b></div><div><span>TOP CONTRIBUTOR</span><b>${a.topContributorShare}%</b></div><div><span>STARS</span><b>${s.stars.toLocaleString()}</b></div><div><span>LANGUAGE</span><b>${escapeHtml(s.language)}</b></div><div><span>LICENSE</span><b>${escapeHtml(s.license)}</b></div>`;
 $("#resultPlan").innerHTML=a.plan.map((item,index)=>`<article><b>0${index+1}</b><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.reason)}</p></div></article>`).join("");
 $("#resultFingerprint").textContent=`sha256: ${rescue.fingerprint.slice(0,12)}…${rescue.fingerprint.slice(-8)}`;
 if(rescue.chainProof){proofButton.textContent="View chain proof ↗";proofButton.dataset.tx=rescue.chainProof.txHash}else{proofButton.textContent="Publish onchain ↗";delete proofButton.dataset.tx}
 showStage("result");
}
async function runAssessment(){
 const repositoryUrl=repoInput.value.trim();if(!repoInput.validity.valid||!repositoryUrl){repoInput.focus();return notify("Enter a valid public GitHub repository URL","error")}
 showStage("progress");scanButton.disabled=true;
 try{const rescue=await api("/api/assess",{method:"POST",body:JSON.stringify({repositoryUrl})});renderResult(rescue);await loadRescues();notify("Live repository assessment complete")}
 catch(error){showStage("form");notify(error.message,"error")}
 finally{scanButton.disabled=false}
}
function proofData(rescue){const message=`NESSO:v1:${rescue.id}:${rescue.repository.fullName}:${rescue.fingerprint}`;return"0x"+[...new TextEncoder().encode(message)].map(byte=>byte.toString(16).padStart(2,"0")).join("")}
async function publishProof(){
 if(proofButton.dataset.tx){window.open(`https://robinhoodchain.blockscout.com/tx/${proofButton.dataset.tx}`,"_blank","noopener");return}
 if(!currentRescue)return;proofButton.disabled=true;proofButton.textContent="Confirm in wallet…";
 try{const wallet=await connect(),txHash=await window.ethereum.request({method:"eth_sendTransaction",params:[{from:wallet,to:wallet,value:"0x0",data:proofData(currentRescue)}]});currentRescue=await api(`/api/rescues/${currentRescue.id}/proof`,{method:"POST",body:JSON.stringify({txHash,wallet})});renderResult(currentRescue);await loadRescues();notify("Rescue proof broadcast to Robinhood Chain")}
 catch(error){notify(error.message?.split("\n")[0]||"Transaction cancelled","error")}
 finally{proofButton.disabled=false}
}
function rescueCard(rescue){
 const a=rescue.assessment,proof=rescue.chainProof?`<a href="https://robinhoodchain.blockscout.com/tx/${rescue.chainProof.txHash}" target="_blank" rel="noreferrer">ONCHAIN ↗</a>`:"<span>LOCAL DOSSIER</span>";
 return `<article class="live-rescue-card" data-rescue-id="${rescue.id}"><div class="live-score ${a.status}"><b>${a.health}</b><span>HEALTH</span></div><div><small>${a.status.toUpperCase()} · ${new Date(rescue.createdAt).toLocaleDateString()}</small><h3>${escapeHtml(rescue.repository.fullName)}</h3><p>${escapeHtml(a.plan[0]?.title||"Health monitoring")}</p></div><div class="live-card-proof">${proof}<button data-view-rescue="${rescue.id}">VIEW REPORT ↗</button></div></article>`;
}
async function loadRescues(){
 try{const data=await api("/api/rescues"),list=$("#liveRescueList");window.nessoRescues=data.rescues;list.innerHTML=data.rescues.length?data.rescues.map(rescueCard).join(""):'<p class="empty-state">No repository has been assessed on this node yet.</p>';$$("[data-view-rescue]").forEach(button=>button.addEventListener("click",()=>{const rescue=data.rescues.find(item=>item.id===button.dataset.viewRescue);modal.classList.add("open");modal.setAttribute("aria-hidden","false");document.body.style.overflow="hidden";renderResult(rescue)}));$("#serviceLabel").textContent="Rescue agent online · GitHub live"}
 catch{$("#serviceLabel").textContent="Rescue agent unavailable";$(".service-state")?.classList.add("offline")}
}
walletButton.addEventListener("click",async event=>{event.stopPropagation();if(currentAccount){const opening=walletMenu.hidden;walletMenu.hidden=!opening;walletButton.setAttribute("aria-expanded",String(opening));return}try{await connect()}catch(error){notify(error.message?.split("\n")[0]||"Wallet connection cancelled","error")}});
$("#disconnectWallet").addEventListener("click",()=>{sessionStorage.setItem("nesso_wallet_disconnected","1");setWallet(null);notify("Wallet disconnected from this session")});
$("#switchNetworkButton").addEventListener("click",async()=>{try{await ensureRobinhood();setWallet(currentAccount,RH.chainId);notify("Switched to Robinhood Chain")}catch(error){notify(error.message?.split("\n")[0]||"Network switch cancelled","error")}});
$(".wallet-shell").addEventListener("click",event=>event.stopPropagation());
document.addEventListener("click",closeWalletMenu);
$$("[data-open-modal]").forEach(node=>node.addEventListener("click",()=>openModal()));
$$("[data-close-modal]").forEach(node=>node.addEventListener("click",closeModal));
$$("[data-project]").forEach(node=>node.addEventListener("click",()=>openModal(node.dataset.project)));
scanButton.addEventListener("click",runAssessment);repoInput.addEventListener("keydown",event=>{if(event.key==="Enter")runAssessment()});
proofButton.addEventListener("click",publishProof);
$("#newAssessmentButton").addEventListener("click",()=>{repoInput.value="";showStage("form");repoInput.focus()});
document.addEventListener("keydown",event=>{if(event.key==="Escape"){closeModal();closeWalletMenu()}});
if(window.ethereum){
 if(!sessionStorage.getItem("nesso_wallet_disconnected"))window.ethereum.request({method:"eth_accounts"}).then(async accounts=>{if(accounts[0])setWallet(accounts[0],await window.ethereum.request({method:"eth_chainId"}))}).catch(()=>{});
 window.ethereum.on?.("accountsChanged",async accounts=>setWallet(accounts[0]||null,await window.ethereum.request({method:"eth_chainId"})));
 window.ethereum.on?.("chainChanged",chainId=>setWallet(currentAccount,chainId));
}
initContractAddress();
$$(".filters button").forEach(button=>button.addEventListener("click",()=>{$$(".filters button").forEach(node=>node.classList.remove("active"));button.classList.add("active");$$(".project-row").forEach(row=>row.classList.toggle("hidden",button.dataset.filter!=="all"&&row.dataset.status!==button.dataset.filter))}));
$$(".activity-tabs button").forEach(button=>button.addEventListener("click",()=>{$$(".activity-tabs button").forEach(node=>node.classList.remove("active"));button.classList.add("active");const type=button.textContent.trim().toLowerCase().replace("all activity","all");$$(".activity-table article").forEach(row=>row.style.display=type==="all"||row.dataset.activity===type?"grid":"none")}));
$(".dark-button")?.addEventListener("click",()=>notify("Maintainer profiles are part of the bounty settlement phase"));
$$(".bounty-grid footer button").forEach(button=>button.addEventListener("click",()=>notify("These are illustrative bounty briefs; live claiming is not enabled yet")));
$(".archive-foot button")?.addEventListener("click",()=>notify("The public archive will open after node deployment"));
const revealItems=$$(".archive-head,.index-board,.case-grid,.economics-head,.money-flow,.activity-panel,.bounty-grid,.trust-grid,.faq-grid,.live-lab-grid");revealItems.forEach(item=>item.classList.add("reveal-item"));
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("revealed");observer.unobserve(entry.target)}}),{threshold:.1});revealItems.forEach(item=>observer.observe(item));
const artifact=$(".artifact-stage");artifact?.addEventListener("pointermove",event=>{const box=artifact.getBoundingClientRect(),x=(event.clientX-box.left)/box.width-.5,y=(event.clientY-box.top)/box.height-.5;artifact.style.setProperty("--mx",`${x*5}px`);artifact.style.setProperty("--my",`${y*4}px`)});artifact?.addEventListener("pointerleave",()=>{artifact.style.setProperty("--mx","0px");artifact.style.setProperty("--my","0px")});
loadRescues();









