# Conferência de Notas x TOTVS RM — especificação para reimplementar

Acompanha o arquivo `Conferencia-Notas-TOTVS-codigo-fonte.html`, que é a aplicação oficial
funcionando (HTML + CSS + JavaScript puro, sem framework). Este documento resume as regras para
que a versão na aplicação do Dalvino dê **exatamente o mesmo resultado**.

Resultado de referência (para validar a sua versão): `11.zip` (42 NFS-e de novembro) +
`Entradas_11.2026.pdf` (relatório TOTVS), período 01/11/2026 a 30/11/2026, data de entrada,
CNPJ 04.779.058/0001-36 → **42 notas, 37 recebidas, 3 não recebidas (R$ 519,18:
Amaral e Castro 1511, Ortobona 2, 2º Tabelionato 2391), 1 provável (Telefônica 621756, lançada
como 821756), 1 cancelada (Tania 2).**

---

## Prompt para colar no ChatGPT

Anexar no ChatGPT: `Conferencia-Notas-TOTVS-codigo-fonte.html`, este `ESPECIFICACAO-DALVINO.md`,
os scripts `sql/01` a `sql/04` e `referencia/conferencia_novembro_2026.json`. Depois colar:

```text
Você vai implementar na nossa plataforma a "Conferência de Notas x TOTVS RM" da Atom
Engenharia Elétrica. Ela já existe e funciona: o arquivo Conferencia-Notas-TOTVS-codigo-fonte.html
é a versão oficial (HTML + JavaScript puro) e o ESPECIFICACAO-DALVINO.md descreve as regras.

Regras obrigatórias:
1. Reproduza EXATAMENTE a leitura das notas (seção 2), a regra de cruzamento (seção 4),
   as situações e os arquivos gerados (seção 5). Não simplifique nem "melhore" regras.
   Em caso de dúvida, o comportamento do código do HTML é o correto.
2. Os movimentos da TOTVS vêm do banco pela procedure conf.sp_MovimentosEntrada
   (sql/03_movimentos_totvs.sql), e não mais do relatório em PDF.
3. O resultado de cada conferência é gravado chamando conf.sp_GravarConferencia
   (sql/04_gravar_e_consultar.sql) com um JSON no formato de
   referencia/conferencia_novembro_2026.json (mesmos nomes de campos).
4. Visual padrão Atom: azul #1F3864 e o logo oficial (img/logo-atom.png).
5. Critério de aceite: com o 11.zip e os movimentos de novembro/2026, o resultado tem
   que ser igual ao conferencia_novembro_2026.json: 42 notas, 37 recebidas,
   3 NÃO RECEBIDAS (R$ 519,18: Amaral e Castro 1511, Ortobona 2, 2º Tabelionato 2391),
   1 provável (Telefônica 621756, lançada na TOTVS como 821756), 1 cancelada.

Nossa plataforma: [descrever aqui a linguagem, o framework, o banco e onde ficam as notas].

Comece me mostrando o plano de arquivos e a regra de cruzamento implementada com testes
que usem o resultado de referência. Depois a leitura dos XML, dos PDFs e o pacote ZIP.
```

---

## 1. Entradas

**Notas (pasta, com subpastas):** XML, PDF, JPG/PNG, ZIP e RAR (inclusive compactado dentro de
compactado, até 5 níveis). Reconhece o tipo pelo conteúdo quando a extensão não ajuda.

**Movimentos TOTVS:** relatório PDF "Relação de notas fiscais recebidas", Excel ou CSV, ou API.

**Parâmetros:** período (início/fim), base de data dos movimentos (`entrada` ou `emissao`),
margem em dias antes do início, CNPJ(s) da empresa, tolerância de valor (padrão R$ 1,00),
tipos de movimento (padrão: todos os `1.2.xx`).

## 2. Leitura das notas → registro padrão

