'use strict';

// =====================================================================
// Caminhada a Aparecida — Rota da Luz
// Ponto de saída → Santuário Nacional, com instruções passo a passo.
// =====================================================================

const SANTUARIO = { nome: 'Santuário Nacional de Aparecida', p: [-22.8519, -45.2337] };
const PINDA = { nome: 'Centro de Pindamonhangaba', sub: 'Ponto provisório · confirme a saída oficial com a Associação', p: [-22.9246, -45.4613] };
const VELOCIDADE = 4.5;          // km/h de caminhada
const FORA_DO_CAMINHO = 0.06;    // km (60 m)
const ROUTER = 'https://routing.openstreetmap.de/routed-foot';
const GEOCODER = 'https://nominatim.openstreetmap.org';

const CHECKLIST = [
  'Tênis já amaciado (nunca novo)',
  'Meias sem costura (3 pares ou mais)',
  'Garrafa ou mochila de hidratação',
  'Protetor solar e boné',
  'Capa de chuva',
  'Colete ou faixa refletiva',
  'Lanterna',
  'Curativo para bolhas, esparadrapo e vaselina',
  'Remédios de uso pessoal',
  'Documento com foto e cartão do SUS',
  'Carregador portátil para o celular',
  'Lanches leves (frutas, castanhas, barrinhas)',
  'Terço ou intenção da promessa 🙏',
];

// ---------------------------------------------------------------------
// Estado (salvo só no celular)
// ---------------------------------------------------------------------
const KEY = 'caminhada-aparecida-v2';
const blank = () => ({
  start: null,      // { p:[lat,lng], title, sub }
  route: null,      // { pts:[[lat,lng]], steps:[...], dist, src:'osm'|'gpx', key }
  check: [],
  km: 0,
  ms: 0,
  walking: false,
  startedAt: null,
  layer: 'mapa',
});
let state = load();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return Object.assign(blank(), JSON.parse(raw));
  } catch (e) { /* sem armazenamento */ }
  return blank();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignora */ }
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const rad = (d) => d * Math.PI / 180;
function dist(a, b) {
  const h = Math.sin(rad(b[0] - a[0]) / 2) ** 2 +
    Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(rad(b[1] - a[1]) / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
const km1 = (km) => km.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function fmtDist(km) {
  if (km < 1) return `${Math.max(10, Math.round(km * 100) * 10)} m`;
  return `${km1(km)} km`;
}
function fmtDur(h) {
  const m = Math.round(h * 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}
function fmtClock(ms) {
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
function cumulative(pts) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + dist(pts[i - 1], pts[i]));
  return acc;
}
// Projeta a posição na linha do trajeto → km já percorridos e distância até a linha.
function project(pos, pts, acc) {
  let best = { d: Infinity, along: 0 };
  const k = Math.cos(rad(pos[0]));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = pos[1] * k, py = pos[0];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1e-12)));
    const d = dist(pos, [ay + t * dy, (ax + t * dx) / k]);
    if (d < best.d) best = { d, along: acc[i] + t * (acc[i + 1] - acc[i]) };
  }
  return best;
}
const round6 = (p) => [+p[0].toFixed(6), +p[1].toFixed(6)];
const sameP = (a, b) => a && b && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// ---------------------------------------------------------------------
// Instruções em português (a partir das manobras do roteador)
// ---------------------------------------------------------------------
const VIRA = {
  left: ['Vire à esquerda', '⬅️'],
  right: ['Vire à direita', '➡️'],
  'slight left': ['Mantenha-se à esquerda', '↖️'],
  'slight right': ['Mantenha-se à direita', '↗️'],
  'sharp left': ['Vire bem à esquerda', '↙️'],
  'sharp right': ['Vire bem à direita', '↘️'],
  straight: ['Siga em frente', '⬆️'],
  uturn: ['Faça o retorno', '↩️'],
};
const via = (name) => (name ? ` na ${name}` : ' na estrada sem nome');
function instruction(step, i, all) {
  const m = step.maneuver || {};
  const name = step.name || step.ref || '';
  const [vira, ic] = VIRA[m.modifier] || ['Siga', '⬆️'];
  switch (m.type) {
    case 'depart': return { text: `Comece a caminhar${name ? ` pela ${name}` : ''}`, ic: '🚶' };
    case 'arrive': return { text: i === all.length - 1 ? 'Chegada ao Santuário Nacional de Aparecida' : 'Ponto intermediário', ic: '⛪' };
    case 'roundabout': case 'rotary': case 'roundabout turn':
      return { text: `Na rotatória, pegue a ${m.exit || 1}ª saída${name ? ` para a ${name}` : ''}`, ic: '🔄' };
    case 'fork': return { text: `Na bifurcação, ${vira.toLowerCase()}${name ? `, pela ${name}` : ''}`, ic };
    case 'end of road': return { text: `No fim da via, ${vira.toLowerCase()}${via(name)}`, ic };
    case 'continue': case 'new name':
      return m.modifier && m.modifier !== 'straight'
        ? { text: `${vira}${via(name)}`, ic }
        : { text: `Continue${name ? ` pela ${name}` : ' em frente'}`, ic: '⬆️' };
    default:
      return { text: `${vira}${via(name)}`, ic };
  }
}
// Junta trechos repetidos ("continue pela mesma rua") para a lista ficar limpa.
function buildSteps(osrmSteps, pts, acc) {
  const out = [];
  osrmSteps.forEach((s, i) => {
    const ins = instruction(s, i, osrmSteps);
    const loc = [s.maneuver.location[1], s.maneuver.location[0]];
    const along = i === 0 ? 0 : project(loc, pts, acc).along;
    const prev = out[out.length - 1];
    const straightOn = ['continue', 'new name'].includes(s.maneuver.type) &&
      (!s.maneuver.modifier || s.maneuver.modifier === 'straight');
    if (prev && straightOn && (s.name || '') === prev.name) { prev.len += s.distance / 1000; return; }
    out.push({ text: ins.text, ic: ins.ic, name: s.name || '', p: loc, along, len: s.distance / 1000 });
  });
  return out;
}

