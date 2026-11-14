'use strict';

// ---------- Dados ----------
const SANTUARIO = { nome: 'Santuário Nacional de Aparecida', lat: -22.8519, lng: -45.2337 };

const ROUTES = {
  luz: {
    nome: 'Rota da Luz: Pindamonhangaba → Aparecida',
    desc: 'Trecho final da Rota da Luz, com cerca de 35 km pelo caminho, segundo a Associação dos Amigos da Rota da Luz. O caminho segue estradas rurais, por isso é mais longo que a linha reta.',
    site: 'https://www.amigosdarotadaluz.org',
    kmReal: 35,
    stops: [
      ['Pindamonhangaba', -22.9246, -45.4613],
    ],
  },
  sp: {
    nome: 'São Paulo → Aparecida (Via Dutra)',
    desc: 'Saída da Praça da Sé, seguindo o eixo da Via Dutra pelo Vale do Paraíba.',
    stops: [
      ['São Paulo (Praça da Sé)', -23.5505, -46.6340],
      ['Guarulhos', -23.4628, -46.5333],
      ['Arujá', -23.3965, -46.3200],
      ['Santa Isabel', -23.3156, -46.2236],
      ['Jacareí', -23.3053, -45.9658],
      ['São José dos Campos', -23.1794, -45.8869],
      ['Caçapava', -23.1008, -45.7069],
      ['Taubaté', -23.0264, -45.5553],
      ['Pindamonhangaba', -22.9246, -45.4613],
      ['Roseira', -22.8978, -45.3070],
    ],
  },
  rj: {
    nome: 'Rio de Janeiro → Aparecida (Via Dutra)',
    desc: 'Saída do centro do Rio, subindo a Serra das Araras e seguindo pelo Vale do Paraíba.',
    stops: [
      ['Rio de Janeiro (Centro)', -22.9010, -43.1770],
      ['Nova Iguaçu', -22.7590, -43.4510],
      ['Piraí', -22.6290, -43.8980],
      ['Volta Redonda', -22.5230, -44.1040],
      ['Barra Mansa', -22.5440, -44.1710],
      ['Resende', -22.4690, -44.4470],
      ['Itatiaia', -22.4960, -44.5640],
      ['Queluz', -22.5370, -44.7750],
      ['Cruzeiro', -22.5760, -44.9630],
      ['Cachoeira Paulista', -22.6650, -45.0090],
      ['Lorena', -22.7310, -45.1240],
      ['Guaratinguetá', -22.8160, -45.1920],
    ],
  },
  gps: {
    nome: 'Da minha localização',
    desc: 'Usa o ponto onde você ativou o GPS como saída, em linha reta até o Santuário.',
    stops: [],
  },
};

const CHECKLIST = [
  'Tênis já amaciado (nunca novo)',
  'Meias sem costura (3 pares ou mais)',
  'Garrafa ou mochila de hidratação',
  'Protetor solar e boné',
  'Capa de chuva',
  'Colete ou faixa refletiva',
  'Lanterna',
  'Esparadrapo, curativo para bolhas e vaselina',
  'Remédios de uso pessoal',
  'Documento com foto e cartão do SUS',
  'Carregador portátil para o celular',
  'Lanches leves (frutas, castanhas, barrinhas)',
  'Terço ou intenção da promessa 🙏',
];

// ---------- Estado ----------
const KEY = 'caminhada-aparecida-v1';
const defaultState = () => ({
  route: 'luz',
  done: {},          // { routeId: [indices concluídos] }
  check: [],         // índices marcados
  km: 0,             // km andados
  ms: 0,             // tempo andando (ms)
  walking: false,
  startedAt: null,   // timestamp do trecho atual
  gpsStart: null,    // [lat, lng] para rota "gps"
});

let state = load();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) { /* armazenamento indisponível */ }
  return defaultState();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignora */ }
}

