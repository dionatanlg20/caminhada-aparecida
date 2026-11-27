/* Lê o relatório de movimentos da TOTVS RM (Excel, CSV ou TXT)
   e, no futuro, a API de movimentos (ver API-FUTURA.md). */
window.CN = window.CN || {};

CN.totvs = (function () {
  const U = CN.util;

  function decodificarTexto(dados) {
    let t = new TextDecoder('utf-8').decode(dados);
    if (t.includes('�')) t = new TextDecoder('windows-1252').decode(dados);
    return t.replace(/^﻿/, '');
  }

  function linhasCsv(texto) {
    const amostra = texto.split(/\r?\n/).slice(0, 20).join('\n');
    const delims = [';', '\t', ',', '|'];
    const delim = delims.map((d) => [d, (amostra.match(new RegExp('\\' + d, 'g')) || []).length]).sort((a, b) => b[1] - a[1])[0][0];
    const linhas = []; let campo = '', linha = [], aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (aspas) {
        if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
      } else if (c === '"') aspas = true;
      else if (c === delim) { linha.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        linha.push(campo); linhas.push(linha); linha = []; campo = '';
      } else campo += c;
    }
    if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
    return linhas;
  }

  /** Lê o arquivo e devolve { abas: [{nome, linhas}] } */
  function lerArquivo(dados, nome) {
    const e = (nome.split('.').pop() || '').toLowerCase();
    if (e === 'csv' || e === 'txt') return { abas: [{ nome: nome, linhas: linhasCsv(decodificarTexto(dados)) }] };
    const wb = XLSX.read(dados, { type: 'array', cellDates: true, dense: false });
    return {
      abas: wb.SheetNames.map((n) => ({ nome: n, linhas: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) }))
    };
  }

  function pontuar(cab, sinonimos) {
    const c = U.normCabecalho(cab);
    if (!c) return 0;
    const cc = c.replace(/\s|\//g, '');
    let melhor = 0;
    sinonimos.forEach((s, i) => {
      const sn = U.normCabecalho(s);
      const sc = sn.replace(/\s|\//g, '');
      const peso = 1 - i / (sinonimos.length * 2); // sinônimos do início valem mais
      if (c === sn || cc === sc) melhor = Math.max(melhor, 3 * peso);
      else if (sn.length > 3 && (c.startsWith(sn + ' ') || c.endsWith(' ' + sn) || c.includes(' ' + sn + ' '))) melhor = Math.max(melhor, 1.5 * peso);
    });
    return melhor;
  }

  /** Encontra a linha de cabeçalho e sugere qual coluna é cada campo. */
  function detectarColunas(linhas) {
    const S = CN.config.colunasTotvs;
    let melhor = { linha: 0, nota: -1 };
    for (let r = 0; r < Math.min(40, linhas.length); r++) {
      const row = linhas[r] || [];
      let nota = 0;
      row.forEach((cel) => { if (typeof cel === 'string' && cel.trim()) { const m = Math.max(...Object.values(S).map((s) => pontuar(cel, s))); if (m > 0) nota += 1 + m / 3; } });
      if (nota > melhor.nota) melhor = { linha: r, nota };
    }
    const cab = (linhas[melhor.linha] || []).map((c) => String(c == null ? '' : c).trim());
    // Atribuição gulosa: maior pontuação primeiro, cada coluna uma vez.
    const pares = [];
    Object.entries(S).forEach(([campo, sin]) => cab.forEach((c, i) => { const p = pontuar(c, sin); if (p > 0) pares.push({ campo, i, p }); }));
    pares.sort((a, b) => b.p - a.p);
    const mapa = {}; const usadas = new Set();
    for (const { campo, i } of pares) { if (mapa[campo] == null && !usadas.has(i)) { mapa[campo] = i; usadas.add(i); } }
    return { linhaCabecalho: melhor.linha, cabecalho: cab, mapa };
  }

  const ehCancelado = (s) => /^(C|CANCELADO|CANCELADA|CANC)$/i.test(String(s || '').trim());

  /** Converte as linhas em movimentos padronizados. */
  function montarMovimentos(linhas, linhaCabecalho, mapa) {
    const pegar = (row, campo) => (mapa[campo] == null || mapa[campo] === '' ? '' : row[mapa[campo]]);
    const out = [];
    for (let r = linhaCabecalho + 1; r < linhas.length; r++) {
      const row = linhas[r];
      if (!row || row.every((c) => c === '' || c == null)) continue;
      const numero = U.numNota(pegar(row, 'numero'));
      const chave = U.soDigitos(pegar(row, 'chave'));
      if (!numero && !chave) continue; // linha de total / subtítulo
      const tipoBruto = String(pegar(row, 'tipoMov') || '').trim();
      out.push({
        linha: r + 1,
        tipoMov: tipoBruto,
        tipoMovNorm: normTipo(tipoBruto),
        numero: numero || (chave.length === 44 ? U.dadosDaChave(chave).numero : ''),
        serie: String(pegar(row, 'serie') || '').trim(),
        dataEmissao: U.parseData(pegar(row, 'dataEmissao')),
        dataEntrada: U.parseData(pegar(row, 'dataEntrada')),
        cnpj: U.soDigitos(pegar(row, 'cnpj')),
        fornecedor: String(pegar(row, 'fornecedor') || '').trim(),
        codFornecedor: String(pegar(row, 'codFornecedor') || '').trim(),
        valor: U.parseValor(pegar(row, 'valor')),
        chave: chave.length === 44 || chave.length === 50 ? chave : '',
        idmov: String(pegar(row, 'idmov') || '').trim(),
        cancelado: ehCancelado(pegar(row, 'status'))
      });
    }
    return out;
  }

  // "1.2.06", "1206", "1.2.06 - Entrada de serviço" -> "1.2.06"
  function normTipo(s) {
    const t = String(s || '').trim();
    let m = t.match(/\d+\.\d+\.\d+/);
    if (m) return m[0].split('.').map((p, i) => (i === 2 ? p.padStart(2, '0') : String(+p))).join('.');
    m = t.match(/^(\d)(\d)(\d{2})\b/);
    if (m) return `${m[1]}.${m[2]}.${m[3]}`;
    return t.toUpperCase();
  }

  /** Busca na API (quando o Dalvino publicar). Formato em API-FUTURA.md. */
  async function buscarApi(urlBase, { inicio, fim, tipos, base, token }) {
    const u = new URL(urlBase.replace(/\/+$/, '') + '/movimentos');
    u.searchParams.set('inicio', inicio); u.searchParams.set('fim', fim);
    u.searchParams.set('base', base); if (tipos && tipos.length) u.searchParams.set('tipos', tipos.join(','));
    const resp = await fetch(u, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    if (!resp.ok) throw new Error(`A API respondeu ${resp.status}.`);
    const json = await resp.json();
    const lista = Array.isArray(json) ? json : json.movimentos || [];
    return lista.map((m, i) => ({
      linha: i + 1, tipoMov: m.tipoMovimento || '', tipoMovNorm: normTipo(m.tipoMovimento), numero: U.numNota(m.numero),
      serie: m.serie || '', dataEmissao: U.parseData(m.dataEmissao), dataEntrada: U.parseData(m.dataEntrada),
      cnpj: U.soDigitos(m.cnpjFornecedor), fornecedor: m.nomeFornecedor || '', codFornecedor: m.codFornecedor || '',
      valor: U.parseValor(m.valor), chave: U.soDigitos(m.chaveAcesso), idmov: String(m.idmov || ''), cancelado: !!m.cancelado
    }));
  }

  return { lerArquivo, detectarColunas, montarMovimentos, normTipo, buscarApi };
})();
