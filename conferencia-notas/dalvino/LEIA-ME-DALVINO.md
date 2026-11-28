# Pacote oficial — Conferência de Notas x TOTVS RM (Atom Engenharia Elétrica)

## O que tem aqui

| Arquivo | Para quê |
|---|---|
| `Conferencia-Notas-TOTVS-codigo-fonte.html` | Aplicação oficial (HTML + JavaScript), versão de referência |
| `ESPECIFICACAO-DALVINO.md` | Regras completas + **prompt pronto para o ChatGPT** (no início do arquivo) |
| `sql/01_estrutura.sql` | Cria o schema `conf` e as tabelas |
| `sql/02_dados_iniciais.sql` | Tipos de movimento, situações e parâmetros (CNPJ da Atom etc.) |
| `sql/03_movimentos_totvs.sql` | Lê os movimentos de entrada da TOTVS RM (somente leitura) |
| `sql/04_gravar_e_consultar.sql` | Grava cada conferência (JSON) e views de consulta |
| `referencia/05_teste_referencia.sql` | Teste com a conferência real de novembro/2026 (desfaz no final) |
| `referencia/conferencia_novembro_2026.json` | Resultado de referência (critério de aceite) |
| `img/logo-atom.png` | Logo oficial |
| `API-FUTURA.md` | Contrato de API, caso a tela busque os movimentos por HTTP |

## Ordem para instalar no banco (SQL Server 2016 SP1+)

1. Criar/usar um banco **da plataforma** (não usar o banco da TOTVS).
2. Rodar `sql/01_estrutura.sql` e `sql/02_dados_iniciais.sql`.
3. Em `sql/03_movimentos_totvs.sql`, ajustar as linhas marcadas `>>> AJUSTAR`
   (nome do banco da TOTVS e campo da data de lançamento) e rodar.
4. Rodar `sql/04_gravar_e_consultar.sql`.
5. Rodar `referencia/05_teste_referencia.sql` → todas as linhas devem dar **OK**.
6. Testar a leitura da TOTVS:
   `EXEC conf.sp_MovimentosEntrada '2026-11-01', '2026-11-30', 'ENTRADA', 0;`
   → deve bater com o relatório "Relação de notas fiscais recebidas" de novembro (325 notas).

## Como usar com o ChatGPT

Anexar o HTML, a especificação, os 4 scripts da pasta `sql` e o JSON de referência,
e colar o prompt que está no início do `ESPECIFICACAO-DALVINO.md`
(completando a linha "Nossa plataforma: ...").

> Os scripts foram validados quanto à sintaxe, mas **não foram executados num SQL Server
> real**. Rode primeiro em homologação.
