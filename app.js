'use strict';

// =====================================================================
// Caminhada a Aparecida — trecho final da Rota da Luz
// Usa o traçado oficial da Associação dos Amigos da Rota da Luz
// (arquivo rota-oficial.js) até a Praça da Fé, em Aparecida.
// =====================================================================

const OF = window.ROTA_OFICIAL;
const FIM = { nome: OF.fim.nome, sub: OF.fim.sub, p: [OF.fim.lat, OF.fim.lng] };
const SANTUARIO = { nome: 'Santuário Nacional de Aparecida', p: [-22.850521, -45.233723] };
const KM_PADRAO = 35;            // km até o término, pedido para a caminhada
const VELOCIDADE = 4.5;          // km/h de caminhada
const FORA_DO_CAMINHO = 0.06;    // km (60 m)
const NA_TRILHA = 0.08;          // até 80 m da trilha conta como "na trilha"
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
// Projeta a posição na linha → km percorridos ao longo dela e distância até ela.
function project(pos, pts, acc) {
  let best = { d: Infinity, along: 0, i: 0 };
  const k = Math.cos(rad(pos[0]));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = pos[1] * k, py = pos[0];
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1e-12)));
    const d = dist(pos, [ay + t * dy, (ax + t * dx) / k]);
    if (d < best.d) best = { d, along: acc[i] + t * (acc[i + 1] - acc[i]), i };
  }
  return best;
}
// Ponto da linha a "km" do início dela
function pointAt(pts, acc, km) {
  const i = acc.findIndex((a) => a >= km);
  if (i <= 0) return i === 0 ? pts[0] : pts[pts.length - 1];
  const t = (km - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
  return [pts[i - 1][0] + t * (pts[i][0] - pts[i - 1][0]), pts[i - 1][1] + t * (pts[i][1] - pts[i - 1][1])];
}
const round6 = (p) => [+p[0].toFixed(6), +p[1].toFixed(6)];
const sameP = (a, b) => a && b && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Trilha oficial
const OF_PTS = OF.pts;
const OF_ACC = cumulative(OF_PTS);
const OF_TOTAL = OF_ACC[OF_ACC.length - 1];
const P35 = round6(pointAt(OF_PTS, OF_ACC, OF_TOTAL - KM_PADRAO));
const START35 = { p: P35, title: 'Estrada da Rota da Luz', sub: `Pindamonhangaba · ${km1(KM_PADRAO)} km até a Praça da Fé pelo traçado oficial`, preset: true };

// ---------------------------------------------------------------------
// Estado (salvo só no celular)
// ---------------------------------------------------------------------
const KEY = 'caminhada-aparecida-v3';
const blank = () => ({
  start: { ...START35 },
  route: null,     // { pts, steps, dist, approach, key }
  check: [],
  km: 0,
  ms: 0,
  walking: false,
  startedAt: null,
  layer: 'mapa',
  visto: false,
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
// Instruções em português
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
function instruction(type, modifier, rawName, exit) {
  const name = (rawName || '').replace(/\s*;\s*/g, ' / ');
  const [vira, ic] = VIRA[modifier] || ['Siga', '⬆️'];
  switch (type) {
    case 'roundabout': case 'rotary': case 'roundabout turn':
      return { text: `Na rotatória, pegue a ${exit || 1}ª saída${name ? ` para a ${name}` : ''}`, ic: '🔄' };
    case 'fork': return { text: `Na bifurcação, ${vira.toLowerCase()}${name ? `, pela ${name}` : ''}`, ic };
    case 'end of road': return { text: `No fim da via, ${vira.toLowerCase()}${via(name)}`, ic };
    case 'continue': case 'new name':
      return modifier && modifier !== 'straight'
        ? { text: `${vira}${via(name)}`, ic }
        : { text: `Continue${name ? ` pela ${name}` : ' em frente'}`, ic: '⬆️' };
    default:
      return { text: `${vira}${via(name)}`, ic };
  }
}
// Manobras muito próximas (< 50 m) viram uma instrução só: "Vire à direita e logo vire à esquerda…"
function mergeClose(list) {
  const out = [];
  list.forEach((s) => {
    const prev = out[out.length - 1];
    if (prev && !prev.merged && prev.kind === 'turn' && s.kind === 'turn' && s.along - prev.along < 0.05) {
      prev.text = `${prev.text} e logo ${s.text.charAt(0).toLowerCase()}${s.text.slice(1)}`;
      prev.name = s.name;
      prev.merged = true;
      return;
    }
    out.push({ ...s });
  });
  out.forEach((s, i) => { s.len = (i < out.length - 1 ? out[i + 1].along : s.along) - s.along; });
  return out;
}
// Nome da via em que a trilha está no km "al"
function roadAt(al) {
  let name = '';
  OF.steps.forEach((s) => { if (s.along <= al && s.name) name = s.name; });
  return name || 'Estrada da Rota da Luz';
}

// ---------------------------------------------------------------------
// Montagem do trajeto: (caminho até a trilha, se preciso) + trilha oficial
// ---------------------------------------------------------------------
async function getJSON(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
let routing = false, routeError = false;

function officialFrom(al, offset) {
  const pts = [round6(pointAt(OF_PTS, OF_ACC, al)), ...OF_PTS.filter((_, i) => OF_ACC[i] > al + 0.001)];
  // "Continue pela mesma rua" não é uma instrução útil: só entra quando o nome da via muda
  const norm = (n) => (n || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  let prevName = null;
  const steps = OF.steps
    .filter((s) => s.along > al + 0.01)
    .filter((s) => {
      const straight = ['continue', 'new name'].includes(s.type) && (!s.modifier || s.modifier === 'straight');
      const same = prevName !== null && norm(s.name) === norm(prevName);
      prevName = s.name;
      return !(straight && same);
    })
    .map((s) => ({ ...instruction(s.type, s.modifier, s.name, s.exit), kind: 'turn', name: s.name, p: [s.lat, s.lng], along: s.along - al + offset }));
  return { pts, steps, len: OF_TOTAL - al };
}

async function computeRoute() {
  if (!state.start || routing) return;
  const key = state.start.p.join(',');
  if (state.route && state.route.key === key) return;
  const sp = state.start.p;
  const pr = project(sp, OF_PTS, OF_ACC);
  // ponto de saída na própria trilha oficial
  if (pr.d <= NA_TRILHA) {
    const o = officialFrom(pr.along, 0);
    const first = { text: `Comece a caminhar pela ${roadAt(pr.along)}`, ic: '🚶', kind: 'start', name: '', p: sp, along: 0 };
    const last = { text: `Chegada à ${FIM.nome}, término da Rota da Luz`, ic: '⛪', kind: 'end', name: '', p: FIM.p, along: o.len };
    state.route = { key, pts: [sp, ...o.pts], steps: mergeClose([first, ...o.steps, last]), dist: o.len + pr.d, approach: 0 };
    routeError = false;
    save();
    refreshAll();
    return;
  }
  // fora da trilha: caminho a pé até o ponto mais próximo dela, depois a trilha oficial
  routing = true;
  refreshAll();
  const join = round6(pointAt(OF_PTS, OF_ACC, pr.along));
  const c = [sp, join].map(([la, ln]) => `${ln.toFixed(6)},${la.toFixed(6)}`).join('%3B'); // ';' codificado (alguns proxies bloqueiam ';')
  try {
    const j = await getJSON(`${ROUTER}/route/v1/foot/${c}?overview=full&geometries=geojson&steps=true`);
    const r = j.routes[0];
    const apts = r.geometry.coordinates.map(([ln, la]) => round6([la, ln]));
    const aacc = cumulative(apts);
    const alen = aacc[aacc.length - 1];
    const asteps = r.legs[0].steps
      .filter((s) => !['depart', 'arrive'].includes(s.maneuver.type))
      .map((s) => {
        const loc = [s.maneuver.location[1], s.maneuver.location[0]];
        return { ...instruction(s.maneuver.type, s.maneuver.modifier, s.name || s.ref || '', s.maneuver.exit), kind: 'turn', name: s.name || '', p: loc, along: project(loc, apts, aacc).along };
      });
    const first0 = r.legs[0].steps[0];
    const first = { text: `Comece a caminhar${first0 && first0.name ? ` pela ${first0.name}` : ''} em direção à trilha da Rota da Luz`, ic: '🚶', kind: 'start', name: '', p: sp, along: 0 };
    const joinStep = { text: `Entre na trilha oficial da Rota da Luz, pela ${roadAt(pr.along)}`, ic: '🟦', kind: 'join', name: '', p: join, along: alen };
    const o = officialFrom(pr.along, alen);
    const last = { text: `Chegada à ${FIM.nome}, término da Rota da Luz`, ic: '⛪', kind: 'end', name: '', p: FIM.p, along: alen + o.len };
    if (state.start && state.start.p.join(',') === key) {
      state.route = { key, pts: [...apts, ...o.pts], steps: mergeClose([first, ...asteps, joinStep, ...o.steps, last]), dist: alen + o.len, approach: alen };
      save();
    }
    routeError = false;
  } catch (e) {
    routeError = true;
  } finally {
    routing = false;
    refreshAll();
    if (!routeError && state.start && (!state.route || state.route.key !== state.start.p.join(','))) computeRoute();
  }
}

// ---------------------------------------------------------------------
// Busca de endereço
// ---------------------------------------------------------------------
function searchAddress(q) {
  return getJSON(`${GEOCODER}/search?format=jsonv2&addressdetails=1&limit=6&countrycodes=br&accept-language=pt-BR` +
    `&viewbox=-45.75,-22.70,-45.10,-23.05&q=${encodeURIComponent(q)}`);
}
async function reverseAddress(p) {
  try {
    const j = await getJSON(`${GEOCODER}/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=pt-BR&lat=${p[0]}&lon=${p[1]}`);
    if (j && j.address) return labelFromAddress(j);
    throw new Error('sem endereço');
  } catch (e) {
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
  state.start = { p: rp, title: lbl.title, sub: lbl.sub, preset: !!(label && label.preset) };
  state.route = null;
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
  if (dist(me, FIM.p) < 0.06 || (rest < 0.03 && pr.d < FORA_DO_CAMINHO)) return { kind: 'arrived', total, along: total, rest: 0 };
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
      t.textContent = 'Abra "Trajeto" e escolha onde o carro vai te deixar.';
      break;
    case 'loading':
      icon.textContent = '⏳'; d.textContent = 'Calculando…';
      t.textContent = 'Montando o caminho até a trilha da Rota da Luz.';
      break;
    case 'offline':
      icon.textContent = '📶'; d.textContent = 'Sem internet';
      t.textContent = 'O caminho até a trilha será calculado assim que houver conexão.';
      break;
    case 'nogps':
      icon.textContent = '🚶'; d.textContent = `${fmtDist(n.total)} até a ${FIM.nome}`;
      t.textContent = `Saída: ${state.start.title}. Toque em "Iniciar caminhada" quando estiver lá.`;
      break;
    case 'tostart':
      icon.textContent = '📍'; d.textContent = `${fmtDist(n.toStart)} até a saída`;
      t.textContent = `Vá até o ponto de saída: ${state.start.title}.`;
      break;
    case 'arrived':
      icon.textContent = '⛪'; d.textContent = 'Você chegou!';
      t.textContent = `${FIM.nome}, término da Rota da Luz. O Santuário Nacional fica a ${fmtDist(dist(FIM.p, SANTUARIO.p))}. 🙏`;
      break;
    default:
      if (n.next) {
        icon.textContent = n.next.ic; d.textContent = `Em ${fmtDist(n.toNext)}`;
        t.textContent = n.next.text;
      } else {
        icon.textContent = '⬆️'; d.textContent = fmtDist(n.rest);
        t.textContent = `Siga em frente até a ${FIM.nome}.`;
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
  $('btnStart35').hidden = !!(s && s.preset);
  $('driverBox').hidden = !s;
  if (s) {
    const [la, ln] = s.p;
    $('lnkGmaps').href = `https://www.google.com/maps/dir/?api=1&destination=${la},${ln}&travelmode=driving`;
    $('lnkWaze').href = `https://waze.com/ul?ll=${la},${ln}&navigate=yes`;
  }
  $('sumDist').textContent = r ? fmtDist(r.dist) : '--';
  $('sumTime').textContent = r ? fmtDur(r.dist / VELOCIDADE) : '--';
  let info;
  if (!s) info = 'Escolha o ponto de saída.';
  else if (!r) info = routeError ? 'Sem internet para calcular o caminho até a trilha. Ele será calculado assim que houver conexão.' : 'Calculando…';
  else if (r.approach > 0) info = `Traçado oficial da Rota da Luz (mapa da Associação), até a ${FIM.nome}. Do seu ponto de saída até a trilha são ${fmtDist(r.approach)} pelas ruas.`;
  else info = `Traçado oficial da Rota da Luz (mapa da Associação), do ponto de saída até a ${FIM.nome}, em Aparecida.`;
  $('trackInfo').textContent = info;

  const ol = $('steps');
  ol.innerHTML = '';
  if (r) {
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
      li.addEventListener('click', () => focusOn(st.p));
      ol.append(li);
    });
  }
  // pontos da Associação ao longo do trajeto
  const ul = $('pois');
  ul.innerHTML = '';
  const startAl = s ? project(s.p, OF_PTS, OF_ACC).along : 0;
  const offset = r ? r.approach : 0;
  OF.pois.filter((p) => p.along >= startAl - 0.05).forEach((p) => {
    const li = document.createElement('li');
    li.innerHTML = '<div class="ic"></div><div><div class="t"></div><div class="d"></div></div>';
    li.querySelector('.ic').textContent = p.ic;
    li.querySelector('.t').textContent = p.nome;
    li.querySelector('.d').textContent = `km ${km1(Math.max(0, p.along - startAl + offset))}${p.dist > 60 ? ` · a ${fmtDist(p.dist / 1000)} da trilha` : ''}`;
    li.addEventListener('click', () => focusOn([p.lat, p.lng]));
    ul.append(li);
  });
}
function focusOn(p) {
  showTab('caminhada');
  follow = false;
  $('btnFollow').classList.remove('on');
  if (map) setTimeout(() => map.setView(p, 17), 60);
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
let map = null, routeLayer = null, poiLayer = null, meMarker = null, meCircle = null, tileErrors = 0;
const layers = {};
function initMap() {
  if (typeof L === 'undefined') { $('map').innerHTML = '<p style="padding:150px 16px">Sem internet para carregar o mapa agora.</p>'; return; }
  map = L.map('map', { zoomControl: false, zoomSnap: 0.25 }).setView(P35, 11);
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
  poiLayer = L.layerGroup(OF.pois.map((p) =>
    L.marker([p.lat, p.lng], { icon: L.divIcon({ className: '', html: `<div class="poi">${p.ic}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] }) })
      .bindPopup(`<b>${escapeHtml(p.nome)}</b>`)));
  map.on('zoomend', () => { if (map.getZoom() >= 13) poiLayer.addTo(map); else poiLayer.remove(); });
  map.on('dragstart', () => { follow = false; $('btnFollow').classList.remove('on'); });
  map.on('click', (e) => {
    if (!pickingOnMap) return;
    pickingOnMap = false;
    map.closePopup();
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
    L.polyline(r.pts, { color: '#ffffff', weight: 9, opacity: 0.95, interactive: false }).addTo(routeLayer);
    L.polyline(r.pts, { color: '#1a73e8', weight: 5, opacity: 1, className: 'route-line', interactive: false }).addTo(routeLayer);
  }
  // os marcadores não bloqueiam o toque ao escolher o ponto no mapa
  if (state.start) L.marker(state.start.p, { icon: pinIcon('a', 'A'), interactive: false, keyboard: false }).addTo(routeLayer);
  L.marker(FIM.p, { icon: pinIcon('b', '⛪'), interactive: false, keyboard: false }).addTo(routeLayer);
}
function drawMe() {
  if (!map || !me) return;
  if (!meMarker) {
    meCircle = L.circle(me, { radius: meAcc || 20, color: '#1a73e8', weight: 1, fillOpacity: 0.08, interactive: false }).addTo(map);
    meMarker = L.marker(me, { icon: L.divIcon({ className: '', html: '<div class="me-dot"></div>', iconSize: [20, 20], iconAnchor: [10, 10] }), zIndexOffset: 1000, interactive: false }).addTo(map);
  } else {
    meMarker.setLatLng(me);
    meCircle.setLatLng(me).setRadius(meAcc || 20);
  }
  if (follow && state.walking) map.setView(me, Math.max(map.getZoom(), 16));
}
function fitRoute() {
  if (!map) return;
  const pts = state.route ? state.route.pts.slice() : [FIM.p, state.start ? state.start.p : P35];
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
  const rk = state.route ? `${state.route.key}:${state.route.pts.length}` : 'none';
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
function showTab(name) {
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
  $('btnStart35').addEventListener('click', () => setStart(START35.p, START35));
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
    if (map) setTimeout(() => map.setView(state.start ? state.start.p : P35, 15), 60);
  });
  $('btnReset').addEventListener('click', () => {
    if (!confirm('Zerar km andados e tempo? O ponto de saída e o trajeto continuam salvos.')) return;
    state.km = 0; state.ms = 0; state.walking = false; state.startedAt = null; lastFix = null;
    save(); refreshAll();
  });
  window.addEventListener('online', () => { routeError = false; computeRoute(); });

  if (state.walking) startGps();
  setInterval(() => { if (state.walking) refreshAll(); }, 10000);
  refreshAll();
  computeRoute();
  if (state.route) fitRoute();
  showTab(state.visto ? 'caminhada' : 'trajeto');
  state.visto = true;
  save();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