Cada nota vira: `tipo, modelo, chave, numero, serie, dataEmissao, emitCnpj, emitNome,
destCnpj, destNome, valor, fonte (XML|PDF|Imagem), confianca (alta|media|baixa), cancelada,
anexos[]`. Número sempre **sem zeros à esquerda**; CNPJ só dígitos.

| Documento | Onde ler |
|---|---|
| NF-e/NFC-e (`infNFe`) | Id→chave, `ide/nNF`, `ide/serie`, `ide/mod`, `ide/dhEmi`, `emit/CNPJ`, `emit/xNome`, `dest/CNPJ`, `total/ICMSTot/vNF`, itens `det/prod` |
| Resumo NF-e (`resNFe`) | `chNFe` (número/série/modelo saem da chave), `CNPJ`, `xNome`, `dhEmi`, `vNF`; `cSitNFe=3` = cancelada |
| CT-e (`infCte`) | Id→chave, `ide/nCT`, `emit`, `toma4` ou `dest`, `vPrest/vTPrest` |
| NFS-e Nacional (`infNFSe`, **case-sensitive**) | Id→chave (50 díg.), `nNFSe`, `emit/CNPJ`, `emit/xNome`, `DPS/infDPS/dhEmi`, `toma/CNPJ`, valor = `vServPrest/vServ` (senão `valores/vLiq`) |
| NFS-e ABRASF (`CompNfse`/`InfNfse`) e municipais (SP `NumeroNFe`) | `Numero`, `DataEmissao`, `PrestadorServico`/`Prestador` → `Cnpj`, `RazaoSocial`; `TomadorServico`/`Tomador`; `ValorServicos` (senão `ValorLiquidoNfse`); `NfseCancelamento` = cancelada |
| Cancelamentos | `infEvento` com `tpEvento` 110111/101101/110181 → `chNFe/chCTe/chNFSe`; NFS-e Nacional: `pedRegEvento` com `e101101` → `chNFSe`; `cStat=101` |

**Chave NF-e (44):** `UF(2) AAMM(4) CNPJ(14) modelo(2) série(3) número(9) tpEmis(1) código(8) DV(1)`,
DV módulo 11 (pesos 2..9 da direita). **Chave NFS-e Nacional (50):** `cMun(7) amb(1) tpInsc(1)
inscrição(14) nNFSe(13) AAMM(4) ...`.

**PDF:** texto por página (pdf.js), linhas montadas pela posição Y. Por página procura: chave
de 44 dígitos válida (modelo 55/57/65) ou de 50 dígitos com CNPJ válido; número, data e valor
pelo rótulo (valor à direita na mesma linha ou logo abaixo na mesma coluna), ex.:
"VALOR TOTAL DA NOTA", "DATA DA EMISSÃO", "Número da NFS-e"; fornecedor por
"RECEBEMOS DE (.+) OS PRODUTOS" ou "Nome/Razão Social" abaixo de "PRESTADOR"; CNPJs válidos
da página: fornecedor = primeiro que **não** é da empresa (raiz de 8 dígitos).
**Um PDF com várias notas** é dividido: páginas seguidas com a mesma chave/CNPJ+número (ou
sem identificação, ou "FOLHA 2/2") ficam juntas.
Página sem texto (escaneada): lê as imagens embutidas na resolução original e procura código
de barras CODE-128/QR com a chave; depois tenta renderizar a 200/300/144 dpi.

**Imagem:** código de barras/QR (ZXing), testando a imagem inteira e janelas sobrepostas
(55% e 40% da largura × 12% da altura) e rotações de 0/90/270°. Sem data exata → usa o mês da chave.

**Mesma nota em vários arquivos** (XML + PDF + imagem): junta por chave ou CNPJ+número;
dados do XML têm prioridade; todos os arquivos ficam em `anexos`.

**Nome vazio** (nota só lida por código de barras): pega de outra nota ou do relatório TOTVS
com o mesmo CNPJ (ou a mesma raiz).

## 3. Movimentos TOTVS → registro padrão