// ---------------------------------------------------------------------
// Rede: roteador a pé e busca de endereço
// ---------------------------------------------------------------------
async function getJSON(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
let routing = false;
async function computeRoute() {
  if (!state.start || routing) return;
  const key = state.start.p.join(',');
  if (state.route && (state.route.src === 'gpx' || state.route.key === key)) return;
  routing = true;
  refreshAll();
  // ';' vai codificado (%3B): alguns proxies bloqueiam ';' na URL
  const c = [state.start.p, SANTUARIO.p].map(([la, ln]) => `${ln.toFixed(6)},${la.toFixed(6)}`).join('%3B');
  try {
    const j = await getJSON(`${ROUTER}/route/v1/foot/${c}?overview=full&geometries=geojson&steps=true`);
    const r = j.routes[0];
    const pts = r.geometry.coordinates.map(([ln, la]) => round6([la, ln]));
    const acc = cumulative(pts);
    if (state.start && state.start.p.join(',') === key) {
      state.route = { pts, steps: buildSteps(r.legs[0].steps, pts, acc), dist: acc[acc.length - 1], src: 'osm', key };
      save();
    }
    routeError = false;
  } catch (e) {
    routeError = true;
  } finally {
    routing = false;
    refreshAll();
    if (state.start && (!state.route || state.route.key !== state.start.p.join(',')) && !routeError) computeRoute();
  }
}
let routeError = false;
function searchAddress(q) {
  // Prioriza a região entre Pindamonhangaba e Aparecida
  return getJSON(`${GEOCODER}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=br&accept-language=pt-BR` +
    `&viewbox=-45.75,-22.70,-45.10,-23.05&q=${encodeURIComponent(q)}`);
}
async function reverseAddress(p) {
  try {
    const j = await getJSON(`${GEOCODER}/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=pt-BR&lat=${p[0]}&lon=${p[1]}`);
    if (j && j.address) return labelFromAddress(j);
    throw new Error('sem endereço');
  } catch (e) {
    // alternativa: nome da rua mais próxima pelo próprio roteador
    try {
      const j = await getJSON(`${ROUTER}/nearest/v1/foot/${p[1].toFixed(6)},${p[0].toFixed(6)}`);
      const n = j.waypoints && j.waypoints[0] && j.waypoints[0].name;
      if (n) return { title: n, sub: 'Rua mais próxima do ponto escolhido' };
    } catch (e2) { /* ignora */ }
    return { title: 'Ponto escolhido no mapa', sub: `${p[0].toFixed(5)}, ${p[1].toFixed(5)}` };
  }
}
function labelFromAddress(j) {
  const a = j.address || {};
  const rua = a.road || a.pedestrian || a.footway || a.path || a.neighbourhood || j.name || 'Ponto escolhido';
  const title = a.house_number ? `${rua}, ${a.house_number}` : rua;
  const cidade = a.city || a.town || a.village || a.municipality || '';
  const sub = [a.suburb || a.neighbourhood, cidade].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(' · ');
  return { title, sub: sub || 'Endereço encontrado' };
}

// ---------------------------------------------------------------------
// Ponto de saída
// ---------------------------------------------------------------------
async function setStart(p, label) {
  const rp = round6(p);
  const lbl = label || { title: 'Buscando endereço…', sub: '' };
  state.start = { p: rp, title: lbl.title, sub: lbl.sub };
  if (state.route && state.route.src !== 'gpx') state.route = null;
  routeError = false;
  save();
  refreshAll();
  computeRoute();
  if (!label) {
    const l = await reverseAddress(rp);
    if (state.start && sameP(state.start.p, rp)) {
      state.start.title = l.title;
      state.start.sub = l.sub;
      save();
      refreshAll();
    }
  }
}

// ---------------------------------------------------------------------
// Trilha oficial (GPX/KML)
// ---------------------------------------------------------------------
function parseTrackFile(text) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  let pts = [...xml.querySelectorAll('trkpt, rtept')].map((n) => [+n.getAttribute('lat'), +n.getAttribute('lon')]);
  if (pts.length < 2) {
    pts = [];
    xml.querySelectorAll('coordinates').forEach((c) => {
      c.textContent.trim().split(/\s+/).forEach((t) => {
        const [ln, la] = t.split(',').map(Number);
        if (isFinite(la) && isFinite(ln)) pts.push([la, ln]);
      });
    });
  }
  pts = pts.filter(([la, ln]) => isFinite(la) && isFinite(ln));
  const step = Math.ceil(pts.length / 5000) || 1;
  return pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(round6);
}
function loadTrackFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let pts = [];
    try { pts = parseTrackFile(reader.result); } catch (e) { pts = []; }
    if (pts.length < 2) { alert('Não encontrei uma trilha nesse arquivo. Use um arquivo GPX ou KML.'); return; }
    if (dist(pts[0], SANTUARIO.p) < dist(pts[pts.length - 1], SANTUARIO.p)) pts.reverse();
    const acc = cumulative(pts);
    state.route = { pts, steps: [], dist: acc[acc.length - 1], src: 'gpx', key: 'gpx' };
    save();
    setStart(pts[0]);
  };
  reader.readAsText(file);
}

