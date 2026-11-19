# MoveFIT — Assistente Virtual de Atendimento

Projeto acadêmico de **Análise e Desenvolvimento de Sistemas (ADS)** para desenvolver o **MoveFIT**, um assistente virtual de atendimento para academias. O chatbot será representado pela persona **Muvinho** e terá como foco esclarecer dúvidas, consultar informações de aulas e auxiliar os alunos em solicitações de atendimento.

> **Situação atual:** projeto em desenvolvimento. O repositório é uma **base de trabalho para a equipe**, e não uma aplicação finalizada. A integração com a IA generativa, o banco de dados e os fluxos completos ainda precisam ser implementados e validados.

## Objetivo

Construir uma aplicação web acessível pelo navegador, com uma interface de chat, integração com um serviço de **IA generativa** e consulta a dados cadastrados de uma academia fictícia. O sistema deverá respeitar regras de negócio e não substituir profissionais de Educação Física.

## Funcionalidades previstas

- Atendimento conversacional com o **Muvinho**.
- Respostas a dúvidas sobre funcionamento, aulas e horários cadastrados.
- Orientações **gerais** de exercícios, aquecimento e níveis de condicionamento físico.
- Informações gerais sobre treinos principais e secundários.
- Fluxo **demonstrativo** de solicitação/agendamento de aulas, sem prometer uma reserva real.
- Encaminhamento ao atendimento humano quando o assunto estiver fora do escopo ou exigir avaliação profissional.

**Importante:** horários, aulas e vagas utilizados nos testes são fictícios. Respostas da IA não devem inventar dados operacionais ou oferecer diagnóstico, tratamento ou prescrição individualizada.

## Tecnologias planejadas

| Tecnologia | Uso no projeto |
| --- | --- |
| Figma | Protótipo navegável e referência visual |
| HTML, CSS e JavaScript | Interface web |
| Cloudflare Pages | Hospedagem do site com integração ao GitHub |
| Cloudflare Pages Functions | Rotas do servidor e proteção de credenciais |
| Google Gemini API | Respostas com IA generativa |
| MongoDB Atlas | Informações de aulas, horários e, futuramente, reservas |
| Git e GitHub | Versionamento e colaboração |

## Arquitetura prevista

```text
Aluno (navegador)
      |
      v
Interface MoveFIT (Cloudflare Pages)
      |
      v
Pages Functions (servidor)
      |                    |
      v                    v
Gemini API             MongoDB Atlas
(respostas)           (dados da academia)
```

As chamadas ao Gemini e ao banco de dados devem passar pelo **servidor**. As credenciais nunca devem ser colocadas no JavaScript público do site.

## Estrutura inicial do repositório

A base de desenvolvimento está organizada da seguinte forma:

```text
movefit-assistente-virtual/
├── public/               # Interface e arquivos publicados no navegador
│   └── assets/           # Imagens e recursos visuais
├── functions/
│   └── api/              # Rotas do Cloudflare Pages Functions
├── data/                 # Dados demonstrativos para modelagem
├── docs/                 # Regras, fluxos, segurança e documentação
├── .dev.vars.example     # Modelo de configuração local, sem segredos reais
├── .gitignore
├── LICENSE
├── package.json
└── README.md
```

A estrutura poderá evoluir conforme a implementação. Arquivos de configuração com senhas reais não fazem parte do repositório.

## Como executar a base localmente

**Pré-requisitos:** Git e Node.js instalados.

Depois de clonar o repositório ou abrir a base no VS Code, execute:

```bash
npm install
npm run dev
```

Acesse o endereço local informado no terminal. Na base inicial, a rota `/api/health` poderá ser utilizada para verificar se a estrutura do servidor responde. As demais rotas podem retornar `501 - Not Implemented` enquanto estiverem sendo desenvolvidas.

### Configuração local de credenciais

Se a base incluir o arquivo `.dev.vars.example`, faça uma cópia com o nome `.dev.vars` e preencha apenas nesse arquivo local os valores necessários, conforme forem obtidos:

```dotenv
GEMINI_API_KEY=SUA_CHAVE_LOCAL
MONGODB_URI=SUA_STRING_DE_CONEXAO_LOCAL
MONGODB_DB=movefit
```

O arquivo `.dev.vars` está ignorado pelo Git. **Nunca envie chaves de API, senhas ou strings de conexão ao GitHub, nem mesmo em repositórios privados.**

## Publicação planejada no Cloudflare Pages

1. Conectar o repositório GitHub ao projeto Cloudflare Pages.
2. Usar `main` como branch principal e `public` como diretório de saída da publicação para esta base estática.
3. Manter a pasta `functions/` na raiz do repositório, separada de `public/`.
4. Cadastrar `GEMINI_API_KEY` e, quando necessário, `MONGODB_URI` como **Secrets** nas configurações do projeto Cloudflare Pages.
5. Validar a publicação inicial antes de adicionar a lógica do chat e do banco.

A simples configuração das credenciais **não implementa** o chatbot nem a conexão com o MongoDB. Essas funcionalidades precisam ser programadas, testadas e publicadas posteriormente.

## Equipe

| Integrante | Área de contribuição |
| --- | --- |
| **João** | Prototipação no Figma, preparação do GitHub e Cloudflare, organização e integração inicial |
| **Rafael** | Interface web e JavaScript |
| **Brian** | Backend e integrações com Gemini e MongoDB |
| **Erick** | Fluxos de conversa, dados demonstrativos e documentação |
| **Marcos** | Testes, acessibilidade e validação das funcionalidades |

As responsabilidades poderão ser ajustadas conforme o andamento do desenvolvimento.

## Organização do trabalho

- Criar uma branch para cada funcionalidade ou correção, evitando alterações diretas na `main`.
- Utilizar **pull requests** para revisar as mudanças antes de integrá-las.
- Registrar no repositório somente dados fictícios ou autorizados para demonstração.
- Verificar se o funcionamento do sistema corresponde às regras de negócio definidas no projeto.

## Licença

A licença proposta é a **MIT**. Sua adoção deve ser aprovada pela equipe antes da publicação do arquivo `LICENSE`. Consulte esse arquivo para os termos, caso seja incluído no repositório.

## Referências técnicas

- [Documentação do Cloudflare Pages](https://developers.cloudflare.com/pages/)
- [Documentação do Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [Google Gemini API](https://ai.google.dev/gemini-api/docs/)
- [MongoDB Atlas](https://www.mongodb.com/products/platform/atlas-database)