`tipoMov` (normalizado `1.2.06`), `numero` (sem zeros), `serie`, `dataEmissao`, `dataEntrada`,
`cnpj`, `fornecedor`, `valor` (bruto), `chave`, `idmov`, `cancelado` (status `C`).
**Parcelas repetidas** da mesma nota viram um único movimento.

Na plataforma, os movimentos vêm de `conf.sp_MovimentosEntrada` (`sql/03_movimentos_totvs.sql`),
que já busca **até 60 dias depois do fim**, para achar notas lançadas mais tarde.

**Relatório em PDF (layout atual):** cada linha
`DataLanc DataEmissao Nº CNPJ? RazaoSocial UF? Movimento - descrição CCusto %ICMS Base VlrICMS VlrBruto VlrLiq Vencimento VlrParc`
(CNPJ e UF podem faltar, ex.: CANVA com `--`).

## 4. Regra de cruzamento (o coração — manter igual)

1. **Notas consideradas:** `dataEmissao` entre `inicio − margem` e `fim` (sem data: mês da chave
   dentro do período; sem nenhuma data → "Conferir manualmente").
2. **Movimentos considerados:** tipos selecionados e não cancelados — **todos**, de qualquer
   data (assim "fora do período" é detectado).
3. Para cada nota, procurar nesta ordem:
   1. chave de acesso → exato;
   2. CNPJ completo + número → exato;
   3. raiz do CNPJ (8) + número → **provável** ("filial diferente");
   4. mesma raiz de CNPJ + valor igual + número parecido (mesmo tamanho ≥ 3 e 1 dígito
      diferente, ou 2 dígitos vizinhos trocados) → **provável** ("possível erro de digitação");
   5. só número: com valor igual **e** nome parecido → exato se faltar CNPJ de um dos lados;
      só valor ou só nome (e sem CNPJ) → provável.
   - Valor igual: diferença ≤ max(tolerância, 0,5% do valor).
   - Nome parecido: palavras em comum ÷ menor nº de palavras ≥ 0,5 (sem acentos, ignorando
     LTDA, ME, EPP, SA, EIRELI, DE, DA, DO, COMERCIO, SERVICOS, INDUSTRIA, CIA, MEI...).
4. **Situação** (nesta prioridade):

| Situação | Quando |
|---|---|
| Cancelada | nota cancelada |
| Emitida pela empresa | raiz do CNPJ do emitente = empresa |
| Provavelmente recebida | achada por critério 3, 4 ou 5-parcial |
| Recebida | achada; data do movimento (pela base escolhida) no período |
| Recebida fora do período | achada; data fora → mostrar a data e o movimento |
| Outro destinatário | não achada, confiança alta e destinatário de outro CNPJ |
| Conferir manualmente | sem número, sem data, ou baixa confiança sem CNPJ |
| **NÃO RECEBIDA** | todo o resto |

   Se achou mas o valor difere → observação "Valor diferente: nota X × TOTVS Y".
5. **TOTVS sem nota na pasta:** movimentos com data no período que não foram usados por nenhuma nota.
6. Ordem: NÃO RECEBIDA, Conferir, Provável, Fora, Recebida, Outro destinatário, Emitida, Cancelada;
   depois emissão e fornecedor.

## 5. Saídas

**ZIP** `Notas nao recebidas DD-MM-AAAA a DD-MM-AAAA.zip`:
- `Relatorio notas nao recebidas.xlsx` — abas: *Não recebidas* (com total), *Conferir*,
  *Todas as notas* (cores por situação), *TOTVS sem documento*, *Parâmetros*. Título com logo,
  cabeçalho azul `#1F3864` com fonte branca em negrito, filtros, painel congelado.
- `conferencia.json` — resultado completo, no formato de `conf.sp_GravarConferencia`.
- `Relatorio notas nao recebidas.pdf` — paisagem, logo, quadros-resumo, tabela das não recebidas
  e página dos movimentos sem nota.
