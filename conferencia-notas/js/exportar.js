/* Gera o relatório (Excel e PDF), o PDF de cada nota não recebida e o pacote ZIP. */
window.CN = window.CN || {};

CN.exportar = (function () {
  const U = CN.util;
  const S = () => CN.conferencia.STATUS;
  const AZUL = 'FF1F3864';
  const AZUL_RGB = [31, 56, 100];

  // ---------- Logo ----------
  // Logo oficial da Atom (logo.js). Não há logo alternativo.
  function logoDataUrl() { return window.ATOM_LOGO; }
  async function tamanhoImagem(url) {
    const img = new Image(); await new Promise((ok) => { img.onload = ok; img.onerror = ok; img.src = url; });
    return { w: img.naturalWidth || 3, h: img.naturalHeight || 1 };
  }
  const formatoImg = (url) => (/^data:image\/jpe?g/i.test(url) ? 'JPEG' : 'PNG');

  // ---------- Nomes ----------
  function siglaTipo(d) {
    if (d.modelo === 'NFSe' || /NFS/.test(d.tipo)) return 'NFS-e';
    if (d.modelo === '57') return 'CT-e';
    if (d.modelo === '65') return 'NFC-e';
    return 'NF';
  }
  function nomeBase(d) {
    const forn = d.emitNome || (d.emitCnpj ? 'CNPJ ' + U.fmtCNPJ(d.emitCnpj).replace(/\//g, '-') : 'Fornecedor não identificado');
    const data = d.dataEmissao ? 'emissao ' + U.fmtData(d.dataEmissao).replace(/\//g, '-') : d.anoMesChave ? 'emissao ' + d.anoMesChave.split('-').reverse().join('-') : 'sem data';
    return U.nomeArquivoSeguro(`${siglaTipo(d)} ${d.numero || 'sem numero'} - ${forn} - ${data}`);
  }

  const colunasNotas = [
    { t: 'Item', k: (r, i) => i + 1, w: 6 },
    { t: 'Fornecedor', k: (r) => r.doc.emitNome || '', w: 40 },
    { t: 'CNPJ', k: (r) => U.fmtCNPJ(r.doc.emitCnpj), w: 20 },
    { t: 'Tipo', k: (r) => r.doc.tipo, w: 10 },
    { t: 'Nº da nota', k: (r) => r.doc.numero, w: 12 },
    { t: 'Série', k: (r) => r.doc.serie || '', w: 7 },
    { t: 'Emissão', k: (r) => (r.doc.dataEmissao ? U.fmtData(r.doc.dataEmissao) : r.doc.anoMesChave ? r.doc.anoMesChave.split('-').reverse().join('/') : ''), w: 12 },
    { t: 'Valor (R$)', k: (r) => r.doc.valor, w: 15, moeda: true },
    { t: 'Chave de acesso', k: (r) => r.doc.chave || '', w: 50 },
    { t: 'Arquivo de origem', k: (r) => r.doc.anexos.map((a) => a.origem.caminho + (a.paginas && a.totalPaginasArquivo > 1 ? ` (pág. ${a.paginas.map((p) => p + 1).join(', ')})` : '')).join(' | '), w: 50 },
    { t: 'Observação', k: (r) => r.observacao || '', w: 45 }
  ];
  const colunaStatus = { t: 'Situação', k: (r) => r.status, w: 24 };
  const colunasTotvs = [
    { t: 'Movimento TOTVS', k: (r) => (r.movimento ? `${r.movimento.tipoMov} nº ${r.movimento.numero}` : ''), w: 18 },
    { t: 'Entrada TOTVS', k: (r) => (r.movimento && r.movimento.dataEntrada ? U.fmtData(r.movimento.dataEntrada) : ''), w: 13 },
    { t: 'Como foi encontrada', k: (r) => r.como || '', w: 28 }
  ];

  // ---------- Excel ----------
  async function gerarExcel(conf) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Conferência de Notas x TOTVS RM';
    const logo = logoDataUrl();
    const idLogo = wb.addImage({ base64: logo, extension: formatoImg(logo).toLowerCase() === 'jpeg' ? 'jpeg' : 'png' });
    const tam = await tamanhoImagem(logo);
    const periodo = `${U.fmtData(conf.params.inicio)} a ${U.fmtData(conf.params.fim)}`;

    function aba(nome, titulo, colunas, linhas, opcoes = {}) {
      const ws = wb.addWorksheet(nome, { views: [{ state: 'frozen', ySplit: 3, showGridLines: false, zoomScale: 90 }] });
      ws.columns = colunas.map((c) => ({ width: c.w }));
      const ult = colunas.length;
      ws.mergeCells(1, 1, 1, ult);
      const t = ws.getCell(1, 1);
      t.value = titulo; t.font = { size: 18, bold: true, color: { argb: AZUL } }; t.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 48;
      ws.addImage(idLogo, { tl: { col: 0.15, row: 0.15 }, ext: { width: Math.round(40 * tam.w / tam.h), height: 40 } });
      ws.mergeCells(2, 1, 2, ult);
      const s = ws.getCell(2, 1);
      s.value = opcoes.subtitulo || `Período: ${periodo}   •   Gerado em ${new Date().toLocaleString('pt-BR')}`;
      s.font = { size: 10, italic: true, color: { argb: 'FF555555' } }; s.alignment = { horizontal: 'center' };
      const cab = ws.getRow(3);
      colunas.forEach((c, i) => {
        const cel = cab.getCell(i + 1);
        cel.value = c.t; cel.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
        cel.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        cel.border = { top: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
      });
      cab.height = 32;
      linhas.forEach((r, i) => {
        const row = ws.addRow(colunas.map((c) => c.k(r, i)));
        row.eachCell({ includeEmpty: true }, (cel, n) => {
          cel.alignment = { vertical: 'top', wrapText: true };
          cel.border = { left: { style: 'thin' }, right: { style: 'thin' }, bottom: { style: 'hair' } };
          if (colunas[n - 1] && colunas[n - 1].moeda) cel.numFmt = '"R$" #,##0.00';
        });
        if (opcoes.cor) { const cor = opcoes.cor(r); if (cor) row.eachCell({ includeEmpty: true }, (cel) => { cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } }; }); }
      });
      if (linhas.length) ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3 + linhas.length, column: ult } };
      if (opcoes.total) {
        const row = ws.addRow(colunas.map((c, i) => (i === 0 ? 'Total' : c.moeda ? linhas.reduce((s, r) => s + (c.k(r) || 0), 0) : '')));
        row.font = { bold: true };
        row.eachCell((cel, n) => { if (colunas[n - 1].moeda) cel.numFmt = '"R$" #,##0.00'; cel.border = { top: { style: 'thin' } }; });
      }
      return ws;
    }

    const nao = conf.resultado.filter((r) => r.status === S().NAO);
    aba('Não recebidas', 'Notas fiscais NÃO recebidas na TOTVS', colunasNotas, nao, { total: true });
    const manuais = conf.resultado.filter((r) => r.status === S().MANUAL || r.status === S().PROVAVEL);
    aba('Conferir', 'Notas para conferência manual', [...colunasNotas.slice(0, 1), colunaStatus, ...colunasNotas.slice(1), ...colunasTotvs], manuais);
    const cores = { [S().NAO]: 'FFFDE2E1', [S().MANUAL]: 'FFFFF4D6', [S().PROVAVEL]: 'FFFFF4D6', [S().FORA]: 'FFE8F0FB' };
    aba('Todas as notas', 'Todas as notas do período e a situação na TOTVS', [...colunasNotas.slice(0, 1), colunaStatus, ...colunasNotas.slice(1), ...colunasTotvs], conf.resultado, { cor: (r) => cores[r.status] });
    aba('TOTVS sem documento', 'Movimentos de entrada na TOTVS sem nota na pasta', [
      { t: 'Item', k: (m, i) => i + 1, w: 6 }, { t: 'Tipo de movimento', k: (m) => m.tipoMov, w: 16 },
      { t: 'Nº', k: (m) => m.numero, w: 12 }, { t: 'Série', k: (m) => m.serie, w: 7 },
      { t: 'Fornecedor', k: (m) => m.fornecedor, w: 40 }, { t: 'CNPJ', k: (m) => U.fmtCNPJ(m.cnpj), w: 20 },
      { t: 'Emissão', k: (m) => U.fmtData(m.dataEmissao), w: 12 }, { t: 'Entrada', k: (m) => U.fmtData(m.dataEntrada), w: 12 },
      { t: 'Valor (R$)', k: (m) => m.valor, w: 15, moeda: true }, { t: 'IDMOV', k: (m) => m.idmov, w: 12 },
      { t: 'Linha no relatório', k: (m) => m.linha, w: 10 }
    ], conf.semDocumento, { total: true, subtitulo: `Período: ${periodo} — lançados na TOTVS, mas a nota não foi encontrada na pasta.` });

    const p = conf.params, r = conf.resumo;
    const ws = wb.addWorksheet('Parâmetros', { views: [{ showGridLines: false }] });
    ws.columns = [{ width: 42 }, { width: 70 }];
    [
      ['Período', periodo],
      ['Notas consideradas por', 'Data de emissão' + (p.margemDias ? ` (incluindo ${p.margemDias} dias antes do início)` : '')],
      ['Período dos movimentos TOTVS por', p.baseMov === 'emissao' ? 'Data de emissão' : 'Data de entrada (lançamento)'],
      ['Tipos de movimento', [...(p.tipos || [])].join(', ') || 'Todos'],
      ['CNPJ(s) da empresa', (p.cnpjsEmpresa || []).map(U.fmtCNPJ).join(', ') || 'Não informado'],
      ['Relatório TOTVS', p.arquivoTotvs || ''],
      [''],
      ['Notas no período', r.notas], ['Recebidas', r.recebidas], ['Recebidas fora do período', r.fora],
      ['Provavelmente recebidas (confirmar)', r.provaveis], ['NÃO recebidas', r.naoRecebidas],
      ['Valor total não recebido', U.fmtMoeda(r.valorNaoRecebido)], ['Conferir manualmente', r.manuais],
      ['Canceladas / emitidas pela empresa / outro destinatário', r.outras],
      ['Movimentos TOTVS sem nota na pasta', r.semDocumento]
    ].forEach((l) => { const row = ws.addRow(l); row.getCell(1).font = { bold: true, color: { argb: AZUL } }; });
    return new Uint8Array(await wb.xlsx.writeBuffer());
  }

  // ---------- Relatório em PDF ----------
  async function gerarRelatorioPdf(conf) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    const logo = logoDataUrl(); const tam = await tamanhoImagem(logo);
    const W = pdf.internal.pageSize.getWidth();
    const periodo = `${U.fmtData(conf.params.inicio)} a ${U.fmtData(conf.params.fim)}`;
    const cabecalho = () => {
      pdf.setFillColor(...AZUL_RGB); pdf.rect(0, 0, W, 3, 'F');
      const h = 17; pdf.addImage(logo, formatoImg(logo), 10, 5, h * tam.w / tam.h, h, 'logo', 'FAST');
      pdf.setTextColor(...AZUL_RGB); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15);
      pdf.text('Notas fiscais não recebidas na TOTVS RM', W - 10, 12, { align: 'right' });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(90);
      pdf.text(`Período: ${periodo}   •   Gerado em ${new Date().toLocaleString('pt-BR')}`, W - 10, 18, { align: 'right' });
    };
    cabecalho();
    const r = conf.resumo;
    const caixas = [['Notas no período', r.notas], ['Recebidas', r.recebidas + r.fora], ['NÃO recebidas', r.naoRecebidas], ['Valor não recebido', U.fmtMoeda(r.valorNaoRecebido)], ['Conferir manualmente', r.manuais + r.provaveis], ['TOTVS sem nota', r.semDocumento]];
    const bw = (W - 20 - 5 * 4) / 6;
    caixas.forEach(([t, v], i) => {
      const x = 10 + i * (bw + 4);
      pdf.setDrawColor(210); pdf.setFillColor(i === 2 || i === 3 ? 253 : 245, i === 2 || i === 3 ? 236 : 247, i === 2 || i === 3 ? 235 : 250);
      pdf.roundedRect(x, 25, bw, 16, 2, 2, 'FD');
      pdf.setFontSize(8); pdf.setTextColor(90); pdf.text(t, x + 3, 30);
      pdf.setFontSize(13); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(i === 2 || i === 3 ? 180 : 31, i === 2 || i === 3 ? 35 : 56, i === 2 || i === 3 ? 24 : 100);
      pdf.text(String(v), x + 3, 38); pdf.setFont('helvetica', 'normal');
    });
    const nao = conf.resultado.filter((x) => x.status === S().NAO);
    const cols = ['#', 'Fornecedor', 'CNPJ', 'Tipo', 'Nº', 'Emissão', 'Valor', 'Arquivo', 'Observação'];
    const corpo = nao.map((x, i) => [i + 1, x.doc.emitNome, U.fmtCNPJ(x.doc.emitCnpj), siglaTipo(x.doc), x.doc.numero, colunasNotas[6].k(x), U.fmtMoeda(x.doc.valor), nomeBase(x.doc) + '.pdf', x.observacao || '']);
    pdf.autoTable({
      startY: 46, head: [cols], body: corpo.length ? corpo : [['', 'Nenhuma nota pendente no período. ', '', '', '', '', '', '', '']],
      foot: corpo.length ? [['', 'Total', '', '', '', '', U.fmtMoeda(r.valorNaoRecebido), '', '']] : undefined,
      styles: { fontSize: 7.5, cellPadding: 1.5, overflow: 'linebreak' },
      headStyles: { fillColor: AZUL_RGB, textColor: 255, fontStyle: 'bold' }, footStyles: { fillColor: [235, 239, 246], textColor: AZUL_RGB },
      alternateRowStyles: { fillColor: [247, 249, 252] },
      columnStyles: { 0: { cellWidth: 8 }, 1: { cellWidth: 52 }, 2: { cellWidth: 30 }, 3: { cellWidth: 12 }, 4: { cellWidth: 16 }, 5: { cellWidth: 18 }, 6: { cellWidth: 24, halign: 'right' }, 7: { cellWidth: 62 } },
      margin: { top: 24, left: 10, right: 10 },
      didDrawPage: (data) => { if (data.pageNumber > 1) cabecalho(); pdf.setFontSize(8); pdf.setTextColor(120); pdf.text(`Página ${data.pageNumber}`, W - 10, pdf.internal.pageSize.getHeight() - 6, { align: 'right' }); }
    });
    if (conf.semDocumento.length) {
      pdf.addPage(); cabecalho();
      pdf.setFontSize(11); pdf.setTextColor(...AZUL_RGB); pdf.setFont('helvetica', 'bold');
      pdf.text('Movimentos de entrada na TOTVS sem nota na pasta', 10, 30); pdf.setFont('helvetica', 'normal');
      pdf.autoTable({
        startY: 34, head: [['#', 'Tipo mov.', 'Nº', 'Fornecedor', 'CNPJ', 'Emissão', 'Entrada', 'Valor']],
        body: conf.semDocumento.map((m, i) => [i + 1, m.tipoMov, m.numero, m.fornecedor, U.fmtCNPJ(m.cnpj), U.fmtData(m.dataEmissao), U.fmtData(m.dataEntrada), U.fmtMoeda(m.valor)]),
        styles: { fontSize: 7.5, cellPadding: 1.5 }, headStyles: { fillColor: AZUL_RGB, textColor: 255 }, columnStyles: { 7: { halign: 'right' } },
        margin: { top: 24, left: 10, right: 10 }, didDrawPage: (data) => { if (data.pageNumber > 1 && data.cursor && data.cursor.y < 30) cabecalho(); }
      });
    }
    return new Uint8Array(pdf.output('arraybuffer'));
  }

  // ---------- PDF de cada nota ----------
  async function pdfDaNota(d) {
    const pdfAnexo = d.anexos.find((a) => a.fonte === 'PDF');
    if (pdfAnexo) {
      const dados = pdfAnexo.origem.dados;
      const todas = !pdfAnexo.paginas || pdfAnexo.paginas.length === pdfAnexo.totalPaginasArquivo;
      if (todas) return { dados, gerado: false };
      try {
        const src = await PDFLib.PDFDocument.load(dados, { ignoreEncryption: true });
        const novo = await PDFLib.PDFDocument.create();
        const pags = await novo.copyPages(src, pdfAnexo.paginas);
        pags.forEach((p) => novo.addPage(p));
        return { dados: await novo.save(), gerado: false };
      } catch (e) { /* cai para o espelho */ }
    }
    const img = d.anexos.find((a) => a.fonte === 'Imagem');
    if (img) {
      const canvas = await CN.codigoBarras.carregarImagem(img.origem.dados, img.origem.nome);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? 'landscape' : 'portrait', unit: 'mm', format: 'a4', compress: true });
      const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
      const esc = Math.min((W - 10) / canvas.width, (H - 10) / canvas.height);
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', (W - canvas.width * esc) / 2, (H - canvas.height * esc) / 2, canvas.width * esc, canvas.height * esc);
      return { dados: new Uint8Array(pdf.output('arraybuffer')), gerado: false };
    }
    return { dados: await espelhoDoXml(d), gerado: true };
  }

  // Quando só existe o XML: gera um espelho simples da nota (não substitui o DANFE).
  async function espelhoDoXml(d) {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    const W = pdf.internal.pageSize.getWidth();
    const logo = logoDataUrl(); const tam = await tamanhoImagem(logo);
    pdf.setFillColor(...AZUL_RGB); pdf.rect(0, 0, W, 3, 'F');
    pdf.addImage(logo, formatoImg(logo), 10, 7, 11 * tam.w / tam.h, 11, 'logo', 'FAST');
    pdf.setTextColor(...AZUL_RGB); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(14);
    pdf.text(`Espelho da ${siglaTipo(d) === 'NF' ? 'NF-e' : siglaTipo(d)} nº ${d.numero}`, W - 10, 12, { align: 'right' });
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8); pdf.setTextColor(110);
    pdf.text('Gerado a partir do XML para conferência. Não substitui o DANFE / DANFSe.', W - 10, 17, { align: 'right' });
    pdf.autoTable({
      startY: 24, theme: 'grid', styles: { fontSize: 9, cellPadding: 2 }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48, textColor: AZUL_RGB, fillColor: [240, 243, 248] } },
      body: [
        ['Tipo / modelo', `${d.tipo}${d.modelo && d.modelo !== 'NFSe' ? ' — modelo ' + d.modelo : ''}`],
        ['Número / série', `${d.numero}${d.serie ? ' / ' + d.serie : ''}`],
        ['Data de emissão', U.fmtData(d.dataEmissao)],
        ['Chave de acesso', d.chave ? d.chave.replace(/(\d{4})(?=\d)/g, '$1 ') : '—'],
        ['Emitente / prestador', `${d.emitNome || ''}\nCNPJ ${U.fmtCNPJ(d.emitCnpj)}`],
        ['Destinatário / tomador', `${d.destNome || ''}\nCNPJ ${U.fmtCNPJ(d.destCnpj)}`],
        ['Valor total', U.fmtMoeda(d.valor)],
        ...(d.valorLiquido != null && d.valorLiquido !== d.valor ? [['Valor líquido', U.fmtMoeda(d.valorLiquido)]] : []),
        ...(d.descricaoServico ? [['Discriminação do serviço', d.descricaoServico.slice(0, 1500)]] : []),
        ['Arquivo XML', d.anexos.map((a) => a.origem.caminho).join('\n')]
      ]
    });
    if (d.itens && d.itens.length) {
      pdf.autoTable({
        startY: pdf.lastAutoTable.finalY + 6, head: [['Código', 'Descrição', 'Un.', 'Qtde', 'Valor']],
        body: d.itens.map((i) => [i.codigo, i.descricao, i.unidade, i.quantidade == null ? '' : i.quantidade.toLocaleString('pt-BR'), U.fmtMoeda(i.valor)]),
        styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: AZUL_RGB, textColor: 255 }, columnStyles: { 4: { halign: 'right' } }
      });
    }
    return new Uint8Array(pdf.output('arraybuffer'));
  }

  // ---------- JSON para a plataforma (conf.sp_GravarConferencia) ----------
  const COD_SITUACAO = () => ({
    [S().NAO]: 'NAO_RECEBIDA', [S().MANUAL]: 'CONFERIR', [S().PROVAVEL]: 'PROVAVEL', [S().FORA]: 'FORA_PERIODO',
    [S().RECEBIDA]: 'RECEBIDA', [S().OUTRO_DEST]: 'OUTRO_DEST', [S().EMITIDA]: 'EMITIDA', [S().CANCELADA]: 'CANCELADA'
  });
  function gerarJson(conf, usuario) {
    const p = conf.params, r = conf.resumo, cod = COD_SITUACAO();
    const nulo = (v) => (v === '' || v == null ? null : v);
    return {
      conferencia: {
        dataInicio: p.inicio, dataFim: p.fim, baseDataMovimento: p.baseMov === 'emissao' ? 'EMISSAO' : 'ENTRADA',
        margemDias: p.margemDias || 0, cnpjEmpresa: (p.cnpjsEmpresa || []).join(';'), toleranciaValor: p.toleranciaValor,
        tiposMovimento: [...(p.tipos || [])].filter(Boolean).sort().join(';'),
        origemMovimentos: /\.pdf$/i.test(p.arquivoTotvs || '') ? 'RELATORIO_PDF' : /^API/.test(p.arquivoTotvs || '') ? 'TOTVS_SQL' : 'EXCEL',
        usuario: usuario || 'conferencia-html',
        qtdNotas: r.notas, qtdRecebidas: r.recebidas, qtdForaPeriodo: r.fora, qtdProvaveis: r.provaveis,
        qtdNaoRecebidas: r.naoRecebidas, qtdConferirManual: r.manuais, qtdOutras: r.outras, qtdTotvsSemNota: r.semDocumento,
        valorNaoRecebido: Math.round(r.valorNaoRecebido * 100) / 100
      },
      notas: conf.resultado.map((x) => {
        const d = x.doc, m = x.movimento;
        return {
          situacao: cod[x.status], tipoDocumento: d.tipo, modelo: nulo(d.modelo), chaveAcesso: nulo(d.chave),
          numero: nulo(d.numero), serie: nulo(d.serie), dataEmissao: nulo(d.dataEmissao), anoMesChave: nulo(d.anoMesChave),
          emitenteCnpj: nulo(d.emitCnpj), emitenteNome: nulo(d.emitNome), destinatarioCnpj: nulo(d.destCnpj),
          valor: d.valor, fonte: d.fonte, confianca: d.confianca, cancelada: !!d.cancelada,
          arquivosOrigem: d.anexos.map((a) => a.origem.caminho + (a.paginas && a.totalPaginasArquivo > 1 ? ` (pág. ${a.paginas.map((n) => n + 1).join(', ')})` : '')).join(' | '),
          nomeArquivoPacote: x.status === S().NAO ? nomeBase(d) + '.pdf' : null,
          observacao: nulo(x.observacao),
          movIdmov: m && m.idmov ? Number(m.idmov) || null : null, movCodTmv: m ? m.tipoMovNorm : null, movNumero: m ? m.numero : null,
          movDataEntrada: m ? m.dataEntrada : null, movDataEmissao: m ? m.dataEmissao : null, movValor: m ? m.valor : null,
          comoEncontrada: nulo(x.como)
        };
      }),
      movimentosSemNota: conf.semDocumento.map((m) => ({
        idmov: Number(m.idmov) || null, codTmv: m.tipoMovNorm, numero: m.numero, serie: nulo(m.serie),
        fornecedorCnpj: nulo(m.cnpj), fornecedorNome: nulo(m.fornecedor), dataEmissao: m.dataEmissao, dataEntrada: m.dataEntrada, valor: m.valor
      }))
    };
  }

  // ---------- Pacote ZIP ----------
  async function gerarPacote(conf, aoProgresso) {
    const zip = new JSZip();
    const ini = U.fmtData(conf.params.inicio).replace(/\//g, '-'), fim = U.fmtData(conf.params.fim).replace(/\//g, '-');
    aoProgresso && aoProgresso('Gerando relatório em Excel…', 0.05);
    zip.file('Relatorio notas nao recebidas.xlsx', await gerarExcel(conf));
    aoProgresso && aoProgresso('Gerando relatório em PDF…', 0.1);
    zip.file('Relatorio notas nao recebidas.pdf', await gerarRelatorioPdf(conf));
    zip.file('conferencia.json', JSON.stringify(gerarJson(conf), null, 2));
    const pasta = zip.folder('Notas nao recebidas');
    const nao = conf.resultado.filter((r) => r.status === S().NAO);
    const usados = new Set();
    for (let i = 0; i < nao.length; i++) {
      const d = nao[i].doc;
      aoProgresso && aoProgresso(`Separando nota ${i + 1} de ${nao.length}…`, 0.1 + 0.85 * (i / Math.max(1, nao.length)));
      let nome = nomeBase(d), n = 2;
      while (usados.has(nome.toLowerCase())) nome = `${nomeBase(d)} (${n++})`;
      usados.add(nome.toLowerCase());
      try {
        const { dados } = await pdfDaNota(d);
        pasta.file(nome + '.pdf', dados);
      } catch (e) { pasta.file(nome + ' - ERRO.txt', 'Não foi possível gerar o PDF: ' + e.message); }
      const xml = d.anexos.find((a) => a.fonte === 'XML');
      if (xml) pasta.file(nome + '.xml', xml.origem.dados);
      await U.esperar();
    }
    aoProgresso && aoProgresso('Compactando…', 0.97);
    const dados = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return { dados, nome: `Notas nao recebidas ${ini} a ${fim}.zip` };
  }

  function baixar(dados, nome, tipo = 'application/octet-stream') {
    const url = URL.createObjectURL(new Blob([dados], { type: tipo }));
    const a = document.createElement('a'); a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  return { gerarExcel, gerarRelatorioPdf, gerarPacote, gerarJson, pdfDaNota, nomeBase, baixar, logoDataUrl, siglaTipo };
})();
