/* =====================================================================
   CONFERÊNCIA DE NOTAS x TOTVS RM — Atom Engenharia Elétrica
   Script 03 — Leitura dos movimentos de entrada da TOTVS RM (somente leitura)
   ---------------------------------------------------------------------
   ANTES DE RODAR, AJUSTAR 2 PONTOS (marcados com >>> AJUSTAR):
     1) O nome do banco da TOTVS RM nos SINÔNIMOS (padrão: CORPORE).
     2) O campo da DATA DE LANÇAMENTO usado no relatório
        "Relação de notas fiscais recebidas" (coluna "Data Lanc").
        Dica: abrir a sentença SQL desse relatório no RM e usar o mesmo campo,
        assim o resultado fica idêntico ao relatório que já é usado hoje.
   Também conferir se TMOV tem CHAVEACESSONFE na versão instalada (ver abaixo).
   ===================================================================== */

/* ---------- Sinônimos: único lugar com o nome do banco da TOTVS ---------- */
-- >>> AJUSTAR: trocar CORPORE pelo nome do banco da TOTVS RM (e o servidor, se for outro).
IF OBJECT_ID('conf.TOTVS_TMOV', 'SN') IS NOT NULL DROP SYNONYM conf.TOTVS_TMOV;
CREATE SYNONYM conf.TOTVS_TMOV FOR [CORPORE].dbo.TMOV;
IF OBJECT_ID('conf.TOTVS_FCFO', 'SN') IS NOT NULL DROP SYNONYM conf.TOTVS_FCFO;
CREATE SYNONYM conf.TOTVS_FCFO FOR [CORPORE].dbo.FCFO;
GO

/* ---------- Procedure: movimentos de entrada no período ----------
   Devolve UMA linha por movimento (as parcelas ficam na FLAN, não repetem aqui).
   Busca até @DiasFolga dias depois do fim, para achar nota lançada depois
   (vira "Recebida fora do período", e não "NÃO RECEBIDA").
   Retorno = contrato da aplicação (mesmos nomes do API-FUTURA.md).          */
CREATE OR ALTER PROCEDURE conf.sp_MovimentosEntrada
    @Inicio      DATE,
    @Fim         DATE,
    @Base        VARCHAR(10)  = 'ENTRADA',     -- 'ENTRADA' ou 'EMISSAO'
    @DiasFolga   INT          = NULL,          -- NULL = parâmetro DIAS_FOLGA_TOTVS (60)
    @Tipos       VARCHAR(500) = NULL           -- NULL = tipos ativos em conf.TipoMovimento
AS
BEGIN
    SET NOCOUNT ON;
    SET TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;   -- não trava a TOTVS (só leitura)

    DECLARE @Coligada INT = (SELECT TRY_CAST(Valor AS INT) FROM conf.Parametro WHERE Chave = 'CODCOLIGADA');
    IF @DiasFolga IS NULL
        SET @DiasFolga = ISNULL((SELECT TRY_CAST(Valor AS INT) FROM conf.Parametro WHERE Chave = 'DIAS_FOLGA_TOTVS'), 60);
    DECLARE @FimBusca DATE = DATEADD(DAY, @DiasFolga, @Fim);

    DECLARE @TiposSel TABLE (Codigo VARCHAR(10) PRIMARY KEY);
    IF @Tipos IS NULL
        INSERT @TiposSel SELECT Codigo FROM conf.TipoMovimento WHERE Ativo = 1;
    ELSE
        INSERT @TiposSel SELECT DISTINCT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@Tipos, ';') WHERE LTRIM(RTRIM(value)) <> '';

    ;WITH M AS (
        SELECT
            T.IDMOV,
            T.CODCOLIGADA,
            T.CODFILIAL,
            T.CODTMV,
            T.NUMEROMOV,
            T.SERIE,
            CAST(T.DATAEMISSAO AS DATE)                   AS DATAEMISSAO,
            -- >>> AJUSTAR: campo da "Data Lanc" do relatório (ex.: DATAMOVIMENTO, DATAENTRADA, DATAEXTRA1).
            CAST(T.DATAMOVIMENTO AS DATE)                 AS DATAENTRADA,
            T.VALORBRUTO,
            T.STATUS,
            -- Chave de acesso da NF-e/CT-e. Se a versão não tiver TMOV.CHAVEACESSONFE,
            -- trocar por NULL ou pela tabela onde a chave fica (ex.: TMOVCOMPL).
            T.CHAVEACESSONFE                              AS CHAVEACESSO,
            F.CODCFO,
            F.NOME,
            F.CGCCFO
        FROM conf.TOTVS_TMOV AS T
        JOIN conf.TOTVS_FCFO AS F
          ON F.CODCOLIGADA = T.CODCOLCFO
         AND F.CODCFO      = T.CODCFO
        WHERE (@Coligada IS NULL OR T.CODCOLIGADA = @Coligada)
          AND T.CODTMV IN (SELECT Codigo FROM @TiposSel)
    )
    SELECT
        M.IDMOV                                               AS idmov,
        M.CODCOLIGADA                                         AS coligada,
        M.CODFILIAL                                           AS filial,
        M.CODTMV                                              AS tipoMovimento,
        -- número sem zeros à esquerda ('000032843' -> '32843')
        ISNULL(NULLIF(SUBSTRING(M.NUMEROMOV, PATINDEX('%[^0]%', M.NUMEROMOV + 'x'), 20), ''), '0') AS numero,
        M.SERIE                                               AS serie,
        M.DATAEMISSAO                                         AS dataEmissao,
        M.DATAENTRADA                                         AS dataEntrada,
        M.CODCFO                                              AS codFornecedor,
        M.NOME                                                AS nomeFornecedor,
        -- CNPJ só com dígitos
        REPLACE(REPLACE(REPLACE(REPLACE(ISNULL(M.CGCCFO, ''), '.', ''), '/', ''), '-', ''), ' ', '') AS cnpjFornecedor,
        CAST(M.VALORBRUTO AS DECIMAL(15,2))                   AS valor,
        NULLIF(LTRIM(RTRIM(M.CHAVEACESSO)), '')               AS chaveAcesso,
        CAST(CASE WHEN M.STATUS = 'C' THEN 1 ELSE 0 END AS BIT) AS cancelado
    FROM M
    WHERE (CASE WHEN @Base = 'EMISSAO' THEN M.DATAEMISSAO ELSE M.DATAENTRADA END)
          BETWEEN @Inicio AND @FimBusca
    ORDER BY dataEntrada, numero;
END
GO

/* ---------- Permissão (rodar como administrador) ----------
   O usuário da plataforma só precisa LER TMOV e FCFO na TOTVS:

   USE [CORPORE];
   CREATE USER [usr_plataforma] FOR LOGIN [usr_plataforma];
   GRANT SELECT ON dbo.TMOV TO [usr_plataforma];
   GRANT SELECT ON dbo.FCFO TO [usr_plataforma];
*/

/* ---------- Teste rápido ----------
   EXEC conf.sp_MovimentosEntrada @Inicio = '2026-11-01', @Fim = '2026-11-30';
   -- Esperado (novembro/2026, com @DiasFolga = 0): 325 notas entre 03/11 e 27/11,
   -- iguais ao relatório "Relação de notas fiscais recebidas".
   EXEC conf.sp_MovimentosEntrada @Inicio = '2026-11-01', @Fim = '2026-11-30', @DiasFolga = 0;
*/