// ---------- Geometria ----------
const R = 6371;
const rad = (d) => d * Math.PI / 180;
function dist(a, b) {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function routePoints() {
  const r = ROUTES[state.route];
  let stops = r.stops.map(([n, la, ln]) => ({ nome: n, p: [la, ln] }));
  if (state.route === 'gps') {
    stops = state.gpsStart ? [{ nome: 'Ponto de partida', p: state.gpsStart }] : [];
  }
  stops.push({ nome: SANTUARIO.nome, p: [SANTUARIO.lat, SANTUARIO.lng] });
  return stops;
}

// ---------- Traçado do caminho ----------
// Caminho real (a pé pelo OpenStreetMap ou trilha GPX) guardado no aparelho.
const TRACK_KEY = 'caminhada-aparecida-tracks-v1';
let tracks = {};
try { tracks = JSON.parse(localStorage.getItem(TRACK_KEY) || '{}'); } catch (e) { tracks = {}; }
function saveTracks() {
  try { localStorage.setItem(TRACK_KEY, JSON.stringify(tracks)); } catch (e) { /* ignora */ }
}
function trackId() {
  return state.route === 'gps' ? `gps:${(state.gpsStart || []).map((n) => n.toFixed(3)).join(',')}` : state.route;
}

function cumulativeLine(line) {
  const acc = [0];
  for (let i = 1; i < line.length; i++) acc.push(acc[i - 1] + dist(line[i - 1], line[i]));
  return acc;
}

// Projeta a posição na linha: km percorridos ao longo dela e distância até ela.
function projectOnLine(pos, line, acc) {
  if (line.length < 2) return null;
  let best = { d: Infinity, along: 0 };
  const k = Math.cos(rad(pos[0]));
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const ax = a[1] * k, ay = a[0], bx = b[1] * k, by = b[0], px = pos[1] * k, py = pos[0];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const q = [ay + t * dy, (ax + t * dx) / k];
    const d = dist(pos, q);
    if (d < best.d) best = { d, along: acc[i] + t * (acc[i + 1] - acc[i]) };
  }
  return best;
}

// Junta paradas + traçado: linha, km acumulados, km de cada parada e de onde veio o traçado.
function geometry() {
  const stops = routePoints();
  const t = tracks[trackId()];
  const line = t && t.pts.length > 1 ? t.pts : stops.map((s) => s.p);
  const src = t && t.pts.length > 1 ? t.src : 'reta';
  const acc = cumulativeLine(line);
  let total = acc[acc.length - 1] || 0;
  let stopAlong;
  if (src === 'reta') {
    stopAlong = acc.slice();
  } else {
    let prev = 0;
    stopAlong = stops.map((s, i) => {
      if (i === 0) return 0;
      if (i === stops.length - 1) return total;
      const pr = projectOnLine(s.p, line, acc);
      prev = Math.max(prev, pr ? pr.along : prev);
      return prev;
    });
  }
  // sem traçado real, usa a distância informada pela organização da rota
  const kmReal = ROUTES[state.route].kmReal;
  const f = src === 'reta' && kmReal && total > 0 ? kmReal / total : 1;
  return { stops, line, acc, total, stopAlong, src, f };
}

const SRC_LABEL = {
  osm: 'pelo caminho a pé',
  gpx: 'pela trilha carregada',
  reta: 'em linha reta',
};

