# MoveFIT

Protótipo acadêmico de Análise e Desenvolvimento de Sistemas. A página inicial apresenta uma academia fictícia. O Muvinho atende visitantes, consulta aulas e horários e conduz uma simulação de agendamento.

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
3. Envie uma pergunta do chat. Em caso de erro, confira a chave, a disponibilidade do modelo e a cota do projeto no AI Studio. [Guia de chaves do Gemini](https://ai.google.dev/gemini-api/docs/api-key).

### MongoDB Atlas

1. Abra ou crie o cluster `movefit-cluster`. Crie a base `movefit` com as coleções `aulas` e `horarios`, ou deixe a carga inicial criá-las.
2. Em **Database Access**, crie um usuário de banco com permissão `read` para `movefit`. Em **Connect → Drivers**, copie a URI, substitua os marcadores pelo usuário e pela senha e salve o valor em `MONGODB_URI`. Use `MONGODB_DB=movefit`, que também é o padrão. [Usuários de banco no Atlas](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/).
3. Em **Network Access**, autorize seu IP público para testar no computador. O acesso publicado sai da infraestrutura da Cloudflare. A lista pública de IPs da Cloudflare não corresponde à origem das conexões TCP de Workers. Se o Atlas exigir uma origem fixa e o ambiente publicado não a oferecer, valide a integração localmente até configurar uma saída autorizada. [Lista de acesso do Atlas](https://www.mongodb.com/docs/atlas/security/ip-access-list/) e [conexões TCP da Cloudflare](https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/).
4. Para carregar os exemplos, defina `MONGODB_SEED_URI` apenas no `.dev.vars` local, com um usuário separado com permissão `readWrite` somente em `movefit`. Rode `npm run seed`. A carga insere registros de exemplo por código e preserva os registros que já têm o mesmo código. Você também pode importar [aulas](data/aulas.json) e [horários](data/horarios.json) nas respectivas coleções de teste usando o [MongoDB Compass](https://www.mongodb.com/docs/compass/import-export/).
5. Abra `/api/catalog` na URL local. O campo `mode` deve mostrar `atlas`, com as aulas e sessões que estiverem cadastradas e ativas. Se a conexão falhar, confira a senha e o controle de rede no Atlas. Se o catálogo estiver vazio, confira o nome da base e se os documentos usam os campos dos JSONs de exemplo.

Os horários de aula são recorrentes por dia da semana. Nos arquivos de exemplo, `diaSemana` vai de `0` (domingo) a `6` (sábado). O campo `aulaCodigo` em `horarios` corresponde ao `codigo` de uma aula. Teste com dados fictícios.

## Validar a demonstração

Execute `npm test` para rodar os testes do backend. Na interface, confira estes fluxos:

| Fluxo | Como conferir |
| --- | --- |
| Horários | Use o atalho **Horários** e confira o funcionamento da academia apresentado pelo Muvinho. |
| Aulas | Use **Aulas** e confira as modalidades exibidas. Com Atlas configurado, compare o resultado com a coleção `aulas`. |
| Dúvidas frequentes | Use o atalho correspondente ou pergunte por um plano. Confira se a resposta trata o conteúdo como ilustrativo. |
| Orientações gerais | Use **Aquecimento** e **Sugestões de treino**. Experimente uma pergunta sobre dor ou restrição e verifique se a resposta encaminha para avaliação profissional. |
| Agendamento | Use **Agendar aula**, selecione uma data futura e uma sessão com vaga e confirme. Confira o aviso de simulação. Na base de exemplo, o Pilates de quinta-feira às 10h está lotado e deve ficar indisponível para seleção. |

A confirmação da simulação valida a data, a sessão e a disponibilidade no servidor. O fluxo acadêmico não cria reservas. A conversa fica em memória enquanto a página está aberta, e o servidor envia o contexto recente ao Gemini quando a integração está ativa.

## Publicar pelo GitHub e Cloudflare Pages

1. Em **Workers & Pages**, abra o projeto MoveFIT. Caso ainda precise conectá-lo, escolha **Pages → Connect to Git** e selecione `JoaoRibeiro31/movefit-assistente-virtual`.
2. Configure **Production branch** como `main`, **Root directory** como a raiz do repositório e **Build output directory** como `public`. Selecione o preset **None** e deixe o comando de build em branco. O Pages encontra as rotas em `functions/` na raiz. Mantenha a instalação automática de dependências ativa e use Node.js 22 ou superior no build. O arquivo `wrangler.toml` define a compatibilidade Node.js usada pelo driver MongoDB. [Integração do Pages com Git](https://developers.cloudflare.com/pages/get-started/git-integration/) e [configuração do Wrangler](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).
3. Em **Settings → Builds & deployments**, habilite a prévia para `test`. Em **Settings → Variables and Secrets**, selecione **Preview** e cadastre `GEMINI_API_KEY` e `MONGODB_URI` como segredos quando estiverem prontas. `GEMINI_MODEL` e `MONGODB_DB` são opcionais. [Controle de branches](https://developers.cloudflare.com/pages/configuration/branch-build-controls/) e [segredos no Pages](https://developers.cloudflare.com/pages/functions/bindings/#secrets).
4. Se a prévia usar Gemini com sua chave, habilite a política do **Cloudflare Access** para limitar quem pode enviar mensagens e consumir sua cota. A prévia do Pages é pública por padrão. [Controle de acesso a prévias](https://developers.cloudflare.com/pages/configuration/preview-deployments/#customize-preview-deployments-access).
5. Confira se está na branch `test` e revise os arquivos antes de fazer o commit. Envie apenas essa branch e acompanhe o deploy em **Deployments**. Para levar as mudanças à `main`, abra um pull request de `test` para `main` e aguarde aprovação.

```powershell
git branch --show-current
git status --short
git add --all
git diff --cached --stat
git commit -m "feat: adiciona protótipo funcional do MoveFIT"
git push origin test
```

Faça primeiro o deploy em modo demonstrativo para conferir as telas e as rotas. Depois, ative os serviços na prévia, refaça o deploy e repita os testes pela URL gerada pela Cloudflare. Consulte [a configuração das Pages Functions](https://developers.cloudflare.com/pages/functions/get-started/) e [o guia de conexão com MongoDB](https://developers.cloudflare.com/workers/tutorials/connect-to-mongodb-atlas/).

## Organização do código

- `public/` contém as duas páginas, as imagens e o JavaScript do navegador.
- `functions/` contém as rotas de disponibilidade, catálogo, conversa e simulação. Apenas o servidor acessa as credenciais.
- `server/` contém as regras do chat e as integrações com Gemini e Atlas.
- `data/` contém os exemplos de aulas e horários.

## Equipe

| Integrante | Área de contribuição |
| --- | --- |
| João | Prototipação no Figma, preparação do GitHub e Cloudflare, organização e integração inicial |
| Rafael | Interface web e JavaScript |
| Brian | Backend e integrações com Gemini e MongoDB |
| Erick | Fluxos de conversa, dados demonstrativos e documentação |
| Marcos | Testes, acessibilidade e validação das funcionalidades |

Consulte o arquivo [LICENSE](LICENSE) para os termos de uso do código.
