# Conferência de Notas x TOTVS RM

Confere se as notas fiscais de entrada (NF-e modelo 55, NFS-e, CT-e) que estão numa pasta
foram lançadas nos movimentos de entrada da TOTVS RM (1.2.04, 1.2.06, 1.2.12…) e gera um
pacote ZIP com o relatório e o PDF de cada nota **não recebida**.

Funciona direto no navegador, **sem instalar nada e sem internet**: tudo é processado no
computador, nenhum arquivo é enviado para fora.

## Como usar

**Jeito mais fácil:** baixe o arquivo único `Conferencia-Notas-TOTVS.html` e dê dois cliques
(abre no Chrome ou Edge). Ele já tem tudo dentro, não precisa de pasta nem extrair nada.
Depois de mudar o código, gere de novo com `python ferramentas/gerar_arquivo_unico.py`.

Ou, com a pasta completa:

1. **Extraia** o ZIP (botão direito → *Extrair tudo*). Abrir o `index.html` de dentro do ZIP
   sem extrair não funciona.
2. Dê dois cliques em `index.html` (abre no Chrome ou Edge).
3. **Passo 1 – Notas:** clique em *Escolher pasta* (ou arraste a pasta para a tela).
   Lê, inclusive dentro de subpastas:
   - XML de NF-e/NFC-e, CT-e, NFS-e Padrão Nacional, NFS-e ABRASF e outras municipais
     (ex.: São Paulo), resumo de NF-e e eventos de cancelamento;
   - PDF de DANFE e de NFS-e — **um PDF com várias notas** (ex.: o ano todo) é separado
     nota por nota;
   - PDF escaneado e foto (JPEG/PNG): lê o **código de barras** da chave de acesso;
   - ZIP e RAR, inclusive compactado dentro de compactado.
4. **Passo 2 – TOTVS:** escolha o relatório de movimentos exportado da TOTVS:
   o PDF **"Relação de notas fiscais recebidas"** (lido linha a linha, juntando as parcelas
   da mesma nota) ou Excel .xlsx/.xls, .csv ou .txt. O sistema acha sozinho a linha de cabeçalho e as colunas;
   confira em *Colunas do relatório* e ajuste se precisar. Marque os tipos de movimento: por padrão vêm marcados **todos os tipos de entrada 1.2.xx**
   encontrados (1.2.01, 1.2.04, 1.2.05, 1.2.06, 1.2.08, 1.2.12, 1.2.19, 1.2.26…), para uma nota lançada
   em outro tipo não aparecer como não recebida.
5. **Passo 3 – Período:** informe o período (ex.: 01/11 a 30/11), se o período dos
   lançamentos é pela data de **entrada** ou de **emissão**, e o CNPJ da empresa.
6. Clique em **Conferir notas** e depois em **Baixar pacote ZIP**.

### O que vem no ZIP

```
Notas nao recebidas 01-11-2026 a 30-11-2026.zip
├── Relatorio notas nao recebidas.xlsx   (abas: Não recebidas, Conferir, Todas as notas,
│                                          TOTVS sem documento, Parâmetros)
├── Relatorio notas nao recebidas.pdf
└── Notas nao recebidas/
    ├── NF 1502 - ACO FORTE DISTRIBUIDORA LTDA - emissao 10-11-2026.pdf
    ├── NF 1502 - ACO FORTE DISTRIBUIDORA LTDA - emissao 10-11-2026.xml
    └── NFS-e 78 - LIMPA BEM SERVICOS GERAIS EIRELI - emissao 28-11-2026.pdf
```

O PDF de cada nota é: as páginas dela recortadas do PDF original; ou a foto convertida em PDF;
ou, quando só existe o XML, um **espelho** da nota gerado a partir do XML (com aviso de que não
substitui o DANFE). O ZIP abre normalmente no WinRAR.

## Como a conferência funciona

