'use strict';

// =====================================================================
// Caminhada a Aparecida — trecho final a pé (distância configurável, hoje 50 km)
// Três caminhos: Rota da Luz (rota-oficial.js, traçado oficial da Associação),
// Via Dutra (rota-dutra.js) e Caminho da Fé (rota-fe.js, trilha GPS conferida com o mapa oficial).
// Data e distância vêm de alertas.json ("caminhada"), atualizável sem mudar o app.
// =====================================================================

const DU = window.ROTA_DUTRA;
const ROTAS = {
  luz: {
    dados: window.ROTA_OFICIAL, nome: 'Rota da Luz', da: 'da Rota da Luz',
    estrada: 'Estrada da Rota da Luz',
    fim: { nome: 'Praça da Fé', ate: 'a Praça da Fé', chegada: 'à Praça da Fé' },
    fonte: 'Traçado oficial da Rota da Luz (mapa da Associação)',
  },
  fe: {
    dados: window.ROTA_FE, nome: 'Caminho da Fé', da: 'do Caminho da Fé',
    estrada: 'Estrada do Gomeral',
    fim: { nome: 'Santuário Nacional de Aparecida', ate: 'o Santuário Nacional', chegada: 'ao Santuário Nacional' },
    fonte: 'Trilha do Caminho da Fé gravada por GPS e conferida com o mapa oficial da Associação (ramal principal, pela Estrada do Gomeral)',
  },
};
let RT, OF, FIM;
const SANTUARIO = { nome: 'Santuário Nacional de Aparecida', p: [-22.850521, -45.233723] };
// Caminhada planejada: data e distância. Valores do planejamento; alertas.json ("caminhada") pode mudar
// a distância quando sair o anúncio de quantos km da Via Dutra serão fechados para os romeiros.
const CFG_KEY = 'caminhada-aparecida-config';
const CAMINHADA_PADRAO = { data: '2027-11-02', km: 50, kmOrigem: 'planejamento' };
let CAMINHADA = { ...CAMINHADA_PADRAO };
try { const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); if (c && c.km > 0 && c.data) CAMINHADA = { ...CAMINHADA_PADRAO, ...c }; } catch (e) { /* sem armazenamento */ }
const KM_MAX = 60;               // os traçados cobrem os 62 km finais de cada caminho
let KM_PADRAO = Math.min(KM_MAX, CAMINHADA.km);  // km até o término
const VELOCIDADE = 4.5;          // km/h de caminhada
const FORA_DO_CAMINHO = 0.06;    // km (60 m)
const FORA_NA_DUTRA = 0.12;      // na rodovia o traçado segue o centro da pista: tolerância maior
const NO_PONTO = 0.15;            // até 150 m do ponto de saída = chegou de carro
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
  if (Math.round(km * 100) * 10 < 1000) return `${Math.max(10, Math.round(km * 100) * 10)} m`;
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

// Trilha da rota escolhida (troca ao mudar de rota)
let OF_PTS, OF_ACC, OF_TOTAL, P35, START35, rotaAtual = null;
// Cidade (por km até o fim) do ponto de saída
function cidadeEm(dados, kmFim) {
  const c = (dados.cidades || []).reduce((m, x) => (Math.abs(x[0] - kmFim) < Math.abs(m[0] - kmFim) ? x : m), [1e9, '']);
  return c[1];
}
// Ponto de saída da Via Dutra: KM_PADRAO km antes do fim, na própria rodovia
const DU_ACC = cumulative(DU.pts), DU_TOTAL = DU_ACC[DU_ACC.length - 1];
let P_DUTRA, START_DUTRA;
function kmDaDutra(al) { return Math.round((DU.kmSaida || 71) + (DU.dutra.ate - al)); }
function calcularDutra() {
  const al = DU_TOTAL - KM_PADRAO;
  P_DUTRA = round6(pointAt(DU.pts, DU_ACC, al));
  START_DUTRA = { p: P_DUTRA, title: `Via Dutra, por volta do km ${kmDaDutra(al)}`, sub: `${cidadeEm(DU, KM_PADRAO)} · ${km1(KM_PADRAO)} km até a Praça da Fé pela Via Dutra`, preset: true, dutra: true };
}
function usarRota(id, forcar) {
  if (!ROTAS[id] || !ROTAS[id].dados) id = 'luz';
  if (rotaAtual === id && !forcar) return;
  rotaAtual = id;
  RT = ROTAS[id];
  OF = RT.dados;
  FIM = { nome: RT.fim.nome, ate: RT.fim.ate, chegada: RT.fim.chegada, sub: OF.fim.sub, p: [OF.fim.lat, OF.fim.lng] };
  OF_PTS = OF.pts;
  OF_ACC = cumulative(OF_PTS);
  OF_TOTAL = OF_ACC[OF_ACC.length - 1];
  P35 = round6(pointAt(OF_PTS, OF_ACC, OF_TOTAL - KM_PADRAO));
  const via0 = roadAt(OF_TOTAL - KM_PADRAO);
  START35 = { p: P35, title: via0 === RT.nome ? RT.estrada : via0, sub: `${cidadeEm(OF, KM_PADRAO)} · ${km1(KM_PADRAO)} km até ${RT.fim.ate} pela trilha ${RT.da}`, preset: true };
  calcularDutra();
}
// ponto de saída padrão do caminho escolhido (muda com a distância da caminhada)
const startPadrao = () => (state.via === 'dutra' && state.rota === 'luz' ? START_DUTRA : START35);
usarRota('luz');