// ---------------------------------------------------------------------
// GPS e caminhada
// ---------------------------------------------------------------------
let me = null, meAcc = null, lastFix = null, watchId = null;
let follow = true, offRouteWarned = false, pickingOnMap = false, pendingStartHere = false;

function startGps() {
  if (!('geolocation' in navigator)) { setGps('Este aparelho não oferece GPS ao navegador.'); return; }
  if (watchId !== null) return;
  setGps('Procurando sinal de GPS…');
  watchId = navigator.geolocation.watchPosition(onPos, (err) => {
    if (err.code === 1) {
      setGps('Permissão de localização negada. Libere a localização para este site nas configurações do navegador.');
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    } else {
      setGps('Sinal de GPS fraco. Continuando a procurar… fique em local aberto.');
    }
  }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 30000 });
}
function setGps(t) { $('gpsStatus').textContent = t; }

function onPos(pos) {
  const { latitude, longitude, accuracy } = pos.coords;
  me = [latitude, longitude];
  meAcc = accuracy;
  setGps(`GPS ativo · precisão de ${Math.round(accuracy)} m`);
  if (state.walking && accuracy <= 50) {
    if (lastFix) {
      const d = dist(lastFix.p, me);
      const h = (pos.timestamp - lastFix.t) / 3600000;
      const v = h > 0 ? d / h : 0;
      // ignora ruído (< 8 m) e saltos impossíveis a pé (> 12 km/h)
      if (d >= 0.008 && v <= 12) { state.km += d; lastFix = { p: me, t: pos.timestamp }; save(); }
      else if (v > 12) lastFix = { p: me, t: pos.timestamp };
    } else {
      lastFix = { p: me, t: pos.timestamp };
    }
  }
  if (pendingStartHere) { pendingStartHere = false; setStart(me); }
  drawMe();
  refreshAll();
}

