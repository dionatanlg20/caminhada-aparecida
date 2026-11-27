/* Configurações padrão da Conferência de Notas x TOTVS RM.
   Pode editar este arquivo à vontade: ele só tem valores iniciais da tela. */
window.CN = window.CN || {};

CN.config = {
  // Tipos de movimento de entrada da TOTVS RM que entram na conferência.
  // 1.2.04 e 1.2.06 = serviços, 1.2.12 = recebimento de materiais.
  tiposMovimento: [
    { codigo: '1.2.04', descricao: 'Entrada de serviço' },
    { codigo: '1.2.06', descricao: 'Entrada de serviço' },
    { codigo: '1.2.12', descricao: 'Recebimento de materiais' },
    { codigo: '1.2.01', descricao: 'NF de recebimento' },
    { codigo: '1.2.05', descricao: 'Efetivação' },
    { codigo: '1.2.08', descricao: 'Conhecimento de transporte (CT-e)' },
    { codigo: '1.2.19', descricao: 'Contratos' },
    { codigo: '1.2.26', descricao: 'NF de materiais' }
  ],

  // true = marca todos os tipos de entrada (1.2.xx) encontrados no relatório.
  // Evita marcar como "não recebida" uma nota lançada em outro tipo (1.2.01, 1.2.08…).
  marcarTodasEntradas: true,

  // CNPJ(s) da empresa (destinatária das notas). Deixe vazio para não filtrar.
  // Ex.: ['12.345.678/0001-90']
  cnpjsEmpresa: [],

  // Diferença de valor aceita para dizer que nota e movimento batem (R$).
  toleranciaValor: 1.00,

  // Cor padrão Atom (azul corporativo) usada na tela, no Excel e no PDF.
  corPrimaria: '#1F3864',

  // Nomes de coluna que o sistema reconhece no relatório da TOTVS.
  // A comparação ignora maiúsculas, acentos e pontuação.
  colunasTotvs: {
    tipoMov:     ['codtmv', 'tipo de movimento', 'tipo movimento', 'tipo mov', 'cod tipo movimento', 'codigo do tipo de movimento', 'tmv', 'tipo', 'movimento'],
    numero:      ['numeromov', 'n nota', 'no nota', 'nota', 'numero do movimento', 'n do movimento', 'numero movimento', 'numero da nota', 'numero nota', 'numero nf', 'numero da nf', 'n nf', 'nota fiscal', 'nf', 'numero documento', 'numero do documento', 'documento', 'numero', 'n'],
    serie:       ['serie', 'serie nf', 'serie da nota'],
    dataEmissao: ['dataemissao', 'data emissao', 'data de emissao', 'dt emissao', 'emissao'],
    dataEntrada: ['dataentrada', 'data lanc', 'dt lanc', 'data entrada', 'data de entrada', 'dt entrada', 'data lancamento', 'data de lancamento', 'dt lancamento', 'data do lancamento', 'data movimento', 'data do movimento', 'dataextra1', 'entrada'],
    cnpj:        ['cgccfo', 'cnpj', 'cpf cnpj', 'cnpj cpf', 'cnpj fornecedor', 'cnpj do fornecedor', 'cpf/cnpj', 'cnpj/cpf', 'cgc'],
    fornecedor:  ['nome', 'fornecedor', 'razao social', 'nome do fornecedor', 'nome fornecedor', 'cliente fornecedor', 'cliente/fornecedor', 'nome cli for', 'nomefantasia', 'nome fantasia'],
    codFornecedor: ['codcfo', 'cod fornecedor', 'codigo fornecedor', 'codigo do fornecedor', 'cod cli for'],
    valor:       ['valorbruto', 'valor bruto', 'vlr bruto', 'valor total', 'valorliquido', 'valor liquido', 'valor da nota', 'valor nf', 'valor', 'vlr', 'total'],
    chave:       ['chaveacessonfe', 'chave de acesso', 'chave acesso', 'chave nfe', 'chave da nfe', 'chaveacesso', 'chave'],
    idmov:       ['idmov', 'id mov', 'id movimento'],
    status:      ['status', 'situacao', 'status do movimento']
  },

  rotulosCampos: {
    tipoMov: 'Tipo de movimento', numero: 'Número da nota', serie: 'Série',
    dataEmissao: 'Data de emissão', dataEntrada: 'Data de entrada (lançamento)',
    cnpj: 'CNPJ do fornecedor', fornecedor: 'Nome do fornecedor', codFornecedor: 'Código do fornecedor',
    valor: 'Valor', chave: 'Chave de acesso', idmov: 'IDMOV', status: 'Status'
  }
};
