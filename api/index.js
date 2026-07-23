const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function createToken(mediaId, streamId, extension, mediaType, durationMinutes) {
  const secret = process.env.TOKEN_SECRET;
  const extra = parseInt(process.env.EXTRA_EXPIRATION_MINUTES || '60', 10);
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (durationMinutes + extra) * 60;
  return jwt.sign({ mediaId, mediaType, streamId, extension, exp, iat: now, jti: crypto.randomBytes(8).toString('hex') }, secret, { algorithm: 'HS256', issuer: 'cdn', audience: 'client' });
}

function verifyToken(token) {
  try { return jwt.verify(token, process.env.TOKEN_SECRET, { algorithms: ['HS256'], issuer: 'cdn', audience: 'client' }); } catch { return null; }
}

function jsonRes(res, data, status) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.status(status || 200).json(data);
}

function checkKey(req) {
  return req.headers['x-api-key'] === process.env.API_KEY;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (path === '/' || path === '') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(getPanel());
  }

  if (path === '/api/health') {
    let proxyOk = false;
    try {
      const proxyUrl = 'http://' + process.env.PROXY_USER + ':' + process.env.PROXY_PASS + '@' + process.env.PROXY_HOST + ':' + process.env.PROXY_PORT;
      const r = await fetch(proxyUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      proxyOk = r.ok || r.status === 405;
    } catch (e) { proxyOk = false; }
    return jsonRes(res, { status: proxyOk ? 'healthy' : 'degraded', proxy: proxyOk ? 'connected' : 'unreachable', timestamp: new Date().toISOString() }, proxyOk ? 200 : 503);
  }

  if (path === '/api/token' && req.method === 'POST') {
    if (!checkKey(req)) return jsonRes(res, { error: 'Invalid API key' }, 401);
    let body = '';
    for await (const chunk of req) body += chunk;
    const parsed = JSON.parse(body || '{}');
    const mediaId = parsed.mediaId;
    const mediaType = parsed.mediaType;
    const duration = parsed.duration;
    const extension = parsed.extension;
    if (!mediaId || !mediaType) return jsonRes(res, { error: 'mediaId and mediaType required' }, 400);
    if (['live', 'vod', 'series'].indexOf(mediaType) === -1) return jsonRes(res, { error: 'Invalid mediaType' }, 400);
    const ext = mediaType === 'live' ? 'm3u8' : (extension || 'mp4');
    const dur = duration || 120;
    const token = createToken(mediaId, mediaId, ext, mediaType, dur);
    const p = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return jsonRes(res, { token: token, url: 'https://' + process.env.CDN_DOMAIN + '/api/stream/' + token, expiresAt: new Date(p.exp * 1000).toISOString(), duration: dur }, 201);
  }

  if (path.indexOf('/api/stream/') === 0) {
    const token = path.replace('/api/stream/', '');
    const payload = verifyToken(token);
    if (!payload) return jsonRes(res, { error: 'Invalid or expired token' }, 401);
    const now = Math.floor(Date.now() / 1000);
    if (now > payload.exp) return jsonRes(res, { error: 'Token expired' }, 401);
    const base = (process.env.XTREAM_URL || '').replace(/\/+$/, '');
    const u = process.env.XTREAM_USERNAME;
    const pw = process.env.XTREAM_PASSWORD;
    let targetUrl;
    if (payload.mediaType === 'live') targetUrl = base + '/live/' + u + '/' + pw + '/' + payload.streamId + '.m3u8';
    else targetUrl = base + '/movie/' + u + '/' + pw + '/' + payload.streamId + '.' + payload.extension;
    const proxyUrl = 'http://' + process.env.PROXY_USER + ':' + process.env.PROXY_PASS + '@' + process.env.PROXY_HOST + ':' + process.env.PROXY_PORT + '?url=' + encodeURIComponent(targetUrl);
    try {
      const headers = { 'User-Agent': 'VLC/3.0.20 LibVLC/3.0.20' };
      const range = Array.isArray(req.headers.range) ? req.headers.range[0] : req.headers.range;
      if (range) headers['Range'] = range;
      const upstream = await fetch(proxyUrl, { method: req.method === 'HEAD' ? 'HEAD' : 'GET', headers: headers });
      if (!upstream.ok) return jsonRes(res, { error: 'Upstream error' }, upstream.status);
      const ct = upstream.headers.get('content-type');
      const cl = upstream.headers.get('content-length');
      const cr = upstream.headers.get('content-range');
      if (ct) res.setHeader('Content-Type', ct);
      if (cl) res.setHeader('Content-Length', cl);
      if (cr) res.setHeader('Content-Range', cr);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-store');
      res.status(upstream.status);
      if (req.method === 'HEAD') return res.end();
      const reader = upstream.body.getReader();
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        if (!res.write(result.value)) await new Promise(function (r) { res.once('drain', r); });
      }
      res.end();
    } catch (e) {
      if (!res.headersSent) return jsonRes(res, { error: 'Stream error' }, 502);
      res.end();
    }
    return;
  }

  if (path.indexOf('/api/media') === 0) {
    if (!checkKey(req)) return jsonRes(res, { error: 'Invalid API key' }, 401);
    const mediaPath = path.replace('/api/media', '').replace(/^\/+/, '');
    const authUrl = function (action, params) {
      params = params || {};
      const u = new URL(process.env.XTREAM_URL + '/player_api.php');
      u.searchParams.set('username', process.env.XTREAM_USERNAME);
      u.searchParams.set('password', process.env.XTREAM_PASSWORD);
      u.searchParams.set('action', action);
      Object.keys(params).forEach(function (k) { u.searchParams.set(k, params[k]); });
      return u.toString();
    };
    const fetchJson = async function (url) {
      const r = await fetch(url);
      return r.ok ? await r.json() : [];
    };
    try {
      if (mediaPath === 'live') return jsonRes(res, { categories: await fetchJson(authUrl('get_live_categories')) });
      if (mediaPath.indexOf('live/') === 0) return jsonRes(res, { streams: await fetchJson(authUrl('get_live_streams', { category_id: mediaPath.split('/')[1] })) });
      if (mediaPath === 'vod') return jsonRes(res, { categories: await fetchJson(authUrl('get_vod_categories')) });
      if (mediaPath.indexOf('vod/') === 0) return jsonRes(res, { streams: await fetchJson(authUrl('get_vod_streams', { category_id: mediaPath.split('/')[1] })) });
      if (mediaPath === 'series') return jsonRes(res, { categories: await fetchJson(authUrl('get_series_categories')) });
      if (mediaPath.indexOf('series/') === 0 && mediaPath.indexOf('info') === -1 && mediaPath.indexOf('episodes') === -1) return jsonRes(res, { series: await fetchJson(authUrl('get_series', { category_id: mediaPath.split('/')[1] })) });
      if (mediaPath.indexOf('series/') !== -1 && mediaPath.indexOf('info') !== -1) return jsonRes(res, { info: await fetchJson(authUrl('get_series_info', { series_id: mediaPath.split('/')[1] })) });
      if (mediaPath.indexOf('episodes') !== -1) {
        const parts = mediaPath.split('/');
        const data = await fetchJson(authUrl('get_series_info', { series_id: parts[1], season: parts[3] }));
        return jsonRes(res, { episodes: (data.episodes && data.episodes[parts[3]]) ? data.episodes[parts[3]] : [] });
      }
      return jsonRes(res, { error: 'Not found' }, 404);
    } catch (e) {
      return jsonRes(res, { error: 'Internal error' }, 500);
    }
  }

  return jsonRes(res, { error: 'Not found' }, 404);
};

