/* Imagens (JPEG/PNG) e páginas escaneadas: lê o código de barras do DANFE
   (chave de acesso de 44 dígitos) ou o QR Code da NFC-e / DANFSe. */
window.CN = window.CN || {};

CN.codigoBarras = (function () {
  const U = CN.util;
  let leitor = null;

  function obterLeitor() {
    if (leitor) return leitor;
    const Z = window.ZXing;
    const dicas = new Map();
    dicas.set(Z.DecodeHintType.TRY_HARDER, true);
    dicas.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.ITF, Z.BarcodeFormat.DATA_MATRIX]);
    leitor = new Z.MultiFormatReader();
    leitor.setHints(dicas);
    return leitor;
  }

  function decodificarCanvas(canvas) {
    const Z = window.ZXing;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const { width: w, height: h } = canvas;
    const px = ctx.getImageData(0, 0, w, h).data;
    const lum = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) lum[j] = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
    const fonte = new Z.RGBLuminanceSource(lum, w, h);
    const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(fonte));
    try { return obterLeitor().decode(bitmap).getText(); } catch (e) { return null; }
  }

  function girar(canvas, graus) {
    const c = document.createElement('canvas');
    const r = graus % 180 !== 0;
    c.width = r ? canvas.height : canvas.width; c.height = r ? canvas.width : canvas.height;
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2); ctx.rotate((graus * Math.PI) / 180);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    return c;
  }

  // Página inteira e depois "janelas" menores: textos ao lado do código de barras
  // atrapalham a leitura da linha inteira, então procuramos em pedaços sobrepostos.
  // O código do DANFE fica no topo, por isso as janelas de cima vêm primeiro.
  function* recortes(canvas) {
    yield canvas;
    const h = canvas.height, w = canvas.width;
    const altura = Math.max(120, Math.round(h * 0.12));
    const passoY = Math.round(altura / 2);
    for (const fracL of [0.55, 0.4]) {
      const largura = Math.round(w * fracL), passoX = Math.round(largura / 3);
      for (let y = 0; y < h; y += passoY) {
        for (let x = 0; x + largura <= w + passoX - 1; x += passoX) {
          const x0 = Math.min(x, w - largura), y0 = Math.min(y, h - altura);
          const c = document.createElement('canvas');
          c.width = largura; c.height = altura;
          c.getContext('2d').drawImage(canvas, x0, y0, largura, altura, 0, 0, largura, altura);
          yield c;
        }
        if (y + altura >= h) break;
      }
    }
  }

  /** Procura chave de acesso no canvas. Devolve { chave, textoLido } ou null. */
  function lerChaveDoCanvas(canvas) {
    for (const g of [0, 90, 270]) {
      const base = g ? girar(canvas, g) : canvas;
      for (const c of recortes(base)) {
        const t = decodificarCanvas(c);
        if (!t) continue;
        const chave = chaveNoTexto(t);
        if (chave) return { chave, textoLido: t };
      }
    }
    return null;
  }

  function chaveNoTexto(t) {
    const nums = (t.match(/\d{44,50}/g) || []);
    for (const n of nums) {
      if (n.length === 44 && U.chaveNFeValida(n)) return n;
      if (n.length === 50 && U.dadosChaveNFSe(n)) return n;
      for (let i = 0; i + 44 <= n.length; i++) { const s = n.slice(i, i + 44); if (U.chaveNFeValida(s)) return s; }
    }
    return null;
  }

  async function carregarImagem(dados, nome) {
    const tipo = /png$/i.test(nome) ? 'image/png' : /webp$/i.test(nome) ? 'image/webp' : /bmp$/i.test(nome) ? 'image/bmp' : /gif$/i.test(nome) ? 'image/gif' : 'image/jpeg';
    const url = URL.createObjectURL(new Blob([dados], { type: tipo }));
    try {
      const img = new Image();
      await new Promise((ok, erro) => { img.onload = ok; img.onerror = () => erro(new Error('Imagem inválida.')); img.src = url; });
      const escala = Math.min(1, 3600 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * escala); c.height = Math.round(img.naturalHeight * escala);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally { URL.revokeObjectURL(url); }
  }

  /** Documento a partir de uma imagem de nota. */
  async function lerImagem(entrada) {
    const canvas = await carregarImagem(entrada.dados, entrada.nome);
    const achou = lerChaveDoCanvas(canvas);
    const d = {
      tipo: '', modelo: '', chave: '', numero: '', serie: '', dataEmissao: null,
      emitCnpj: '', emitNome: '', destCnpj: '', destNome: '', valor: null,
      fonte: 'Imagem', confianca: 'baixa', origem: entrada, avisos: [], itens: []
    };
    if (achou) preencherPelaChave(d, achou.chave);
    else d.avisos.push('Não foi possível ler o código de barras da imagem. Conferir manualmente.');
    return d;
  }

  function preencherPelaChave(d, chave) {
    d.chave = chave;
    if (chave.length === 44) {
      const c = U.dadosDaChave(chave);
      d.modelo = c.modelo; d.tipo = c.modelo === '57' ? 'CT-e' : c.modelo === '65' ? 'NFC-e' : 'NF-e';
      d.numero = c.numero; d.serie = c.serie; d.emitCnpj = c.cnpj;
      d.anoMesChave = `${c.ano}-${String(c.mes).padStart(2, '0')}`;
    } else {
      const c = U.dadosChaveNFSe(chave);
      d.modelo = 'NFSe'; d.tipo = 'NFS-e'; d.numero = c.numero; d.emitCnpj = c.cnpj;
      d.anoMesChave = `${c.ano}-${String(c.mes).padStart(2, '0')}`;
    }
    d.confianca = 'media';
    d.avisos.push('Dados lidos do código de barras (sem data exata de emissão nem valor).');
  }

  return { lerImagem, lerChaveDoCanvas, chaveNoTexto, preencherPelaChave, carregarImagem };
})();
