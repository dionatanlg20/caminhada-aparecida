/* =====================================================================
   CONFERÊNCIA DE NOTAS x TOTVS RM — Atom Engenharia Elétrica
   Script 04 — Gravar o resultado de uma conferência e consultar
   ---------------------------------------------------------------------
   A aplicação gera um JSON (o mesmo "conferencia.json" que vai no ZIP)
   e chama conf.sp_GravarConferencia, que grava tudo numa transação
   e devolve o Id da conferência.
   Requer nível de compatibilidade 130+ (SQL Server 2016) por causa do OPENJSON.
   ===================================================================== */

CREATE OR ALTER PROCEDURE conf.sp_GravarConferencia
    @Json        NVARCHAR(MAX),
    @PastaNotas  VARCHAR(500) = NULL,
    @ArquivoZip  VARCHAR(500) = NULL,
    @Id          INT          = NULL OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF ISJSON(@Json) <> 1
        THROW 50001, 'JSON inválido.', 1;

    BEGIN TRAN;

    INSERT conf.Conferencia (
        DataInicio, DataFim, BaseDataMovimento, MargemDias, CnpjEmpresa, ToleranciaValor,
        TiposMovimento, OrigemMovimentos, PastaNotas, QtdNotas, QtdRecebidas, QtdForaPeriodo,
        QtdProvaveis, QtdNaoRecebidas, QtdConferirManual, QtdOutras, QtdTotvsSemNota,
        ValorNaoRecebido, ArquivoPacote, Usuario)
    SELECT
        c.dataInicio, c.dataFim, c.baseDataMovimento, ISNULL(c.margemDias, 0), c.cnpjEmpresa,
        ISNULL(c.toleranciaValor, 1), ISNULL(c.tiposMovimento, ''), ISNULL(c.origemMovimentos, 'TOTVS_SQL'),
        @PastaNotas, c.qtdNotas, c.qtdRecebidas, c.qtdForaPeriodo, c.qtdProvaveis, c.qtdNaoRecebidas,
        c.qtdConferirManual, c.qtdOutras, c.qtdTotvsSemNota, c.valorNaoRecebido, @ArquivoZip,
        ISNULL(c.usuario, SUSER_SNAME())
    FROM OPENJSON(@Json, '$.conferencia') WITH (
        dataInicio         DATE           '$.dataInicio',
        dataFim            DATE           '$.dataFim',
        baseDataMovimento  VARCHAR(10)    '$.baseDataMovimento',
        margemDias         SMALLINT       '$.margemDias',
        cnpjEmpresa        VARCHAR(200)   '$.cnpjEmpresa',
        toleranciaValor    DECIMAL(15,2)  '$.toleranciaValor',
        tiposMovimento     VARCHAR(500)   '$.tiposMovimento',
        origemMovimentos   VARCHAR(20)    '$.origemMovimentos',
        usuario            VARCHAR(100)   '$.usuario',
        qtdNotas           INT            '$.qtdNotas',
        qtdRecebidas       INT            '$.qtdRecebidas',
        qtdForaPeriodo     INT            '$.qtdForaPeriodo',
        qtdProvaveis       INT            '$.qtdProvaveis',
        qtdNaoRecebidas    INT            '$.qtdNaoRecebidas',
        qtdConferirManual  INT            '$.qtdConferirManual',
        qtdOutras          INT            '$.qtdOutras',
        qtdTotvsSemNota    INT            '$.qtdTotvsSemNota',
        valorNaoRecebido   DECIMAL(15,2)  '$.valorNaoRecebido'
    ) AS c;

    SET @Id = SCOPE_IDENTITY();

    INSERT conf.ConferenciaNota (
        ConferenciaId, Situacao, TipoDocumento, Modelo, ChaveAcesso, Numero, Serie, DataEmissao,
        AnoMesChave, EmitenteCnpj, EmitenteNome, DestinatarioCnpj, Valor, Fonte, Confianca, Cancelada,
        ArquivosOrigem, NomeArquivoPacote, Observacao, MovIdmov, MovCodTmv, MovNumero,
        MovDataEntrada, MovDataEmissao, MovValor, ComoEncontrada)
    SELECT
        @Id, n.situacao, n.tipoDocumento, n.modelo, n.chaveAcesso, n.numero, n.serie, n.dataEmissao,
        n.anoMesChave, n.emitenteCnpj, LEFT(n.emitenteNome, 200), n.destinatarioCnpj, n.valor, n.fonte,
        n.confianca, ISNULL(n.cancelada, 0), LEFT(n.arquivosOrigem, 2000), n.nomeArquivoPacote,
        LEFT(n.observacao, 1000), n.movIdmov, n.movCodTmv, n.movNumero, n.movDataEntrada,
        n.movDataEmissao, n.movValor, LEFT(n.comoEncontrada, 200)
    FROM OPENJSON(@Json, '$.notas') WITH (
        situacao          VARCHAR(20)    '$.situacao',
        tipoDocumento     VARCHAR(20)    '$.tipoDocumento',
        modelo            VARCHAR(5)     '$.modelo',
        chaveAcesso       VARCHAR(50)    '$.chaveAcesso',
        numero            VARCHAR(20)    '$.numero',
        serie             VARCHAR(10)    '$.serie',
        dataEmissao       DATE           '$.dataEmissao',
        anoMesChave       CHAR(7)        '$.anoMesChave',
        emitenteCnpj      VARCHAR(14)    '$.emitenteCnpj',
        emitenteNome      NVARCHAR(400)  '$.emitenteNome',
        destinatarioCnpj  VARCHAR(14)    '$.destinatarioCnpj',
        valor             DECIMAL(15,2)  '$.valor',
        fonte             VARCHAR(10)    '$.fonte',
        confianca         VARCHAR(5)     '$.confianca',
        cancelada         BIT            '$.cancelada',
        arquivosOrigem    NVARCHAR(4000) '$.arquivosOrigem',
        nomeArquivoPacote VARCHAR(300)   '$.nomeArquivoPacote',
        observacao        NVARCHAR(2000) '$.observacao',
        movIdmov          INT            '$.movIdmov',
        movCodTmv         VARCHAR(10)    '$.movCodTmv',
        movNumero         VARCHAR(20)    '$.movNumero',
        movDataEntrada    DATE           '$.movDataEntrada',
        movDataEmissao    DATE           '$.movDataEmissao',
        movValor          DECIMAL(15,2)  '$.movValor',
        comoEncontrada    NVARCHAR(400)  '$.comoEncontrada'
    ) AS n;

    INSERT conf.ConferenciaMovSemNota (
        ConferenciaId, Idmov, CodTmv, Numero, Serie, FornecedorCnpj, FornecedorNome,
        DataEmissao, DataEntrada, Valor)
    SELECT
        @Id, m.idmov, m.codTmv, m.numero, m.serie, m.fornecedorCnpj, LEFT(m.fornecedorNome, 200),
        m.dataEmissao, m.dataEntrada, m.valor
    FROM OPENJSON(@Json, '$.movimentosSemNota') WITH (
        idmov           INT            '$.idmov',
        codTmv          VARCHAR(10)    '$.codTmv',
        numero          VARCHAR(20)    '$.numero',
        serie           VARCHAR(10)    '$.serie',
        fornecedorCnpj  VARCHAR(14)    '$.fornecedorCnpj',
        fornecedorNome  NVARCHAR(400)  '$.fornecedorNome',
        dataEmissao     DATE           '$.dataEmissao',
        dataEntrada     DATE           '$.dataEntrada',
        valor           DECIMAL(15,2)  '$.valor'
    ) AS m;

    COMMIT;

    SELECT @Id AS ConferenciaId;