function getPanel() {
  var html = '<!DOCTYPE html>\n';
  html += '<html lang="pt-BR">\n';
  html += '<head>\n';
  html += '<meta charset="UTF-8">\n';
  html += '<meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
  html += '<title>PositivoFlix CDN</title>\n';
  html += '<style>\n';
  html += '*{margin:0;padding:0;box-sizing:border-box}\n';
  html += 'body{font-family:sans-serif;background:#0a0a0f;color:#e0e0e0;min-height:100vh}\n';
  html += '.hdr{background:linear-gradient(135deg,#1a1a2e,#16213e);padding:20px 30px;border-bottom:1px solid #2a2a3e;display:flex;justify-content:space-between;align-items:center}\n';
  html += '.hdr h1{font-size:22px;color:#7c3aed}\n';
  html += '.ctr{max-width:1200px;margin:0 auto;padding:20px}\n';
  html += '.card{background:#12121a;border:1px solid #2a2a3e;border-radius:12px;padding:20px;margin-bottom:20px}\n';
  html += '.card h2{font-size:18px;color:#7c3aed;margin-bottom:15px;border-bottom:1px solid #2a2a3e;padding-bottom:10px}\n';
  html += '.g{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:15px}\n';
  html += '.ig{margin-bottom:12px}\n';
  html += '.ig label{display:block;font-size:13px;color:#888;margin-bottom:4px}\n';
  html += '.ig input,.ig select{width:100%;padding:10px 12px;background:#1a1a2e;border:1px solid #2a2a3e;border-radius:8px;color:#e0e0e0;font-size:14px;outline:none}\n';
  html += '.ig input:focus,.ig select:focus{border-color:#7c3aed}\n';
  html += '.btn{padding:10px 20px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;transition:all .2s}\n';
  html += '.bp{background:#7c3aed;color:#fff}.bp:hover{background:#6d28d9}\n';
  html += '.bs{background:#2a2a3e;color:#e0e0e0}.bs:hover{background:#3a3a4e}\n';
  html += '.bsm{padding:6px 12px;font-size:12px}\n';
  html += '.tr{background:#1a1a2e;border:1px solid #2a2a3e;border-radius:8px;padding:15px;margin-top:15px;display:none}\n';
  html += '.tr.show{display:block}\n';
  html += '.tr .lb{font-size:12px;color:#888;margin-bottom:4px}\n';
  html += '.tr .vl{font-family:monospace;font-size:13px;color:#7c3aed;word-break:break-all;background:#0a0a0f;padding:8px;border-radius:6px;margin-bottom:10px}\n';
  html += '.tr .ur{color:#10b981}\n';
  html += '.ml{margin-top:15px;max-height:400px;overflow-y:auto}\n';
  html += '.mi{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#1a1a2e;border-radius:8px;margin-bottom:6px}\n';
  html += '.mi:hover{background:#1e1e30}\n';
  html += '.mi .nm{font-size:14px;flex:1}\n';
  html += '.st{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}\n';
  html += '.st.ok{background:#10b981}.st.er{background:#ef4444}\n';
  html += '.hd{display:none}\n';
  html += '.ld{color:#888;font-style:italic;padding:20px;text-align:center}\n';
  html += '.em{color:#ef4444;font-size:13px;margin-top:5px}\n';
  html += '</style>\n';
  html += '</head>\n';
  html += '<body>\n';
  html += '<div class="hdr"><h1>PositivoFlix CDN</h1><div><span class="st ok" id="sd"></span><span id="stx">Conectado</span></div></div>\n';
  html += '<div class="ctr">\n';
  html += '<div class="card"><h2>Configuracao</h2><div class="g">\n';
  html += '<div class="ig"><label>API URL</label><input type="text" id="au" placeholder="https://cdn.positivoflix.qzz.io"/></div>\n';
  html += '<div class="ig"><label>API Key</label><input type="password" id="ak" placeholder="Sua chave API"/></div>\n';
  html += '</div><button class="btn bp" onclick="testConn()">Testar</button></div>\n';
  html += '<div class="card"><h2>Gerar Token</h2><div class="g">\n';
  html += '<div class="ig"><label>Tipo</label><select id="mt" onchange="loadCat()"><option value="">Selecione...</option><option value="live">Ao Vivo</option><option value="vod">Filmes</option><option value="series">Series</option></select></div>\n';
  html += '<div class="ig"><label>Categoria</label><select id="cs" onchange="loadMed()"><option value="">Selecione tipo</option></select></div>\n';
  html += '<div class="ig"><label>ID da Midia</label><input type="text" id="mi" placeholder="ID"/></div>\n';
  html += '<div class="ig"><label>Duracao (min)</label><input type="number" id="dr" placeholder="120"/></div>\n';
  html += '</div><button class="btn bp" onclick="genToken()">Gerar Token</button>\n';
  html += '<div class="tr" id="tr"><div class="lb">Token:</div><div class="vl" id="tv"></div><div class="lb">URL:</div><div class="vl ur" id="tu"></div><div class="lb">Expira:</div><div class="vl" id="te"></div>\n';
  html += '<button class="btn bs bsm" onclick="cp(document.getElementById(\'tu\').textContent)">Copiar URL</button></div>\n';
  html += '<div class="em hd" id="er"></div></div>\n';
  html += '<div class="card hd" id="mb"><h2>Midias</h2><div class="ml" id="ml"><div class="ld">Selecione categoria</div></div></div>\n';
  html += '</div>\n';
  html += '<script>\n';
  html += 'function gc(){return{a:document.getElementById("au").value.replace(/\\/+$/g,""),k:document.getElementById("ak").value}}\n';
  html += 'function cp(t){navigator.clipboard.writeText(t);alert("Copiado!")}\n';
  html += 'async function testConn(){var x=gc();try{var r=await fetch(x.a+"/api/health");var d=await r.json();document.getElementById("sd").className="st "+(d.status==="healthy"?"ok":"er");document.getElementById("stx").textContent=d.status==="healthy"?"Conectado":"Degradado";alert(d.status+": proxy "+d.proxy)}catch(e){document.getElementById("sd").className="st er";document.getElementById("stx").textContent="Erro";alert("Erro: "+e.message)}}\n';
  html += 'async function loadCat(){var x=gc();var t=document.getElementById("mt").value;var s=document.getElementById("cs");s.innerHTML="<option>Carregando...</option>";if(!t){s.innerHTML="<option>Selecione tipo</option>";return}try{var r=await fetch(x.a+"/api/media/"+t,{headers:{"X-API-Key":x.k}});var d=await r.json();s.innerHTML="<option value=>Todas</option>";var cats=d.categories||[];for(var i=0;i<cats.length;i++){s.innerHTML+="<option value=\\""+cats[i].category_id+"\\">"+cats[i].category_name+"</option>"}}catch(e){s.innerHTML="<option>Erro</option>"}}\n';
  html += 'async function loadMed(){var x=gc();var t=document.getElementById("mt").value;var c=document.getElementById("cs").value;var l=document.getElementById("ml");var b=document.getElementById("mb");if(!t){b.style.display="none";return}b.style.display="block";l.innerHTML="<div class=ld>Carregando...</div>";try{var u=x.a+"/api/media/"+t;if(c)u+="/"+c;var r=await fetch(u,{headers:{"X-API-Key":x.k}});var d=await r.json();var items=d.streams||d.series||[];if(!items.length){l.innerHTML="<div class=ld>Vazio</div>";return}l.innerHTML="";for(var i=0;i<items.length;i++){var id=items[i].stream_id||items[i].series_id;var nm=items[i].name;l.innerHTML+="<div class=mi><span class=nm>"+nm+"</span><button class=\\"btn bp bsm\\" onclick=\\"selMed("+id+")\\">Sel</button></div>"}}catch(e){l.innerHTML="<div class=ld>Erro: "+e.message+"</div>"}}\n';
  html += 'function selMed(id){document.getElementById("mi").value=id;document.getElementById("mb").style.display="none"}\n';
  html += 'async function genToken(){var x=gc();var mt=document.getElementById("mt").value;var mi=document.getElementById("mi").value;var dr=document.getElementById("dr").value;var tr=document.getElementById("tr");var er=document.getElementById("er");tr.classList.remove("show");er.classList.add("hd");if(!mt||!mi){er.textContent="Preencha tipo e ID";er.classList.remove("hd");return}try{var body={mediaId:mi,mediaType:mt};if(dr)body.duration=parseInt(dr);var r=await fetch(x.a+"/api/token",{method:"POST",headers:{"Content-Type":"application/json","X-API-Key":x.k},body:JSON.stringify(body)});var d=await r.json();if(!r.ok){er.textContent=d.error||"Erro";er.classList.remove("hd");return}document.getElementById("tv").textContent=d.token;document.getElementById("tu").textContent=d.url;document.getElementById("te").textContent=new Date(d.expiresAt).toLocaleString("pt-BR");tr.classList.add("show")}catch(e){er.textContent="Erro: "+e.message;er.classList.remove("hd")}}\n';
  html += 'window.onload=function(){var u=localStorage.getItem("au");var k=localStorage.getItem("ak");if(u)document.getElementById("au").value=u;if(k)document.getElementById("ak").value=k;document.getElementById("au").onchange=function(e){localStorage.setItem("au",e.target.value)};document.getElementById("ak").onchange=function(e){localStorage.setItem("ak",e.target.value)}}\n';
  html += '</script>\n';
  html += '</body>\n';
  html += '</html>';
  return html;
}
