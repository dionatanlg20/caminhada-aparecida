/* Lê XML de NF-e (modelo 55), NFC-e (65), CT-e (57), resumo de NF-e,
   NFS-e Padrão Nacional, NFS-e ABRASF/municipais e eventos de cancelamento. */
window.CN = window.CN || {};

CN.parserXml = (function () {
  const U = CN.util;

  // Primeiro descendente com um dos nomes (ignora namespace e maiúsculas).
  function achar(raiz, ...nomes) {
    if (!raiz) return null;
    const alvos = nomes.map((n) => n.toLowerCase());
    const todos = raiz.getElementsByTagName('*');
    for (const alvo of alvos) {
      for (let i = 0; i < todos.length; i++) {
        if (todos[i].localName.toLowerCase() === alvo) return todos[i];
      }
    }
    return null;
  }
  // exato = true diferencia maiúsculas (ex.: infNFSe nacional x InfNfse ABRASF).
  function todosCom(raiz, nome, exato = false) {
    const out = [], alvo = exato ? nome : nome.toLowerCase();
    const todos = raiz.getElementsByTagName('*');
    for (let i = 0; i < todos.length; i++) {
      const n = exato ? todos[i].localName : todos[i].localName.toLowerCase();
      if (n === alvo) out.push(todos[i]);
    }
    return out;
  }
  // Caminho de nomes: txt(el, 'emit', 'CNPJ') -> procura emit, depois CNPJ dentro dele.
  function txt(raiz, ...caminho) {
    let el = raiz;
    for (const parte of caminho) {
      const opcoes = parte.split('|');
      el = achar(el, ...opcoes);
      if (!el) return '';
    }
    return (el.textContent || '').trim();
  }
  const filhoDireto = (el, nome) => el && [...el.children].find((c) => c.localName.toLowerCase() === nome.toLowerCase());

  function base(origem) {
    return {
      tipo: '', modelo: '', chave: '', numero: '', serie: '', dataEmissao: null,
      emitCnpj: '', emitNome: '', destCnpj: '', destNome: '', valor: null, valorLiquido: null,
      fonte: 'XML', confianca: 'alta', origem, avisos: [], itens: []
    };
  }

  function nfe(inf, origem, textoXml) {
    const d = base(origem);
    const ide = achar(inf, 'ide');
    d.modelo = txt(ide, 'mod') || '55';
    d.tipo = d.modelo === '65' ? 'NFC-e' : 'NF-e';
    d.chave = U.soDigitos(inf.getAttribute('Id'));
    d.numero = U.numNota(txt(ide, 'nNF'));
    d.serie = txt(ide, 'serie');
    d.dataEmissao = U.parseData(txt(ide, 'dhEmi|dEmi'));
    const emit = achar(inf, 'emit'), dest = achar(inf, 'dest');
    d.emitCnpj = U.soDigitos(txt(emit, 'CNPJ|CPF'));
    d.emitNome = txt(emit, 'xNome');
    d.destCnpj = U.soDigitos(txt(dest, 'CNPJ|CPF'));
    d.destNome = txt(dest, 'xNome');
    d.valor = U.parseValor(txt(inf, 'total', 'ICMSTot', 'vNF'));
    d.itens = todosCom(inf, 'det').slice(0, 300).map((det) => ({
      codigo: txt(det, 'cProd'), descricao: txt(det, 'xProd'), unidade: txt(det, 'uCom'),
      quantidade: U.parseValor(txt(det, 'qCom')), valor: U.parseValor(txt(det, 'vProd'))
    }));
    d.xml = textoXml;
    return d;
  }

  function resumoNfe(res, origem, textoXml) {
    const d = base(origem);
    d.chave = txt(res, 'chNFe');
    const c = d.chave.length === 44 ? U.dadosDaChave(d.chave) : null;
    d.modelo = c ? c.modelo : '55';
    d.tipo = 'NF-e (resumo)';
    d.numero = c ? c.numero : '';
    d.serie = c ? c.serie : '';
    d.emitCnpj = U.soDigitos(txt(res, 'CNPJ|CPF'));
    d.emitNome = txt(res, 'xNome');
    d.dataEmissao = U.parseData(txt(res, 'dhEmi'));
    d.valor = U.parseValor(txt(res, 'vNF'));
    if (txt(res, 'cSitNFe') === '3') d.cancelada = true;
    d.xml = textoXml;
    return d;
  }

  function cte(inf, origem, textoXml) {
    const d = base(origem);
    d.tipo = 'CT-e'; d.modelo = '57';
    d.chave = U.soDigitos(inf.getAttribute('Id'));
    const ide = achar(inf, 'ide');
    d.numero = U.numNota(txt(ide, 'nCT'));
    d.serie = txt(ide, 'serie');
    d.dataEmissao = U.parseData(txt(ide, 'dhEmi'));
    const emit = achar(inf, 'emit');
    d.emitCnpj = U.soDigitos(txt(emit, 'CNPJ|CPF'));
    d.emitNome = txt(emit, 'xNome');
    // Tomador do serviço: pode ser remetente, destinatário ou outro.
    const toma = achar(inf, 'toma4');
    const dest = toma || achar(inf, 'dest');
    d.destCnpj = U.soDigitos(txt(dest, 'CNPJ|CPF'));
    d.destNome = txt(dest, 'xNome');
    d.valor = U.parseValor(txt(inf, 'vPrest', 'vTPrest'));
    d.xml = textoXml;
    return d;
  }

  function nfseNacional(inf, origem, textoXml) {
    const d = base(origem);
    d.tipo = 'NFS-e'; d.modelo = 'NFSe';
    d.chave = U.soDigitos(inf.getAttribute('Id'));
    d.numero = U.numNota(txt(inf, 'nNFSe'));
    const emit = filhoDireto(inf, 'emit') || achar(inf, 'emit');
    d.emitCnpj = U.soDigitos(txt(emit, 'CNPJ|CPF'));
    d.emitNome = txt(emit, 'xNome');
    const dps = achar(inf, 'infDPS');
    d.dataEmissao = U.parseData(txt(dps, 'dhEmi') || txt(inf, 'dhProc'));
    d.serie = txt(dps, 'serie');
    const toma = achar(dps, 'toma');
    d.destCnpj = U.soDigitos(txt(toma, 'CNPJ|CPF'));
    d.destNome = txt(toma, 'xNome');
    if (!d.emitCnpj) { const prest = achar(dps, 'prest'); d.emitCnpj = U.soDigitos(txt(prest, 'CNPJ|CPF')); }
    d.valor = U.parseValor(txt(dps, 'vServPrest', 'vServ')) ?? U.parseValor(txt(inf, 'valores', 'vLiq'));
    d.valorLiquido = U.parseValor(txt(filhoDireto(inf, 'valores'), 'vLiq'));
    d.descricaoServico = txt(dps, 'xDescServ');
    d.xml = textoXml;
    return d;
  }

  // ABRASF (1.0 e 2.x) e outros modelos municipais (ex.: São Paulo), por nomes comuns.
  function nfseMunicipal(inf, origem, textoXml, raizDoc) {
    const d = base(origem);
    d.tipo = 'NFS-e'; d.modelo = 'NFSe';
    d.numero = U.numNota(txt(inf, 'NumeroNFe|NumeroNfse|NumeroNota|Numero'));
    d.chave = '';
    d.dataEmissao = U.parseData(txt(inf, 'DataEmissaoNFe|DataEmissao|DataHoraEmissao|DtEmissao|dhEmi|Competencia'));
    const prest = achar(inf, 'PrestadorServico', 'Prestador', 'IdentificacaoPrestador', 'CPFCNPJPrestador') ||
      achar(raizDoc, 'PrestadorServico', 'Prestador');
    d.emitCnpj = U.soDigitos(txt(prest, 'Cnpj|CNPJ|Cpf|CPF'));
    d.emitNome = txt(prest, 'RazaoSocial|NomeFantasia') || txt(inf, 'RazaoSocialPrestador');
    if (!d.emitNome) { const p2 = achar(raizDoc, 'PrestadorServico'); d.emitNome = txt(p2, 'RazaoSocial'); }
    const toma = achar(inf, 'TomadorServico', 'Tomador', 'CPFCNPJTomador') || achar(raizDoc, 'TomadorServico', 'Tomador');
    d.destCnpj = U.soDigitos(txt(toma, 'Cnpj|CNPJ|Cpf|CPF'));
    d.destNome = txt(toma, 'RazaoSocial') || txt(inf, 'RazaoSocialTomador');
    d.valor = U.parseValor(txt(inf, 'ValorServicos|ValorTotal|vServ')) ?? U.parseValor(txt(raizDoc, 'ValorServicos'));
    d.valorLiquido = U.parseValor(txt(inf, 'ValorLiquidoNfse|ValorLiquido'));
    if (d.valor == null) d.valor = d.valorLiquido;
    d.descricaoServico = txt(inf, 'Discriminacao') || txt(raizDoc, 'Discriminacao');
    d.confianca = d.numero && d.emitCnpj ? 'alta' : 'media';
    d.xml = textoXml;
    return d;
  }

  /** Devolve { documentos: [...], cancelamentos: [chaves], aviso } */
  function ler(dados, origem) {
    let texto = new TextDecoder('utf-8').decode(dados);
    if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(dados);
    texto = texto.replace(/^﻿/, '');
    const doc = new DOMParser().parseFromString(texto, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      return { documentos: [], cancelamentos: [], aviso: 'XML inválido ou corrompido.' };
    }
    const raiz = doc.documentElement;
    const documentos = [], cancelamentos = [];

    // Eventos (cancelamento NF-e 110111, NFS-e nacional 101101).
    todosCom(raiz, 'infEvento').forEach((ev) => {
      const tp = txt(ev, 'tpEvento');
      const ch = txt(ev, 'chNFe|chCTe|chNFSe');
      if (/^(110111|101101|110181)$/.test(tp) && ch) cancelamentos.push(U.soDigitos(ch));
    });
    todosCom(raiz, 'pedRegEvento').forEach((ev) => {
      if (achar(ev, 'e101101')) { const ch = txt(ev, 'chNFSe'); if (ch) cancelamentos.push(U.soDigitos(ch)); }
    });

    todosCom(raiz, 'infNFe', true).forEach((inf) => documentos.push(nfe(inf, origem, texto)));
    todosCom(raiz, 'resNFe').forEach((r) => documentos.push(resumoNfe(r, origem, texto)));
    todosCom(raiz, 'infCte', true).forEach((inf) => documentos.push(cte(inf, origem, texto)));
    todosCom(raiz, 'infNFSe', true).forEach((inf) => documentos.push(nfseNacional(inf, origem, texto)));

    if (!documentos.length) {
      // ABRASF: InfNfse dentro de CompNfse/Nfse. Outros: NFe (São Paulo) etc.
      const comp = todosCom(raiz, 'CompNfse');
      if (comp.length) {
        comp.forEach((c) => {
          const inf = achar(c, 'InfNfse') || c;
          const d = nfseMunicipal(inf, origem, texto, c);
          if (achar(c, 'NfseCancelamento') || achar(c, 'Cancelamento')) d.cancelada = true;
          documentos.push(d);
        });
      } else {
        const infs = todosCom(raiz, 'InfNfse');
        if (infs.length) infs.forEach((inf) => documentos.push(nfseMunicipal(inf, origem, texto, inf.parentNode)));
        else {
          const nfsSP = todosCom(raiz, 'NFe').filter((n) => achar(n, 'NumeroNFe'));
          if (nfsSP.length) nfsSP.forEach((n) => documentos.push(nfseMunicipal(n, origem, texto, n)));
          else if (achar(raiz, 'Numero', 'NumeroNota', 'NumeroNfse') && achar(raiz, 'Cnpj', 'CNPJ')) {
            const d = nfseMunicipal(raiz, origem, texto, raiz);
            d.confianca = 'baixa';
            d.avisos.push('Layout de XML não reconhecido; dados lidos por aproximação.');
            documentos.push(d);
          }
        }
      }
    }

    // Situação cancelada no próprio XML (alguns municípios / resumo).
    documentos.forEach((d) => {
      const sit = txt(raiz, 'cStat');
      if (d.chave && cancelamentos.includes(d.chave)) d.cancelada = true;
      if (sit === '101') d.cancelada = true; // 101 = cancelamento homologado
    });

    let aviso = '';
    if (!documentos.length && !cancelamentos.length) aviso = 'XML sem nota fiscal reconhecida.';
    return { documentos, cancelamentos, aviso };
  }

  return { ler };
})();