END
GO

/* ---------- Views para telas e relatórios ---------- */

-- Resumo de cada conferência
CREATE OR ALTER VIEW conf.vw_ResumoConferencia AS
SELECT
    c.Id, c.DataInicio, c.DataFim, c.BaseDataMovimento, c.QtdNotas, c.QtdRecebidas,
    c.QtdForaPeriodo, c.QtdProvaveis, c.QtdNaoRecebidas, c.QtdConferirManual, c.QtdOutras,
    c.QtdTotvsSemNota, c.ValorNaoRecebido, c.OrigemMovimentos, c.Usuario, c.CriadoEm, c.ArquivoPacote
FROM conf.Conferencia AS c;
GO

-- Notas com a descrição da situação (para a tela de resultado)
CREATE OR ALTER VIEW conf.vw_NotasConferencia AS
SELECT
    n.ConferenciaId, s.Ordem, s.Descricao AS Situacao, n.Situacao AS CodSituacao,
    n.EmitenteNome AS Fornecedor, n.EmitenteCnpj AS Cnpj, n.TipoDocumento AS Tipo, n.Numero,
    n.Serie, n.DataEmissao, n.AnoMesChave, n.Valor, n.ChaveAcesso, n.ArquivosOrigem,
    n.Observacao, n.MovCodTmv, n.MovNumero, n.MovDataEntrada, n.ComoEncontrada,
    n.NomeArquivoPacote, n.Fonte, n.Confianca
FROM conf.ConferenciaNota AS n
JOIN conf.Situacao AS s ON s.Codigo = n.Situacao;
GO

-- Só as pendências de verdade (vão para o ZIP)
CREATE OR ALTER VIEW conf.vw_NotasNaoRecebidas AS
SELECT ConferenciaId, Fornecedor, Cnpj, Tipo, Numero, Serie, DataEmissao, Valor,
       ChaveAcesso, NomeArquivoPacote, ArquivosOrigem, Observacao
FROM conf.vw_NotasConferencia
WHERE CodSituacao = 'NAO_RECEBIDA';
GO

/* ---------- Exemplos de uso ----------
   DECLARE @id INT;
   EXEC conf.sp_GravarConferencia @Json = @json, @PastaNotas = '\\servidor\notas\11',
        @ArquivoZip = '\\servidor\conferencias\Notas nao recebidas 01-11-2026 a 30-11-2026.zip',
        @Id = @id OUTPUT;

   SELECT * FROM conf.vw_ResumoConferencia ORDER BY Id DESC;
   SELECT * FROM conf.vw_NotasConferencia WHERE ConferenciaId = @id ORDER BY Ordem, DataEmissao, Fornecedor;
   SELECT * FROM conf.vw_NotasNaoRecebidas WHERE ConferenciaId = @id ORDER BY DataEmissao;
*/
