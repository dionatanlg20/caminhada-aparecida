# API de movimentos de entrada (integração direta com a TOTVS RM)

Proposta para a segunda fase: em vez de exportar o relatório, a tela busca os movimentos
direto da TOTVS por uma API interna (feita pelo Dalvino, com o acesso e a segurança do banco).
A tela já tem o campo **"Buscar direto da TOTVS"** pronto para usar este contrato.

## Endpoint

```
GET {base}/movimentos?inicio=2026-11-01&fim=2027-01-29&base=entrada&tipos=1.2.04,1.2.06,1.2.12
Authorization: Bearer <token>
```

| Parâmetro | Descrição |
|---|---|
| `inicio`, `fim` | Datas `AAAA-MM-DD`. A tela já pede 60 dias a mais depois do fim, para achar notas lançadas depois. |
| `base` | `entrada` (DATAENTRADA / data de lançamento) ou `emissao` (DATAEMISSAO). |
| `tipos` | Códigos de tipo de movimento separados por vírgula. |

## Resposta (JSON)

```json
{
  "movimentos": [
    {
      "idmov": 123456,
      "coligada": 1,
      "filial": 1,
      "tipoMovimento": "1.2.12",
      "numero": "001501",
      "serie": "1",
      "dataEmissao": "2026-11-03",
      "dataEntrada": "2026-11-04",
      "codFornecedor": "F0001",
      "nomeFornecedor": "ACO FORTE DISTRIBUIDORA LTDA",
      "cnpjFornecedor": "45123456000187",
      "valor": 18450.00,
      "chaveAcesso": "41261145123456000187550010000015011434640973",
      "cancelado": false
    }
  ]
}
```

## Sugestão de consulta (TOTVS RM — conferir nomes no ambiente)

```sql
SELECT M.IDMOV, M.CODCOLIGADA AS coligada, M.CODFILIAL AS filial,
       M.CODTMV AS tipoMovimento, M.NUMEROMOV AS numero, M.SERIE AS serie,
       M.DATAEMISSAO AS dataEmissao, M.DATAENTRADA AS dataEntrada,
       F.CODCFO AS codFornecedor, F.NOME AS nomeFornecedor, F.CGCCFO AS cnpjFornecedor,
       M.VALORBRUTO AS valor, M.CHAVEACESSONFE AS chaveAcesso,
       CASE WHEN M.STATUS = 'C' THEN 1 ELSE 0 END AS cancelado
FROM TMOV M
JOIN FCFO F ON F.CODCOLIGADA = M.CODCOLCFO AND F.CODCFO = M.CODCFO
WHERE M.CODTMV IN ('1.2.04', '1.2.06', '1.2.12')
  AND M.DATAENTRADA BETWEEN @inicio AND @fim
```

> `CHAVEACESSONFE` pode estar em outra tabela/campo conforme a versão e a parametrização
> (ex.: `TMOVCOMPL` ou campo complementar). Com a chave, o cruzamento fica exato.

## Observações

- Se a API ficar em outro endereço que a página, liberar **CORS** para a origem da página.
- Usuário de banco **somente leitura**.
- A regra de cruzamento está toda em `js/conferencia.js`, sem dependência da tela, e pode ser
  levada para o servidor (Node.js) se depois a conferência precisar rodar sozinha (ex.: todo
  dia, lendo a pasta do servidor e enviando o ZIP por e-mail).
