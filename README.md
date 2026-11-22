# Caminhada a Aparecida

App para a peregrinação a pé até Aparecida em **sábado, 30 de outubro de 2027** (saída de Curitiba na sexta à noite), pela Rota da Luz, pela Via Dutra ou pelo Caminho da Fé. Abre no navegador do celular e pode ser instalado na tela inicial.

- **Contagem regressiva:** toda vez que o app abre, mostra quantos dias faltam para a peregrinação, a distância, o caminho e a cidade de saída.
- **Distância da caminhada:** 50 km pelo planejamento. Quando sair o anúncio de quantos km da Via Dutra serão fechados para os romeiros, basta mudar `caminhada.km` em `alertas.json` (ex.: 45): o app recalcula o ponto de saída dos três caminhos e avisa na tela. Os traçados cobrem os 62 km finais de cada caminho.
- **Trajeto oficial:** usa o traçado da Rota da Luz do mapa oficial da Associação dos Amigos da Rota da Luz, até a Praça da Fé, em Aparecida. O ponto de saída padrão fica exatamente na distância da caminhada antes do término (com 50 km, em Taubaté), com botões para o motorista abrir no Google Maps ou no Waze. Também dá para sair de outro endereço: o app leva até a trilha e segue por ela.
- **Caminhada:** mapa vetorial moderno (zoom suave, giro, 3D) ou satélite, próxima instrução com nome das ruas ("Em 300 m, vire à esquerda…"), aviso quando você sai do caminho, km que faltam, km andados e horário previsto de chegada.
- **Caminho da Fé:** com 50 km, saída em Campos do Jordão, subindo até quase 2.000 m e descendo a serra pela Estrada do Gomeral até o Santuário Nacional. Trilha gravada por GPS e conferida com o mapa oficial da Associação dos Amigos do Caminho da Fé.
- **Via Dutra:** pela própria rodovia (com 50 km, saída por volta do km 119), com as travessias seguras e as orientações do mapa Caminho Consciente.
- **Paradas da viagem de carro:** lista das paradas até o ponto de saída, com rota no Google Maps passando por elas.
- **Alertas:** comunicados sobre bloqueios, obras e operações na Rota da Luz e na Dutra, com as fontes. Ficam no arquivo `alertas.json` e podem ser atualizados sem mudar o app.
- **No caminho:** pontos de apoio, hospedagem, igrejas, saúde e QR-codes do mapa oficial.
- **Acompanhamento ao vivo:** um link secreto para quem vai te esperar ver no celular (iPhone ou Android) onde você está, quanto falta e a hora prevista de chegada. Funciona com o app aberto e a tela ligada; a posição passa pelo serviço gratuito ntfy.sh.
- **Preparação:** checklist da mochila, dicas de segurança e telefones de emergência.

Os dados ficam salvos só no próprio celular.