// ---------------------------------------------------------------------
// Estado (salvo só no celular)
// ---------------------------------------------------------------------
const KEY = 'caminhada-aparecida-v3';
const PARADAS = window.PARADAS || [];   // paradas da viagem de carro (paradas.js)
const PERTO_DA_PARADA = 0.4;             // km: chegando perto com o GPS ligado, marca a parada como feita
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
  share: null,     // { id, on, awake } acompanhamento ao vivo
  paradas: [],     // ids das paradas da viagem de carro já feitas
  via: 'luz',      // 'luz' (Rota da Luz oficial) ou 'dutra' (alternativa)
  rota: 'luz',     // 'luz' (Rota da Luz) ou 'fe' (Caminho da Fé)
});
let state = load();
usarRota(state.rota);
if (state.via === 'dutra' && state.rota !== 'luz') state.via = 'luz';
// distância mudou (ou caminho trocado): ponto de saída padrão acompanha. No meio de uma caminhada nada muda.
if (!state.start || (state.start.preset && !state.walking && !state.ms && !sameP(state.start.p, startPadrao().p))) { state.start = { ...startPadrao() }; state.route = null; }
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return Object.assign(blank(), JSON.parse(raw));
  } catch (e) { /* sem armazenamento */ }
  return blank();
}
function save() {
  if (MODO_ACOMP) return; // o celular de quem acompanha não grava nada
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
// artigo certo: "no Caminho da Fé", "na Rua X", "pelo Acesso Y"
const masc = (name) => /^(Caminho|Acesso|Anel|Contorno|Viaduto|Trevo|Largo|Beco|Rodoanel|Corredor|Elevado|Túnel|Parque|Calçadão)\b/i.test(name);
const via = (name) => (name ? ` ${masc(name) ? 'no' : 'na'} ${name}` : ' na estrada sem nome');
const pela = (name) => `${masc(name) ? 'pelo' : 'pela'} ${name}`;
function instruction(type, modifier, rawName, exit) {
  const name = (rawName || '').replace(/\s*;\s*/g, ' / ');
  const [vira, ic] = VIRA[modifier] || ['Siga', '⬆️'];
  switch (type) {
    case 'roundabout': case 'rotary': case 'roundabout turn':
      return { text: `Na rotatória, pegue a ${exit || 1}ª saída${name ? ` para a ${name}` : ''}`, ic: '🔄' };
    case 'fork': return { text: `Na bifurcação, ${vira.toLowerCase()}${name ? `, ${pela(name)}` : ''}`, ic };
    case 'end of road': return { text: `No fim da via, ${vira.toLowerCase()}${via(name)}`, ic };
    case 'continue': case 'new name':
      return modifier && modifier !== 'straight'
        ? { text: `${vira}${via(name)}`, ic }
        : { text: `Continue${name ? ` ${pela(name)}` : ' em frente'}`, ic: '⬆️' };
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
// Altitude aproximada (m) no km "al" do Caminho da Fé
function altitudeEm(al) {
  const a = OF.alt || [];
  if (!a.length) return '';
  const p = a.reduce((m, x) => (Math.abs(x[0] - al) < Math.abs(m[0] - al) ? x : m), a[0]);
  return (Math.round(p[1] / 10) * 10).toLocaleString('pt-BR');
}
// Nome da via em que a trilha está no km "al"
function roadAt(al) {
  let name = '';
  OF.steps.forEach((s) => { if (s.along <= al && s.name) name = s.name; });
  return name || RT.estrada;
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

// caminho escolhido: 'luz', 'dutra' (alternativa da Rota da Luz) ou 'fe'
const caminho = () => (state.rota === 'fe' ? 'fe' : state.via === 'dutra' ? 'dutra' : 'luz');
const NOME_CAMINHO = { luz: 'Rota da Luz', dutra: 'Via Dutra', fe: 'Caminho da Fé' };
const COR_CAMINHO = { luz: '#1a73e8', dutra: '#e37400', fe: '#8e24aa' };
function escolherCaminho(c) {
  if (state.walking || c === caminho()) return;
  if (c === 'fe') { trocarRota('fe'); return; }
  if (state.rota !== 'luz') trocarRota('luz');
  const eraPadrao = !state.start || state.start.preset;
  state.via = c === 'dutra' ? 'dutra' : 'luz';
  // a Via Dutra tem ponto de saída próprio, na rodovia
  if (c === 'dutra' || eraPadrao || state.start.dutra) state.start = { ...startPadrao() };
  state.route = null;
  save();
  refreshAll();
  computeRoute();
  pendingFit = true;
  if (currentTab === 'caminhada') setTimeout(() => { if (!state.route) return; pendingFit = false; fitRoute(); }, 50);
}
function refreshCaminho() {
  const seg = $('rotaSeg'), c = caminho();
  seg.classList.toggle('travado', !!(state.walking || state.ms > 0));
  seg.querySelectorAll('button').forEach((b) => {
    const on = b.dataset.r === c;
    b.classList.toggle('on', on);
    b.setAttribute('aria-checked', on ? 'true' : 'false');
  });
}
const routeKey = () => `${state.rota}:${state.via}:${state.start.p.join(',')}`;
const dutraOk = () => state.rota === 'luz';

function dutraRoute(key) {
  const acc = DU_ACC;
  const al0 = project(state.start.p, DU.pts, acc).along;
  const pts = [round6(pointAt(DU.pts, acc, al0)), ...DU.pts.filter((_, i) => acc[i] > al0 + 0.001)];
  const total = DU_TOTAL - al0;
  const first = { text: `Comece a caminhar pelo acostamento da Via Dutra (por volta do km ${kmDaDutra(al0)}), sentido Rio de Janeiro, rumo a Aparecida. Caminhe com atenção aos carros e atravesse a pista só nos pontos de travessia segura.`, ic: '🛣️', kind: 'start', name: '', p: pts[0], along: 0 };
  const avisos = DU.avisos.filter((a) => a.along > al0 + 0.05).map((a) => ({ text: a.text, ic: a.ic, kind: a.kind, name: '', p: round6(pointAt(DU.pts, acc, a.along)), along: a.along - al0, aprox: !!a.aprox }));
  const fim = DU.steps.filter((s) => s.along > al0).map((s) => ({ ...instruction(s.type, s.modifier, s.name, s.exit), kind: 'turn', name: s.name, p: [s.lat, s.lng], along: s.along - al0 }));
  const last = { text: `Chegada ${FIM.chegada}, em Aparecida`, ic: '⛪', kind: 'end', name: '', p: FIM.p, along: total };
  const steps = mergeClose([first, ...avisos, ...fim, last].sort((a, b) => a.along - b.along));
  return { key, pts, steps, dist: total, approach: 0, dutra: { de: Math.max(0, DU.dutra.de - al0), ate: DU.dutra.ate - al0 } };
}

async function computeRoute() {
  if (!state.start || routing) return;
  if (state.via === 'dutra' && !dutraOk()) state.via = 'luz';
  const key = routeKey();
  if (state.route && state.route.key === key) return;
  if (state.via === 'dutra') {
    state.route = dutraRoute(key);
    routeError = false;
    save();
    refreshAll();
    return;
  }
  const sp = state.start.p;
  const pr = project(sp, OF_PTS, OF_ACC);
  // ponto de saída na própria trilha oficial
  if (pr.d <= NA_TRILHA) {
    const o = officialFrom(pr.along, 0);
    const first = { text: `Comece a caminhar ${pela(roadAt(pr.along))}`, ic: '🚶', kind: 'start', name: '', p: sp, along: 0 };
    const last = { text: `Chegada ${FIM.chegada}, término ${RT.da}`, ic: '⛪', kind: 'end', name: '', p: FIM.p, along: o.len };
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
    const first = { text: `Comece a caminhar${first0 && first0.name ? ` ${pela(first0.name)}` : ''} em direção à trilha ${RT.da}`, ic: '🚶', kind: 'start', name: '', p: sp, along: 0 };
    const joinStep = { text: `Entre na trilha ${RT.da}, ${pela(roadAt(pr.along))}`, ic: '🟦', kind: 'join', name: '', p: join, along: alen };
    const o = officialFrom(pr.along, alen);
    const last = { text: `Chegada ${FIM.chegada}, término ${RT.da}`, ic: '⛪', kind: 'end', name: '', p: FIM.p, along: alen + o.len };
    if (state.start && routeKey() === key) {
      state.route = { key, pts: [...apts, ...o.pts], steps: mergeClose([first, ...asteps, joinStep, ...o.steps, last]), dist: alen + o.len, approach: alen };
      save();
    }
    routeError = false;
  } catch (e) {
    routeError = true;
  } finally {
    routing = false;
    refreshAll();
    if (!routeError && state.start && (!state.route || state.route.key !== routeKey())) computeRoute();
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
  state.start = { p: rp, title: lbl.title, sub: lbl.sub, preset: !!(label && label.preset), dutra: !!(label && label.dutra) };
  if (!state.start.dutra && state.via === 'dutra') state.via = 'luz'; // ponto próprio: segue pela trilha
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

// Troca entre Rota da Luz e Caminho da Fé
function trocarRota(id) {
  if (id === state.rota || !ROTAS[id] || !ROTAS[id].dados) return;
  const eraPadrao = !state.start || state.start.preset;
  state.rota = id;
  usarRota(id);
  if (id !== 'luz') state.via = 'luz';
  if (eraPadrao) state.start = { ...startPadrao() };
  state.route = null;
  routeError = false;
  save();
  refreshAll();
  computeRoute();
  pendingFit = true;
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
  enviarPosicao();
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
  enviarPosicao(true);
  manterTela();
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
  // antes de começar a pé, longe do ponto de saída: a orientação é ir até ele (etapa 1, de carro)
  const antesDeComecar = !state.walking && state.ms === 0;
  if ((antesDeComecar && dist(me, state.start.p) > NO_PONTO) || (pr.along < 0.05 && dist(me, state.start.p) > 0.08)) {
    return { kind: 'tostart', total, along: 0, rest: total, toStart: dist(me, state.start.p) };
  }
  const idx = r.steps.findIndex((s, i) => i > 0 && s.along > pr.along + 0.015);
  const next = idx >= 0 ? r.steps[idx] : null;
  const naDutra = r.dutra && pr.along >= r.dutra.de - 0.05 && pr.along <= r.dutra.ate + 0.05;
  return {
    kind: pr.d > (naDutra ? FORA_NA_DUTRA : FORA_DO_CAMINHO) ? 'off' : 'on',
    total, along: pr.along, rest, off: pr.d,
    next, nextIdx: idx, toNext: next ? next.along - pr.along : rest,
  };
}

function refreshTela() {
  const tools = document.querySelector('.map-tools');
  if (!document.body.classList.contains('tela-cheia')) { tools.style.bottom = ''; return; }
  $('telaInfo').innerHTML = '<b></b><br><span></span>';
  $('telaInfo').querySelector('b').textContent = $('navDist').textContent;
  $('telaInfo').querySelector('span').textContent = $('navInstr').textContent;
  // botões sempre acima da barrinha, qualquer que seja a altura dela
  tools.style.bottom = `${$('telaInfo').offsetHeight + 28}px`;
}
function telaCheia(on) {
  document.body.classList.toggle('tela-cheia', on);
  $('btnSairTela').hidden = !on;
  $('telaInfo').hidden = !on;
  if (on) document.documentElement.style.setProperty('--sheet-h', '0px');
  refreshTela();
  setTimeout(() => {
    if (!on) fitSheet();
    if (map) { map.resize(); if (on && !state.walking && !MODO_ACOMP) fitRoute(); }
  }, 30);
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
      t.textContent = `Montando o caminho até a trilha ${RT.da}.`;
      break;
    case 'offline':
      icon.textContent = '📶'; d.textContent = 'Sem internet';
      t.textContent = 'O caminho até a trilha será calculado assim que houver conexão.';
      break;
    case 'nogps':
      icon.textContent = '🚶'; d.textContent = `${fmtDist(n.total)} até ${FIM.ate}`;
      t.textContent = NOME_CAMINHO[caminho()];
      break;
    case 'tostart':
      icon.textContent = state.walking ? '📍' : '🚗'; d.textContent = `${fmtDist(n.toStart)} até a saída`;
      t.textContent = state.walking ? `Vá até o ponto de saída: ${state.start.title}.` : `Etapa 1: siga de carro até o ponto de saída (${state.start.title}). Use os botões Google Maps ou Waze abaixo.`;
      break;
    case 'arrived':
      icon.textContent = '⛪'; d.textContent = 'Você chegou!';
      t.textContent = state.rota === 'luz' && dist(FIM.p, SANTUARIO.p) > 0.15
        ? `${FIM.nome}, término ${RT.da}. O Santuário Nacional fica a ${fmtDist(dist(FIM.p, SANTUARIO.p))}. 🙏`
        : `${FIM.nome}, término ${RT.da}. 🙏`;
      break;
    default:
      if (n.next) {
        icon.textContent = n.next.ic; d.textContent = `Em ${fmtDist(n.toNext)}`;
        t.textContent = n.next.text;
      } else {
        icon.textContent = '⬆️'; d.textContent = fmtDist(n.rest);
        t.textContent = `Siga em frente até ${FIM.ate}.`;
      }
      if (n.kind === 'off') {
        alertEl.hidden = false;
        alertEl.textContent = `⚠️ Você saiu do caminho. Volte cerca de ${fmtDist(n.off)} até a linha ${({ luz: 'azul', dutra: 'laranja', fe: 'roxa' })[caminho()]}.`;
        if (!offRouteWarned && navigator.vibrate) navigator.vibrate([300, 150, 300]);
        offRouteWarned = true;
      } else {
        offRouteWarned = false;
      }
  }
}

function refreshStats(n) {
  setTimeout(refreshTela, 0);
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
  else b.textContent = state.ms > 0 ? 'Continuar caminhada' : `Iniciar os ${fmtDist(state.route.dist)} a pé`;
  refreshEtapas();
}

// Antes de começar: etapa 1 (de carro até o ponto de saída) e etapa 2 (a pé)
function refreshEtapas() {
  const mostrar = !!(state.start && state.route && !state.walking && state.ms === 0);
  const box = $('etapas');
  if (box.hidden === mostrar) {
    box.hidden = !mostrar;
    $('dash').classList.toggle('pre', mostrar);
    setTimeout(fitSheet, 0);
  }
  if (!mostrar) return;
  const [la, ln] = state.start.p;
  const faltam = paradasQueFaltam();
  const wp = faltam.length ? `&waypoints=${encodeURIComponent(faltam.map((x) => x.p.join(',')).join('|'))}` : '';
  $('et1gm').href = `https://www.google.com/maps/dir/?api=1&destination=${la},${ln}&travelmode=driving${wp}`;
  $('et1gm').textContent = faltam.length ? `🚗 Google Maps (${faltam.length} parada${faltam.length > 1 ? 's' : ''})` : '🚗 Google Maps';
  $('et1wz').href = `https://waze.com/ul?ll=${la},${ln}&navigate=yes`;
  const d = me ? dist(me, state.start.p) : null;
  const chegou = d != null && d <= NO_PONTO;
  $('etapa1').className = `etapa ${chegou ? 'feita' : 'atual'}`;
  $('etapa2').className = `etapa ${chegou ? 'atual' : ''}`;
  $('et1num').textContent = chegou ? '✓' : '1';
  $('et1links').hidden = chegou;
  $('paradasBox').hidden = chegou || !PARADAS.length;
  if (!chegou) refreshParadas();
  $('et1sub').textContent = chegou
    ? `Você está no ponto de saída: ${state.start.title}`
    : `${state.start.title}${state.start.preset && !state.start.title.includes(saidaResumo()) ? `, ${saidaResumo()}` : ''}${d != null ? ` · você está a ${fmtDist(d)} daqui, em linha reta` : ''}`;
  $('et2tit').textContent = `A pé até ${FIM.ate}`;
  $('et2sub').textContent = `${fmtDist(state.route.dist)} · cerca de ${fmtDur(state.route.dist / VELOCIDADE)} andando${chegou ? ' · pode começar!' : ''}`;
}

// Paradas da viagem de carro (paradas.js)
let parHtml = '';
function paradasQueFaltam() { return PARADAS.filter((x) => !(state.paradas || []).includes(x.id)); }
function marcarParada(id, feita) {
  const set = new Set(state.paradas || []);
  if (feita) set.add(id); else set.delete(id);
  state.paradas = PARADAS.map((x) => x.id).filter((i) => set.has(i));
  save(); refreshEtapas();
}
function refreshParadas() {
  if (!PARADAS.length) return;
  const perto = me ? paradasQueFaltam().filter((x) => dist(me, x.p) <= PERTO_DA_PARADA) : [];
  if (perto.length) { const set = new Set([...(state.paradas || []), ...perto.map((x) => x.id)]); state.paradas = PARADAS.map((x) => x.id).filter((i) => set.has(i)); save(); }
  const feitas = state.paradas || [];
  const prox = paradasQueFaltam()[0];
  $('parCount').textContent = `${feitas.length} de ${PARADAS.length} feitas`;
  const html = PARADAS.map((x, i) => {
    const ok = feitas.includes(x.id), atual = prox && prox.id === x.id;
    const d = me ? ` · a ${fmtDist(dist(me, x.p))} em linha reta` : '';
    const gm = `https://www.google.com/maps/dir/?api=1&destination=${x.p.join(',')}&travelmode=driving`;
    const wz = `https://waze.com/ul?ll=${x.p.join(',')}&navigate=yes`;
    const ver = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(x.q)}`;
    return `<li class="par ${ok ? 'feita' : ''} ${atual ? 'atual' : ''}" data-id="${x.id}">
      <span class="num">${ok ? '✓' : i + 1}</span>
      <div class="par-txt"><b>${escapeHtml(x.nome)}</b>
        <small>${escapeHtml(x.onde)} · ${escapeHtml(x.horas)}${atual ? d : ''}</small>
        <small>Para: ${escapeHtml(x.para)}. ${escapeHtml(x.obs || '')}</small>
        ${ok ? '' : `<div class="par-bts"><a class="btn" href="${gm}" target="_blank" rel="noopener">Ir (Google)</a><a class="btn" href="${wz}" target="_blank" rel="noopener">Ir (Waze)</a><a class="btn" href="${ver}" target="_blank" rel="noopener">Ver local</a></div>`}
        <label class="par-ok"><input type="checkbox" ${ok ? 'checked' : ''}> ${ok ? 'Parada feita' : 'Marcar como feita'}</label>
      </div></li>`;
  }).join('');
  if (html !== parHtml) { parHtml = html; $('parList').innerHTML = html; }
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
  else if (state.via === 'dutra') info = `Pela Via Dutra até ${FIM.ate}. Traçado pelas vias do mapa (OpenStreetMap), com as orientações do Caminho Consciente. A posição dos km da rodovia é aproximada.`;
  else if (r.approach > 0) info = `${RT.fonte}, até ${FIM.ate}. Do seu ponto de saída até a trilha são ${fmtDist(r.approach)} pelas ruas.`;
  else info = `${RT.fonte}, do ponto de saída até ${FIM.ate}, em Aparecida.`;
  if (state.rota === 'fe' && s) info += ` Descida da Serra da Mantiqueira: de cerca de ${altitudeEm(project(s.p, OF_PTS, OF_ACC).along)} m para ${OF.altFim} m de altitude, boa parte em estrada de terra.`;
  $('trackInfo').textContent = info;

  // escolha do caminho
  const pr0 = s ? project(s.p, OF_PTS, OF_ACC) : null;
  $('viaLuzKm').textContent = state.via === 'luz' && r ? fmtDist(r.dist) : (pr0 ? `${pr0.d > NA_TRILHA ? '≈ ' : ''}${fmtDist(OF_TOTAL - pr0.along + pr0.d)}` : '--');
  $('viaDutraKm').textContent = state.via === 'dutra' && r ? fmtDist(r.dist) : fmtDist(KM_PADRAO);
  $('viaLuz').classList.toggle('on', state.via === 'luz');
  $('viaDutra').classList.toggle('on', state.via === 'dutra');
  $('viaDutra').disabled = !dutraOk();
  // situação da terceira faixa da Dutra, direto dos alertas
  const faixa = alertas && alertas.alertas.find((x) => x.rota === 'dutra' && /faixa/i.test(x.titulo));
  const stF = $('viaDutraSt');
  stF.textContent = faixa ? `${faixa.nivel === 'atencao' || faixa.nivel === 'urgente' ? '⚠️' : '✅'} ${faixa.titulo}` : '';
  stF.className = `via-st ${faixa && !(faixa.nivel === 'atencao' || faixa.nivel === 'urgente') ? 'ok' : ''}`;
  $('viaNote').textContent = state.via === 'dutra'
    ? `Você escolheu a Via Dutra: ${km1(KM_PADRAO)} km pela rodovia, saindo por volta do km ${kmDaDutra(DU_TOTAL - KM_PADRAO)}. Veja nos alertas se a faixa para romeiros foi confirmada.`
    : `Se a Rota da Luz estiver bloqueada no dia, troque aqui para a Via Dutra. O ponto de saída muda para a própria rodovia (${km1(KM_PADRAO)} km antes de Aparecida).`;
  $('poisCard').hidden = state.via === 'dutra' || !OF.pois.length;
  $('viaCard').hidden = state.rota !== 'luz';
  $('rotaLuz').classList.toggle('on', state.rota === 'luz');
  $('rotaFe').classList.toggle('on', state.rota === 'fe');
  $('btnStart35').textContent = state.via === 'dutra' && state.rota === 'luz' ? `Usar o ponto dos ${km1(KM_PADRAO)} km da Via Dutra` : `Usar o ponto dos ${km1(KM_PADRAO)} km ${RT.da}`;
  document.querySelectorAll('.km-cam').forEach((e) => { e.textContent = `${km1(KM_PADRAO)} km`; });
  $('trajSub').textContent = `${RT.nome} · trecho final até ${FIM.ate}, em Aparecida`;

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
        : `${st.aprox ? 'aprox. ' : ''}km ${km1(st.along)} · depois siga ${fmtDist(st.len)}`;
      li.addEventListener('click', () => focusOn(st.p));
      ol.append(li);
    });
  }
  // pontos da Associação ao longo do trajeto (só na Rota da Luz)
  const ul = $('pois');
  ul.innerHTML = '';
  if (state.via === 'dutra') return;
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
  if (map) setTimeout(() => mapView(p, 17), 60);
}

// ---------------------------------------------------------------------
// Alertas (arquivo alertas.json, atualizável sem mudar o app)
// ---------------------------------------------------------------------
const ALERT_KEY = 'caminhada-aparecida-alertas';
let alertas = null;
try { alertas = JSON.parse(localStorage.getItem(ALERT_KEY) || 'null'); } catch (e) { alertas = null; }
// assinatura do conteúdo: muda quando um alerta é incluído, removido ou alterado
const assinatura = (a) => (a ? JSON.stringify(a.alertas.map((x) => [x.id, x.nivel, x.titulo, x.texto])) : '');
let alertaNovo = null;   // aviso de atualização mostrado no mapa
async function loadAlertas() {
  try {
    const r = await fetch(`alertas.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    const novo = await r.json();
    const antes = assinatura(alertas);
    if (alertas && antes !== assinatura(novo)) avisarMudanca(alertas, novo);
    alertas = novo;
    try { localStorage.setItem(ALERT_KEY, JSON.stringify(alertas)); } catch (e) { /* ignora */ }
    aplicarCaminhada(novo.caminhada);
  } catch (e) { /* sem internet: usa a última cópia */ }
  if (MODO_ACOMP) refreshAlertas(); else refreshAll();
}
// Data e distância da caminhada vindas de alertas.json. Quando sair o anúncio de quantos km da Via Dutra
// serão fechados para os romeiros, a distância muda aqui e o app recalcula o ponto de saída.
let kmMudou = null;
function aplicarCaminhada(c) {
  if (!c || !c.data || !(c.km > 0)) return;
  const antes = KM_PADRAO;
  CAMINHADA = { ...CAMINHADA_PADRAO, ...c };
  if (!MODO_ACOMP) { try { localStorage.setItem(CFG_KEY, JSON.stringify(CAMINHADA)); } catch (e) { /* ignora */ } }
  refreshCapa();
  const novoKm = Math.min(KM_MAX, CAMINHADA.km);
  if (novoKm === antes) return;
  if (!MODO_ACOMP && (state.walking || state.ms > 0)) return; // não muda o trajeto no meio da caminhada
  KM_PADRAO = novoKm;
  usarRota(state.rota, true);
  if (MODO_ACOMP) return;
  if (!state.start || state.start.preset) { state.start = { ...startPadrao() }; state.route = null; }
  kmMudou = { de: antes, para: novoKm };
  save();
  computeRoute();
  pendingFit = true;
  setTimeout(() => { if (map && state.route && currentTab === 'caminhada') { pendingFit = false; fitRoute(); } }, 80);
  const txt = `A caminhada agora tem ${km1(novoKm)} km (antes ${km1(antes)} km).${CAMINHADA.kmMotivo ? ` ${CAMINHADA.kmMotivo}` : ''}`;
  if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
  if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification('Caminhada atualizada', { body: txt, tag: 'caminhada-km', icon: 'icon.svg', badge: 'icon.svg' })).catch(() => {});
  }
}

// ----------------------------- contagem regressiva -----------------------------
function diasParaCaminhada() {
  const [y, m, d] = CAMINHADA.data.split('-').map(Number);
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d) - hoje) / 86400000);
}
function dataPorExtenso() {
  const [y, m, d] = CAMINHADA.data.split('-').map(Number);
  const t = new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}${m === 11 && d === 2 ? ' · Dia de Finados' : ''}`;
}
function saidaResumo() {
  if (!state.start) return '--';
  if (!state.start.preset) return state.start.title || 'Ponto escolhido';
  return cidadeEm(state.via === 'dutra' && state.rota === 'luz' ? DU : OF, KM_PADRAO) || state.start.title;
}
function refreshCapa() {
  if (!$('capa')) return;
  const n = diasParaCaminhada();
  const num = $('capaNum'), pre = $('capaPre'), dias = $('capaDias');
  if (n > 1) { pre.textContent = 'Faltam'; num.textContent = n.toLocaleString('pt-BR'); dias.textContent = 'dias para a sua peregrinação'; }
  else if (n === 1) { pre.textContent = 'Falta'; num.textContent = '1'; dias.textContent = 'dia para a sua peregrinação. É amanhã!'; }
  else if (n === 0) { pre.textContent = ''; num.textContent = 'Hoje'; dias.textContent = 'é o dia da sua peregrinação. Bom caminho! 🙏'; }
  else { pre.textContent = ''; num.textContent = '✓'; dias.textContent = 'Peregrinação realizada. Graças a Deus!'; }
  $('capaData').textContent = dataPorExtenso();
  $('capaKm').textContent = `${km1(KM_PADRAO)} km`;
  $('capaCam').textContent = NOME_CAMINHO[caminho()].replace(' (alternativa)', '');
  $('capaSaida').textContent = saidaResumo();
  const conf = CAMINHADA.kmOrigem === 'confirmado';
  $('capaSt').textContent = conf
    ? `Distância confirmada: ${km1(KM_PADRAO)} km.${CAMINHADA.kmMotivo ? ` ${CAMINHADA.kmMotivo}` : ''}`
    : `Distância do planejamento (${km1(KM_PADRAO)} km). Quando anunciarem quantos km da Via Dutra serão fechados para os romeiros, a caminhada é atualizada aqui.`;
  $('capaSt').className = `capa-st ${conf ? 'ok' : ''}`;
  const c = $('contagem');
  c.hidden = n < 0;
  $('contTxt').textContent = n > 1 ? `Faltam ${n.toLocaleString('pt-BR')} dias para a sua peregrinação` : n === 1 ? 'Falta 1 dia: é amanhã!' : n === 0 ? 'Hoje é o dia da sua peregrinação!' : '';
  $('contSub').textContent = `${CAMINHADA.data.split('-').reverse().join('/')} · ${km1(KM_PADRAO)} km · ${NOME_CAMINHO[caminho()].replace(' (alternativa)', '')}${conf ? '' : ' · distância do planejamento'}`;
}
let capaEscondidaEm = 0;
function mostrarCapa(on) {
  const capa = $('capa');
  if (!capa) return;
  if (on && (window.__semCapa || MODO_ACOMP || state.walking)) return;
  if (on) refreshCapa();
  capa.hidden = !on;
  if (!on) capaEscondidaEm = Date.now();
}

// Avisa o caminhante: aviso na tela, vibração e notificação do celular (se permitida)
function avisarMudanca(velho, novo) {
  const ids = new Set(velho.alertas.map((x) => `${x.id}|${x.nivel}|${x.texto}`));
  const mudou = novo.alertas.filter((x) => !ids.has(`${x.id}|${x.nivel}|${x.texto}`) && (x.rota === alertaRota() || x.rota === 'todas'));
  const lista = mudou.length ? mudou : novo.alertas.filter((x) => !ids.has(`${x.id}|${x.nivel}|${x.texto}`));
  const top = lista.sort((a, b) => (NIVEL_ORDEM[a.nivel] ?? 9) - (NIVEL_ORDEM[b.nivel] ?? 9))[0];
  if (!top) return;
  alertaNovo = top;
  if (navigator.vibrate) navigator.vibrate([400, 200, 400, 200, 400]);
  if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
    navigator.serviceWorker.ready.then((reg) => reg.showNotification(`Alerta: ${top.titulo}`, {
      body: top.texto, tag: 'alerta-caminhada', renotify: true, icon: 'icon.svg', badge: 'icon.svg',
    })).catch(() => {});
  }
}
const fmtData = (iso) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '';
const fmtQuando = (a) => a.atualizado
  ? `Atualizado em ${fmtData(a.atualizado)} às ${a.atualizado.slice(11, 16)}`
  : `Verificado em ${fmtData(a.verificado)}`;
const NIVEL_ORDEM = { urgente: 0, atencao: 1, ok: 2, info: 3 };
const NIVEL = { urgente: ['bad', 'urgente'], ok: ['ok', 'sem bloqueio'], atencao: ['warn', 'atenção'], info: ['info', 'informação'] };
const ROTA_NOME = { luz: 'Rota da Luz', dutra: 'Via Dutra', fe: 'Caminho da Fé', todas: 'Todas as rotas' };
const alertaRota = () => (state.rota === 'fe' ? 'fe' : state.via);
function alertCard(a) {
  const div = document.createElement('div');
  div.className = `card alerta ${a.nivel}`;
  const [cls, lbl] = NIVEL[a.nivel] || NIVEL.info;
  div.innerHTML = `<div class="meta"><span class="tag ${cls}"></span> · <span class="rota"></span></div><h3></h3><p></p><div class="fontes">Fontes: </div>`;
  div.querySelector('.tag').textContent = lbl;
  div.querySelector('.rota').textContent = ROTA_NOME[a.rota] || a.rota;
  div.querySelector('h3').textContent = a.titulo;
  div.querySelector('p').textContent = a.texto;
  const f = div.querySelector('.fontes');
  (a.fontes || []).forEach((x, i) => {
    if (i) f.append(' · ');
    const link = document.createElement('a');
    link.href = x.url; link.target = '_blank'; link.rel = 'noopener'; link.textContent = x.nome;
    f.append(link);
  });
  return div;
}
function refreshAlertas() {
  const list = $('alertasList');
  list.innerHTML = '';
  if (!alertas) {
    list.innerHTML = '<div class="card"><p class="note">Sem conexão para carregar os alertas. Conecte-se à internet e toque em "Atualizar alertas".</p></div>';
    $('alertBadge').hidden = true; $('alertChip').hidden = true;
    return;
  }
  $('alertasSub').textContent = `${fmtQuando(alertas)} · para a caminhada de ${alertas.para}`;
  const rel = (a) => a.rota === alertaRota() || a.rota === 'todas';
  const ordem = NIVEL_ORDEM;
  const meus = alertas.alertas.filter(rel).sort((a, b) => ordem[a.nivel] - ordem[b.nivel]);
  const outros = alertas.alertas.filter((a) => !rel(a));
  const h = document.createElement('div');
  h.className = 'card-label';
  h.textContent = `Para o caminho escolhido: ${ROTA_NOME[alertaRota()]}`;
  list.append(h);
  meus.forEach((a) => list.append(alertCard(a)));
  if (outros.length) {
    const h2 = document.createElement('div');
    h2.className = 'card-label';
    h2.style.marginTop = '20px';
    h2.textContent = 'Sobre as outras opções';
    list.append(h2);
    outros.forEach((a) => list.append(alertCard(a)));
  }
  const n = meus.filter((a) => a.nivel === 'atencao' || a.nivel === 'urgente').length;
  const urg = meus.find((a) => a.nivel === 'urgente');
  $('alertBadge').hidden = !n;
  $('alertBadge').textContent = n;
  const chip = $('alertChip');
  const ok = meus.find((a) => a.nivel === 'ok');
  if (kmMudou) { chip.hidden = false; chip.textContent = `📏 Caminhada atualizada: agora são ${km1(kmMudou.para)} km (antes ${km1(kmMudou.de)} km) · ver`; chip.className = 'alert-chip'; }
  else if (alertaNovo) { chip.hidden = false; chip.textContent = `🔔 Alerta atualizado: ${alertaNovo.titulo} · ver`; chip.className = `alert-chip ${alertaNovo.nivel === 'urgente' ? 'bad' : ''}`; }
  else if (urg) { chip.hidden = false; chip.textContent = `⛔ ${urg.titulo} · ver`; chip.className = 'alert-chip bad'; }
  else if (n) { chip.hidden = false; chip.textContent = `⚠️ ${n} ${n > 1 ? 'alertas' : 'alerta'} para este caminho · ver`; chip.className = 'alert-chip'; }
  else if (ok) { chip.hidden = false; chip.textContent = `✅ ${ok.titulo} · ver`; chip.className = 'alert-chip okc'; }
  else chip.hidden = true;
}

function refreshNotif(perm) {
  const p = perm || ('Notification' in window ? Notification.permission : 'unsupported');
  const b = $('btnNotif'), t = $('notifInfo');
  if (p === 'granted') { b.hidden = true; t.textContent = '✅ Notificações ativadas. Com o app aberto, ele confere os alertas a cada 5 minutos e avisa quando algo mudar.'; }
  else if (p === 'denied') { b.hidden = true; t.textContent = 'Notificações bloqueadas no navegador. Os avisos ainda aparecem na tela e o celular vibra. Para liberar: configurações do site no navegador → Notificações.'; }
  else if (p === 'unsupported') { b.hidden = true; t.textContent = 'Este navegador não permite notificações. Os avisos aparecem na tela e o celular vibra.'; }
  else { b.hidden = false; t.textContent = 'Com o app aberto, ele confere os alertas a cada 5 minutos. Ative as notificações para ser avisado também quando estiver em outra tela.'; }
}

// ---------------------------------------------------------------------
// Acompanhamento ao vivo
// O caminhante publica a posição num endereço secreto do ntfy.sh;
// quem tem o link (#acompanhar=<código>) recebe e vê no mapa.
// ---------------------------------------------------------------------
const RELAY = 'https://ntfy.sh';
// O ntfy.sh gratuito aceita 250 mensagens por dia por conexão. Para caber ~8 h de caminhada:
const ENVIO_DIST = 0.25;          // envia a cada 250 m andados…
const ENVIO_MAX_MS = 3 * 60000;   // …ou a cada 3 min, se parado
const ENVIO_MIN_MS = 30000;       // nunca menos de 30 s entre envios (salvo momentos importantes)
const LIMITE_DIA = 250, RESERVA = 15, ECONOMIA = 200; // perto do limite, envia menos e guarda para a chegada
const SEM_SINAL_MS = 8 * 60000;   // acompanhante: aviso após 8 min sem atualização
const MODO_ACOMP = (location.hash.match(/^#acompanhar=([a-z0-9]{16,64})$/) || [])[1] || null;

function novoCodigo() {
  const b = new Uint8Array(15);
  crypto.getRandomValues(b);
  return 'cam' + [...b].map((x) => x.toString(36).padStart(2, '0')).join('').slice(0, 26);
}
const shareLink = () => `${location.origin}${location.pathname}#acompanhar=${state.share.id}`;

