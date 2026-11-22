// Paradas da viagem de carro até o ponto de saída (sentido sul → norte: Régis Bittencourt e depois Dutra).
// Coordenadas conferidas no OpenStreetMap. "aprox" = local provável, confira no Google Maps.
window.PARADAS = [
  {
    id: 'brambila', nome: 'Auto Posto Brambila', onde: 'BR-116 (Régis Bittencourt), km 528 · Barra do Turvo (SP)',
    horas: 'Posto 24 horas', para: 'café e banheiro', obs: 'Na mesma região fica a Parada do Café, de comida caseira.',
    p: [-24.9377593, -48.2942448], q: 'Auto Posto Brambila, Barra do Turvo, SP', aprox: true,
  },
  {
    id: 'petropen', nome: 'Graal Petropen', onde: 'BR-116, região do km 461 · Pariquera-Açu (SP)',
    horas: '24 horas', para: 'almoço ou refeição completa', obs: 'Restaurante, padaria, lanches, café e banheiros.',
    p: [-24.6238716, -47.8951706], q: 'Graal Petropen, Pariquera-Açu, SP',
  },
  {
    id: 'juquitiba', nome: 'Posto São Leopoldo (Juquitiba)', onde: 'BR-116, região do km 322 · Juquitiba (SP)',
    horas: '24 horas', para: 'lanche, café e descanso', obs: 'Restaurante, lanchonete, banheiro e café. Última parada antes da Grande São Paulo.',
    p: [-23.9350431, -47.0170843], q: 'Posto São Leopoldo, Rodovia Régis Bittencourt, Juquitiba, SP', aprox: true,
  },
  {
    id: 'graal-dutra', nome: 'Graal Market Dutra', onde: 'Via Dutra, km 182,5 · Guararema (SP)',
    horas: '24 horas', para: 'café e banheiro', obs: 'Restaurante, cafeteria, conveniência e banheiros. Último descanso antes do ponto de saída.',
    p: [-23.3417578, -46.1535531], q: 'Graal Market Dutra, Guararema, SP',
  },
];
