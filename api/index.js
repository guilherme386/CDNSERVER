const HTML = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>PositivoFlix - Painel CDN</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',sans-serif;background:#0a0a0f;color:#e0e0e0;min-height:100vh}
.header{background:linear-gradient(135deg,#1a1a2e,#16213e);padding:20px 30px;border-bottom:1px solid #2a2a3e;display:flex;justify-content:space-between;align-items:center}
.header h1{font-size:22px;color:#7c3aed}
.header .user{font-size:14px;color:#888}
.container{max-width:1200px;margin:0 auto;padding:20px}
.card{background:#12121a;border:1px solid #2a2a3e;border-radius:12px;padding:20px;margin-bottom:20px}
.card h2{font-size:18px;color:#7c3aed;margin-bottom:15px;border-bottom:1px solid #2a2a3e;padding-bottom:10px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:15px}
.input-group{margin-bottom:12px}
.input-group label{display:block;font-size:13px;color:#888;margin-bottom:4px}
.input-group input,.input-group select{width:100%;padding:10px 12px;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:8px;color:#e0e0e0;font-size:14px;outline:none}
.input-group input:focus,.input-group select:focus{border-color:#7c3aed}
.btn{padding:10px 20px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;transition:all .2s}
.btn-primary{background:#7c3aed;color:#fff}
.btn-primary:hover{background:#6d28d9}
.btn-secondary{background:#2a2a3e;color:#e0e0e0}
.btn-secondary:hover{background:#3a3a4e}
.btn-sm{padding:6px 12px;font-size:12px}
.token-result{background:#1a1a2e;border:1px solid #2a2a3e;border-radius:8px;padding:15px;margin-top:15px;display:none}
.token-result.show{display:block}
.token-result .label{font-size:12px;color:#888;margin-bottom:4px}
.token-result .value{font-family:'Courier New',monospace;font-size:13px;color:#7c3aed;word-break:break-all;background:#0a0a0f;padding:8px;border-radius:6px;margin-bottom:10px}
.token-result .url{color:#10b981}
.categories{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.category-chip{background:#1a1a2e;border:1px solid #2a2a3e;padding:6px 14px;border-radius:20px;font-size:13px;cursor:pointer;transition:all .2s}
.category-chip:hover,.category-chip.active{background:#7c3aed;border-color:#7c3aed;color:#fff}
.media-list{margin-top:15px;max-height:400px;overflow-y:auto}
.media-item{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#1a1a2e;border-radius:8px;margin-bottom:6px}
.media-item:hover{background:#1e1e30}
.media-item .name{font-size:14px;flex:1}
.media-item .actions{display:flex;gap:6px}
.status{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.status.ok{background:#10b981}
.status.err{background:#ef4444}
.hidden{display:none}
.loading{color:#888;font-style:italic;padding:20px;text-align:center}
.error-msg{color:#ef4444;font-size:13px;margin-top:5px}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:#0a0a0f}::-webkit-scrollbar-thumb{background:#2a2a3e;border-radius:3px}
</style>
</head>
<body>
<div class="header">
<h1>PositivoFlix CDN</h1>
<div class="user"><span class="status ok" id="statusDot"></span><span id="statusText">Conectado</span></div>
</div>
<div class="container">
<div class="card">
<h2>Configuracao</h2>
<div class="grid">
<div class="input-group"><label>API URL</label><input type="text" id="apiUrl" placeholder="https://cdn.positivoflix.qzz.io"/></div>
<div class="input-group"><label>API Key</label><input type="password" id="apiKey" placeholder="Sua chave de API"/></div>
</div>
<button class="btn btn-primary" onclick="testConnection()">Testar Conexao</button>
</div>
<div class="card">
<h2>Gerar Token</h2>
<div class="grid">
<div class="input-group"><label>Tipo de Midia</label><select id="mediaType" onchange="loadCategories()"><option value="">Selecione...</option><option value="live">Ao Vivo</option><option value="vod">Filmes (VOD)</option><option value="series">Series</option></select></div>
<div class="input-group"><label>Categoria</label><select id="categorySelect" onchange="loadMedia()"><option value="">Selecione o tipo primeiro</option></select></div>
<div class="input-group"><label>Midia (ID)</label><input type="text" id="mediaId" placeholder="ID da midia"/></div>
<div class="input-group"><label>Duracao (minutos, opcional)</label><input type="number" id="duration" placeholder="Padrao: 120"/></div>
</div>
<button class="btn btn-primary" onclick="generateToken()">Gerar Token</button>
<div class="token-result" id="tokenResult">
<div class="label">Token:</div><div class="value" id="tokenValue"></div>
<div class="label">URL de Streaming:</div><div class="value url" id="tokenUrl"></div>
<div class="label">Expira em:</div><div class="value" id="tokenExp"></div>
<button class="btn btn-secondary btn-sm" onclick="copyUrl()">Copiar URL</button>
<button class="btn btn-secondary btn-sm" onclick="copyToken()">Copiar Token</button>
</div>
<div class="error-msg hidden" id="tokenError"></div>
</div>
<div class="card" id="mediaBrowser" style="display:none">
<h2 id="browserTitle">Midias Disponiveis</h2>
<div class="categories" id="categoryList"></div>
<div class="media-list" id="mediaList"><div class="loading">Selecione uma categoria</div></div>
</div>
</div>
<script>
let categories=[];
function getConfig(){return{apiUrl:document.getElementById("apiUrl").value.replace(/\\/+$/g,""),apiKey:document.getElementById("apiKey").value}}
async function testConnection(){const{apiUrl}=getConfig();try{const r=await fetch(apiUrl+"/api/health");const d=await r.json();const dot=document.getElementById("statusDot");const txt=document.getElementById("statusText");if(d.status==="healthy"){dot.className="status ok";txt.textContent="Conectado";alert("Conexao OK! Proxy: "+d.services.proxy)}else{dot.className="status err";txt.textContent="Degradado";alert("Servidor degradado")}}catch(e){document.getElementById("statusDot").className="status err";document.getElementById("statusText").textContent="Erro";alert("Erro: "+e.message)}}
async function loadCategories(){const{apiUrl,apiKey}=getConfig();const type=document.getElementById("mediaType").value;const sel=document.getElementById("categorySelect");sel.innerHTML="<option value="">Carregando...</option>";categories=[];if(!type){sel.innerHTML="<option value="">Selecione o tipo primeiro</option>";return}try{const r=await fetch(apiUrl+"/api/media/"+type,{headers:{"X-API-Key":apiKey}});const d=await r.json();categories=d.categories||[];sel.innerHTML='<option value="">Todas as categorias</option>';categories.forEach(c=>{sel.innerHTML+='<option value="'+c.category_id+'">'+c.category_name+"</option>"})}catch(e){sel.innerHTML="<option value="">Erro ao carregar</option>"}}
async function loadMedia(){const{apiUrl,apiKey}=getConfig();const type=document.getElementById("mediaType").value;const catId=document.getElementById("categorySelect").value;const list=document.getElementById("mediaList");const browser=document.getElementById("mediaBrowser");if(!type){browser.style.display="none";return}browser.style.display="block";list.innerHTML="<div class=loading>Carregando...</div>";try{let url=apiUrl+"/api/media/"+type;if(catId)url+="/"+catId;const r=await fetch(url,{headers:{"X-API-Key":apiKey}});const d=await r.json();const items=d.streams||d.series||d.categories||[];if(!items.length){list.innerHTML="<div class=loading>Nenhuma midia encontrada</div>";return}list.innerHTML="";document.getElementById("browserTitle").textContent=type==="live"?"Canais Ao Vivo":type==="vod"?"Filmes":"Series";items.forEach(item=>{const id=item.stream_id||item.series_id||item.category_id;const name=item.name||item.category_name;list.innerHTML+='<div class="media-item"><span class="name">'+name+'</span><div class="actions"><button class="btn btn-primary btn-sm" onclick="selectMedia(\\''+id+"','"+name.replace(/'/g,"\\\\'")+"')\">Selecionar</button></div></div>"})}catch(e){list.innerHTML="<div class=loading>Erro: "+e.message+"</div>"}}
function selectMedia(id,name){document.getElementById("mediaId").value=id;document.getElementById("mediaBrowser").style.display="none"}
async function generateToken(){const{apiUrl,apiKey}=getConfig();const mediaType=document.getElementById("mediaType").value;const mediaId=document.getElementById("mediaId").value;const duration=document.getElementById("duration").value;const result=document.getElementById("tokenResult");const error=document.getElementById("tokenError");result.classList.remove("show");error.classList.add("hidden");if(!mediaType||!mediaId){error.textContent="Selecione o tipo e informe o ID da midia.";error.classList.remove("hidden");return}try{const body={mediaId,mediaType};if(duration)body.duration=parseInt(duration);const r=await fetch(apiUrl+"/api/token",{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":apiKey},body:JSON.stringify(body)});const d=await r.json();if(!r.ok){error.textContent=d.error||"Erro ao gerar token";error.classList.remove("hidden");return}document.getElementById("tokenValue").textContent=d.token;document.getElementById("tokenUrl").textContent=d.url;document.getElementById("tokenExp").textContent=new Date(d.expiresAt).toLocaleString("pt-BR");result.classList.add("show")}catch(e){error.textContent="Erro: "+e.message;error.classList.remove("hidden")}}
function copyUrl(){navigator.clipboard.writeText(document.getElementById("tokenUrl").textContent);alert("URL copiada!")}
function copyToken(){navigator.clipboard.writeText(document.getElementById("tokenValue").textContent);alert("Token copiado!")}
window.onload=()=>{const u=localStorage.getItem("apiUrl");const k=localStorage.getItem("apiKey");if(u)document.getElementById("apiUrl").value=u;if(k)document.getElementById("apiKey").value=k;document.getElementById("apiUrl").onchange=e=>localStorage.setItem("apiUrl",e.target.value);document.getElementById("apiKey").onchange=e=>localStorage.setItem("apiKey",e.target.value)};
</script>
</body>
</html>`;

module.exports = function handler(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(HTML);
};
