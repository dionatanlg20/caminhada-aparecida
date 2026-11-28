/* =====================================================================
   CONFERÊNCIA DE NOTAS x TOTVS RM — Atom Engenharia Elétrica
   Script 01 — Estrutura (schema, tabelas, índices)
   Banco: SQL Server 2016 SP1 ou superior
   ---------------------------------------------------------------------
   * Criar num banco PRÓPRIO da plataforma (ex.: ATOM_PLATAFORMA),
     NUNCA dentro do banco da TOTVS RM (CORPORE). A TOTVS é só lida.
   * Script idempotente: pode rodar mais de uma vez sem erro.
   ===================================================================== */

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'conf')
    EXEC ('CREATE SCHEMA conf');
GO

/* ---------- Tabelas de apoio ---------- */

-- Tipos de movimento de entrada da TOTVS considerados na conferência
IF OBJECT_ID('conf.TipoMovimento', 'U') IS NULL
CREATE TABLE conf.TipoMovimento (
    Codigo      VARCHAR(10)   NOT NULL CONSTRAINT PK_TipoMovimento PRIMARY KEY,  -- ex.: '1.2.06'
    Descricao   VARCHAR(100)  NOT NULL,
    Ativo       BIT           NOT NULL CONSTRAINT DF_TipoMovimento_Ativo DEFAULT (1)
);
GO

-- Situações possíveis de cada nota (ordem = ordem no relatório)
IF OBJECT_ID('conf.Situacao', 'U') IS NULL
CREATE TABLE conf.Situacao (
    Codigo          VARCHAR(20)   NOT NULL CONSTRAINT PK_Situacao PRIMARY KEY,   -- ex.: 'NAO_RECEBIDA'
    Descricao       VARCHAR(60)   NOT NULL,                                       -- texto exibido
    Ordem           TINYINT       NOT NULL,
    EntraNoPacote   BIT           NOT NULL CONSTRAINT DF_Situacao_Pacote DEFAULT (0), -- vai para o ZIP?
    Pendencia       BIT           NOT NULL CONSTRAINT DF_Situacao_Pendencia DEFAULT (0)
);
GO

-- Parâmetros gerais (CNPJ da empresa, tolerância, folga de datas...)
IF OBJECT_ID('conf.Parametro', 'U') IS NULL
CREATE TABLE conf.Parametro (
    Chave       VARCHAR(50)   NOT NULL CONSTRAINT PK_Parametro PRIMARY KEY,
    Valor       VARCHAR(500)  NOT NULL,
    Descricao   VARCHAR(200)  NULL
);
GO

/* ---------- Execuções da conferência ---------- */

IF OBJECT_ID('conf.Conferencia', 'U') IS NULL
CREATE TABLE conf.Conferencia (
    Id                  INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_Conferencia PRIMARY KEY,
    DataInicio          DATE          NOT NULL,              -- período (emissão das notas)
    DataFim             DATE          NOT NULL,
    BaseDataMovimento   VARCHAR(10)   NOT NULL               -- 'ENTRADA' ou 'EMISSAO'
        CONSTRAINT CK_Conferencia_Base CHECK (BaseDataMovimento IN ('ENTRADA', 'EMISSAO')),
    MargemDias          SMALLINT      NOT NULL CONSTRAINT DF_Conferencia_Margem DEFAULT (0),
    CnpjEmpresa         VARCHAR(200)  NOT NULL,              -- um ou mais, só dígitos, separados por ';'
    ToleranciaValor     DECIMAL(15,2) NOT NULL CONSTRAINT DF_Conferencia_Tol DEFAULT (1.00),
    TiposMovimento      VARCHAR(500)  NOT NULL,              -- ex.: '1.2.01;1.2.04;1.2.06'
    OrigemMovimentos    VARCHAR(20)   NOT NULL               -- 'TOTVS_SQL', 'RELATORIO_PDF', 'EXCEL'
        CONSTRAINT DF_Conferencia_Origem DEFAULT ('TOTVS_SQL'),
    PastaNotas          VARCHAR(500)  NULL,                  -- pasta/arquivo de onde vieram as notas
    -- Resumo (preenchido ao final)
    QtdNotas            INT NULL,
    QtdRecebidas        INT NULL,
    QtdForaPeriodo      INT NULL,
    QtdProvaveis        INT NULL,
    QtdNaoRecebidas     INT NULL,
    QtdConferirManual   INT NULL,
    QtdOutras           INT NULL,            -- canceladas + emitidas pela empresa + outro destinatário
    QtdTotvsSemNota     INT NULL,
    ValorNaoRecebido    DECIMAL(15,2) NULL,
    ArquivoPacote       VARCHAR(500)  NULL,  -- caminho do ZIP gerado
    Usuario             VARCHAR(100)  NOT NULL,
    CriadoEm            DATETIME2(0)  NOT NULL CONSTRAINT DF_Conferencia_CriadoEm DEFAULT (SYSDATETIME()),
    CONSTRAINT CK_Conferencia_Periodo CHECK (DataFim >= DataInicio)
);
GO