let ultimoEnvio = { t: 0, p: null, ok: null }, bateria = null, wakeLock = null;
if (navigator.getBattery) navigator.getBattery().then((b) => { bateria = b; }).catch(() => {});

const hojeStr = () => new Date().toISOString().slice(0, 10);
function contarEnvio() {
  const sh = state.share;
  if (sh.dia !== hojeStr()) { sh.dia = hojeStr(); sh.n = 0; }
  sh.n = (sh.n || 0) + 1;
  save();
}
const enviosHoje = () => (state.share && state.share.dia === hojeStr() ? state.share.n || 0 : 0);

// forcar = momento importante (criar link, iniciar, pausar, chegar, nova tentativa)
async function enviarPosicao(forcar) {
  const sh = state.share;
  if (!sh || !sh.on || !me || MODO_ACOMP) return;
  const agora = Date.now();
  const desde = agora - ultimoEnvio.t;
  const andou = ultimoEnvio.p ? dist(ultimoEnvio.p, me) : Infinity;
  const usados = enviosHoje();
  const n = navInfo();
  const chegou = n.kind === 'arrived';
  if (usados >= LIMITE_DIA - 1) return;                                // acabou a cota do dia
  if (usados >= LIMITE_DIA - RESERVA && !chegou) return;              // guarda as últimas para a chegada
  if (!forcar && !(chegou && !ultimoEnvio.chegou)) {
    const maxMs = usados >= ECONOMIA ? 10 * 60000 : ENVIO_MAX_MS;
    if (desde < ENVIO_MIN_MS) {
      // já andou o suficiente: agenda o envio para quando completar os 30 s
      if (andou >= ENVIO_DIST && !agendado) agendado = setTimeout(() => { agendado = null; enviarPosicao(); }, ENVIO_MIN_MS - desde + 300);
      return;
    }
    if (andou < ENVIO_DIST && desde < maxMs) return;
  }
  const msg = {
    lat: +me[0].toFixed(6), lng: +me[1].toFixed(6), acc: Math.round(meAcc || 0), t: agora,
    al: n.along != null ? +n.along.toFixed(3) : null, r: n.rest != null ? +n.rest.toFixed(3) : null,
    tot: n.total != null ? +n.total.toFixed(3) : null, k: n.kind,
    km: +state.km.toFixed(3), w: !!state.walking, v: state.via, ro: state.rota,
    s: state.start ? state.start.p : null, st: state.start ? state.start.title : '',
    b: bateria ? Math.round(bateria.level * 100) : null,
  };
  ultimoEnvio = { t: agora, p: me, ok: ultimoEnvio.ok, chegou: ultimoEnvio.chegou };
  let status = 0;
  try {
    const r = await fetch(`${RELAY}/${sh.id}`, { method: 'POST', body: JSON.stringify(msg) });
    status = r.status;
    ultimoEnvio.ok = r.ok ? agora : false;
    if (r.ok) { contarEnvio(); if (chegou) ultimoEnvio.chegou = true; }
  } catch (e) {
    ultimoEnvio.ok = false;
  }
  // falhou: sem sinal → tenta de novo em 10 s; serviço no limite (429) → espera 1 min
  if (ultimoEnvio.ok === false && !retentativa) {
    retentativa = setTimeout(() => { retentativa = null; enviarPosicao(true); }, status === 429 ? 60000 : 10000);
  }
  refreshShare();
}
let retentativa = null, agendado = null;