- `Notas nao recebidas/` — um PDF por nota:
  `{NF|NFS-e|CT-e|NFC-e} {número} - {FORNECEDOR} - emissao DD-MM-AAAA.pdf` (+ o `.xml` original).
  PDF = páginas recortadas do PDF original; ou a imagem convertida; ou, só com XML, um "espelho"
  gerado (dados + itens, com aviso de que não substitui o DANFE).

Colunas do relatório: Item, Fornecedor, CNPJ, Tipo, Nº da nota, Série, Emissão, Valor,
Chave de acesso, Arquivo de origem (com páginas), Observação (+ Situação, Movimento TOTVS,
Entrada TOTVS, Como foi encontrada nas abas completas).

## 6. Visual (padrão Atom)

Azul `#1F3864` (cabeçalho e botões), fundo `#F3F5F9`, logo Atom Engenharia Elétrica no
topo. Tela em 3 passos (Notas · TOTVS · Período e filtros), quadros-resumo clicáveis, filtros
por situação, busca e botão "PDF" por nota.

## 7. Banco de dados (scripts oficiais — SQL Server 2016 SP1+)

Rodar em um banco **da plataforma** (nunca dentro do banco da TOTVS), nesta ordem:

| Script | O que faz |
|---|---|
| `sql/01_estrutura.sql` | Schema `conf` e tabelas: `TipoMovimento`, `Situacao`, `Parametro`, `Conferencia` (cada execução + resumo), `ConferenciaNota` (uma linha por nota), `ConferenciaMovSemNota` |
| `sql/02_dados_iniciais.sql` | Tipos 1.2.01…1.2.26, as 8 situações (mesmos textos da tela), parâmetros (CNPJ 04779058000136, tolerância 1,00, folga 60 dias, coligada) |
| `sql/03_movimentos_totvs.sql` | Sinônimos para `TMOV`/`FCFO` da TOTVS e `conf.sp_MovimentosEntrada @Inicio, @Fim, @Base, @DiasFolga, @Tipos` (somente leitura) |
| `sql/04_gravar_e_consultar.sql` | `conf.sp_GravarConferencia @Json` (grava tudo numa transação e devolve o Id) e as views `vw_ResumoConferencia`, `vw_NotasConferencia`, `vw_NotasNaoRecebidas` |
| `referencia/05_teste_referencia.sql` | Grava a conferência real de novembro, confere os totais (tudo "OK") e desfaz (ROLLBACK) |

**Ajustar antes de rodar o 03:** nome do banco da TOTVS nos sinônimos (padrão `CORPORE`) e o
campo da data de lançamento ("Data Lanc" do relatório — usar o mesmo campo da sentença SQL do
relatório "Relação de notas fiscais recebidas"). Conferir se a versão tem `TMOV.CHAVEACESSONFE`.
O teste da procedure é comparar com o relatório: novembro/2026 com `@DiasFolga = 0` → 325 notas.

Situações (código no banco → texto na tela): `NAO_RECEBIDA` → NÃO RECEBIDA, `CONFERIR` →
Conferir manualmente, `PROVAVEL` → Provavelmente recebida, `FORA_PERIODO` → Recebida fora do
período, `RECEBIDA` → Recebida, `OUTRO_DEST` → Outro destinatário, `EMITIDA` → Emitida pela
empresa, `CANCELADA` → Cancelada.

O ZIP gerado também traz `conferencia.json` — é exatamente o JSON que `sp_GravarConferencia` recebe.

## 8. Bibliotecas usadas (versões exatas)

jszip 3.10.1 · xlsx (SheetJS) 0.18.5 · exceljs 4.4.0 · pdfjs-dist 3.11.174 · pdf-lib 1.17.1 ·
jspdf 2.5.2 + jspdf-autotable 3.8.4 · @zxing/library 0.21.3 · node-unrar-js 2.0.2.
No servidor (Node, Python, .NET) existem equivalentes para todas.
