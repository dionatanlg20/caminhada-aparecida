/* Tela da Conferência de Notas x TOTVS RM. */
(function () {
  const U = CN.util, ST = CN.conferencia.STATUS;
  const $ = (id) => document.getElementById(id);
  const esc = U.escapeHtml;

  const estado = {
    documentos: [], cancelamentos: [], leitura: null,
    totvs: null, movimentos: [], arquivoTotvs: '',
    conf: null, filtroStatus: ST.NAO, busca: ''
  };

  // ---------- Preferências salvas no navegador ----------
  const PREF = 'cn_pref';
  const lerPref = () => { try { return JSON.parse(localStorage.getItem(PREF) || '{}'); } catch (e) { return {}; } };
  const salvarPref = (p) => { try { localStorage.setItem(PREF, JSON.stringify({ ...lerPref(), ...p })); } catch (e) { /* ignora */ } };

  function iniciar() {
    atualizarLogo();
    const hoje = new Date();
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1), fim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const p = lerPref();
    $('dtIni').value = iso(ini); $('dtFim').value = iso(fim);
    $('cnpjEmpresa').value = p.cnpjEmpresa != null ? p.cnpjEmpresa : CN.config.cnpjsEmpresa.join('; ');
    $('tolerancia').value = p.tolerancia != null ? p.tolerancia : CN.config.toleranciaValor;
    if (p.apiUrl) $('apiUrl').value = p.apiUrl;

    $('inPasta').addEventListener('change', (e) => carregarNotas([...e.target.files]).finally(() => { e.target.value = ''; }));
    $('inArquivos').addEventListener('change', (e) => carregarNotas([...e.target.files]).finally(() => { e.target.value = ''; }));
    const area = $('areaSoltar');
    ['dragenter', 'dragover'].forEach((ev) => area.addEventListener(ev, (e) => { e.preventDefault(); area.classList.add('ativo'); }));
    ['dragleave', 'drop'].forEach((ev) => area.addEventListener(ev, () => area.classList.remove('ativo')));
    area.addEventListener('drop', async (e) => { e.preventDefault(); carregarNotas(await CN.leitor.arquivosDoDrop(e.dataTransfer)); });

    $('inTotvs').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) carregarTotvs(f); e.target.value = ''; });
    $('selAba').addEventListener('change', () => usarAba(+$('selAba').value));
    $('btnApi').addEventListener('click', buscarApi);
    $('btnConferir').addEventListener('click', conferir);
    $('cnpjEmpresa').addEventListener('change', () => salvarPref({ cnpjEmpresa: $('cnpjEmpresa').value }));
    $('tolerancia').addEventListener('change', () => salvarPref({ tolerancia: $('tolerancia').value }));
    ['dtIni', 'dtFim'].forEach((id) => $(id).addEventListener('change', verificarPronto));
    $('busca').addEventListener('input', (e) => { estado.busca = e.target.value; desenharTabela(); });

    $('btnZip').addEventListener('click', () => exportar('zip'));
    $('btnExcel').addEventListener('click', () => exportar('excel'));
    $('btnPdf').addEventListener('click', () => exportar('pdf'));

    $('btnConfig').addEventListener('click', () => { $('logoPrevia').src = CN.exportar.logoDataUrl(); $('dlgConfig').showModal(); });
    $('inLogo').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const url = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); });
      try { localStorage.setItem('cn_logo', url); } catch (err) { alert('Não foi possível salvar o logo neste navegador (imagem grande demais?).'); }
      atualizarLogo(); $('logoPrevia').src = CN.exportar.logoDataUrl(); e.target.value = '';
    });
    $('btnLogoRemover').addEventListener('click', () => { try { localStorage.removeItem('cn_logo'); } catch (e) { /* ignora */ } atualizarLogo(); $('logoPrevia').src = CN.exportar.logoDataUrl(); });
    verificarPronto();
  }

  function atualizarLogo() { $('logo').src = CN.exportar.logoDataUrl(); }

  function progresso(id, texto, fracao) {
    const el = $(id);
    el.hidden = fracao == null;
    if (fracao == null) return;
    el.querySelector('span').style.width = Math.round(Math.min(1, fracao) * 100) + '%';
    el.querySelector('small').textContent = texto;
  }

  const raizesEmpresa = () => $('cnpjEmpresa').value.split(/[;,\s]+/).map(U.soDigitos).filter((c) => c.length >= 8).map((c) => c.slice(0, 8));

  // ---------- 1. Notas ----------
  async function carregarNotas(files) {
    if (!files.length) return;
    const ctx = { raizesEmpresa: raizesEmpresa() };
    progresso('progNotas', 'Abrindo arquivos…', 0);
    const leitura = await CN.leitor.lerArquivos(files, (t, f) => progresso('progNotas', t, f * 0.3));
    const st = { xml: 0, pdf: 0, paginas: 0, imagem: 0, avisos: [] };
    const docs = [], canc = [];
    const total = leitura.entradas.length;
    for (let i = 0; i < total; i++) {
      const en = leitura.entradas[i];
      const base = 0.3 + 0.7 * (i / Math.max(1, total));
      progresso('progNotas', `Lendo ${i + 1} de ${total}: ${en.caminho}`, base);
      try {
        if (en.tipo === 'xml') {
          st.xml++;
          const r = CN.parserXml.ler(en.dados, en);
          docs.push(...r.documentos); canc.push(...r.cancelamentos);
          if (r.aviso) st.avisos.push(`${en.caminho}: ${r.aviso}`);
        } else if (en.tipo === 'pdf') {
          st.pdf++;
          const r = await CN.parserPdf.lerPdf(en, ctx, (p, n) => progresso('progNotas', `Lendo ${en.caminho} — página ${p} de ${n}`, base));
          if (r.documentos.length) st.paginas += r.documentos[0].totalPaginasArquivo;
          docs.push(...r.documentos);
          if (r.aviso) st.avisos.push(`${en.caminho}: ${r.aviso}`);
        } else if (en.tipo === 'imagem') {
          st.imagem++;
          docs.push(await CN.codigoBarras.lerImagem(en));
        }
      } catch (e) {
        st.avisos.push(`${en.caminho}: erro ao ler (${e.message || e}).`);
      }
      if (i % 3 === 0) await U.esperar();
    }
    leitura.erros.forEach((e) => st.avisos.push(`${e.caminho}: ${e.erro}`));
    estado.documentos.push(...docs); estado.cancelamentos.push(...canc);
    const ant = estado.leitura || { xml: 0, pdf: 0, paginas: 0, imagem: 0, compactados: 0, ignorados: [], avisos: [] };
    estado.leitura = {
      xml: ant.xml + st.xml, pdf: ant.pdf + st.pdf, paginas: ant.paginas + st.paginas, imagem: ant.imagem + st.imagem,
      compactados: ant.compactados + leitura.compactados, ignorados: [...ant.ignorados, ...leitura.ignorados], avisos: [...ant.avisos, ...st.avisos]
    };
    progresso('progNotas', '', null);
    desenharResumoNotas();
    verificarPronto();
  }

  function desenharResumoNotas() {
    const l = estado.leitura;
    const docsUnicos = CN.conferencia.unificar(estado.documentos.map((d) => ({ ...d, anexos: null })), estado.cancelamentos);
    const semDados = estado.documentos.filter((d) => !d.numero).length;
    const avisos = l.avisos.length + semDados;
    $('resumoNotas').innerHTML = `
      <p class="ok">${docsUnicos.length} nota(s) identificada(s)</p>
      <div class="pilulas">
        <span class="pilula">${l.xml} XML</span>
        <span class="pilula">${l.pdf} PDF (${l.paginas} pág.)</span>
        <span class="pilula">${l.imagem} imagem(ns)</span>
        <span class="pilula">${l.compactados} ZIP/RAR aberto(s)</span>
        ${estado.cancelamentos.length ? `<span class="pilula aviso">${estado.cancelamentos.length} cancelamento(s)</span>` : ''}
        ${avisos ? `<span class="pilula aviso">${avisos} aviso(s)</span>` : ''}
      </div>
      ${l.avisos.length ? `<details><summary>Avisos de leitura (${l.avisos.length})</summary><ul>${l.avisos.slice(0, 300).map((a) => `<li>${esc(a)}</li>`).join('')}</ul></details>` : ''}
      ${l.ignorados.length ? `<details><summary>Arquivos ignorados (${l.ignorados.length})</summary><ul>${l.ignorados.slice(0, 300).map((a) => `<li>${esc(a)}</li>`).join('')}</ul></details>` : ''}
      <div class="botoes" style="justify-content:flex-start;margin-top:8px"><button class="btn mini" id="btnLimparNotas">Limpar notas</button></div>`;
    $('btnLimparNotas').onclick = () => { estado.documentos = []; estado.cancelamentos = []; estado.leitura = null; $('resumoNotas').innerHTML = ''; verificarPronto(); };
  }

  // ---------- 2. TOTVS ----------
  async function carregarTotvs(f) {
    try {
      const dados = new Uint8Array(await f.arrayBuffer());
      estado.totvs = CN.totvs.lerArquivo(dados, f.name);
      estado.arquivoTotvs = f.name;
    } catch (e) {
      $('resumoTotvs').innerHTML = `<p class="faltando">Não foi possível ler o relatório: ${esc(e.message || e)}</p>`;
      return;
    }
    const sel = $('selAba');
    const abas = estado.totvs.abas;
    sel.innerHTML = abas.map((a, i) => `<option value="${i}">Aba: ${esc(a.nome)} (${a.linhas.length} linhas)</option>`).join('');
    sel.hidden = abas.length < 2;
    // Escolhe a aba com mais linhas de movimento reconhecidas.
    let melhor = 0, melhorQtd = -1;
    abas.forEach((a, i) => { const det = CN.totvs.detectarColunas(a.linhas); const q = CN.totvs.montarMovimentos(a.linhas, det.linhaCabecalho, det.mapa).length; if (q > melhorQtd) { melhor = i; melhorQtd = q; } });
    sel.value = melhor;
    usarAba(melhor);
  }

  function usarAba(i) {
    const aba = estado.totvs.abas[i];
    const det = CN.totvs.detectarColunas(aba.linhas);
    estado.totvs.aba = aba; estado.totvs.det = det;
    desenharMapa();
    recalcularMovimentos();
  }

  function desenharMapa() {
    const { det, aba } = estado.totvs;
    const R = CN.config.rotulosCampos;
    const opcoes = (sel) => `<option value="">(não usar)</option>` + det.cabecalho.map((c, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(c || `Coluna ${i + 1}`)}</option>`).join('');
    $('mapaColunas').innerHTML = Object.keys(R).map((campo) =>
      `<span class="${['numero'].includes(campo) ? 'obrig' : ''}">${R[campo]}</span><select data-campo="${campo}">${opcoes(det.mapa[campo])}</select>`).join('');
    $('mapaColunas').querySelectorAll('select').forEach((s) => s.addEventListener('change', () => {
      det.mapa[s.dataset.campo] = s.value === '' ? undefined : +s.value; recalcularMovimentos();
    }));
    const linhas = aba.linhas.slice(det.linhaCabecalho + 1, det.linhaCabecalho + 6);
    const fmt = (v) => (v instanceof Date ? U.fmtData(U.parseData(v)) : v);
    $('previa').innerHTML = `<table><tr>${det.cabecalho.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>${linhas.map((l) => `<tr>${det.cabecalho.map((c, j) => `<td>${esc(fmt(l[j]))}</td>`).join('')}</tr>`).join('')}</table>`;
    $('detMapa').hidden = false;
  }

  function recalcularMovimentos() {
    const { det, aba } = estado.totvs;
    estado.movimentos = CN.totvs.montarMovimentos(aba.linhas, det.linhaCabecalho, det.mapa);
    desenharResumoTotvs();
  }

  function desenharResumoTotvs(origem) {
    const movs = estado.movimentos;
    const m = estado.totvs && estado.totvs.det ? estado.totvs.det.mapa : {};
    const faltam = [];
    if (origem !== 'api') {
      if (m.numero == null && m.chave == null) faltam.push('número da nota');
      if (m.dataEntrada == null && m.dataEmissao == null) faltam.push('data de entrada ou emissão');
      if (m.cnpj == null) faltam.push('CNPJ do fornecedor (sem ele a busca é por número + valor/nome)');
      if (m.tipoMov == null) faltam.push('tipo de movimento (todos os movimentos serão considerados)');
    }
    const datas = movs.map((x) => x.dataEntrada || x.dataEmissao).filter(Boolean).sort();
    $('resumoTotvs').innerHTML = `
      <p class="ok">${movs.length} movimento(s) lido(s)${estado.arquivoTotvs && origem !== 'api' ? ` de ${esc(estado.arquivoTotvs)}` : ' da API'}</p>
      ${datas.length ? `<p class="ajuda">Datas no relatório: ${U.fmtData(datas[0])} a ${U.fmtData(datas[datas.length - 1])}</p>` : ''}
      ${faltam.length ? `<p class="faltando">Coluna não encontrada: ${faltam.map(esc).join('; ')}. Ajuste em "Colunas do relatório".</p>` : ''}`;
    // Tipos de movimento
    const cont = new Map();
    movs.forEach((x) => cont.set(x.tipoMovNorm || '(sem tipo)', (cont.get(x.tipoMovNorm || '(sem tipo)') || 0) + 1));
    const padrao = new Set(CN.config.tiposMovimento.map((t) => CN.totvs.normTipo(t.codigo)));
    const algumPadrao = [...cont.keys()].some((k) => padrao.has(k));
    const desc = Object.fromEntries(CN.config.tiposMovimento.map((t) => [CN.totvs.normTipo(t.codigo), t.descricao]));
    const tipos = [...cont.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    $('tiposMov').hidden = !tipos.length;
    $('tiposMov').innerHTML = `<h4>Tipos de movimento considerados</h4>` + tipos.map(([t, n]) =>
      `<label><input type="checkbox" value="${esc(t)}" ${!algumPadrao || padrao.has(t) ? 'checked' : ''}> ${esc(t)}${desc[t] ? ` — ${esc(desc[t])}` : ''} <small>(${n})</small></label>`).join('');
    verificarPronto();
  }

  async function buscarApi() {
    const url = $('apiUrl').value.trim();
    if (!url) { alert('Informe o endereço da API.'); return; }
    salvarPref({ apiUrl: url });
    $('btnApi').disabled = true;
    try {
      const tipos = CN.config.tiposMovimento.map((t) => t.codigo);
      // Busca com folga de 60 dias depois do fim para achar notas lançadas mais tarde.
      estado.movimentos = await CN.totvs.buscarApi(url, { inicio: U.addDias($('dtIni').value, -Number($('margem').value || 0)), fim: U.addDias($('dtFim').value, 60), tipos, base: baseMov(), token: $('apiToken').value });
      estado.totvs = null; estado.arquivoTotvs = 'API ' + url; $('detMapa').hidden = true;
      desenharResumoTotvs('api');
    } catch (e) {
      $('resumoTotvs').innerHTML = `<p class="faltando">Erro ao buscar na API: ${esc(e.message || e)}. Se a API estiver em outro servidor, ela precisa liberar CORS.</p>`;
    } finally { $('btnApi').disabled = false; }
  }

  const baseMov = () => document.querySelector('input[name=baseMov]:checked').value;

  function verificarPronto() {
    const falta = [];
    if (!estado.documentos.length) falta.push('as notas da pasta');
    if (!estado.movimentos.length) falta.push('o relatório da TOTVS');
    if (!$('dtIni').value || !$('dtFim').value) falta.push('o período');
    else if ($('dtIni').value > $('dtFim').value) falta.push('um período válido (início antes do fim)');
    $('btnConferir').disabled = falta.length > 0;
    $('faltando').textContent = falta.length ? 'Falta escolher: ' + falta.join(', ') + '.' : '';
  }

  // ---------- 3. Conferência ----------
  function conferir() {
    const tipos = new Set([...$('tiposMov').querySelectorAll('input:checked')].map((i) => i.value));
    const cnpjs = $('cnpjEmpresa').value.split(/[;,\s]+/).map(U.soDigitos).filter((c) => c.length >= 8);
    const params = {
      inicio: $('dtIni').value, fim: $('dtFim').value, baseMov: baseMov(), margemDias: Number($('margem').value || 0),
      tipos, cnpjsEmpresa: cnpjs, raizesEmpresa: cnpjs.map((c) => c.slice(0, 8)),
      toleranciaValor: Number($('tolerancia').value || 0), arquivoTotvs: estado.arquivoTotvs
    };
    if (tipos.has('(sem tipo)')) { tipos.delete('(sem tipo)'); tipos.add(''); }
    estado.conf = CN.conferencia.conferir(estado.documentos, estado.cancelamentos, estado.movimentos, params);
    estado.filtroStatus = estado.conf.resumo.naoRecebidas ? ST.NAO : 'todas';
    $('resultado').hidden = false;
    $('periodoTxt').textContent = `— ${U.fmtData(params.inicio)} a ${U.fmtData(params.fim)}`;
    desenharResultado();
    $('resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const classeStatus = (s) => ({ [ST.NAO]: 'st-nao', [ST.RECEBIDA]: 'st-ok', [ST.FORA]: 'st-fora', [ST.PROVAVEL]: 'st-atencao', [ST.MANUAL]: 'st-atencao' }[s] || 'st-neutro');

  function desenharResultado() {
    const r = estado.conf.resumo;
    const k = (rot, val, filtro, cls = '', sub = '') => `<button class="kpi ${cls}" data-filtro="${esc(filtro)}"><span>${rot}</span><strong>${val}</strong>${sub ? `<small>${sub}</small>` : ''}</button>`;
    $('kpis').innerHTML = [
      k('Notas no período', r.notas, 'todas'),
      k('Recebidas', r.recebidas, ST.RECEBIDA),
      k('Recebidas fora do período', r.fora, ST.FORA),
      k('NÃO recebidas', r.naoRecebidas, ST.NAO, r.naoRecebidas ? 'perigo' : '', U.fmtMoeda(r.valorNaoRecebido)),
      k('Conferir manualmente', r.manuais + r.provaveis, 'conferir', r.manuais + r.provaveis ? 'atencao' : ''),
      k('Canceladas / outras', r.outras, 'outras'),
      k('TOTVS sem nota na pasta', r.semDocumento, 'semdoc', r.semDocumento ? 'atencao' : '')
    ].join('');
    $('kpis').querySelectorAll('.kpi').forEach((b) => b.addEventListener('click', () => { estado.filtroStatus = b.dataset.filtro; desenharResultado(); }));
    const al = $('alerta');
    al.hidden = false;
    if (r.naoRecebidas) { al.className = 'alerta'; al.textContent = `Atenção: ${r.naoRecebidas} nota(s) não estão recebidas na TOTVS neste período (${U.fmtMoeda(r.valorNaoRecebido)}).`; }
    else { al.className = 'alerta ok'; al.textContent = 'Todas as notas identificadas no período foram encontradas na TOTVS.'; }
    const chips = [['todas', 'Todas'], [ST.NAO, 'Não recebidas'], ['conferir', 'Conferir'], [ST.FORA, 'Fora do período'], [ST.RECEBIDA, 'Recebidas'], ['outras', 'Canceladas / outras'], ['semdoc', 'TOTVS sem nota']];
    $('chips').innerHTML = chips.map(([v, t]) => `<button class="chip ${estado.filtroStatus === v ? 'ativo' : ''}" data-v="${esc(v)}">${t}</button>`).join('');
    $('chips').querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => { estado.filtroStatus = c.dataset.v; desenharResultado(); }));
    $('btnZip').disabled = !r.naoRecebidas;
    desenharTabela();
  }

  function desenharTabela() {
    const f = estado.filtroStatus, b = U.normTexto(estado.busca);
    const tab = $('tabela');
    if (f === 'semdoc') {
      const lista = estado.conf.semDocumento.filter((m) => !b || U.normTexto(`${m.fornecedor} ${m.cnpj} ${U.fmtCNPJ(m.cnpj)} ${m.numero}`).includes(b));
      tab.innerHTML = `<thead><tr><th>Tipo mov.</th><th>Nº</th><th>Fornecedor</th><th>CNPJ</th><th>Emissão</th><th>Entrada</th><th class="valor">Valor</th><th>Linha</th></tr></thead><tbody>` +
        (lista.length ? lista.map((m) => `<tr><td>${esc(m.tipoMov)}</td><td>${esc(m.numero)}</td><td>${esc(m.fornecedor)}</td><td class="nowrap">${esc(U.fmtCNPJ(m.cnpj))}</td><td>${U.fmtData(m.dataEmissao)}</td><td>${U.fmtData(m.dataEntrada)}</td><td class="valor">${U.fmtMoeda(m.valor)}</td><td>${m.linha}</td></tr>`).join('')
          : `<tr><td colspan="8" class="vazio">Nenhum movimento sem nota.</td></tr>`) + '</tbody>';
      return;
    }
    const grupos = { conferir: [ST.MANUAL, ST.PROVAVEL], outras: [ST.CANCELADA, ST.EMITIDA, ST.OUTRO_DEST] };
    const lista = estado.conf.resultado.filter((r) => (f === 'todas' || (grupos[f] ? grupos[f].includes(r.status) : r.status === f)) &&
      (!b || U.normTexto(`${r.doc.emitNome} ${r.doc.emitCnpj} ${U.fmtCNPJ(r.doc.emitCnpj)} ${r.doc.numero} ${r.doc.chave}`).includes(b)));
    tab.innerHTML = `<thead><tr><th>Situação</th><th>Fornecedor</th><th>CNPJ</th><th>Tipo</th><th>Nº</th><th>Emissão</th><th class="valor">Valor</th><th>TOTVS</th><th>Arquivo</th><th>Observação</th><th></th></tr></thead><tbody>` +
      (lista.length ? lista.map((r) => {
        const d = r.doc, i = estado.conf.resultado.indexOf(r);
        const emissao = d.dataEmissao ? U.fmtData(d.dataEmissao) : d.anoMesChave ? d.anoMesChave.split('-').reverse().join('/') + '*' : '—';
        const mov = r.movimento ? `${esc(r.movimento.tipoMov)} nº ${esc(r.movimento.numero)}${r.movimento.dataEntrada ? '<br><small>' + U.fmtData(r.movimento.dataEntrada) + '</small>' : ''}` : '';
        return `<tr><td><span class="status ${classeStatus(r.status)}">${esc(r.status)}</span></td><td>${esc(d.emitNome || '—')}</td><td class="nowrap">${esc(U.fmtCNPJ(d.emitCnpj) || '—')}</td><td class="nowrap">${esc(d.tipo)}</td><td>${esc(d.numero || '—')}</td><td class="nowrap">${emissao}</td><td class="valor">${U.fmtMoeda(d.valor)}</td><td class="nowrap">${mov}</td><td class="origem">${d.anexos.map((a) => esc(a.origem.caminho) + (a.paginas && a.totalPaginasArquivo > 1 ? ` <small>(pág. ${a.paginas.map((p) => p + 1).join(', ')})</small>` : '')).join('<br>')}</td><td class="obs">${esc(r.observacao)}</td><td><button class="btn mini" data-pdf="${i}" title="Baixar o PDF desta nota">PDF</button></td></tr>`;
      }).join('') : `<tr><td colspan="11" class="vazio">Nenhuma nota nesta situação.</td></tr>`) + '</tbody>';
    tab.querySelectorAll('[data-pdf]').forEach((bt) => bt.addEventListener('click', async () => {
      const d = estado.conf.resultado[+bt.dataset.pdf].doc;
      bt.disabled = true;
      try { const { dados } = await CN.exportar.pdfDaNota(d); CN.exportar.baixar(dados, CN.exportar.nomeBase(d) + '.pdf', 'application/pdf'); }
      catch (e) { alert('Não foi possível gerar o PDF: ' + e.message); } finally { bt.disabled = false; }
    }));
  }

  async function exportar(tipo) {
    const conf = estado.conf; if (!conf) return;
    const ini = U.fmtData(conf.params.inicio).replace(/\//g, '-'), fim = U.fmtData(conf.params.fim).replace(/\//g, '-');
    ['btnZip', 'btnExcel', 'btnPdf'].forEach((id) => { $(id).disabled = true; });
    try {
      if (tipo === 'zip') {
        const { dados, nome } = await CN.exportar.gerarPacote(conf, (t, f) => progresso('progExport', t, f));
        CN.exportar.baixar(dados, nome, 'application/zip');
      } else if (tipo === 'excel') {
        progresso('progExport', 'Gerando Excel…', 0.5);
        CN.exportar.baixar(await CN.exportar.gerarExcel(conf), `Conferencia notas TOTVS ${ini} a ${fim}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else {
        progresso('progExport', 'Gerando PDF…', 0.5);
        CN.exportar.baixar(await CN.exportar.gerarRelatorioPdf(conf), `Notas nao recebidas ${ini} a ${fim}.pdf`, 'application/pdf');
      }
    } catch (e) {
      console.error(e); alert('Erro ao gerar: ' + (e.message || e));
    } finally {
      progresso('progExport', '', null);
      ['btnExcel', 'btnPdf'].forEach((id) => { $(id).disabled = false; });
      $('btnZip').disabled = !conf.resumo.naoRecebidas;
    }
  }

  // Exposto para testes automáticos.
  window.CN.app = { estado, carregarNotas, carregarTotvs, conferir };
  iniciar();
})();