-- Uma linha por nota fiscal encontrada na pasta (após juntar XML + PDF + imagem da mesma nota)
IF OBJECT_ID('conf.ConferenciaNota', 'U') IS NULL
CREATE TABLE conf.ConferenciaNota (
    Id                  BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ConferenciaNota PRIMARY KEY,
    ConferenciaId       INT           NOT NULL CONSTRAINT FK_ConferenciaNota_Conferencia
                                          REFERENCES conf.Conferencia (Id) ON DELETE CASCADE,
    Situacao            VARCHAR(20)   NOT NULL CONSTRAINT FK_ConferenciaNota_Situacao
                                          REFERENCES conf.Situacao (Codigo),
    TipoDocumento       VARCHAR(20)   NOT NULL,   -- 'NF-e', 'NFS-e', 'CT-e', 'NFC-e', 'NF-e (resumo)'
    Modelo              VARCHAR(5)    NULL,       -- '55', '65', '57', 'NFSe'
    ChaveAcesso         VARCHAR(50)   NULL,       -- 44 (NF-e/CT-e) ou 50 dígitos (NFS-e Nacional)
    Numero              VARCHAR(20)   NULL,       -- sem zeros à esquerda
    Serie               VARCHAR(10)   NULL,
    DataEmissao         DATE          NULL,
    AnoMesChave         CHAR(7)       NULL,       -- 'AAAA-MM' quando só o código de barras foi lido
    EmitenteCnpj        VARCHAR(14)   NULL,       -- só dígitos
    EmitenteNome        VARCHAR(200)  NULL,
    DestinatarioCnpj    VARCHAR(14)   NULL,
    Valor               DECIMAL(15,2) NULL,
    Fonte               VARCHAR(10)   NOT NULL,   -- 'XML', 'PDF', 'Imagem'
    Confianca           VARCHAR(5)    NOT NULL    -- 'alta', 'media', 'baixa'
        CONSTRAINT CK_ConferenciaNota_Conf CHECK (Confianca IN ('alta', 'media', 'baixa')),
    Cancelada           BIT           NOT NULL CONSTRAINT DF_ConferenciaNota_Canc DEFAULT (0),
    ArquivosOrigem      VARCHAR(2000) NULL,       -- caminhos separados por ' | ' (com páginas do PDF)
    NomeArquivoPacote   VARCHAR(300)  NULL,       -- ex.: 'NFS-e 2 - ORTOBONA LTDA - emissao 03-11-2026.pdf'
    Observacao          VARCHAR(1000) NULL,
    -- Movimento da TOTVS encontrado (quando houver)
    MovIdmov            INT           NULL,
    MovCodTmv           VARCHAR(10)   NULL,
    MovNumero           VARCHAR(20)   NULL,
    MovDataEntrada      DATE          NULL,
    MovDataEmissao      DATE          NULL,
    MovValor            DECIMAL(15,2) NULL,
    ComoEncontrada      VARCHAR(200)  NULL        -- 'chave de acesso', 'CNPJ + número', ...
);
GO

-- Movimentos de entrada da TOTVS no período sem nota correspondente na pasta
IF OBJECT_ID('conf.ConferenciaMovSemNota', 'U') IS NULL
CREATE TABLE conf.ConferenciaMovSemNota (
    Id              BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_ConferenciaMovSemNota PRIMARY KEY,
    ConferenciaId   INT           NOT NULL CONSTRAINT FK_MovSemNota_Conferencia
                                      REFERENCES conf.Conferencia (Id) ON DELETE CASCADE,
    Idmov           INT           NULL,
    CodTmv          VARCHAR(10)   NOT NULL,
    Numero          VARCHAR(20)   NULL,
    Serie           VARCHAR(10)   NULL,
    FornecedorCnpj  VARCHAR(14)   NULL,
    FornecedorNome  VARCHAR(200)  NULL,
    DataEmissao     DATE          NULL,
    DataEntrada     DATE          NULL,
    Valor           DECIMAL(15,2) NULL
);
GO

/* ---------- Índices ---------- */

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ConferenciaNota_Conferencia')
    CREATE INDEX IX_ConferenciaNota_Conferencia ON conf.ConferenciaNota (ConferenciaId, Situacao);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ConferenciaNota_Chave')
    CREATE INDEX IX_ConferenciaNota_Chave ON conf.ConferenciaNota (ChaveAcesso);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ConferenciaNota_CnpjNumero')
    CREATE INDEX IX_ConferenciaNota_CnpjNumero ON conf.ConferenciaNota (EmitenteCnpj, Numero);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_MovSemNota_Conferencia')
    CREATE INDEX IX_MovSemNota_Conferencia ON conf.ConferenciaMovSemNota (ConferenciaId);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Conferencia_Periodo')
    CREATE INDEX IX_Conferencia_Periodo ON conf.Conferencia (DataInicio, DataFim);
GO
