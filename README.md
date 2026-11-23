# MoveFIT

Protótipo acadêmico de Análise e Desenvolvimento de Sistemas. A página inicial apresenta uma academia fictícia. O Muvinho consulta aulas e horários, conduz agendamentos e oferece exemplos gerais de treino e aquecimento.

## Executar no computador

Com Node.js 22 ou superior, abra o terminal na pasta do projeto e rode:

```powershell
npm ci
npm run dev
```

Abra a URL local exibida no terminal. Use **Fale com o Muvinho** para entrar no chat. A rota `/api/health` indica quais integrações foram configuradas. Uma consulta ao catálogo ou uma conversa é que confirma se o serviço responde.

Sem chaves, o protótipo inicia com respostas e dados demonstrativos. Você pode ativar Gemini e Atlas de forma independente. Com apenas Gemini, o chat usa IA e dados de exemplo. Com apenas MongoDB, as respostas demonstrativas consultam o catálogo do Atlas. Se um serviço configurado falhar, o chat informa a indisponibilidade.

## Configurar Gemini e MongoDB Atlas

No PowerShell, copie o arquivo de exemplo antes de definir as credenciais:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

Preencha os valores no arquivo `.dev.vars` na raiz. Reinicie `npm run dev` depois de editar. O Git ignora esse arquivo. Use o arquivo local ou o painel de segredos da Cloudflare para informar credenciais.

### Google Gemini

