window.CN = window.CN || {};

CN.util = (function () {
  const soDigitos = (s) => String(s == null ? '' : s).replace(/\D/g, '');

  // Número da nota sem zeros à esquerda. Em "NF 000015" vira "15".
  // Se houver vários grupos de números (ex.: "000015-1"), usa o maior.
  function numNota(s) {
    if (s == null) return '';
    if (typeof s === 'number') return String(Math.trunc(s));
    const grupos = String(s).match(/\d+/g);
    if (!grupos) return '';
    const maior = grupos.reduce((a, b) => (b.length > a.length ? b : a));
    return maior.replace(/^0+/, '') || '0';
  }

  function parseValor(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).replace(/R\$|\s/gi, '').replace(/[^\d.,-]/g, '');
    if (!s) return null;
    const temV = s.includes(','), temP = s.includes('.');
    if (temV && temP) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (temV) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (temP && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  const pad = (n) => String(n).padStart(2, '0');
  const isoDe = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

  // Converte vários formatos de data em 'AAAA-MM-DD' (ou null).
  function parseData(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) {
      if (isNaN(v)) return null;
      // SheetJS cria datas em UTC à meia-noite; somar 12h evita cair no dia anterior.
      const d = new Date(v.getTime() + 12 * 3600 * 1000);
      return isoDe(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    if (typeof v === 'number') {
      if (v > 20000 && v < 80000) { // número de série do Excel
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        return isoDe(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
      }
      return null;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return isoDe(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (m) {
      let y = +m[3]; if (y < 100) y += 2000;
      if (+m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1 && +m[1] <= 31) return isoDe(y, +m[2], +m[1]);
    }
    m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
    if (m) return isoDe(+m[1], +m[2], +m[3]);
    return null;
  }

  function fmtData(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function addDias(iso, dias) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + dias));
    return isoDe(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }

  const fmtMoedaF = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const fmtMoeda = (v) => (v == null ? '' : fmtMoedaF.format(v));

  function fmtCNPJ(s) {
    const d = soDigitos(s);
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return s || '';
  }

  function normTexto(s) {
    return String(s == null ? '' : s)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toUpperCase().replace(/\s+/g, ' ').trim();
  }

  // Cabeçalho de coluna normalizado para comparação.
  function normCabecalho(s) {
    return normTexto(s).toLowerCase().replace(/[º°ª]/g, '').replace(/[^a-z0-9/ ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // Semelhança simples entre nomes (0 a 1), por palavras significativas.
  const PALAVRAS_IGNORADAS = new Set(['LTDA', 'ME', 'EPP', 'SA', 'S/A', 'EIRELI', 'DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'COMERCIO', 'SERVICOS', 'INDUSTRIA', 'CIA', 'MEI']);
  function semelhancaNome(a, b) {
    const t = (x) => new Set(normTexto(x).replace(/[^A-Z0-9 ]/g, ' ').split(' ').filter((p) => p.length > 1 && !PALAVRAS_IGNORADAS.has(p)));
    const A = t(a), B = t(b);
    if (!A.size || !B.size) return 0;
    let comum = 0; A.forEach((p) => { if (B.has(p)) comum++; });
    return comum / Math.min(A.size, B.size);
  }

  function nomeArquivoSeguro(s, max = 120) {
    let r = String(s).normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
    if (r.length > max) r = r.slice(0, max).trim();
    return r.replace(/[. ]+$/, '');
  }

  // Valida chave de acesso NF-e / CT-e / NFC-e (44 dígitos, DV módulo 11).
  function chaveNFeValida(ch) {
    if (!/^\d{44}$/.test(ch)) return false;
    let soma = 0, peso = 2;
    for (let i = 42; i >= 0; i--) { soma += +ch[i] * peso; peso = peso === 9 ? 2 : peso + 1; }
    const resto = soma % 11;
    const dv = resto < 2 ? 0 : 11 - resto;
    return dv === +ch[43];
  }

  function cnpjValido(c) {
    const d = soDigitos(c);
    if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
    const calc = (n) => {
      const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const s = pesos.reduce((acc, p, i) => acc + +d[i] * p, 0);
      const r = s % 11; return r < 2 ? 0 : 11 - r;
    };
    return calc(12) === +d[12] && calc(13) === +d[13];
  }

  // Extrai os dados que a chave de 44 dígitos carrega.
  function dadosDaChave(ch) {
    return {
      uf: ch.slice(0, 2), ano: 2000 + +ch.slice(2, 4), mes: +ch.slice(4, 6),
      cnpj: ch.slice(6, 20), modelo: ch.slice(20, 22), serie: String(+ch.slice(22, 25)),
      numero: String(+ch.slice(25, 34))
    };
  }

  // Chave da NFS-e Padrão Nacional (50 dígitos).
  function dadosChaveNFSe(ch) {
    if (!/^\d{50}$/.test(ch)) return null;
    const tpInsc = ch[8];
    const insc = ch.slice(9, 23);
    return {
      cMun: ch.slice(0, 7), cnpj: tpInsc === '1' ? insc.slice(3) : insc,
      numero: String(+ch.slice(23, 36)), ano: 2000 + +ch.slice(36, 38), mes: +ch.slice(38, 40)
    };
  }

  const tipoFamilia = (modelo) => (modelo === '55' || modelo === '65' ? 'NF' : modelo === '57' ? 'CT' : modelo === 'NFSe' ? 'NFSE' : '');

  const esperar = () => new Promise((r) => setTimeout(r, 0));

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  return {
    soDigitos, numNota, parseValor, parseData, fmtData, addDias, fmtMoeda, fmtCNPJ, normTexto,
    normCabecalho, semelhancaNome, nomeArquivoSeguro, chaveNFeValida, cnpjValido, dadosDaChave, dadosChaveNFSe,
    tipoFamilia, esperar, escapeHtml
  };
})();
