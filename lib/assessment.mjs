import {createHash} from "node:crypto";
export function parseRepository(value){
 let url;try{url=new URL(String(value||"").trim())}catch{throw Error("Enter a valid GitHub repository URL")}
 if(!["github.com","www.github.com"].includes(url.hostname.toLowerCase()))throw Error("Only public github.com repositories are supported");
 const [owner,rawRepo,extra]=url.pathname.split("/").filter(Boolean),repo=rawRepo?.replace(/\.git$/i,"");
 if(!owner||!repo||extra||!/^[\w.-]+$/.test(owner)||!/^[\w.-]+$/.test(repo))throw Error("Use a repository URL like github.com/owner/repository");
 return{owner,repo};
}
export async function github(path){
 const headers={Accept:"application/vnd.github+json","User-Agent":"Nesso-Rescue","X-GitHub-Api-Version":"2022-11-28"};
 if(process.env.GITHUB_TOKEN)headers.Authorization=`Bearer ${process.env.GITHUB_TOKEN}`;
 const response=await fetch(`https://api.github.com${path}`,{headers,signal:AbortSignal.timeout(12000)});
 if(response.status===404)throw Error("Repository was not found or is not public");
 if(response.status===403||response.status===429)throw Error("GitHub rate limit reached. Add GITHUB_TOKEN and try again");
 if(!response.ok)throw Error(`GitHub returned ${response.status}`);return response.json();
}
const monthsSince=date=>Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/2629746000));
export function buildAssessment(repo,commits,contributors,issues,release){
 const silenceMonths=monthsSince(repo.pushed_at),issueOnly=issues.filter(item=>!item.pull_request),pullRequests=issues.length-issueOnly.length;
 const total=contributors.reduce((sum,item)=>sum+(item.contributions||0),0),topShare=total?Math.round(((contributors[0]?.contributions||0)/total)*100):100;
 let risk=8+Math.min(38,silenceMonths*3)+Math.min(22,Math.floor(repo.open_issues_count/5))+(topShare>=80?18:topShare>=60?10:3)+(repo.archived?15:0)-Math.min(12,commits.length*2);
 risk=Math.max(4,Math.min(96,risk));const health=100-risk,status=health<35?"critical":health<65?"stranded":"stable",plan=[];
 if(silenceMonths>=6)plan.push({title:"Restore the release line",reason:`No repository push for ${silenceMonths} months`,type:"release"});
 if(repo.open_issues_count>=20)plan.push({title:"Triage the maintenance backlog",reason:`${repo.open_issues_count} open issues and pull requests`,type:"triage"});
 if(topShare>=70)plan.push({title:"Reduce maintainer concentration",reason:`Top visible contributor represents ${topShare}% of sampled contributions`,type:"governance"});
 if(!release)plan.push({title:"Create a reproducible first release",reason:"No published GitHub release was found",type:"release"});
 if(!plan.length)plan.push({title:"Protect current project health",reason:"Automate dependency review and release verification",type:"maintenance"});
 return{health,risk,status,silenceMonths,topContributorShare:topShare,signals:{stars:repo.stargazers_count,forks:repo.forks_count,openWork:repo.open_issues_count,watchers:repo.subscribers_count,contributorsSampled:contributors.length,recentCommits:commits.length,openIssuesSampled:issueOnly.length,openPullRequestsSampled:pullRequests,lastRelease:release?.tag_name||null,license:repo.license?.spdx_id||"Unknown",language:repo.language||"Unknown"},plan:plan.slice(0,3)};
}
export const fingerprint=rescue=>createHash("sha256").update(JSON.stringify({id:rescue.id,repo:rescue.repository.fullName,health:rescue.assessment.health,createdAt:rescue.createdAt})).digest("hex");