1. Crie uma chave no [Google AI Studio](https://aistudio.google.com/apikey).
2. Salve-a em `GEMINI_API_KEY`. O padrão é `gemini-3.5-flash-lite`. Para trocar, defina `GEMINI_MODEL` com o identificador de um [modelo disponível](https://ai.google.dev/gemini-api/docs/models) no seu projeto.
3. Envie uma pergunta livre sobre os horários de uma modalidade pelo chat. Atalhos de fatos conhecidos podem ser respondidos pelo servidor. Para verificar a chamada ao Google, confira `mode: "gemini"` na resposta de `POST /api/chat` e `dataMode: "atlas"` se quiser validar os dois serviços juntos. Em caso de erro, confira a chave, o modelo e a cota no AI Studio. [Guia de chaves do Gemini](https://ai.google.dev/gemini-api/docs/api-key).

Quando a rota usa a IA, o servidor envia ao Gemini a pergunta atual, até quatro perguntas anteriores do visitante, a data e os nomes e códigos públicos das modalidades. Respostas anteriores, horários e vagas ficam fora da chamada. O servidor mascara identificadores comuns, como e-mails, telefones, documentos e códigos de reserva, e responde localmente às mensagens com termos de saúde reconhecidos. O filtro pode deixar passar nomes, endereços e outros dados em texto livre. Use informações fictícias ao testar.

O Gemini retorna uma decisão estruturada. A aplicação valida a decisão e monta as respostas sobre aulas e horários a partir dos registros consultados. A chave do Google e a conexão do MongoDB ficam nas Pages Functions.

### MongoDB Atlas

1. Abra ou crie o cluster `movefit-cluster`. Crie a base `movefit` com as coleções `aulas` e `horarios`, ou deixe a carga inicial criá-las.
2. Em **Database Access**, use um usuário de banco restrito ao cluster do MoveFIT. A aplicação precisa ler `movefit.aulas` e `movefit.horarios` e ler, inserir e atualizar documentos em `movefit.reservas`. Se usar uma função personalizada, crie a coleção `reservas` no Atlas antes da primeira reserva. Em **Connect → Drivers**, copie a URI, substitua os marcadores pelo usuário e pela senha e salve o valor em `MONGODB_URI`. Use `MONGODB_DB=movefit`, que também é o padrão. [Usuários de banco no Atlas](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/).
3. Em **Network Access**, autorize seu IP público para testar no computador. O acesso publicado sai da infraestrutura da Cloudflare. A lista pública de IPs da Cloudflare não corresponde à origem das conexões TCP de Workers. Se o Atlas exigir uma origem fixa e o ambiente publicado não a oferecer, valide a integração localmente até configurar uma saída autorizada. [Lista de acesso do Atlas](https://www.mongodb.com/docs/atlas/security/ip-access-list/) e [conexões TCP da Cloudflare](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/).
4. Para carregar os exemplos, defina `MONGODB_SEED_URI` apenas no `.dev.vars` local, com um usuário separado com permissão `readWrite` somente em `movefit`. Rode `npm run seed`. A carga insere registros de exemplo por código e preserva os registros que já têm o mesmo código. Você também pode importar [aulas](data/aulas.json) e [horários](data/horarios.json) nas respectivas coleções de teste usando o [MongoDB Compass](https://www.mongodb.com/docs/compass/import-export/).
5. Abra `/api/aulas` e `/api/horarios` na URL local ou na implantação de teste. Para confirmar a leitura real, confira `mode: "atlas"` nas duas respostas e compare um código de aula e um horário com os documentos do banco. Se a consulta falhar, confira o usuário de banco e o controle de rede no Atlas.

Os horários de aula são recorrentes por dia da semana. `diaSemana` vai de `0` (domingo) a `6` (sábado) e `horario` segue `HH:MM`. `aulaCodigo` em `horarios` corresponde ao `codigo` de uma aula ativa. O backend aceita `ativo` ou `ativa` para marcar registros ativos e `duracao` ou `duracaoMinutos` para informar a duração da aula. Teste com dados fictícios.

### Rotas do Atlas

| Rota | Retorno |
| --- | --- |
| `GET /api/aulas` | `mode` e `aulas` com código, nome, descrição, nível e duração em minutos. Busca até 75 aulas ativas. |
| `GET /api/horarios` | `mode` e `horarios` com a aula, dia da semana, hora e vagas. Busca até 200 horários ativos e vincula cada um a uma aula ativa. |
| `GET /api/horarios?aula=funcional&data=2026-11-26` | Aplica filtros opcionais por código e data. Com data, desconta as reservas daquela sessão. Para hoje, retorna os horários futuros no fuso de São Paulo. Sem data, `vagasDisponiveis` é o valor base do horário semanal. |
| `GET /api/catalog?date=2026-11-26` | Inicializa o visitante e lista as sessões e vagas para a data escolhida. |
| `POST /api/reservas` | Recebe `date`, `sessionId` e `confirmed: true`. Usa o cookie de visitante criado pelo catálogo. Retorna HTTP `201` com comprovante após a gravação e `409` se a sessão estiver lotada ou já reservada pelo visitante. |

`/api/aulas`, `/api/horarios` e `/api/reservas` dependem do Atlas. Uma lista vazia em HTTP `200` indica que a consulta terminou sem encontrar registros válidos para os filtros. HTTP `400` indica solicitação inválida, `503` indica segredo ausente e `502` indica falha no Atlas. `/api/health` indica a presença das variáveis. Sem Atlas, `/api/catalog` usa dados demonstrativos e a confirmação é simulada.

As chamadas usam o driver Node.js com TLS obrigatório e validação de certificados. Para cada combinação de data e horário, a coleção `reservas` usa um único documento. O Atlas verifica a vaga e a duplicidade no mesmo comando que registra a reserva. A disponibilidade de outras datas continua independente. Os registros de erro contêm apenas categorias gerais de falha.

O agendamento acadêmico identifica o visitante por um cookie do navegador. Novos comprovantes guardam o código e um hash específico daquela data e sessão. A data e a sessão identificam o documento que reúne as reservas. Uma tentativa duplicada devolve apenas o aviso de duplicidade. O backend ainda reconhece o formato dos registros anteriores. Não há cadastro pessoal ou cancelamento neste fluxo. A deduplicação vale para o mesmo navegador enquanto o cookie estiver ativo. Para oferecer reservas pessoais com consulta e cancelamento, use uma conta autenticada.

## Validar a demonstração

Execute `npm test` para rodar os testes do backend. Na interface, confira estes fluxos:

| Fluxo | Como conferir |
| --- | --- |
| Horários | Use o atalho **Horários** e confira o funcionamento da academia apresentado pelo Muvinho. |
| Aulas | Use **Aulas** e confira as modalidades exibidas. Com Atlas configurado, compare o resultado com a coleção `aulas`. |
| Dúvidas frequentes | Use o atalho correspondente ou pergunte por um plano. Confira se a resposta trata o conteúdo como ilustrativo. |
| Orientações gerais | Use **Aquecimento** e **Sugestões de treino**. Experimente uma pergunta sobre dor ou restrição e verifique se a resposta encaminha para avaliação profissional. |
| Agendamento | Use **Agendar aula**, selecione uma data futura e uma sessão com vaga e confirme. Com Atlas, confira o comprovante e a vaga consumida ao reabrir o painel. Tente o mesmo horário pelo mesmo navegador e verifique o bloqueio. Sem Atlas, confira o aviso de simulação. |

A conversa fica em memória enquanto a página está aberta. A confirmação passa pelo formulário e pelo servidor. As mensagens do chat não gravam reservas.

## Publicar pelo GitHub e Cloudflare Pages

1. Em **Workers & Pages**, abra o projeto MoveFIT. Caso ainda precise conectá-lo, escolha **Pages → Connect to Git** e selecione `JoaoRibeiro31/movefit-assistente-virtual`.
2. No projeto `movefit-assistente-virtual-test`, use a raiz do repositório como **Root directory**, `public` como **Build output directory** e mantenha a instalação automática de dependências. Defina `NODE_VERSION=22`. Use o comando abaixo para compilar as funções com o Wrangler do projeto e entregar JavaScript ao Pages. O arquivo `wrangler.toml` define a compatibilidade Node.js do runtime. [Configuração do Wrangler](https://developers.cloudflare.com/pages/functions/wrangler-configuration/) e [modo avançado do Pages](https://developers.cloudflare.com/pages/functions/advanced-mode/).
3. Em **Settings → Variables and Secrets**, use o ambiente que recebe a branch `test`. Se `test` for a **Production branch** do projeto de testes, o ambiente é **Production**. Se `test` for uma branch de prévia, use **Preview**. Cadastre `MONGODB_URI` como segredo e `MONGODB_DB` como texto com valor `movefit`. Quando for ativar o Gemini nesse ambiente, cadastre `GEMINI_API_KEY` como segredo e, se necessário, `GEMINI_MODEL`. [Controle de branches](https://developers.cloudflare.com/pages/configuration/branch-build-controls/) e [segredos no Pages](https://developers.cloudflare.com/pages/functions/bindings/#secrets).
4. Se a prévia usar Gemini com sua chave, habilite a política do **Cloudflare Access** para limitar quem pode enviar mensagens e consumir sua cota. A prévia do Pages é pública por padrão. [Controle de acesso a prévias](https://developers.cloudflare.com/pages/configuration/preview-deployments/#customize-preview-deployments-access).
5. Confira se está na branch `test` e revise os arquivos antes de fazer o commit. Envie apenas essa branch e acompanhe o deploy em **Deployments**. Para levar as mudanças à `main`, abra um pull request de `test` para `main` e aguarde aprovação.

```bash
npm run build:pages
```

O comando gera `public/_worker.js/` em modo avançado. O Pages empacota o ponto de entrada e publica a aplicação compilada como módulo separado. Isso preserva as importações nativas do Node usadas pelo Atlas. A pasta é gerada no build e fica fora do Git.

O empacotador aceita apenas arquivos autorizados em `public/`. Ao adicionar uma imagem ou página intencionalmente, atualize a lista em `scripts/package-pages-worker.mjs`. O arquivo `public/_headers` restringe scripts, conexões, permissões e incorporação das páginas no navegador. As APIs aplicam seus próprios cabeçalhos em `server/http.js`. As fontes do layout ainda são carregadas do Google Fonts. [Cabeçalhos do Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/headers/).

Faça primeiro o deploy em modo demonstrativo para conferir as telas e as rotas. Depois, ative os serviços na prévia, refaça o deploy e repita os testes pela URL gerada pela Cloudflare. Consulte [a configuração das Pages Functions](https://developers.cloudflare.com/pages/functions/get-started/) e [o guia de conexão com MongoDB](https://developers.cloudflare.com/workers/tutorials/connect-to-mongodb-atlas/).

## Organização do código

- `public/` contém as duas páginas, as imagens e o JavaScript do navegador.
- `functions/api/aulas.js` e `functions/api/horarios.js` consultam o Atlas. `functions/api/reservas.js` confirma o agendamento por meio de `server/reservations.js`.
- `server/catalog.js` normaliza o catálogo e calcula vagas por data. `server/atlas.js` padroniza a conexão com o Atlas. `server/http.js` valida pedidos e padroniza respostas JSON. `server/chat.js` usa o catálogo e o Gemini para atender o visitante.
- `data/` contém os exemplos de aulas e horários.

Consulte o arquivo [LICENSE](LICENSE) para os termos de uso do código.