function toggleWalk() {
  if (!state.start || !state.route) { showTab('trajeto'); return; }
  if (state.walking) {
    state.ms += Date.now() - state.startedAt;
    state.walking = false;
    state.startedAt = null;
    lastFix = null;
  } else {
    state.walking = true;
    state.startedAt = Date.now();
    follow = true;
    $('btnFollow').classList.add('on');
    startGps();
  }
  save();
  refreshAll();
}
const elapsed = () => state.ms + (state.walking ? Date.now() - state.startedAt : 0);

// ---------------------------------------------------------------------
// Navegação: onde estou, próxima instrução, alertas
// ---------------------------------------------------------------------
function navInfo() {
  const r = state.route;
  if (!state.start) return { kind: 'nostart' };
  if (!r) return { kind: routeError ? 'offline' : 'loading' };
  const acc = cumulative(r.pts);
  const total = acc[acc.length - 1];
  if (!me) return { kind: 'nogps', total, along: 0, rest: total };
  const pr = project(me, r.pts, acc);
  const rest = Math.max(0, total - pr.along);
  if (dist(me, SANTUARIO.p) < 0.08 || rest < 0.03) return { kind: 'arrived', total, along: total, rest: 0 };
  // ainda não chegou ao ponto de saída
  if (pr.along < 0.05 && dist(me, state.start.p) > 0.08) {
    return { kind: 'tostart', total, along: 0, rest: total, toStart: dist(me, state.start.p) };
  }
  const idx = r.steps.findIndex((s, i) => i > 0 && s.along > pr.along + 0.015);
  const next = idx >= 0 ? r.steps[idx] : null;
  return {
    kind: pr.d > FORA_DO_CAMINHO ? 'off' : 'on',
    total, along: pr.along, rest, off: pr.d,
    next, nextIdx: idx, toNext: next ? next.along - pr.along : rest,
  };
}