async function manterTela() {
  const querer = state.walking && state.share && state.share.on && state.share.awake !== false;
  try {
    if (querer && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!querer && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { wakeLock = null; }
}

function refreshShare() {
  if (MODO_ACOMP) return;
  const sh = state.share, on = !!(sh && sh.on);
  $('shareOff').hidden = on;
  $('shareOnBox').hidden = !on;
  const pill = $('sharePill');
  pill.classList.toggle('on', on);
  if (!on) { pill.textContent = '👥 Compartilhar minha caminhada'; return; }
  $('chkAwake').checked = sh.awake !== false;
  let st;
  if (!me) st = '🟡 Link criado. A posição começa a ser enviada quando o GPS ligar (toque em "Iniciar caminhada").';
  else if (ultimoEnvio.ok === false) st = '🔴 Sem internet no momento: a posição será enviada quando o sinal voltar.';
  else if (ultimoEnvio.ok) st = `🟢 Enviando sua posição ao vivo · último envio às ${new Date(ultimoEnvio.ok).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · a cada 250 m ou 3 min · ${enviosHoje()} de ${LIMITE_DIA} envios do dia`;
  else st = '🟡 Preparando o envio da posição…';
  $('shareStatus').textContent = st;
  pill.textContent = ultimoEnvio.ok && ultimoEnvio.ok !== false ? '🟢 Compartilhando ao vivo' : '🟡 Compartilhamento ligado';
}

function ligarCompartilhamento() {
  state.share = { id: novoCodigo(), on: true, awake: true, dia: hojeStr(), n: (state.share && state.share.dia === hojeStr() ? state.share.n : 0) };
  save();
  startGps();
  refreshShare();
  enviarPosicao(true);
}
function desligarCompartilhamento() {
  if (!state.share) return;
  const id = state.share.id;
  fetch(`${RELAY}/${id}`, { method: 'POST', body: JSON.stringify({ fim: true, t: Date.now() }) }).catch(() => {});
  state.share = null;
  save();
  manterTela();
  refreshShare();
}
function enviarLink() {
  const texto = `Acompanhe minha caminhada até Aparecida ao vivo: ${shareLink()}`;
  if (navigator.share) navigator.share({ title: 'Caminhada a Aparecida', text: texto }).catch(() => {});
  else window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank');
}

// ----------------------------- modo acompanhante -----------------------------
let acomp = { pos: null, trilha: [], ids: new Set(), ultimo: 0, fim: false, rotaKey: null };
let walkerMarker = null, followWalker = true;

function receberMsg(ev) {
  if (!ev || ev.event !== 'message' || acomp.ids.has(ev.id)) return;
  acomp.ids.add(ev.id);
  let m;
  try { m = JSON.parse(ev.message); } catch (e) { return; }
  if (m.fim) { acomp.fim = true; renderAcomp(); return; }
  if (typeof m.lat !== 'number') return;
  acomp.fim = false;
  if (!acomp.pos || m.t >= acomp.pos.t) acomp.pos = m;
  acomp.trilha.push([m.lat, m.lng, m.t]);
  acomp.trilha.sort((a, b) => a[2] - b[2]);
  // desenha o mesmo trajeto que o caminhante escolheu
  if (m.s) {
    const key = `${m.ro || 'luz'}:${m.v}:${m.s.join(',')}`;
    if (key !== acomp.rotaKey) {
      acomp.rotaKey = key;
      state.rota = m.ro === 'fe' ? 'fe' : 'luz';
      usarRota(state.rota);
      state.start = { p: m.s, title: m.st || 'Ponto de saída', sub: '' };
      state.via = m.v === 'dutra' ? 'dutra' : 'luz';
      state.route = null;
      computeRoute();
    }
  }
  renderAcomp();
}

function renderAcomp() {
  const p = acomp.pos;
  const info = $('acompInfo');
  if (!p) {
    $('navIcon').textContent = '👥';
    $('navDist').textContent = 'Aguardando a primeira posição';
    $('navInstr').textContent = acomp.fim ? 'O compartilhamento foi encerrado.' : 'Assim que o celular do caminhante enviar a posição, ela aparece aqui.';
    info.textContent = '';
    return;
  }
  const idade = Date.now() - p.t;
  const hora = new Date(p.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (acomp.fim) {
    $('navIcon').textContent = '⏹️'; $('navDist').textContent = 'Compartilhamento encerrado';
    $('navInstr').textContent = `Última posição recebida às ${hora}.`;
  } else if (p.k === 'arrived' || (p.r != null && p.r < 0.05)) {
    $('navIcon').textContent = '⛪'; $('navDist').textContent = `Chegou ${FIM.chegada}!`;
    $('navInstr').textContent = `Chegada registrada às ${hora}. 🙏`;
  } else if (p.k === 'tostart' || p.k === 'nogps' || !p.w) {
    $('navIcon').textContent = '📍'; $('navDist').textContent = p.w ? 'Indo para o ponto de saída' : 'Caminhada ainda não iniciada';
    $('navInstr').textContent = `Posição recebida às ${hora}. Faltam ${p.r != null ? fmtDist(p.r) : '--'} até ${FIM.ate}.`;
  } else {
    $('navIcon').textContent = '🚶'; $('navDist').textContent = `Faltam ${p.r != null ? fmtDist(p.r) : '--'}`;
    $('navInstr').textContent = p.k === 'off' ? 'Está um pouco fora da linha do trajeto.' : `Caminhando · ${NOME_CAMINHO[caminho()]}`;
  }
  // painel de baixo
  $('sFalta').textContent = p.r != null ? fmtDist(p.r) : '--';
  $('sAndado').textContent = p.al != null ? fmtDist(p.al) : '--';
  $('sTempo').textContent = idade < 60000 ? 'agora' : `há ${Math.round(idade / 60000)} min`;
  if (p.r != null && p.r > 0.05 && !acomp.fim) {
    const eta = new Date(p.t + p.r / VELOCIDADE * 3600000);
    $('sChegada').textContent = `${String(eta.getHours()).padStart(2, '0')}:${String(eta.getMinutes()).padStart(2, '0')}`;
  } else $('sChegada').textContent = p.r != null && p.r <= 0.05 ? 'chegou' : '--';
  $('bar').style.width = p.tot ? `${Math.min(100, (p.al || 0) / p.tot * 100).toFixed(1)}%` : '0%';
  const partes = [`Última posição às <b>${hora}</b>`];
  if (p.b != null) partes.push(`bateria <b>${p.b}%</b>`);
  if (p.acc) partes.push(`precisão ${p.acc} m`);
  info.innerHTML = partes.join(' · ');
  refreshTela();
  const parado = idade > SEM_SINAL_MS && !acomp.fim && p.k !== 'arrived';
  info.classList.toggle('stale', parado);
  if (parado) info.innerHTML = `⚠️ Sem atualização há ${Math.round(idade / 60000)} min (última às ${hora}). O celular pode estar com a tela apagada ou sem sinal.${p.b != null ? ` Bateria: ${p.b}%.` : ''}`;
  // mapa
  if (map) {
    if (!walkerMarker) walkerMarker = new maplibregl.Marker({ element: el('walker-dot'), anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
    walkerMarker.setLngLat([p.lng, p.lat]);
    if (mapReady) map.getSource('trilha').setData({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: acomp.trilha.map((x) => [x[1], x[0]]) } });
    if (followWalker) map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
  }
}

let fonte = null, pollTimer = null;
async function buscarHistorico() {
  try {
    const since = acomp.ultimoId || 'all';
    const r = await fetch(`${RELAY}/${MODO_ACOMP}/json?poll=1&since=${since}`);
    const txt = await r.text();
    txt.split('\n').filter(Boolean).forEach((l) => {
      try { const ev = JSON.parse(l); receberMsg(ev); if (ev.id) acomp.ultimoId = ev.id; } catch (e) { /* ignora */ }
    });
  } catch (e) { /* sem internet: tenta de novo */ }
}
function conectarAoVivo() {
  if (!('EventSource' in window)) { pollTimer = setInterval(buscarHistorico, 15000); return; }
  fonte = new EventSource(`${RELAY}/${MODO_ACOMP}/sse?since=all`);
  fonte.onmessage = (e) => { try { const ev = JSON.parse(e.data); receberMsg(ev); if (ev.id && ev.event === 'message') acomp.ultimoId = ev.id; } catch (er) { /* ignora */ } };
  // se a conexão ao vivo falhar, busca por consulta a cada 15 s
  fonte.onerror = () => { if (!pollTimer) pollTimer = setInterval(buscarHistorico, 15000); };
  fonte.onopen = () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
}

function initAcompanhante() {
  document.body.classList.add('acomp');
  document.title = 'Acompanhando a caminhada';
  state = blank();
  initMap();
  showTab('caminhada');
  const labels = document.querySelectorAll('.stats span');
  ['faltam', 'percorridos', 'atualizado', 'chegada'].forEach((t, i) => { if (labels[i]) labels[i].textContent = t; });
  $('acompInfo').hidden = false;
  $('btnLayer').addEventListener('click', () => { state.layer = state.layer === 'satelite' ? 'mapa' : 'satelite'; applyLayer(); });
  $('btnFollow').classList.add('on');
  $('btnFollow').addEventListener('click', () => { followWalker = true; $('btnFollow').classList.add('on'); if (acomp.pos && map) mapView([acomp.pos.lat, acomp.pos.lng], 16); });
  $('btnFit').addEventListener('click', () => { followWalker = false; $('btnFollow').classList.remove('on'); fitRoute(); });
  $('btnNorte').addEventListener('click', () => { if (map) map.easeTo({ bearing: 0, pitch: 0, duration: 500 }); });
  $('btnTela').addEventListener('click', () => telaCheia(true));
  $('btnSairTela').addEventListener('click', () => telaCheia(false));
  refreshAll();
  computeRoute();
  renderAcomp();
  conectarAoVivo();
  setInterval(renderAcomp, 15000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') buscarHistorico(); });
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
// Mapa vetorial (MapLibre + OpenFreeMap): zoom suave, giro e 3D; satélite opcional
// ---------------------------------------------------------------------
const ESTILO_MAPA = 'https://tiles.openfreemap.org/styles/liberty';
const SATELITE = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
let map = null, mapReady = false, primeiroSimbolo = null;
let meMarker = null, startMarker = null, fimMarker = null, poiMarkers = [];
const ll = (p) => [p[1], p[0]];   // [lat, lng] → [lng, lat]
function mapView(p, zoom) {
  if (!map) return;
  map.easeTo({ center: ll(p), zoom: zoom != null ? zoom : map.getZoom(), duration: 500 });
}
function el(cls, html) {
  const d = document.createElement('div');
  d.className = cls;
  if (html) d.innerHTML = html;
  return d;
}
function initMap() {
  if (typeof maplibregl === 'undefined') { $('map').innerHTML = '<p style="padding:150px 16px">Sem internet para carregar o mapa agora.</p>'; return; }
  map = new maplibregl.Map({
    container: 'map', style: ESTILO_MAPA, center: ll(P35), zoom: 10.5,
    attributionControl: false, dragRotate: true, pitchWithRotate: true, maxPitch: 60,
  });
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  // peça do mapa que falhou (sinal fraco, conexão caiu): baixa de novo só a camada que falhou
  const pendentes = new Set(); let recarga = null, tentativas = 0;
  const recarregarMapa = (ids) => {
    (ids || ['openmaptiles']).forEach((id) => pendentes.add(id));
    if (recarga || tentativas > 15) return;
    recarga = setTimeout(() => {
      recarga = null; tentativas++;
      const defs = map.getStyle().sources;
      pendentes.forEach((id) => {
        const src = map.getSource(id), def = defs[id];
        if (!src || !def) return;
        if (def.type === 'vector' && src.setUrl && src.url) src.setUrl(src.url);
        else if (def.type === 'raster' && src.setTiles && def.tiles && map.getLayoutProperty(id, 'visibility') !== 'none') src.setTiles(def.tiles);
      });
      pendentes.clear();
    }, 4000);
  };
  map.on('error', (e) => { if (e && e.sourceId) recarregarMapa([e.sourceId]); });
  map.on('idle', () => {
    const caches = (map.style && map.style.sourceCaches) || {};
    const ruins = Object.entries(caches).filter(([, sc]) => Object.values(sc._tiles || {}).some((t) => t.state === 'errored')).map(([id]) => id);
    if (ruins.length) recarregarMapa(ruins); else tentativas = 0;
  });
  window.addEventListener('online', () => recarregarMapa(['openmaptiles']));
  map.on('load', () => {
    mapReady = true;
    // créditos recolhidos (só o ícone ⓘ), para não ocupar o mapa
    const at = document.querySelector('.maplibregl-ctrl-attrib');
    if (at) at.classList.remove('maplibregl-compact-show');
    const simb = map.getStyle().layers.find((l) => l.type === 'symbol');
    primeiroSimbolo = simb ? simb.id : undefined;
    // satélite (escondido até o usuário escolher), abaixo das ruas e nomes
    map.addSource('satelite', { type: 'raster', tiles: [SATELITE], tileSize: 256, maxzoom: 19, attribution: 'Imagens © Esri, Maxar, Earthstar Geographics' });
    map.addLayer({ id: 'satelite', type: 'raster', source: 'satelite', layout: { visibility: 'none' } }, map.getStyle().layers[1] && map.getStyle().layers[1].id);
    // trajeto: borda branca + linha colorida, abaixo dos nomes
    map.addSource('rota', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'rota-borda', type: 'line', source: 'rota', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 5, 16, 12] } }, primeiroSimbolo);
    map.addLayer({ id: 'rota-linha', type: 'line', source: 'rota', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#1a73e8', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3, 16, 7] } }, primeiroSimbolo);
    // rastro de quem está sendo acompanhado
    map.addSource('trilha', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'trilha', type: 'line', source: 'trilha', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#e37400', 'line-width': 4, 'line-dasharray': [0.5, 2] } });
    applyLayer();
    drawRoute();
    if (state.route && currentTab === 'caminhada') fitRoute();
    drawMe();
    if (MODO_ACOMP) renderAcomp();
  });
  // pontos oficiais da Associação: aparecem de perto (zoom 13+)
  OF.pois.forEach((p) => {
    const m = new maplibregl.Marker({ element: el('poi', p.ic), anchor: 'center' })
      .setLngLat([p.lng, p.lat])
      .setPopup(new maplibregl.Popup({ offset: 16, closeButton: false }).setText(p.nome));
    poiMarkers.push(m);
  });
  const atualizarPois = () => {
    const ver = map.getZoom() >= 13 && !MODO_ACOMP_SEM_POIS();
    poiMarkers.forEach((m) => { if (ver && !m._map) m.addTo(map); else if (!ver && m._map) m.remove(); });
  };
  map.on('zoomend', atualizarPois);
  map.on('dragstart', () => {
    follow = false; $('btnFollow').classList.remove('on');
    if (typeof followWalker !== 'undefined') followWalker = false;
  });
  map.on('rotate', () => { $('btnNorte').hidden = Math.abs(map.getBearing()) < 1 && map.getPitch() < 1; $('norteIc').style.transform = `rotate(${-map.getBearing()}deg)`; });
  map.on('pitch', () => { $('btnNorte').hidden = Math.abs(map.getBearing()) < 1 && map.getPitch() < 1; });
  map.on('click', (e) => {
    if (!pickingOnMap) return;
    pickingOnMap = false;
    setStart([e.lngLat.lat, e.lngLat.lng]);
    setTimeout(() => showTab('trajeto'), 300);
  });
}
const MODO_ACOMP_SEM_POIS = () => state.via === 'dutra';
function applyLayer() {
  $('layerIcon').textContent = state.layer === 'satelite' ? '🗺️' : '🛰️';
  $('btnLayer').title = state.layer === 'satelite' ? 'Ver mapa' : 'Ver satélite';
  $('btnLayer').classList.toggle('on', state.layer === 'satelite');
  if (!mapReady) return;
  const sat = state.layer === 'satelite';
  // no satélite, ficam só as ruas e os nomes por cima da imagem (como o "híbrido" do Google)
  map.getStyle().layers.forEach((l) => {
    if (['rota-borda', 'rota-linha', 'trilha'].includes(l.id)) return;
    if (l.id === 'satelite') { map.setLayoutProperty(l.id, 'visibility', sat ? 'visible' : 'none'); return; }
    if (['background', 'fill', 'fill-extrusion', 'raster', 'hillshade'].includes(l.type)) map.setLayoutProperty(l.id, 'visibility', sat ? 'none' : 'visible');
  });
}
function marcador(cls, txt) {
  const d = el(`mk ${cls}`, txt);
  d.style.pointerEvents = 'none'; // não bloqueia o toque ao escolher o ponto no mapa
  return d;
}
function drawRoute() {
  if (!mapReady) return;
  const r = state.route;
  map.getSource('rota').setData(r
    ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.pts.map(ll) } }
    : { type: 'FeatureCollection', features: [] });
  map.setPaintProperty('rota-linha', 'line-color', COR_CAMINHO[caminho()]);
  if (startMarker) startMarker.remove();
  startMarker = state.start ? new maplibregl.Marker({ element: marcador('a', 'A'), anchor: 'center' }).setLngLat(ll(state.start.p)).addTo(map) : null;
  if (!fimMarker) fimMarker = new maplibregl.Marker({ element: marcador('b', '⛪'), anchor: 'center' }).setLngLat(ll(FIM.p)).addTo(map);
  else fimMarker.setLngLat(ll(FIM.p));
  // pontos oficiais só da rota escolhida
  poiMarkers.forEach((m) => m.remove());
  poiMarkers = OF.pois.map((p) => new maplibregl.Marker({ element: el('poi', p.ic), anchor: 'center' }).setLngLat([p.lng, p.lat])
    .setPopup(new maplibregl.Popup({ offset: 16, closeButton: false }).setText(p.nome)));
  if (map.getZoom() >= 13 && state.via !== 'dutra') poiMarkers.forEach((m) => m.addTo(map));
}
function drawMe() {
  if (!map || !me) return;
  if (!meMarker) meMarker = new maplibregl.Marker({ element: el('me-dot'), anchor: 'center' }).setLngLat(ll(me)).addTo(map);
  else meMarker.setLngLat(ll(me));
  if (follow && state.walking) map.easeTo({ center: ll(me), zoom: Math.max(map.getZoom(), 16), duration: 600 });
}
function fitRoute() {
  if (!map) return;
  const pts = state.route ? state.route.pts : [FIM.p, state.start ? state.start.p : P35];
  const b = new maplibregl.LngLatBounds();
  pts.forEach((p) => b.extend(ll(p)));
  const cheia = document.body.classList.contains('tela-cheia');
  const sheetH = cheia ? ($('telaInfo').offsetHeight + 10) : 10;
  const topH = cheia ? 70 : 30;
  const cam = map.cameraForBounds(b, { padding: { top: topH, bottom: sheetH + 20, left: 24, right: 72 }, bearing: 0 });
  if (cam) map.easeTo({ ...cam, bearing: 0, pitch: 0, duration: 600 });
}

// ---------------------------------------------------------------------
// Atualização geral e abas
// ---------------------------------------------------------------------
let lastRouteKey = null, lastStartKey = null, pendingFit = false, currentTab = 'caminhada';
function refreshAll() {
  const n = navInfo();
  if (!MODO_ACOMP) {
    refreshNav(n);
    refreshStats(n);
    refreshTrajeto(n);
    refreshChecklist();
    refreshAlertas();
    refreshShare();
    refreshCaminho();
    refreshCapa();
  }
  const rk = state.route ? `${state.route.key}:${state.route.pts.length}` : 'none';
  const sk = state.start ? `${state.start.p.join(',')}:${state.start.title}` : 'none';
  if (rk !== lastRouteKey || sk !== lastStartKey) {
    const routeChanged = rk !== lastRouteKey;
    lastRouteKey = rk; lastStartKey = sk;
    drawRoute();
    if (routeChanged && state.route) {
      // com o mapa escondido (outra aba), o enquadramento fica para quando ele aparecer
      if (currentTab === 'caminhada') fitRoute(); else pendingFit = true;
    }
  }
  if (MODO_ACOMP) renderAcomp();
}
// Layout: mapa fixo em cima e dashboard rolando embaixo (seções que abrem e fecham)
function fitSheet() { if (map) map.resize(); }
window.addEventListener('resize', fitSheet);
const SECAO = { trajeto: 'secTrajeto', alertas: 'secAlertas', check: 'secCheck', share: 'secShare', passos: 'secPassos', pontos: 'secPois' };
function showTab(name) {
  currentTab = 'caminhada'; // o mapa está sempre visível
  if (name === 'caminhada') {
    $('dash').scrollTo({ top: 0 });
    setTimeout(() => { if (!map) return; map.resize(); if (pendingFit && !pickingOnMap) { pendingFit = false; fitRoute(); } }, 30);
    return;
  }
  const sec = $(SECAO[name]);
  if (!sec) return;
  sec.open = true;
  setTimeout(() => sec.scrollIntoView({ block: 'start' }), 30);
}

// ---------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------
function init() {
  // página antiga em cache com código novo: recarrega uma vez buscando a versão nova
  if (!document.getElementById('acompInfo') || !document.getElementById('shareCard') || !document.getElementById('capa')) {
    let ja = false;
    try { ja = sessionStorage.getItem('recarregou') === '1'; sessionStorage.setItem('recarregou', '1'); } catch (e) { /* ignora */ }
    if (!ja) { location.replace(`${location.pathname}?r=${Date.now()}${location.hash}`); return; }
  }
  if (MODO_ACOMP) { initAcompanhante(); return; }
  initMap();
  mostrarCapa(true);
  $('btnCapa').addEventListener('click', () => mostrarCapa(false));
  $('contagem').addEventListener('click', () => mostrarCapa(true));
  // voltando ao app depois de um tempo (30 min ou mais), mostra a contagem de novo
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') capaEscondidaEm = Math.max(capaEscondidaEm, Date.now());
    else if ($('capa').hidden && Date.now() - capaEscondidaEm > 30 * 60 * 1000) mostrarCapa(true);
  });
  $('btnWalk').addEventListener('click', toggleWalk);
  $('btnLayer').addEventListener('click', () => { state.layer = state.layer === 'satelite' ? 'mapa' : 'satelite'; save(); applyLayer(); });
  $('btnFollow').addEventListener('click', () => {
    follow = true; $('btnFollow').classList.add('on');
    startGps();
    if (me && map) mapView(me, 17);
  });
  $('btnFit').addEventListener('click', () => { follow = false; $('btnFollow').classList.remove('on'); fitRoute(); });
  $('btnNorte').addEventListener('click', () => { if (map) map.easeTo({ bearing: 0, pitch: 0, duration: 500 }); });
  $('btnTela').addEventListener('click', () => telaCheia(true));
  $('btnSairTela').addEventListener('click', () => telaCheia(false));

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
  $('btnStart35').addEventListener('click', () => { const st = startPadrao(); setStart(st.p, st); });
  document.querySelectorAll('.rota-op').forEach((b) => b.addEventListener('click', () => trocarRota(b.dataset.rota)));
  document.querySelectorAll('#rotaSeg button').forEach((b) => b.addEventListener('click', () => escolherCaminho(b.dataset.r)));
  document.querySelectorAll('.via[data-via]').forEach((b) => b.addEventListener('click', () => {
    if (b.disabled) return;
    escolherCaminho(b.dataset.via);
  }));
  $('btnShareOn').addEventListener('click', ligarCompartilhamento);
  $('btnShareOff').addEventListener('click', () => { if (confirm('Parar de compartilhar sua localização? O link deixará de ser atualizado.')) desligarCompartilhamento(); });
  $('btnShareSend').addEventListener('click', enviarLink);
  $('btnShareCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareLink()); $('btnShareCopy').textContent = 'Link copiado ✓'; }
    catch (e) { prompt('Copie o link:', shareLink()); }
    setTimeout(() => { $('btnShareCopy').textContent = 'Copiar link'; }, 2500);
  });
  $('chkAwake').addEventListener('change', (e) => { if (state.share) { state.share.awake = e.target.checked; save(); manterTela(); } });
  $('sharePill').addEventListener('click', () => showTab('share'));
  // envia a posição mesmo parado (a cada 30 s) e reativa a tela ligada ao voltar para o app
  setInterval(() => { if (state.share && state.share.on) enviarPosicao(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { manterTela(); enviarPosicao(true); } });
  if (state.share && state.share.on) startGps();
  refreshShare();
  $('alertChip').addEventListener('click', () => { alertaNovo = null; showTab('alertas'); refreshAlertas(); });
  $('btnNotif').addEventListener('click', async () => {
    if (!('Notification' in window)) { $('notifInfo').textContent = 'Este navegador não permite notificações. Os avisos aparecem na tela e o celular vibra.'; return; }
    const r = await Notification.requestPermission();
    refreshNotif(r);
  });
  refreshNotif();
  // confere os alertas a cada 5 minutos e sempre que o app volta para a tela
  setInterval(loadAlertas, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadAlertas(); });
  $('btnAlertas').addEventListener('click', () => { $('alertasSub').textContent = 'Atualizando…'; loadAlertas(); });
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
    if (map) setTimeout(() => mapView(state.start ? state.start.p : P35, 15), 60);
  });
  $('parList').addEventListener('change', (e) => {
    const li = e.target.closest('li.par');
    if (li && e.target.type === 'checkbox') marcarParada(li.dataset.id, e.target.checked);
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
  loadAlertas();
  if (state.route) fitRoute();
  showTab('caminhada');
  state.visto = true;
  save();

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
init();
