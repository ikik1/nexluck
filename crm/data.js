const SECTIONS=[
{k:'analytics',n:'Analytics',i:'📈',c:'#0b5cab',big:['€482.3k','GGR (7d)'],kv:[['NGR','€391.8k','up'],['Active players','18,742','up'],['ARPU','€25.7','up'],['Retention D30','21.4%','down']]},
{k:'casinos',n:'My casinos',i:'🏛️',c:'#7f3fbf',big:['6','Brands live'],kv:[['Jurisdictions','4',''],['Uptime','99.98%','up'],['Licences active','5 / 6',''],['Open incidents','1','down']]},
{k:'customers',n:'Customers',i:'👥',c:'#2e844a',big:['126,480','Total players'],kv:[['New (7d)','1,356','up'],['VIP','842',''],['Pending KYC','87','down'],['Self-excluded','312','']]},
{k:'games',n:'Games',i:'🎰',c:'#e8590c',big:['3,214','Games live'],kv:[['Providers','48',''],['Avg RTP','96.2%',''],['Top game','Gates of Olympus',''],['New this month','37','up']]},
{k:'bonuses',href:'/crm/b/',n:'Bonuses / Promotion',i:'🎁',c:'#c23934',big:['24','Active campaigns'],kv:[['Bonus cost (7d)','€58.2k','down'],['Redemption rate','34%','up'],['Wagering done','61%',''],['Abuse flags','9','down']]},
{k:'loyalty',n:'Loyalty',i:'⭐',c:'#b8860b',big:['12,904','Club members'],kv:[['Diamond tier','128',''],['Points issued','4.2M','up'],['Redeemed','1.1M',''],['Churn risk VIPs','23','down']]},
{k:'finance',n:'Finance',i:'💶',c:'#0a7d8c',big:['€1.26M','Deposits (7d)'],kv:[['Withdrawals','€812k','down'],['Pending payouts','64',''],['Chargebacks','0.4%','up'],['PSP success rate','94.7%','up']]},
{k:'compliance',n:'Compliance',i:'🛡️',c:'#5a4fcf',big:['87','KYC in queue'],kv:[['AML alerts','14','down'],['SAR filed (30d)','3',''],['RG interventions','41',''],['Reports due','2','down']]},
{k:'audit',n:'Audit',i:'📋',c:'#444',big:['2,381','Events (24h)'],kv:[['Admin logins','96',''],['Permission changes','4',''],['Failed logins','17','down'],['Last export','Today 09:12','']]}
];
const USER={name:'v.kovalevskiy',device:'MacBook · Chrome 126',last:'02 Oct 2026, 09:41',plan:'Enterprise · active'};
function chrome(crumb){
document.getElementById('hdr').innerHTML=`<a class="brand" href="/crm/"><div class="logo">N</div>NextLuck</a>
<div class="right"><div class="meta"><span>User <b>${USER.name}</b></span><i class="sep"></i><span>Device <b>${USER.device}</b></span><i class="sep"></i><span>Last login <b>${USER.last}</b></span><i class="sep"></i><span>Subscription <b class="badge">${USER.plan}</b></span></div>
<button class="gear" title="Settings" aria-label="Settings">⚙️</button></div>`;
document.getElementById('sub').innerHTML=`<label for="nav">Navigate to</label><select id="nav"><option value="/crm/">🏠 Home</option>${SECTIONS.map(s=>`<option value="${s.href||'/crm/section.html?s='+s.k}">${s.i} ${s.n}</option>`).join('')}</select>${crumb||''}`;
const sel=document.getElementById('nav'),cur=location.search.match(/s=(\w+)/);
if(cur)sel.value='/crm/section.html?s='+cur[1];
else if(location.pathname.startsWith('/crm/b'))sel.value='/crm/b/';
sel.onchange=()=>location.href=sel.value;
document.getElementById('ftr').innerHTML=`<span>Powered by NextLuck</span>|<a href="#">Terms of Services</a>|<a href="#">Privacy Policy</a>`;
}