function refreshNav(n) {
  if (pickingOnMap) return;
  const icon = $('navIcon'), d = $('navDist'), t = $('navInstr'), alertEl = $('alertCard');
  alertEl.hidden = true;
  switch (n.kind) {
    case 'nostart':
      icon.textContent = '📍'; d.textContent = 'Ponto de saída';
      t.textContent = 'Abra "Trajeto" e informe onde o carro vai te deixar.';
      break;
    case 'loading':
      icon.textContent = '⏳'; d.textContent = 'Calculando…';
      t.textContent = 'Montando o trajeto a pé até o Santuário.';
      break;
    case 'offline':
      icon.textContent = '📶'; d.textContent = 'Sem internet';
      t.textContent = 'O trajeto será calculado assim que houver conexão.';
      break;
    case 'nogps':
      icon.textContent = '🚶'; d.textContent = `${fmtDist(n.total)} até o Santuário`;
      t.textContent = `Saída: ${state.start.title}. Toque em "Iniciar caminhada" quando estiver lá.`;
      break;
    case 'tostart':
      icon.textContent = '📍'; d.textContent = `${fmtDist(n.toStart)} até a saída`;
      t.textContent = `Vá até o ponto de saída: ${state.start.title}.`;
      break;
    case 'arrived':
      icon.textContent = '⛪'; d.textContent = 'Você chegou!';
      t.textContent = 'Bem-vindo ao Santuário Nacional de Aparecida. 🙏';
      break;
    default:
      if (n.next) {
        icon.textContent = n.next.ic; d.textContent = `Em ${fmtDist(n.toNext)}`;
        t.textContent = n.next.text;
      } else {
        icon.textContent = '⬆️'; d.textContent = fmtDist(n.rest);
        t.textContent = state.route.src === 'gpx' ? 'Siga a trilha oficial até o Santuário.' : 'Siga em frente até o Santuário.';
      }
      if (n.kind === 'off') {
        alertEl.hidden = false;
        alertEl.textContent = `⚠️ Você saiu do caminho. Volte cerca de ${fmtDist(n.off)} até a linha azul.`;
        if (!offRouteWarned && navigator.vibrate) navigator.vibrate([300, 150, 300]);
        offRouteWarned = true;
      } else {
        offRouteWarned = false;
      }
  }
}

function refreshStats(n) {
  const rest = n.rest != null ? n.rest : null;
  $('sFalta').textContent = rest != null ? fmtDist(rest) : '--';
  $('sAndado').textContent = state.km < 0.01 ? '0,0 km' : fmtDist(state.km);
  $('sTempo').textContent = fmtClock(elapsed());
  if (rest != null && rest > 0) {
    const t = new Date(Date.now() + rest / VELOCIDADE * 3600000);
    $('sChegada').textContent = `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
  } else {
    $('sChegada').textContent = n.kind === 'arrived' ? 'agora' : '--';
  }
  const pct = n.total ? Math.min(100, Math.max(0, n.along / n.total * 100)) : 0;
  $('bar').style.width = `${pct.toFixed(1)}%`;
  const b = $('btnWalk');
  b.classList.toggle('stop', !!state.walking);
  if (!state.start) b.textContent = 'Definir ponto de saída';
  else if (!state.route) b.textContent = 'Aguardando o trajeto…';
  else if (state.walking) b.textContent = 'Pausar caminhada';
  else b.textContent = state.ms > 0 ? 'Continuar caminhada' : 'Iniciar caminhada';
}

// ---------------------------------------------------------------------
// Tela Trajeto
// ---------------------------------------------------------------------
function refreshTrajeto(n) {
  const s = state.start, r = state.route;
  $('startTitle').textContent = s ? s.title : 'Ainda não definido';
  $('startSub').textContent = s ? (s.sub || '') : 'Onde o carro vai te deixar.';
  $('driverBox').hidden = !s;
  if (s) {
    const [la, ln] = s.p;
    $('lnkGmaps').href = `https://www.google.com/maps/dir/?api=1&destination=${la},${ln}&travelmode=driving`;
    $('lnkWaze').href = `https://waze.com/ul?ll=${la},${ln}&navigate=yes`;
  }
  $('sumDist').textContent = r ? fmtDist(r.dist) : '--';
  $('sumTime').textContent = r ? fmtDur(r.dist / VELOCIDADE) : '--';
  $('btnAuto').hidden = !(r && r.src === 'gpx');
  let info;
  if (!s) info = 'Informe o ponto de saída para calcular o trajeto.';
  else if (!r) info = routeError ? 'Sem internet para calcular o trajeto. Ele será calculado assim que houver conexão.' : 'Calculando o trajeto a pé…';
  else if (r.src === 'gpx') info = 'Usando a trilha oficial carregada do arquivo. O app avisa se você sair dela.';
  else info = 'Trajeto a pé calculado pelas ruas e estradas do mapa (OpenStreetMap), evitando rodovias. Pode não ser exatamente o traçado sinalizado da Rota da Luz.';
  $('trackInfo').textContent = info;

  const ol = $('steps');
  ol.innerHTML = '';
  if (!r) return;
  if (r.src === 'gpx') {
    ol.innerHTML = '<li><div class="ic">〰️</div><div><div class="t">Siga a linha azul da trilha oficial</div><div class="d">Arquivos de trilha não trazem instruções de curva. O app avisa se você sair do caminho.</div></div></li>';
    return;
  }
  const navigating = n.kind === 'on' || n.kind === 'off';
  r.steps.forEach((st, i) => {
    const li = document.createElement('li');
    if (navigating) {
      if (i < n.nextIdx || n.nextIdx < 0) li.className = 'passed';
      else if (i === n.nextIdx) li.className = 'current';
    }
    li.innerHTML = '<div class="ic"></div><div><div class="t"></div><div class="d"></div></div>';
    li.querySelector('.ic').textContent = st.ic;
    li.querySelector('.t').textContent = st.text;
    li.querySelector('.d').textContent = i === r.steps.length - 1
      ? `km ${km1(r.dist)}`
      : `km ${km1(st.along)} · depois siga ${fmtDist(st.len)}`;
    li.addEventListener('click', () => {
      showTab('caminhada');
      follow = false;
      $('btnFollow').classList.remove('on');
      if (map) setTimeout(() => map.setView(st.p, 17), 60);
    });
    ol.append(li);
  });
}

