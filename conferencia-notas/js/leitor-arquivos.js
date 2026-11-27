/* Lê a pasta escolhida e abre compactados (ZIP e RAR, inclusive um dentro do outro). */
window.CN = window.CN || {};

CN.leitor = (function () {
  const EXT_IMAGEM = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'];
  const ext = (nome) => { const m = /\.([^.\/\\]+)$/.exec(nome); return m ? m[1].toLowerCase() : ''; };

  function classificar(nome) {
    const e = ext(nome);
    if (e === 'xml') return 'xml';
    if (e === 'pdf') return 'pdf';
    if (EXT_IMAGEM.includes(e)) return 'imagem';
    if (e === 'zip') return 'zip';
    if (e === 'rar') return 'rar';
    return 'outro';
  }

  // Reconhece pelo conteúdo quando a extensão não ajuda.
  function classificarPorConteudo(dados, padrao) {
    const b = dados;
    if (b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) return 'zip';
    if (b.length > 6 && b[0] === 0x52 && b[1] === 0x61 && b[2] === 0x72 && b[3] === 0x21) return 'rar';
    if (b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf';
    if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8) return 'imagem';
    if (b.length > 4 && b[0] === 0x89 && b[1] === 0x50) return 'imagem';
    if (padrao === 'outro') {
      const ini = new TextDecoder().decode(b.slice(0, 200)).trim();
      if (ini.startsWith('<?xml') || /^<\w/.test(ini)) return 'xml';
    }
    return padrao;
  }

  /**
   * Recebe a lista de File (input/drag) e devolve as entradas já expandidas:
   * [{ nome, caminho, tipo: 'xml'|'pdf'|'imagem', dados: Uint8Array }]
   */
  async function lerArquivos(files, aoProgresso) {
    const saida = [], ignorados = [], erros = [];
    const stats = { compactados: 0 };
    let i = 0;
    for (const f of files) {
      i++;
      const caminho = f.webkitRelativePath || f._caminho || f.name;
      aoProgresso && aoProgresso(`Lendo ${caminho}`, i / files.length);
      try {
        const dados = new Uint8Array(await f.arrayBuffer());
        await processar(f.name, caminho, dados, saida, ignorados, erros, stats, 0);
      } catch (e) {
        erros.push({ caminho, erro: e.message || String(e) });
      }
      if (i % 5 === 0) await CN.util.esperar();
    }
    return { entradas: saida, ignorados, erros, compactados: stats.compactados };
  }

  async function processar(nome, caminho, dados, saida, ignorados, erros, stats, nivel) {
    const tipo = classificarPorConteudo(dados, classificar(nome));
    if (tipo === 'zip' || tipo === 'rar') {
      if (nivel > 5) { erros.push({ caminho, erro: 'Compactado dentro de compactado demais (mais de 5 níveis).' }); return; }
      stats.compactados++;
      let internos;
      try {
        internos = tipo === 'zip' ? await abrirZip(dados) : await window.UnrarLib.extrair(dados);
      } catch (e) {
        const msg = String(e && e.message || e);
        erros.push({ caminho, erro: /password|senha|encrypt/i.test(msg) ? 'Compactado protegido por senha.' : 'Não foi possível abrir o compactado: ' + msg });
        return;
      }
      for (const it of internos) {
        const nomeInterno = it.nome.split(/[\\/]/).pop();
        if (!nomeInterno || nomeInterno.startsWith('.') || it.nome.includes('__MACOSX')) continue;
        await processar(nomeInterno, `${caminho} › ${it.nome}`, it.dados, saida, ignorados, erros, stats, nivel + 1);
      }
      return;
    }
    if (tipo === 'outro') { ignorados.push(caminho); return; }
    saida.push({ nome, caminho, tipo, dados });
  }

  async function abrirZip(dados) {
    const zip = await JSZip.loadAsync(dados);
    const out = [];
    const nomes = Object.keys(zip.files);
    for (const n of nomes) {
      const f = zip.files[n];
      if (f.dir) continue;
      out.push({ nome: n, dados: await f.async('uint8array') });
    }
    return out;
  }

  // Arrastar e soltar pasta: percorre as entradas do navegador.
  async function arquivosDoDrop(dataTransfer) {
    const itens = [...(dataTransfer.items || [])].map((it) => it.webkitGetAsEntry && it.webkitGetAsEntry()).filter(Boolean);
    if (!itens.length) return [...dataTransfer.files];
    const out = [];
    async function andar(entry, prefixo) {
      if (entry.isFile) {
        const f = await new Promise((ok, erro) => entry.file(ok, erro));
        f._caminho = prefixo + f.name;
        out.push(f);
      } else if (entry.isDirectory) {
        const leitor = entry.createReader();
        let lote;
        do {
          lote = await new Promise((ok, erro) => leitor.readEntries(ok, erro));
          for (const e of lote) await andar(e, prefixo + entry.name + '/');
        } while (lote.length);
      }
    }
    for (const e of itens) await andar(e, '');
    return out;
  }

  return { lerArquivos, arquivosDoDrop, ext };
})();
