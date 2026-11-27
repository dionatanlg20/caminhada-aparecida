/* Lê PDFs de DANFE (NF-e), DANFSe / NFS-e municipal e CT-e.
   Um PDF pode ter várias notas (ex.: um ano inteiro): cada página é lida,
   e páginas da mesma nota são agrupadas. */
window.CN = window.CN || {};

CN.parserPdf = (function () {
  const U = CN.util;
  const RE_DINHEIRO = /^-?(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}$/;
  const RE_DINHEIRO_G = /(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}/g;
  const RE_DATA = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;
  const RE_CNPJ_G = /\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g;

  function configurarPdfjs() {
    if (window.pdfjsLib && !configurarPdfjs.ok) {
      // O worker é carregado na própria página (funciona abrindo o HTML direto do disco).
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
      configurarPdfjs.ok = true;
    }
  }

  async function textoDaPagina(pagina) {
    const tc = await pagina.getTextContent();
    const itens = tc.items.filter((i) => i.str && i.str.trim()).map((i) => ({
      str: i.str.trim(), n: U.normTexto(i.str), x: i.transform[4], y: i.transform[5], w: i.width || i.str.length * 4, h: Math.abs(i.transform[3]) || 8
    }));
    // Monta linhas por posição vertical.
    const ord = [...itens].sort((a, b) => b.y - a.y || a.x - b.x);
    const linhas = [];
    for (const it of ord) {
      const l = linhas[linhas.length - 1];
      if (l && Math.abs(l.y - it.y) < 3) l.itens.push(it); else linhas.push({ y: it.y, itens: [it] });
    }
    const texto = linhas.map((l) => l.itens.sort((a, b) => a.x - b.x).map((i) => i.str).join(' ')).join('\n');
    return { itens, texto };
  }

  // Valor perto de um rótulo: à direita na mesma linha ou logo abaixo, na mesma coluna.
  function valorPerto(itens, rotulos, teste, { abaixoMax = 40 } = {}) {
    for (const rot of rotulos) {
      const labels = itens.filter((i) => i.n.includes(rot));
      for (const lb of labels) {
        // Mesmo item: "VALOR TOTAL: 1.234,56"
        const resto = lb.str.slice(lb.n.indexOf(rot) + rot.length).replace(/^[\s:.\-–]+/, '');
        const r1 = teste(resto); if (r1) return r1;
        const cand = [];
        for (const it of itens) {
          if (it === lb) continue;
          const dy = lb.y - it.y; // positivo = abaixo
          const direita = Math.abs(dy) < 3 && it.x >= lb.x + lb.w - 2 && it.x - (lb.x + lb.w) < 220;
          const abaixo = dy > 2 && dy < abaixoMax && it.x < lb.x + Math.max(lb.w, 60) + 10 && it.x + it.w > lb.x - 15;
          if (!direita && !abaixo) continue;
          const v = teste(it.str); if (!v) continue;
          cand.push({ v, dist: direita ? it.x - lb.x : dy * 3 + Math.abs(it.x - lb.x) * 0.2 });
        }
        if (cand.length) return cand.sort((a, b) => a.dist - b.dist)[0].v;
      }
    }
    return null;
  }

  const testeDinheiro = (s) => { const m = String(s).match(RE_DINHEIRO_G); return m && RE_DINHEIRO.test(m[0].trim()) ? U.parseValor(m[0]) : null; };
  const testeData = (s) => { const m = String(s).match(RE_DATA); return m ? U.parseData(m[0]) : null; };
  const testeNumero = (s) => { const m = String(s).trim().match(/^(?:N[º°O.]*\s*)?(\d{1,15}(?:\.\d{3})*)$/i); return m ? U.numNota(m[1]) : null; };
  const testeNome = (s) => { const t = String(s).trim(); return t.length > 3 && /[A-Za-zÀ-ú]{3}/.test(t) && !/^(CNPJ|CPF|INSCRI|ENDERE|MUNIC|NOME|RAZAO|RAZÃO)/i.test(t) ? t : null; };

  function chavesNoTexto(texto) {
    const out = { nfe: null, nfse: null };
    const blocos = texto.match(/\d[\d .]{42,80}\d/g) || [];
    for (const b of blocos) {
      const dig = U.soDigitos(b);
      if (!out.nfe) for (let i = 0; i + 44 <= dig.length; i++) { const s = dig.slice(i, i + 44); if (U.chaveNFeValida(s) && ['55', '57', '65'].includes(s.slice(20, 22))) { out.nfe = s; break; } }
      if (!out.nfse && dig.length === 50) { const c = U.dadosChaveNFSe(dig); if (c && U.cnpjValido(c.cnpj)) out.nfse = dig; }
    }
    return out;
  }

  function cnpjsNoTexto(texto) {
    const vistos = [];
    (texto.match(RE_CNPJ_G) || []).forEach((c) => { const d = U.soDigitos(c); if (U.cnpjValido(d) && !vistos.includes(d)) vistos.push(d); });
    return vistos;
  }

  /** Extrai os dados de uma página. */
  function analisarPagina({ itens, texto }, ctx) {
    const N = U.normTexto(texto);
    const r = { temTexto: texto.replace(/\s/g, '').length > 30, cnpjsTexto: [], chave: '', tipo: '', numero: '', serie: '', dataEmissao: null, emitCnpj: '', emitNome: '', destCnpj: '', valor: null, folha: null };
    const ch = chavesNoTexto(texto);
    const ehNfse = /NFS-?E|NOTA FISCAL (ELETRONICA )?DE SERVICO|PRESTADOR DE SERVICO|DANFSE/.test(N) && !/DANFE\b/.test(N);
    const ehCte = /DACTE|CONHECIMENTO DE TRANSPORTE/.test(N);

    if (ch.nfe && !ehNfse) {
      const c = U.dadosDaChave(ch.nfe);
      Object.assign(r, { chave: ch.nfe, modelo: c.modelo, tipo: c.modelo === '57' ? 'CT-e' : c.modelo === '65' ? 'NFC-e' : 'NF-e', numero: c.numero, serie: c.serie, emitCnpj: c.cnpj, anoMesChave: `${c.ano}-${String(c.mes).padStart(2, '0')}` });
    } else if (ch.nfse) {
      const c = U.dadosChaveNFSe(ch.nfse);
      Object.assign(r, { chave: ch.nfse, modelo: 'NFSe', tipo: 'NFS-e', numero: c.numero, emitCnpj: c.cnpj, anoMesChave: `${c.ano}-${String(c.mes).padStart(2, '0')}` });
    } else if (ehNfse) {
      r.tipo = 'NFS-e'; r.modelo = 'NFSe';
    } else if (ehCte) { r.tipo = 'CT-e'; r.modelo = '57'; }
    else if (/DANFE|NOTA FISCAL ELETRONICA/.test(N)) { r.tipo = 'NF-e'; r.modelo = '55'; }

    // Número (quando não veio da chave)
    if (!r.numero) {
      r.numero = valorPerto(itens, ['NUMERO DA NFS-E', 'NUMERO DA NFSE', 'NUMERO DA NOTA', 'N DA NOTA', 'Nº DA NOTA', 'NUMERO NFS-E', 'NFS-E N', 'NUMERO DO DOCUMENTO', 'NUMERO'], testeNumero) || '';
      if (!r.numero) {
        const m = N.match(/(?:NUMERO DA NFS-?E|NUMERO DA NOTA(?: FISCAL)?|NFS-?E\s*N[º°O.]*|NOTA FISCAL[^\n]{0,40}N[º°O.]+)\s*[:\-]?\s*(\d[\d.]{0,14})/);
        if (m) r.numero = U.numNota(m[1]);
      }
    }
    // Data de emissão
    r.dataEmissao = valorPerto(itens, ['DATA DA EMISSAO', 'DATA DE EMISSAO', 'DATA E HORA DA EMISSAO', 'DATA/HORA DA EMISSAO', 'DATA HORA EMISSAO', 'EMISSAO DA NFS-E', 'DATA EMISSAO', 'EMISSAO'], testeData);
    if (!r.dataEmissao) {
      const m = N.match(/EMISS[AÃ]O[^\d\n]{0,30}(\d{2}\/\d{2}\/\d{4})/);
      if (m) r.dataEmissao = U.parseData(m[1]);
    }
    // Valor total
    r.valor = valorPerto(itens, r.tipo === 'NFS-e'
      ? ['VALOR TOTAL DA NFS-E', 'VALOR TOTAL DA NOTA', 'VALOR TOTAL DO SERVICO', 'VALOR TOTAL DOS SERVICOS', 'VALOR DO SERVICO', 'VALOR DOS SERVICOS', 'VALOR BRUTO', 'VALOR TOTAL', 'VALOR LIQUIDO']
      : r.tipo === 'CT-e' ? ['VALOR TOTAL DO SERVICO', 'VALOR TOTAL DA PRESTACAO', 'VALOR TOTAL']
        : ['VALOR TOTAL DA NOTA', 'V. TOTAL DA NOTA', 'VALOR TOTAL DA NF', 'VALOR TOTAL'], testeDinheiro);
    if (r.valor == null) {
      const m = N.match(/VALOR (?:TOTAL|DOS SERVICOS|DO SERVICO|LIQUIDO)[^\d\n]{0,40}(\d{1,3}(?:\.\d{3})*,\d{2})/);
      if (m) r.valor = U.parseValor(m[1]);
    }
    // Emitente / prestador
    const m = texto.match(/RECEBEMOS DE\s+(.+?)\s+OS PRODUTOS/i);
    if (m) r.emitNome = m[1].trim();
    if (!r.emitNome) {
      const prest = itens.filter((i) => /PRESTADOR|EMITENTE/.test(i.n)).sort((a, b) => b.y - a.y)[0];
      const abaixoDo = prest ? itens.filter((i) => i.y <= prest.y + 2) : itens;
      r.emitNome = valorPerto(abaixoDo, ['NOME/RAZAO SOCIAL', 'NOME / RAZAO SOCIAL', 'RAZAO SOCIAL', 'NOME EMPRESARIAL', 'NOME'], testeNome, { abaixoMax: 30 }) || '';
    }
    // CNPJs: emitente = primeiro que não é da empresa; destinatário = o da empresa.
    const cnpjs = cnpjsNoTexto(texto);
    r.cnpjsTexto = cnpjs;
    const raizes = ctx.raizesEmpresa || [];
    const daEmpresa = cnpjs.find((c) => raizes.includes(c.slice(0, 8)));
    if (daEmpresa) r.destCnpj = daEmpresa;
    if (!r.emitCnpj) {
      const outros = cnpjs.filter((c) => !raizes.includes(c.slice(0, 8)));
      r.emitCnpj = outros[0] || (raizes.length ? '' : cnpjs[0] || '');
      if (!raizes.length && cnpjs[1]) r.destCnpj = cnpjs[1];
    } else if (!r.destCnpj) {
      r.destCnpj = cnpjs.find((c) => c !== r.emitCnpj) || '';
    }
    const f = N.match(/FOLHA\s*(\d+)\s*(?:\/|DE)\s*(\d+)/);
    if (f) r.folha = [+f[1], +f[2]];
    return r;
  }

  const identidade = (r) => r.chave || (r.emitCnpj && r.numero ? `${r.emitCnpj}|${r.numero}` : r.numero ? `?|${r.numero}` : '');

  /** Lê um PDF e devolve uma lista de documentos (uma nota por grupo de páginas). */
  async function lerPdf(entrada, ctx, aoProgresso) {
    configurarPdfjs();
    let pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: entrada.dados.slice(), isEvalSupported: false, disableFontFace: true, verbosity: 0 }).promise;
    } catch (e) {
      const msg = /password/i.test(e && e.name + e.message) ? 'PDF protegido por senha.' : 'PDF inválido: ' + (e.message || e);
      return { documentos: [], aviso: msg };
    }
    const paginas = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const pg = await pdf.getPage(p);
      const t = await textoDaPagina(pg);
      let r = analisarPagina(t, ctx);
      if (!r.temTexto) {
        // Página escaneada: tenta o código de barras.
        const lido = await barrasDaPagina(pg);
        if (lido) {
          const d = { avisos: [] }; CN.codigoBarras.preencherPelaChave(d, lido);
          r = Object.assign(r, { chave: d.chave, tipo: d.tipo, modelo: d.modelo, numero: d.numero, serie: d.serie, emitCnpj: d.emitCnpj, anoMesChave: d.anoMesChave, porBarras: true });
        }
      }
      paginas.push(r);
      pg.cleanup();
      if (aoProgresso && (p % 3 === 0 || p === pdf.numPages)) aoProgresso(p, pdf.numPages);
      if (p % 4 === 0) await U.esperar();
    }
    await pdf.destroy();

    // Agrupa páginas consecutivas da mesma nota.
    const grupos = [];
    paginas.forEach((r, i) => {
      const id = identidade(r);
      const atual = grupos[grupos.length - 1];
      const continuacao = r.folha && r.folha[0] > 1;
      if (atual && (!id || id === atual.id || (continuacao && !r.chave))) { atual.paginas.push(i); mesclar(atual.dados, r); }
      else grupos.push({ id, paginas: [i], dados: { ...r } });
    });

    const documentos = grupos.map((g) => {
      const r = g.dados;
      const d = {
        tipo: r.tipo || 'Não identificado', modelo: r.modelo || '', chave: r.chave, numero: r.numero, serie: r.serie,
        dataEmissao: r.dataEmissao, anoMesChave: r.anoMesChave, emitCnpj: r.emitCnpj, emitNome: r.emitNome,
        destCnpj: r.destCnpj, destNome: '', valor: r.valor, cnpjsTexto: r.cnpjsTexto, cnpjDaChave: !!r.chave, fonte: 'PDF', origem: entrada,
        paginas: g.paginas, totalPaginasArquivo: paginas.length, avisos: [], itens: []
      };
      d.confianca = r.chave && !r.porBarras ? 'alta' : (d.numero && d.emitCnpj ? 'media' : 'baixa');
      if (!r.temTexto && !r.porBarras) d.avisos.push('Página sem texto (escaneada) e sem código de barras legível. Conferir manualmente.');
      else if (r.porBarras) d.avisos.push('Página escaneada: dados lidos do código de barras.');
      if (!d.numero) d.avisos.push('Número da nota não encontrado no PDF.');
      if (!d.emitCnpj) d.avisos.push('CNPJ do fornecedor não encontrado no PDF.');
      if (!d.dataEmissao) d.avisos.push('Data de emissão não encontrada no PDF.');
      return d;
    });
    return { documentos, aviso: '' };
  }

  function mesclar(a, b) {
    for (const k of ['chave', 'tipo', 'modelo', 'numero', 'serie', 'dataEmissao', 'emitCnpj', 'emitNome', 'destCnpj', 'anoMesChave']) if (!a[k] && b[k]) a[k] = b[k];
    if (a.valor == null && b.valor != null) a.valor = b.valor;
    a.temTexto = a.temTexto || b.temTexto;
    (b.cnpjsTexto || []).forEach((c) => { if (!a.cnpjsTexto.includes(c)) a.cnpjsTexto.push(c); });
  }

  // Página escaneada: primeiro lê as imagens embutidas na resolução original
  // (redimensionar borra o código de barras); depois tenta renderizar a página.
  async function barrasDaPagina(pg) {
    try {
      const ops = await pg.getOperatorList();
      const O = pdfjsLib.OPS;
      for (let i = 0; i < ops.fnArray.length; i++) {
        if (ops.fnArray[i] !== O.paintImageXObject && ops.fnArray[i] !== O.paintJpegXObject) continue;
        const nome = ops.argsArray[i][0];
        const img = await new Promise((ok) => { try { pg.objs.get(nome, ok); } catch (e) { ok(null); } });
        const c = canvasDaImagem(img);
        if (!c || c.width < 300) continue;
        const r = CN.codigoBarras.lerChaveDoCanvas(c);
        if (r) return r.chave;
      }
    } catch (e) { /* segue para a renderização */ }
    for (const escala of [2.78, 4.17, 2]) { // ~200, 300 e 144 dpi
      try {
        const vp = pg.getViewport({ scale: escala });
        const c = document.createElement('canvas');
        c.width = Math.round(vp.width); c.height = Math.round(vp.height);
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        await pg.render({ canvasContext: ctx, viewport: vp }).promise;
        const r = CN.codigoBarras.lerChaveDoCanvas(c);
        if (r) return r.chave;
      } catch (e) { /* tenta a próxima escala */ }
    }
    return null;
  }

  function canvasDaImagem(img) {
    if (!img) return null;
    const w = img.width, h = img.height;
    if (!w || !h) return null;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if (img.bitmap) { ctx.drawImage(img.bitmap, 0, 0); return c; }
    if (!img.data) return null;
    const out = ctx.createImageData(w, h), d = img.data, o = out.data;
    if (img.kind === 3) o.set(d.subarray(0, o.length));
    else if (img.kind === 2) { for (let i = 0, j = 0; j < o.length; i += 3, j += 4) { o[j] = d[i]; o[j + 1] = d[i + 1]; o[j + 2] = d[i + 2]; o[j + 3] = 255; } }
    else if (img.kind === 1) {
      const linha = (w + 7) >> 3;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const bit = (d[y * linha + (x >> 3)] >> (7 - (x & 7))) & 1, v = bit ? 255 : 0, j = (y * w + x) * 4;
        o[j] = o[j + 1] = o[j + 2] = v; o[j + 3] = 255;
      }
    } else return null;
    ctx.putImageData(out, 0, 0);
    return c;
  }

  return { lerPdf, analisarPagina, textoDaPagina, configurarPdfjs };
})();
