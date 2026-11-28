"""Gera um HTML só com o código da aplicação (sem as bibliotecas embutidas),
para estudar, revisar ou passar para outra IA. As bibliotecas vêm por CDN.
Uso: python ferramentas/gerar_codigo_fonte.py  ->  Conferencia-Notas-TOTVS-codigo-fonte.html"""
import os, re
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CDN = {
  'lib/jszip.min.js': 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'lib/xlsx.full.min.js': 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'lib/exceljs.min.js': 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js',
  'lib/pdf.min.js': 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  'lib/pdf.worker.min.js': 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js',
  'lib/pdf-lib.min.js': 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'lib/jspdf.umd.min.js': 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',
  'lib/jspdf.plugin.autotable.min.js': 'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js',
  'lib/zxing.min.js': 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js',
}
html = open(os.path.join(BASE, 'index.html'), encoding='utf-8').read()
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">',
  lambda m: '<style>\n' + open(os.path.join(BASE, m.group(1)), encoding='utf-8').read() + '\n</style>', html)

def js(m):
    src = m.group(1)
    if src in CDN: return f'<script src="{CDN[src]}"></script>'
    if src == 'lib/unrar.bundle.js':
        return ('<!-- Leitor de RAR: node-unrar-js 2.0.2 (WebAssembly) empacotado com o .wasm embutido.\n'
                '     Arquivo lib/unrar.bundle.js da pasta completa. Sem ele, só ZIP é aberto. -->\n'
                '<script src="lib/unrar.bundle.js"></script>')
    if src == 'logo.js':
        return ('<script>\n/* Logo: na pasta completa fica em logo.js (base64 de img/logo-atom.png).\n'
                '   Numa aplicação servida por HTTP pode ser só a URL da imagem. */\nwindow.ATOM_LOGO = null;\n</script>')
    codigo = open(os.path.join(BASE, src), encoding='utf-8').read()
    codigo = re.sub(r'</(script)', r'<\\/\1', codigo, flags=re.I)
    return f'<script>\n/* ===================== {src} ===================== */\n' + codigo + '\n</script>'
html = re.sub(r'<script src="([^"]+)"></script>', js, html)
cab = ('<!--\n  Conferência de Notas x TOTVS RM — código-fonte da aplicação (Atom Engenharia Elétrica)\n'
       '  Regras e especificação: ESPECIFICACAO-DALVINO.md\n-->\n')
saida = os.path.join(BASE, 'Conferencia-Notas-TOTVS-codigo-fonte.html')
open(saida, 'w', encoding='utf-8').write(html.replace('<!doctype html>', '<!doctype html>\n' + cab, 1))
print(saida, round(os.path.getsize(saida) / 1e3), 'KB')