- **Quais notas entram:** as da pasta com **data de emissão** dentro do período
  (opcionalmente alguns dias antes do início). Nota só lida pelo código de barras não tem dia
  de emissão, então usa o mês da chave de acesso.
- **Como acha a nota na TOTVS** (nesta ordem):
  1. chave de acesso (se o relatório tiver a coluna);
  2. CNPJ do fornecedor + número da nota;
  3. raiz do CNPJ + número (fornecedor cadastrado na matriz e nota da filial) → *Provavelmente recebida*;
  4. número + valor e/ou nome do fornecedor (quando o relatório não tem CNPJ).
- **Situações:**

| Situação | Significado |
|---|---|
| NÃO RECEBIDA | Não existe movimento de entrada para a nota. Vai para o ZIP. |
| Recebida | Lançada dentro do período. |
| Recebida fora do período | Lançada, mas com data fora do período (mostra a data). |
| Provavelmente recebida | Achada por critério aproximado. Confirme. |
| Conferir manualmente | Arquivo sem dados suficientes (ex.: foto ilegível). |
| Cancelada / Emitida pela empresa / Outro destinatário | Não entram na pendência. |

- **TOTVS sem nota na pasta:** conferência inversa — movimentos lançados no período cuja
  nota não está na pasta.
- Movimentos com status **C / Cancelado** no relatório são ignorados.

### Dicas

- Exporte o relatório da TOTVS com **alguns dias a mais depois do fim do período**: assim uma
  nota de 28/11 lançada em 03/12 aparece como *Recebida fora do período*, e não como não recebida.
- Colunas que ajudam muito no relatório: tipo de movimento, número, série, data de emissão,
  data de entrada, **CNPJ do fornecedor**, nome do fornecedor, valor e, se possível,
  **chave de acesso** (`CHAVEACESSONFE`).
- Escaneie notas com **pelo menos 200 dpi** para o código de barras ser lido.
- Os tipos de movimento padrão e os nomes de coluna reconhecidos ficam em `js/config.js`.

## Logo

O logo da Atom Engenharia Elétrica já vem embutido (`logo.js`; original em `img/logo-atom.png`)
e sai na tela, no Excel e no PDF. Para trocar, use **Logo / Configurações** na tela.

## Teste com os exemplos

A pasta `exemplos/` tem notas fictícias (XML, PDF com várias notas, NFS-e em PDF, foto, PDF
escaneado, ZIP e RAR) e um relatório da TOTVS de exemplo. Use o CNPJ da empresa
`11.222.333/0001-81` e o período 01/11/2026 a 30/11/2026: o resultado esperado é 7 notas não
recebidas, 1 fora do período, 1 provável, 1 cancelada e 1 movimento sem nota.

## Limitações conhecidas

- PDF escaneado ou foto **sem** código de barras legível não é lido (não há OCR): aparece em
  *Conferir manualmente*.
- PDFs de NFS-e municipais têm layouts muito diferentes; a leitura é por aproximação
  (número, CNPJ, data e valor). Sempre que existir, o XML é a fonte mais confiável.
- RAR com senha não é aberto (aparece nos avisos).

## Estrutura

```
index.html            tela
css/estilo.css        visual padrão Atom (azul #1F3864)
js/config.js          tipos de movimento, nomes de coluna da TOTVS, cor
js/leitor-arquivos.js abre pasta, ZIP e RAR
js/parser-xml.js      NF-e, CT-e, NFS-e nacional/ABRASF, cancelamentos
js/parser-pdf.js      DANFE / NFS-e em PDF, separa notas por página
js/parser-imagem.js   código de barras / QR Code (fotos e páginas escaneadas)
js/totvs.js           lê o relatório da TOTVS (e a API futura)
js/conferencia.js     regras de cruzamento
js/exportar.js        Excel, PDF, PDF por nota e ZIP
lib/                  bibliotecas (funcionam offline)
API-FUTURA.md         contrato da API de movimentos para a integração direta
```
