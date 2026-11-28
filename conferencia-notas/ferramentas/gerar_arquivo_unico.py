"""Junta index.html, CSS, JS e bibliotecas em um único arquivo HTML.
Uso: python ferramentas/gerar_arquivo_unico.py  ->  Conferencia-Notas-TOTVS.html"""
import os, re
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
html = open(os.path.join(BASE, 'index.html'), encoding='utf-8').read()

def css(m):
    return '<style>\n' + open(os.path.join(BASE, m.group(1)), encoding='utf-8').read() + '\n</style>'
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', css, html)

def js(m):
    codigo = open(os.path.join(BASE, m.group(1)), encoding='utf-8').read()
    codigo = re.sub(r'</(script)', r'<\\/\1', codigo, flags=re.I)  # não fechar a tag antes da hora
    return '<script>\n' + codigo + '\n</script>'
html = re.sub(r'<script src="([^"]+)"></script>', js, html)

saida = os.path.join(BASE, 'Conferencia-Notas-TOTVS.html')
open(saida, 'w', encoding='utf-8').write(html)
print(saida, round(os.path.getsize(saida) / 1e6, 1), 'MB')
