/* Cruza as notas da pasta com os movimentos de entrada da TOTVS RM. */
window.CN = window.CN || {};

CN.conferencia = (function () {
  const U = CN.util;

  const STATUS = {
    RECEBIDA: 'Recebida',
    FORA: 'Recebida fora do período',
    PROVAVEL: 'Provavelmente recebida',
    NAO: 'NÃO RECEBIDA',
    MANUAL: 'Conferir manualmente',
    CANCELADA: 'Cancelada',
    EMITIDA: 'Emitida pela empresa',
    OUTRO_DEST: 'Outro destinatário'
  };

  /** Junta a mesma nota vinda de arquivos diferentes (XML + PDF + imagem). */
  function unificar(documentos, cancelamentos) {
    const canc = new Set(cancelamentos);
    const porChave = new Map(), porCnpjNum = new Map(), unicos = [];
    const prioridade = { XML: 3, PDF: 2, Imagem: 1 };
    for (const d of documentos) {
      d.anexos = d.anexos || [{ fonte: d.fonte, origem: d.origem, paginas: d.paginas, totalPaginasArquivo: d.totalPaginasArquivo }];
      const kc = d.chave && (d.chave.length === 44 || d.chave.length === 50) ? d.chave : '';
      const kn = d.emitCnpj && d.numero ? `${d.emitCnpj}|${d.numero}` : '';
      const existente = (kc && porChave.get(kc)) || (kn && porCnpjNum.get(kn));
      if (existente) {
        const [melhor, pior] = prioridade[d.fonte] > prioridade[existente.fonte] ? [d, existente] : [existente, d];
        for (const k of ['chave', 'tipo', 'modelo', 'numero', 'serie', 'dataEmissao', 'emitCnpj', 'emitNome', 'destCnpj', 'destNome', 'valor', 'xml', 'anoMesChave', 'descricaoServico']) {
          if (!existente[k] || (melhor === d && d[k])) existente[k] = melhor[k] || pior[k];
        }
        if (!existente.itens.length && d.itens.length) existente.itens = d.itens;
        existente.fonte = melhor.fonte;
        existente.confianca = [existente.confianca, d.confianca].includes('alta') ? 'alta' : [existente.confianca, d.confianca].includes('media') ? 'media' : 'baixa';
        existente.cancelada = existente.cancelada || d.cancelada;
        existente.avisos = melhor === d ? d.avisos : existente.avisos;
        existente.anexos.push(...d.anexos);
        if (existente.chave) porChave.set(existente.chave, existente);
        if (existente.emitCnpj && existente.numero) porCnpjNum.set(`${existente.emitCnpj}|${existente.numero}`, existente);
        continue;
      }
      unicos.push(d);
      if (kc) porChave.set(kc, d);
      if (kn) porCnpjNum.set(kn, d);
    }
    unicos.forEach((d) => { if (d.chave && canc.has(d.chave)) d.cancelada = true; });
    return unicos;
  }

  function dentro(iso, ini, fim) { return !!iso && iso >= ini && iso <= fim; }

  /**
   * params: { inicio, fim, baseMov: 'entrada'|'emissao', margemDias, tipos: Set, raizesEmpresa: [], toleranciaValor }
   */
  function conferir(documentos, cancelamentos, movimentosTodos, params) {
    const raizesEmp = params.raizesEmpresa || [];
    // Cópia rasa: a conferência pode ser refeita com outros parâmetros.
    const copias = documentos.map((d) => {
      const c = { ...d, anexos: null, avisos: [...(d.avisos || [])], itens: d.itens || [] };
      // PDF sem chave: decide quem é fornecedor e quem é a empresa pelos CNPJs da página.
      if (c.fonte === 'PDF' && c.cnpjsTexto && c.cnpjsTexto.length && raizesEmp.length) {
        const daEmp = c.cnpjsTexto.find((x) => raizesEmp.includes(x.slice(0, 8)));
        const outro = c.cnpjsTexto.find((x) => !raizesEmp.includes(x.slice(0, 8)));
        if (!c.cnpjDaChave && outro) c.emitCnpj = outro;
        if (daEmp) c.destCnpj = daEmp;
      }
      return c;
    });
    const docs = unificar(copias, cancelamentos);
    // Nota lida só pelo código de barras não traz o nome: busca em outras notas ou no cadastro da TOTVS.
    const nomes = new Map();
    docs.forEach((d) => { if (d.emitCnpj && d.emitNome) nomes.set(d.emitCnpj, d.emitNome); });
    movimentosTodos.forEach((m) => { if (m.cnpj && m.fornecedor && !nomes.has(m.cnpj)) nomes.set(m.cnpj, m.fornecedor); });
    docs.forEach((d) => {
      if (d.emitNome || !d.emitCnpj) return;
      const n = nomes.get(d.emitCnpj) || [...nomes.entries()].find(([c]) => c.slice(0, 8) === d.emitCnpj.slice(0, 8))?.[1];
      if (n) d.emitNome = n;
    });
    const iniNotas = params.margemDias ? U.addDias(params.inicio, -params.margemDias) : params.inicio;
    const raizes = params.raizesEmpresa || [];
    const tol = params.toleranciaValor ?? 1;

    const movs = movimentosTodos.filter((m) => !m.cancelado && (!params.tipos || !params.tipos.size || params.tipos.has(m.tipoMovNorm)));
    const dataMov = (m) => (params.baseMov === 'emissao' ? m.dataEmissao || m.dataEntrada : m.dataEntrada || m.dataEmissao);

    // Índices
    const idx = { chave: new Map(), cnpjNum: new Map(), raizNum: new Map(), num: new Map() };
    const add = (mapa, k, m) => { if (!k) return; if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(m); };
    for (const m of movs) {
      add(idx.chave, m.chave, m);
      if (m.cnpj && m.numero) { add(idx.cnpjNum, `${m.cnpj}|${m.numero}`, m); add(idx.raizNum, `${m.cnpj.slice(0, 8)}|${m.numero}`, m); }
      add(idx.num, m.numero, m);
    }
    const valorBate = (a, b) => a != null && b != null && Math.abs(a - b) <= Math.max(tol, Math.abs(a) * 0.005);

    function procurar(d) {
      if (d.chave && idx.chave.has(d.chave)) return { m: idx.chave.get(d.chave), como: 'chave de acesso', exato: true };
      if (d.emitCnpj && d.numero) {
        const k = `${d.emitCnpj}|${d.numero}`;
        if (idx.cnpjNum.has(k)) return { m: idx.cnpjNum.get(k), como: 'CNPJ + número', exato: true };
        const kr = `${d.emitCnpj.slice(0, 8)}|${d.numero}`;
        if (idx.raizNum.has(kr)) return { m: idx.raizNum.get(kr), como: 'raiz do CNPJ + número (filial diferente)', exato: false };
      }
      if (d.numero && idx.num.has(d.numero)) {
        const cands = idx.num.get(d.numero);
        const porValor = cands.filter((m) => valorBate(m.valor, d.valor));
        const porNome = cands.filter((m) => d.emitNome && m.fornecedor && U.semelhancaNome(d.emitNome, m.fornecedor) >= 0.5);
        const semCnpj = (lista) => lista.filter((m) => !m.cnpj || !d.emitCnpj);
        const ambos = porValor.filter((m) => porNome.includes(m));
        if (ambos.length) return { m: ambos, como: 'número + valor + nome do fornecedor', exato: !d.emitCnpj || ambos.some((m) => !m.cnpj) };
        if (semCnpj(porValor).length) return { m: semCnpj(porValor), como: 'número + valor', exato: false };
        if (semCnpj(porNome).length) return { m: semCnpj(porNome), como: 'número + nome do fornecedor', exato: false };
      }
      return null;
    }

    const resultado = [];
    const movsUsados = new Set();
    for (const d of docs) {
      // Período: pela data de emissão; sem data, usa o mês da chave.
      let noPeriodo, dataAproximada = false;
      if (d.dataEmissao) noPeriodo = dentro(d.dataEmissao, iniNotas, params.fim);
      else if (d.anoMesChave) { noPeriodo = d.anoMesChave >= iniNotas.slice(0, 7) && d.anoMesChave <= params.fim.slice(0, 7); dataAproximada = true; }
      else noPeriodo = null; // sem data: entra como "conferir manualmente"
      if (noPeriodo === false) continue;

      const r = { doc: d, status: '', movimento: null, como: '', observacao: '' };
      const achou = (d.numero || d.chave) ? procurar(d) : null;
      if (achou) achou.m.forEach((m) => movsUsados.add(m));
      const raizEmit = (d.emitCnpj || '').slice(0, 8);
      const raizDest = (d.destCnpj || '').slice(0, 8);

      if (d.cancelada) { r.status = STATUS.CANCELADA; r.observacao = 'Nota cancelada pelo emitente (evento/situação no XML).'; }
      else if (raizes.length && raizEmit && raizes.includes(raizEmit)) { r.status = STATUS.EMITIDA; r.observacao = 'Nota emitida pela própria empresa (saída).'; }
      else if (achou) {
        const noPer = achou.m.find((m) => dentro(dataMov(m), params.inicio, params.fim)) || achou.m[0];
        r.movimento = noPer; r.como = achou.como;
        if (!achou.exato) { r.status = STATUS.PROVAVEL; r.observacao = `Encontrada por ${achou.como}. Confirme.`; }
        else if (dentro(dataMov(noPer), params.inicio, params.fim) || !dataMov(noPer)) r.status = STATUS.RECEBIDA;
        else { r.status = STATUS.FORA; r.observacao = `Lançada em ${U.fmtData(dataMov(noPer))} (movimento ${noPer.tipoMov} nº ${noPer.numero}).`; }
        if (r.status !== STATUS.PROVAVEL && noPer.valor != null && d.valor != null && !valorBate(noPer.valor, d.valor))
          r.observacao = (r.observacao ? r.observacao + ' ' : '') + `Valor diferente: nota ${U.fmtMoeda(d.valor)} x TOTVS ${U.fmtMoeda(noPer.valor)}.`;
      } else if (raizes.length && raizDest && !raizes.includes(raizDest) && d.confianca === 'alta') {
        r.status = STATUS.OUTRO_DEST; r.observacao = `Destinatário/tomador é outro CNPJ (${U.fmtCNPJ(d.destCnpj)}).`;
      } else if (!d.numero || noPeriodo === null || d.confianca === 'baixa' && !d.emitCnpj) {
        r.status = STATUS.MANUAL;
        r.observacao = [noPeriodo === null ? 'Data de emissão não identificada.' : '', ...(d.avisos || [])].filter(Boolean).join(' ');
      } else {
        r.status = STATUS.NAO;
        r.observacao = [dataAproximada ? 'Data aproximada (mês da chave de acesso).' : '', d.confianca !== 'alta' ? 'Dados lidos do PDF/imagem.' : ''].filter(Boolean).join(' ');
      }
      resultado.push(r);
    }

    // Movimentos no período sem documento na pasta (conferência inversa).
    const semDocumento = movs.filter((m) => dentro(dataMov(m), params.inicio, params.fim) && !movsUsados.has(m));

    const ordem = [STATUS.NAO, STATUS.MANUAL, STATUS.PROVAVEL, STATUS.FORA, STATUS.RECEBIDA, STATUS.OUTRO_DEST, STATUS.EMITIDA, STATUS.CANCELADA];
    resultado.sort((a, b) => ordem.indexOf(a.status) - ordem.indexOf(b.status) || (a.doc.dataEmissao || '').localeCompare(b.doc.dataEmissao || '') || (a.doc.emitNome || '').localeCompare(b.doc.emitNome || ''));

    const contar = (s) => resultado.filter((r) => r.status === s).length;
    const resumo = {
      notas: resultado.length,
      recebidas: contar(STATUS.RECEBIDA), fora: contar(STATUS.FORA), provaveis: contar(STATUS.PROVAVEL),
      naoRecebidas: contar(STATUS.NAO), manuais: contar(STATUS.MANUAL),
      outras: contar(STATUS.CANCELADA) + contar(STATUS.EMITIDA) + contar(STATUS.OUTRO_DEST),
      semDocumento: semDocumento.length, movimentosConsiderados: movs.length,
      valorNaoRecebido: resultado.filter((r) => r.status === STATUS.NAO).reduce((s, r) => s + (r.doc.valor || 0), 0)
    };
    return { resultado, semDocumento, resumo, params };
  }

  return { conferir, unificar, STATUS };
})();