let fetching = null;
async function fetchTrack() {
  const id = trackId();
  const stops = routePoints();
  if (tracks[id] || stops.length < 2 || fetching === id || !navigator.onLine) return;
  fetching = id;
  setTrackStatus('Buscando o caminho a pé pelas ruas e estradas…');
  const coords = stops.map((s) => `${s.p[1].toFixed(5)},${s.p[0].toFixed(5)}`).join('%3B'); // ';' codificado: alguns proxies bloqueiam ';' na URL
  try {
    const r = await fetch(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson`);
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    const pts = j.routes[0].geometry.coordinates.map(([ln, la]) => [+la.toFixed(5), +ln.toFixed(5)]);
    if (pts.length < 2) throw new Error('vazio');
    tracks[id] = { src: 'osm', pts };
    saveTracks();
    drawRoute();
    render();
  } catch (e) {
    setTrackStatus('Não foi possível buscar o caminho a pé agora. Mostrando linha reta; o app tenta de novo na próxima vez que abrir com internet.');
  } finally {
    fetching = null;
  }
}

function setTrackStatus(msg) {
  const el = $('trackStatus');
  if (el) el.textContent = msg;
}

function describeTrack(src) {
  if (src === 'osm') return 'Caminho a pé calculado pelas ruas e estradas do OpenStreetMap, evitando rodovias. Pode não ser exatamente o traçado oficial sinalizado. Se tiver a trilha oficial em arquivo GPX ou KML, carregue abaixo.';
  if (src === 'gpx') return 'Usando a trilha do arquivo que você carregou.';
  return 'Ainda sem o caminho real: mostrando linha reta entre as paradas.';
}

// Lê um arquivo GPX ou KML e devolve a lista de pontos [lat, lng].
function parseTrackFile(text) {
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  let pts = [...xml.querySelectorAll('trkpt, rtept')].map((n) => [+n.getAttribute('lat'), +n.getAttribute('lon')]);
  if (pts.length < 2) {
    pts = [];
    xml.querySelectorAll('LineString coordinates, coordinates').forEach((c) => {
      c.textContent.trim().split(/\s+/).forEach((t) => {
        const [ln, la] = t.split(',').map(Number);
        if (!isNaN(la) && !isNaN(ln)) pts.push([la, ln]);
      });
    });
  }
  pts = pts.filter(([la, ln]) => isFinite(la) && isFinite(ln));
  // reduz para no máximo ~4000 pontos
  const step = Math.ceil(pts.length / 4000);
  return pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(([la, ln]) => [+la.toFixed(5), +ln.toFixed(5)]);
}

function loadTrackFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let pts = [];
    try { pts = parseTrackFile(reader.result); } catch (e) { pts = []; }
    if (pts.length < 2) {
      alert('Não encontrei uma trilha nesse arquivo. Use um arquivo GPX ou KML.');
      return;
    }
    // garante que a trilha termina perto do Santuário
    const toSant = (p) => dist(p, [SANTUARIO.lat, SANTUARIO.lng]);
    if (toSant(pts[0]) < toSant(pts[pts.length - 1])) pts.reverse();
    tracks[trackId()] = { src: 'gpx', pts };
    saveTracks();
    drawRoute();
    render();
  };
  reader.readAsText(file);
}

function useAutoTrack() {
  delete tracks[trackId()];
  saveTracks();
  drawRoute();
  render();
  fetchTrack();
}

// ---------- Formatação ----------
const fmtKm = (km) => km.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
function fmtTime(ms) {
  const m = Math.floor(ms / 60000);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}
const $ = (id) => document.getElementById(id);

// ---------- GPS ----------
let me = null;           // [lat, lng]
let lastFix = null;      // última posição usada para somar km
let watchId = null;

function startGps() {
  if (!('geolocation' in navigator)) {
    $('gpsStatus').textContent = 'Este aparelho não tem GPS disponível no navegador.';
    return;
  }
  if (watchId !== null) return;
  $('gpsStatus').textContent = 'Procurando sinal de GPS…';
  watchId = navigator.geolocation.watchPosition(onPos, (err) => {
    $('gpsStatus').textContent = err.code === 1
      ? 'Permissão de localização negada. Libere nas configurações do navegador.'
      : 'Não foi possível obter a localização. Tente em local aberto.';
    watchId = null;
    $('btnGps').textContent = 'Ativar GPS';
  }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
  $('btnGps').textContent = 'GPS ativo';
}

function onPos(p) {
  const { latitude, longitude, accuracy } = p.coords;
  me = [latitude, longitude];
  $('gpsStatus').textContent = `GPS ativo · precisão de ${Math.round(accuracy)} m`;

  if (state.route === 'gps' && !state.gpsStart) {
    state.gpsStart = me;
    save();
    drawRoute();
    fetchTrack();
  }

  if (state.walking && accuracy <= 50) {
    if (lastFix) {
      const d = dist(lastFix.p, me);
      const hours = (p.timestamp - lastFix.t) / 3600000;
      const speed = hours > 0 ? d / hours : 0;
      // ignora ruído (< 8 m) e saltos impossíveis a pé (> 12 km/h)
      if (d >= 0.008 && speed <= 12) {
        state.km += d;
        lastFix = { p: me, t: p.timestamp };
        save();
      } else if (speed > 12) {
        lastFix = { p: me, t: p.timestamp };
      }
    } else {
      lastFix = { p: me, t: p.timestamp };
    }
  }
  updateMeMarker();
  render();
}

// ---------- Caminhada ----------
function toggleWalk() {
  if (state.walking) {
    state.ms += Date.now() - state.startedAt;
    state.walking = false;
    state.startedAt = null;
    lastFix = null;
  } else {
    state.walking = true;
    state.startedAt = Date.now();
    startGps();
  }
  save();
  render();
}

function elapsed() {
  return state.ms + (state.walking ? Date.now() - state.startedAt : 0);
}

// ---------- Render ----------
function render() {
  const g = geometry();
  const { stops, total, stopAlong, src, f } = g;
  const done = state.done[state.route] || [];
  const label = src === 'reta' && f !== 1 ? 'pelo caminho (estimado)' : SRC_LABEL[src];

  $('routeName').textContent = ROUTES[state.route].nome;
  if (fetching !== trackId()) setTrackStatus(describeTrack(src));
  const mapNote = $('mapNote');
  if (mapNote) {
    mapNote.textContent = src === 'reta'
      ? 'Linha reta provisória entre as paradas. Abra o app com internet para carregar o caminho a pé.'
      : 'Siga sempre a sinalização do caminho e caminhe de frente para o trânsito.';
  }

  // distância e progresso
  let progress = 0;
  let nextIdx = stops.findIndex((_, i) => !done.includes(i) && i > 0);
  if (me) {
    const dS = dist(me, [SANTUARIO.lat, SANTUARIO.lng]);
    const pr = projectOnLine(me, g.line, g.acc);
    if (pr && total > 0 && pr.d <= 3) {
      progress = pr.along / total;
      nextIdx = stopAlong.findIndex((k, i) => i > 0 && k > pr.along + 0.05);
      $('distSantuario').textContent = `${fmtKm((total - pr.along) * f)} km`;
      $('distInfo').textContent = `Distância que falta ${label}. Em linha reta são ${fmtKm(dS)} km.`;
    } else {
      $('distSantuario').textContent = `${fmtKm(dS)} km`;
      $('distInfo').textContent = pr
        ? `Em linha reta. Você está a ${fmtKm(pr.d)} km do percurso escolhido.`
        : 'Distância em linha reta até o Santuário.';
    }
  } else {
    const lastDone = Math.max(0, ...done.filter((i) => i < stops.length));
    progress = total > 0 ? stopAlong[lastDone] / total : 0;
    const rest = total - stopAlong[lastDone];
    $('distSantuario').textContent = total > 0 ? `${fmtKm(rest * f)} km` : '--';
    $('distInfo').textContent = total > 0
      ? 'Estimativa pelas etapas concluídas. Ative o GPS para mais precisão.'
      : 'Ative o GPS para definir seu ponto de partida.';
  }
  progress = Math.max(0, Math.min(1, progress));
  $('progressBar').style.width = `${(progress * 100).toFixed(1)}%`;
  $('progressTxt').textContent = `${Math.round(progress * 100)}% do percurso · total de ${fmtKm(total * f)} km ${label}`;

  // próxima parada
  if (nextIdx > 0 && nextIdx < stops.length) {
    const s = stops[nextIdx];
    const extra = me ? `${fmtKm(dist(me, s.p))} km daqui em linha reta` : `km ${fmtKm(stopAlong[nextIdx] * f)} do percurso`;
    $('nextStop').innerHTML = `<b></b><br><span class="muted">${extra}</span>`;
    $('nextStop').querySelector('b').textContent = s.nome;
  } else if (total > 0) {
    $('nextStop').innerHTML = '<b>Você chegou! Bem-vindo ao Santuário. 🙏</b>';
  }

  // caminhada
  const ms = elapsed();
  $('kmAndados').textContent = fmtKm(state.km);
  $('tempo').textContent = fmtTime(ms);
  $('ritmo').textContent = ms > 60000 && state.km > 0 ? fmtKm(state.km / (ms / 3600000)) : '--';
  $('btnWalk').textContent = state.walking ? 'Pausar caminhada' : (state.ms > 0 ? 'Continuar caminhada' : 'Iniciar caminhada');

  renderStages(stops, stopAlong.map((k) => k * f), done);
  renderChecklist();
}

function renderStages(stops, acc, done) {
  const ul = $('stagesList');
  ul.innerHTML = '';
  stops.forEach((s, i) => {
    const li = document.createElement('li');
    const isDone = i === 0 || done.includes(i);
    if (isDone && i > 0) li.className = 'done';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isDone;
    cb.disabled = i === 0;
    cb.setAttribute('aria-label', `Concluí ${s.nome}`);
    cb.addEventListener('change', () => {
      const list = new Set(state.done[state.route] || []);
      cb.checked ? list.add(i) : list.delete(i);
      state.done[state.route] = [...list];
      save();
      render();
    });
    const txt = document.createElement('div');
    const leg = i > 0 ? `+${fmtKm(acc[i] - acc[i - 1])} km desde a anterior` : 'Saída';
    txt.innerHTML = `<div class="t"></div><div class="muted">${leg}</div>`;
    txt.querySelector('.t').textContent = s.nome;
    const km = document.createElement('span');
    km.className = 'km';
    km.textContent = `km ${fmtKm(acc[i])}`;
    li.append(cb, txt, km);
    ul.append(li);
  });
  const n = stops.length - 1;
  $('stagesCount').textContent = n > 0 ? `${done.filter((i) => i > 0 && i <= n).length}/${n}` : '';
}

function renderChecklist() {
  const ul = $('checkList');
  if (ul.childElementCount !== CHECKLIST.length) {
    ul.innerHTML = '';
    CHECKLIST.forEach((item, i) => {
      const li = document.createElement('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = `ck${i}`;
      cb.addEventListener('change', () => {
        const s = new Set(state.check);
        cb.checked ? s.add(i) : s.delete(i);
        state.check = [...s];
        save();
        renderChecklist();
      });
      const lb = document.createElement('label');
      lb.htmlFor = cb.id;
      lb.className = 't';
      lb.textContent = item;
      li.append(cb, lb);
      ul.append(li);
    });
  }
  [...ul.children].forEach((li, i) => {
    const on = state.check.includes(i);
    li.querySelector('input').checked = on;
    li.classList.toggle('done', on);
  });
  $('checkCount').textContent = `${state.check.length}/${CHECKLIST.length}`;
}

// ---------- Mapa ----------
let map = null, routeLayer = null, meMarker = null;

function initMap() {
  if (map || typeof L === 'undefined') {
    if (typeof L === 'undefined') $('map').innerHTML = '<p class="card">Sem internet para carregar o mapa agora.</p>';
    return;
  }
  map = L.map('map', { zoomControl: true });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);
  drawRoute();
}

function drawRoute() {
  if (!map) return;
  if (routeLayer) routeLayer.remove();
  const g = geometry();
  const stops = g.stops;
  routeLayer = L.layerGroup().addTo(map);
  const done = state.done[state.route] || [];
  if (g.line.length > 1) {
    const style = g.src === 'reta'
      ? { color: '#c9a227', weight: 4, opacity: .8, dashArray: '8 8' }
      : { color: '#d4351c', weight: 5, opacity: .85 };
    L.polyline(g.line, style).addTo(routeLayer);
  }
  stops.forEach((s, i) => {
    const last = i === stops.length - 1;
    L.circleMarker(s.p, {
      radius: last ? 10 : 7,
      color: '#fff', weight: 2,
      fillColor: last ? '#1d3f72' : (i === 0 || done.includes(i) ? '#2e7d4f' : '#c9a227'),
      fillOpacity: 1,
    }).bindPopup(`<b>${s.nome}</b>`).addTo(routeLayer);
  });
  fitRoute();
}

function fitRoute() {
  if (!map) return;
  const pts = geometry().line.slice();
  if (me) pts.push(me);
  if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30] });
  else map.setView(pts[0], 12);
}

function updateMeMarker() {
  if (!map || !me) return;
  if (!meMarker) {
    meMarker = L.circleMarker(me, { radius: 9, color: '#fff', weight: 3, fillColor: '#2f80ed', fillOpacity: 1 })
      .bindPopup('Você está aqui').addTo(map);
  } else {
    meMarker.setLatLng(me);
  }
}

// ---------- Navegação ----------
function showTab(name) {
  document.querySelectorAll('main > section').forEach((s) => { s.hidden = s.id !== `tab-${name}`; });
  document.querySelectorAll('nav button').forEach((b) => {
    if (b.dataset.tab === name) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });
  if (name === 'mapa') {
    const first = !map;
    initMap();
    setTimeout(() => {
      if (!map) return;
      map.invalidateSize();
      updateMeMarker();
      if (first) fitRoute(); // enquadra só depois que o mapa tem tamanho na tela
    }, 50);
  }
  try { sessionStorage.setItem('tab', name); } catch (e) { /* ignora */ }
  window.scrollTo(0, 0);
}

function showDesc() {
  const r = ROUTES[state.route];
  const el = $('routeDesc');
  el.textContent = r.desc + ' ';
  if (r.site) {
    const a = document.createElement('a');
    a.href = r.site;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Onde dormir, comer, mapas e passaporte: amigosdarotadaluz.org';
    el.append(a);
  }
}

// ---------- Início ----------
function init() {
  const sel = $('routeSelect');
  Object.entries(ROUTES).forEach(([id, r]) => {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = r.nome;
    sel.append(o);
  });
  sel.value = state.route;
  showDesc();
  sel.addEventListener('change', () => {
    state.route = sel.value;
    showDesc();
    if (state.route === 'gps' && !state.gpsStart) startGps();
    save();
    drawRoute();
    render();
    fetchTrack();
  });

  $('trackFile').addEventListener('change', (e) => {
    if (e.target.files[0]) loadTrackFile(e.target.files[0]);
    e.target.value = '';
  });
  $('btnGpx').addEventListener('click', () => $('trackFile').click());
  $('btnAutoTrack').addEventListener('click', useAutoTrack);
  window.addEventListener('online', fetchTrack);

  document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('btnWalk').addEventListener('click', toggleWalk);
  $('btnGps').addEventListener('click', startGps);
  $('btnCenterMe').addEventListener('click', () => {
    startGps();
    if (map && me) map.setView(me, 15);
  });
  $('btnCenterRoute').addEventListener('click', fitRoute);
  $('btnReset').addEventListener('click', () => {
    if (!confirm('Apagar km andados, tempo, etapas e checklist?')) return;
    state = defaultState();
    save();
    $('routeSelect').value = state.route;
    showDesc();
    drawRoute();
    render();
  });

  if (state.walking) startGps();
  setInterval(() => { if (state.walking) render(); }, 15000);

  let tab = 'painel';
  try { tab = sessionStorage.getItem('tab') || 'painel'; } catch (e) { /* ignora */ }
  showTab(tab);
  render();
  fetchTrack();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
