/* =====================================================================
   CONFERÊNCIA DE NOTAS x TOTVS RM — Atom Engenharia Elétrica
   Script 02 — Dados iniciais (tipos de movimento, situações, parâmetros)
   Rodar depois do 01. Idempotente (MERGE): pode rodar de novo para atualizar.
   ===================================================================== */

-- Tipos de movimento de entrada (encontrados no relatório de novembro/2026)
MERGE conf.TipoMovimento AS d
USING (VALUES
    ('1.2.01', 'NF de recebimento',                  1),
    ('1.2.04', 'NF de prestação de serviço',         1),
    ('1.2.05', 'Efetivação (contas de consumo etc.)', 1),
    ('1.2.06', 'NF de serviço',                      1),
    ('1.2.08', 'Conhecimento de transporte (CT-e)',  1),
    ('1.2.12', 'NF de recebimento de materiais',     1),
    ('1.2.19', 'Contratos',                          1),
    ('1.2.26', 'NF de materiais',                    1)
) AS o (Codigo, Descricao, Ativo)
ON d.Codigo = o.Codigo
WHEN MATCHED THEN UPDATE SET Descricao = o.Descricao
WHEN NOT MATCHED THEN INSERT (Codigo, Descricao, Ativo) VALUES (o.Codigo, o.Descricao, o.Ativo);
GO

-- Situações (mesmos textos e ordem da tela e do relatório)
MERGE conf.Situacao AS d
USING (VALUES
    ('NAO_RECEBIDA',  'NÃO RECEBIDA',              1, 1, 1),
    ('CONFERIR',      'Conferir manualmente',      2, 0, 1),
    ('PROVAVEL',      'Provavelmente recebida',    3, 0, 1),
    ('FORA_PERIODO',  'Recebida fora do período',  4, 0, 0),
    ('RECEBIDA',      'Recebida',                  5, 0, 0),
    ('OUTRO_DEST',    'Outro destinatário',        6, 0, 0),
    ('EMITIDA',       'Emitida pela empresa',      7, 0, 0),
    ('CANCELADA',     'Cancelada',                 8, 0, 0)
) AS o (Codigo, Descricao, Ordem, EntraNoPacote, Pendencia)
ON d.Codigo = o.Codigo
WHEN MATCHED THEN UPDATE SET Descricao = o.Descricao, Ordem = o.Ordem,
                             EntraNoPacote = o.EntraNoPacote, Pendencia = o.Pendencia
WHEN NOT MATCHED THEN INSERT (Codigo, Descricao, Ordem, EntraNoPacote, Pendencia)
                      VALUES (o.Codigo, o.Descricao, o.Ordem, o.EntraNoPacote, o.Pendencia);
GO

-- Parâmetros
MERGE conf.Parametro AS d
USING (VALUES
    ('CNPJ_EMPRESA',        '04779058000136', 'CNPJ(s) da Atom (só dígitos, separados por ;). Compara pela raiz (8 dígitos).'),
    ('TOLERANCIA_VALOR',    '1.00',           'Diferença de valor aceita (R$). Usa o maior entre isto e 0,5% do valor.'),
    ('DIAS_FOLGA_TOTVS',    '60',             'Dias buscados na TOTVS depois do fim do período (nota lançada depois).'),
    ('MARGEM_DIAS_PADRAO',  '0',              'Dias antes do início para incluir notas emitidas antes.'),
    ('BASE_DATA_PADRAO',    'ENTRADA',        'ENTRADA (data de lançamento) ou EMISSAO.'),
    ('CODCOLIGADA',         '1',              'Coligada da Atom na TOTVS RM (conferir).'),
    ('COR_PRIMARIA',        '#1F3864',        'Azul padrão Atom (tela, Excel, PDF).')
) AS o (Chave, Valor, Descricao)
ON d.Chave = o.Chave
WHEN MATCHED THEN UPDATE SET Descricao = o.Descricao       -- não sobrescreve o valor já ajustado
WHEN NOT MATCHED THEN INSERT (Chave, Valor, Descricao) VALUES (o.Chave, o.Valor, o.Descricao);
GO