// ---------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------
function refreshChecklist() {
  const ul = $('checkList');
  if (ul.childElementCount !== CHECKLIST.length) {
    ul.innerHTML = '';
    CHECKLIST.forEach((item, i) => {
      const li = document.createElement('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.id = `ck${i}`;
      cb.addEventListener('change', () => {
        const s = new Set(state.check);
        cb.checked ? s.add(i) : s.delete(i);
        state.check = [...s];
        save();
        refreshChecklist();
      });
      const lb = document.createElement('label');
      lb.htmlFor = cb.id; lb.textContent = item;
      li.append(cb, lb);
      ul.append(li);
    });
  }
  [...ul.children].forEach((li, i) => {
    const on = state.check.includes(i);
    li.querySelector('input').checked = on;
    li.classList.toggle('done', on);
  });
  $('checkCount').textContent = `· ${state.check.length}/${CHECKLIST.length}`;
}

// ---------------------------------------------------------------------
// Mapa (moderno + satélite)
// ---------------------------------------------------------------------
let map = null, routeLayer = null, meMarker = null, meCircle = null, tileErrors = 0;
const layers = {};
function initMap() {
  if (typeof L === 'undefined') { $('map').innerHTML = '<p style="padding:150px 16px">Sem internet para carregar o mapa agora.</p>'; return; }
  map = L.map('map', { zoomControl: false, zoomSnap: 0.25 }).setView(PINDA.p, 11);
  layers.mapa = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19, subdomains: 'abcd', attribution: '© OpenStreetMap · © CARTO',
  });
  layers.satelite = L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Imagens © Esri, Maxar, Earthstar Geographics',
    }),
    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, opacity: 0.9 }),
    L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
  ]);
  layers.reserva = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
  // se o mapa moderno não carregar, troca para o mapa padrão do OpenStreetMap
  layers.mapa.on('tileerror', () => {
    tileErrors++;
    if (tileErrors === 6 && state.layer === 'mapa') applyLayer();
  });
  applyLayer();
  map.on('dragstart', () => { follow = false; $('btnFollow').classList.remove('on'); });
  map.on('click', (e) => {
    if (!pickingOnMap) return;
    map.closePopup();
    pickingOnMap = false;
    setStart([e.latlng.lat, e.latlng.lng]);
    setTimeout(() => showTab('trajeto'), 300);
  });
}
function applyLayer() {
  if (!map) return;
  Object.values(layers).forEach((l) => { if (map.hasLayer(l)) map.removeLayer(l); });
  const base = state.layer === 'satelite' ? layers.satelite : (tileErrors >= 6 ? layers.reserva : layers.mapa);
  base.addTo(map);
  $('layerIcon').textContent = state.layer === 'satelite' ? '🗺️' : '🛰️';
  $('btnLayer').title = state.layer === 'satelite' ? 'Ver mapa' : 'Ver satélite';
  $('btnLayer').classList.toggle('on', state.layer === 'satelite');
}
const pinIcon = (cls, txt) => L.divIcon({ className: '', html: `<div class="mk ${cls}">${txt}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
function drawRoute() {
  if (!map) return;
  if (routeLayer) routeLayer.remove();
  routeLayer = L.layerGroup().addTo(map);
  const r = state.route;
  if (r) {
    L.polyline(r.pts, { color: '#ffffff', weight: 9, opacity: 0.95 }).addTo(routeLayer);
    L.polyline(r.pts, { color: '#1a73e8', weight: 5, opacity: 1, className: 'route-line' }).addTo(routeLayer);
  }
  if (state.start) L.marker(state.start.p, { icon: pinIcon('a', 'A'), interactive: false, keyboard: false }).addTo(routeLayer); // não bloqueia o toque ao escolher o ponto no mapa
  L.marker(SANTUARIO.p, { icon: pinIcon('b', '⛪'), bubblingMouseEvents: true }).bindPopup(`<b>${SANTUARIO.nome}</b>`).addTo(routeLayer);
}
function drawMe() {
  if (!map || !me) return;
  if (!meMarker) {
    meCircle = L.circle(me, { radius: meAcc || 20, color: '#1a73e8', weight: 1, fillOpacity: 0.08 }).addTo(map);
    meMarker = L.marker(me, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }), zIndexOffset: 1000 }).addTo(map);
  } else {
    meMarker.setLatLng(me);
    meCircle.setLatLng(me).setRadius(meAcc || 20);
  }
  if (follow && state.walking) map.setView(me, Math.max(map.getZoom(), 16));
}
function fitRoute() {
  if (!map) return;
  const pts = state.route ? state.route.pts.slice() : [SANTUARIO.p, state.start ? state.start.p : PINDA.p];
  map.fitBounds(pts, { paddingTopLeft: [20, 130], paddingBottomRight: [72, 200] });
}

// ---------------------------------------------------------------------
// Atualização geral e abas
// ---------------------------------------------------------------------
let lastRouteKey = null, lastStartKey = null;
function refreshAll() {
  const n = navInfo();
  refreshNav(n);
  refreshStats(n);
  refreshTrajeto(n);
  refreshChecklist();
  const rk = state.route ? `${state.route.src}:${state.route.key}:${state.route.pts.length}` : 'none';
  const sk = state.start ? `${state.start.p.join(',')}:${state.start.title}` : 'none';
  if (rk !== lastRouteKey || sk !== lastStartKey) {
    const routeChanged = rk !== lastRouteKey;
    lastRouteKey = rk; lastStartKey = sk;
    drawRoute();
    if (routeChanged && state.route) fitRoute();
  }
}
// os créditos do mapa ficam logo acima do painel de baixo, sem cobrir os números
function fitSheet() {
  const h = document.querySelector('.sheet').offsetHeight;
  if (h) document.documentElement.style.setProperty('--sheet-h', `${h}px`);
}
window.addEventListener('resize', fitSheet);
let currentTab = 'caminhada';
function showTab(name) {
  currentTab = name;
  document.querySelectorAll('.tab').forEach((s) => { s.hidden = s.id !== `tab-${name}`; });
  document.querySelectorAll('.tabs button').forEach((b) => {
    if (b.dataset.tab === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (name === 'caminhada' && map) setTimeout(() => { fitSheet(); map.invalidateSize(); }, 30);
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------
function init() {
  initMap();
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('btnWalk').addEventListener('click', toggleWalk);
  $('btnLayer').addEventListener('click', () => { state.layer = state.layer === 'satelite' ? 'mapa' : 'satelite'; save(); applyLayer(); });
  $('btnFollow').addEventListener('click', () => {
    follow = true; $('btnFollow').classList.add('on');
    startGps();
    if (me && map) map.setView(me, 17);
  });
  $('btnFit').addEventListener('click', () => { follow = false; $('btnFollow').classList.remove('on'); fitRoute(); });

  $('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('searchInput').value.trim();
    const ul = $('searchResults');
    if (!q) return;
    ul.hidden = false;
    ul.innerHTML = '<li>Buscando…</li>';
    try {
      const res = await searchAddress(q);
      ul.innerHTML = '';
      if (!res.length) { ul.innerHTML = '<li>Nenhum endereço encontrado. Inclua o número e a cidade, ou escolha no mapa.</li>'; return; }
      res.forEach((r) => {
        const lbl = labelFromAddress(r);
        const li = document.createElement('li');
        li.innerHTML = '<b></b><br><span class="muted"></span>';
        li.querySelector('b').textContent = lbl.title;
        li.querySelector('span').textContent = lbl.sub;
        li.addEventListener('click', () => {
          ul.hidden = true;
          $('searchInput').value = '';
          setStart([+r.lat, +r.lon], lbl);
        });
        ul.append(li);
      });
    } catch (err) {
      ul.innerHTML = '<li>Não foi possível buscar agora. Verifique a internet ou escolha o ponto no mapa.</li>';
    }
  });
  $('btnStartHere').addEventListener('click', () => {
    if (me) setStart(me);
    else { pendingStartHere = true; startGps(); $('trackInfo').textContent = 'Aguardando o GPS para marcar sua posição…'; }
  });
  $('btnStartMap').addEventListener('click', () => {
    pickingOnMap = true;
    showTab('caminhada');
    $('alertCard').hidden = true;
    $('navIcon').textContent = '👆';
    $('navDist').textContent = 'Escolha no mapa';
    $('navInstr').textContent = 'Toque no local exato onde o carro vai te deixar.';
    if (map) setTimeout(() => map.setView(state.start ? state.start.p : PINDA.p, 15), 60);
  });
  $('btnStartPinda').addEventListener('click', () => setStart(PINDA.p, { title: PINDA.nome, sub: PINDA.sub }));
  $('btnGpx').addEventListener('click', () => $('trackFile').click());
  $('trackFile').addEventListener('change', (e) => { if (e.target.files[0]) loadTrackFile(e.target.files[0]); e.target.value = ''; });
  $('btnAuto').addEventListener('click', () => { state.route = null; save(); computeRoute(); });
  $('btnReset').addEventListener('click', () => {
    if (!confirm('Zerar km andados e tempo? O ponto de saída e o trajeto continuam salvos.')) return;
    state.km = 0; state.ms = 0; state.walking = false; state.startedAt = null; lastFix = null;
    save(); refreshAll();
  });
  window.addEventListener('online', () => { routeError = false; computeRoute(); });

  if (state.walking) startGps();
  setInterval(() => { if (state.walking) refreshAll(); }, 10000);
  refreshAll();
  if (state.route) fitRoute();
  computeRoute();
  showTab(state.start ? 'caminhada' : 'trajeto');

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
