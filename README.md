# Tape Club

Clube privado de cinema com alma de locadora de VHS. O Tape Club organiza um catálogo compartilhado de filmes e séries, sessões, avaliações e indicadores calculados a partir das opiniões reais do clube. A interface em português percorre uma locadora ilustrada, com capas em formato de fita e navegação própria.

O projeto resolve a dispersão de títulos, sessões e avaliações em um clube pequeno: integrantes mantêm uma estante comum, registram o que assistiram e consultam as opiniões do grupo. Seu objetivo é oferecer essa experiência em uma aplicação privada e demonstrar desenvolvimento web, APIs REST, persistência SQL e integração entre Node.js e Python.

## Objetivo do projeto

O Tape Club combina a organização de um catálogo coletivo com a atmosfera de uma locadora de vídeo. O Tape Club Bot amplia a experiência com recomendações explicáveis, baseadas nos critérios escritos pela pessoa e nos metadados consultados no TMDB.

## Funcionalidades

- Cadastro privado de integrantes e autenticação por senha.
- Catálogo compartilhado, pesquisa/importação, cadastro manual e capas.
- Sessões de cinema, avaliações, comentários e favoritos.
- Indicadores e estatísticas calculados das avaliações existentes.
- Cache local das consultas aos provedores de metadados.
- **Tape Club Bot:** conversa em português para filtrar e ordenar sugestões de filmes e séries do TMDB.
- Modo demo com clube de exemplo e provedores simulados.

## Arquitetura e tecnologias

```text
Navegador (JavaScript sem framework)
       │ same-origin, sessão e proteção CSRF
       ▼
Servidor HTTP Node.js ── API REST existente + ponte autenticada /api/chat
       │                              │
       │ node:sqlite                  ▼
       │                    Serviço REST Python (stdlib)
       │                              ├── TMDB API (chave só no servidor)
       ▼                              └── SQLite do Bot
Banco principal
```

- **Frontend:** HTML, CSS e JavaScript ES modules, sem build. A History API mantém a navegação existente e o Tape Bot usa os mesmos componentes, fontes, cores, cartões e carretel do Tape Club.
- **Backend principal:** Node.js ≥ 22.5, servidor HTTP próprio e `node:sqlite`. O banco principal guarda integrantes, títulos, sessões, avaliações, favoritos e cache.
- **Tape Club Bot:** serviço REST Python 3.10+ sem dependências externas; usa `http.server`, `urllib` e `sqlite3` da biblioteca padrão. O Node autentica as chamadas do site e as encaminha ao serviço local. O Bot tem banco separado e não altera as tabelas do clube.
- **Metadados:** TMDB é a fonte de recomendações do Bot. O restante do Tape Club preserva a integração existente com TMDB, TVmaze e Wikidata. As imagens dos pôsteres são servidas diretamente pela CDN do TMDB.

O serviço Python escuta apenas em `127.0.0.1` por padrão. Não o exponha diretamente à rede: no site, as chamadas passam pela API Node, que exige uma sessão autenticada e aplica a proteção CSRF existente.

## Tape Club Bot

O Bot interpreta mensagens usando regras explícitas de português, sem fingir ser um modelo generativo. Reconhece as intenções `recomendar_filme`, `recomendar_serie`, `buscar_por_genero`, `buscar_por_duracao`, `buscar_similares`, `buscar_por_ano`, `saudacao` e `ajuda`. Combina gênero, tipo, duração, ano e título de referência quando esses critérios aparecem na mesma mensagem.

Para recomendações por gênero, tipo, ano ou duração, consulta `/discover/movie` e `/discover/tv`. Para semelhanças, pesquisa o título de referência e consulta o endpoint de títulos similares do TMDB. Resultados vazios, chave ausente/inválida, limites do provedor, indisponibilidade, mensagens inválidas e dados incompletos têm respostas tratadas; a chave nunca é enviada ao navegador.

### Pontuação e ordenação

Cada candidato recebe uma pontuação determinística:

- +20 por tipo correspondente, quando o usuário especifica filme ou série;
- +35 por gênero correspondente;
- até +20 por duração compatível, proporcional ao limite informado após uma consulta limitada de detalhes ao TMDB;
- +20 por ano exato;
- até +8 pela nota externa do TMDB (nota de 0 a 10 multiplicada por 0,8);
- até +1 pelo volume de votos (limitado a mil votos para esse desempate).

Filtros de duração e ano também são aplicados como critérios de elegibilidade. Para duração, o serviço aplica o limite ao endpoint de descoberta e consulta detalhes de até oito candidatos para ordenar e conferir os tempos retornados. Campos ausentes não são inventados; se a duração não puder ser confirmada, o título não é recomendado sob esse filtro. Empates são resolvidos por avaliação, número de votos e título, nessa ordem. Não há sorteio aleatório de recomendações.

### REST e exemplos

A aplicação web encaminha os endpoints autenticados abaixo para o serviço Python. Requisições de escrita pela aplicação devem incluir o cookie de sessão e o cabeçalho `X-Requested-With: tape-club`, como faz o cliente JavaScript do próprio site.

| Método | Endpoint do site | Função |
|---|---|---|
| `POST` | `/api/chat/conversations` | Cria uma conversa vazia e devolve `conversation_id`. |
| `POST` | `/api/chat` | Interpreta a mensagem, consulta o TMDB, pontua e persiste o turno. |
| `GET` | `/api/chat/conversations/{conversation_id}` | Recupera mensagens e recomendações da conversa. |

O serviço Python local, por padrão em `http://127.0.0.1:3101`, disponibiliza as rotas correspondentes em `/api/conversations`, `/api/chat` e `/api/conversations/{conversation_id}`. Ele não tem CORS habilitado nem deve ser publicado diretamente.

Exemplo de corpo:

```json
{
  "conversation_id": "id-de-conversa-devolvido-pelo-servidor",
  "message": "Quero um filme de terror com menos de duas horas"
}
```

Exemplo de resposta válida sem resultados para os critérios:

```json
{
  "conversation_id": "id-de-conversa-devolvido-pelo-servidor",
  "intent": "buscar_por_genero",
  "filters": {
    "genre": "Terror",
    "genre_ids": {"movie": 27, "tv": 9648},
    "type": "movie",
    "max_runtime": 120
  },
  "recommendations": [],
  "message": "Não achei opções com esses filtros no catálogo disponível do TMDB. Tente ampliar o período ou remover um dos critérios."
}
```

A resposta vazia é um resultado válido quando o TMDB não encontra opções que atendam aos filtros; títulos reais dependem dos dados do provedor. O Bot não promete cobrir todos os filmes e séries existentes.

### SQLite do Bot

O banco separado, por padrão `data/tape-club-bot.sqlite3`, contém:

- `conversations`: identificador aleatório e datas de criação/atualização;
- `messages`: texto, papel (usuário/assistente), intenção e filtros;
- `preferences`: filtros mais recentes da conversa, reutilizados como contexto;
- `recommendations`: posição, identificador TMDB, pontuação e dados apresentados.

O Bot não copia nome, senha, cookie, IP ou identificador de integrante para esse banco. Mensagens e preferências são armazenadas para recuperar o histórico; não inclua dados pessoais no chat. “Nova conversa” cria um contexto independente e não modifica o catálogo nem as conversas anteriores.

## Instalação e execução

Requisitos: Node.js ≥ 22.5 e Python 3.10+. O projeto não requer `npm install` nem pacotes Python.

1. Copie `.env.example` para `.env` e preencha `TMDB_API_KEY` (ou `TMDB_READ_TOKEN`) para habilitar recomendações, capas e busca principal do catálogo. A chave gratuita é obtida nas configurações de API do TMDB.
2. No PowerShell, abra **dois terminais** na pasta do projeto.
3. No primeiro, inicie o serviço Python:

   ```powershell
   python bot/server.py
   ```

   Alternativa pelo npm: `npm.cmd run bot`.

4. No segundo terminal, inicie o site:

   ```powershell
   npm.cmd start
   ```

5. Acesse `http://127.0.0.1:3000`. Crie a primeira conta do clube e abra **Tape Bot** na navegação.

Para rodar a demonstração original, use `npm.cmd run demo` e acesse `http://127.0.0.1:3100`. Ela continua usando dados e provedores simulados; o Bot requer que o serviço Python esteja em execução em outro terminal e que haja uma chave TMDB válida para recomendações reais.

Para encerrar cada processo, pressione `Ctrl+C` no terminal correspondente. Sem o serviço Python, o site e as outras funções continuam funcionando; a página do Bot informa que o serviço está indisponível.

### Variáveis de ambiente

No PowerShell, crie o arquivo local de configuração com:

```powershell
Copy-Item .env.example .env
```

Edite `.env` e informe a chave do TMDB. Esse arquivo é local e não deve ser versionado.

| Variável | Uso |
|---|---|
| `TMDB_API_KEY` / `TMDB_READ_TOKEN` | Credencial privada do TMDB. Pode ser lida pelos processos Node e Python via ambiente ou `.env`. |
| `PORT`, `HOST`, `DATA_DIR` | Porta, endereço e armazenamento do Tape Club Node. |
| `BOT_HOST`, `BOT_PORT` | Endereço/porta do serviço Python; o padrão seguro é `127.0.0.1:3101`. |
| `BOT_URL` | URL interna que o Node usa para encaminhar as chamadas do Bot. |
| `BOT_DB` | Caminho opcional do SQLite do Bot; padrão `data/tape-club-bot.sqlite3`. |
| `COOKIE_SECURE`, `SESSION_SECRET` | Opções de cookie HTTPS e segredo da sessão Node. |

Não versionar `.env`, banco de dados, credenciais, uploads ou caches. O `.gitignore` exclui os dados locais e artefatos Python.

## Testes

```powershell
npm.cmd test
python -m unittest discover -s bot/tests -v
```

Os testes Python verificam intenções e filtros, pontuação, montagem das consultas e erros do TMDB, endpoints REST, persistência e recuperação do histórico. As chamadas externas são simuladas; a execução dos testes não usa uma chave TMDB nem depende da rede.

## Estrutura de pastas

```text
bot/                 REST Python, intenções, recomendação, SQLite e testes
server/              servidor Node, autenticação, API e provedores de metadados
public/              SPA, identidade visual, navegação e página Tape Bot
test/                testes de integração Node
dev/                 demo e fixtures de provedores
scripts/             geração de assets visuais
data/                bancos/uploads locais (ignorado pelo Git)
```

## Capturas de tela

Não há capturas revisadas para publicação neste momento. Para demonstrar a interface, use dados de demonstração e salve imagens em `docs/screenshots/`; confira antes se elas não mostram nomes, avaliações ou outras informações privadas. Depois, inclua-as no README com links relativos, por exemplo `![Ficha de filme](docs/screenshots/ficha-filme.png)`.

## Engenharia e Aprendizados

- **Separação de responsabilidades:** a API Node existente continua responsável por sessão, CSRF, catálogo e banco principal. Uma ponte autenticada encaminha somente as operações de conversa ao serviço Python. Isso demonstra integração entre serviços sem reescrever o backend nem expor uma API local aberta ao frontend.
- **Python aplicado ao produto:** o serviço usa a biblioteca padrão para HTTP REST, chamadas externas, validação, parsing de linguagem natural baseado em regras, pontuação determinística e testes com mocks.
- **Dados com limites claros:** SQLite guarda histórico anônimo do Bot num arquivo separado. As consultas são parametrizadas; relações usam chaves estrangeiras e índices; preferências são vinculadas à conversa, não a uma integrante.
- **Integração externa responsável:** credenciais ficam no servidor, resultados incompletos são aceitos com campos opcionais, a API tem timeout e erros de autenticação, limitação, indisponibilidade e ausência de resultados são explícitos.
- **Recomendação explicável:** os critérios extraídos e a intenção ficam na resposta e no histórico. A ordenação pode ser reproduzida a partir dos dados e pesos descritos acima.
- **Interface integrada:** o Bot reutiliza tipografia, cores, botões e navegação do Tape Club, em vez de incorporar um widget de terceiros.

## Desafios e melhorias futuras

O parsing atual é baseado em regras e em português; não é um LLM e não entende todas as formulações possíveis. Gêneros disponíveis e duração dependem dos campos e dos endpoints do TMDB; títulos sem dados necessários podem não receber os pontos correspondentes. A disponibilidade do catálogo e do Bot depende da API externa.

Possíveis evoluções incluem exclusão/expiração configurável do histórico, seleção explícita de integrante para preferências do clube, mais filtros, importação direta de um título recomendado para o catálogo, métricas de qualidade das sugestões e execução supervisionada dos dois serviços em hospedagem privada.

## Publicação e créditos

O Tape Club original é um servidor Node.js com armazenamento persistente; hospedagem estática não é suficiente. Para publicar o Bot, também é necessário executar o serviço Python em rede privada e configurar `BOT_URL` no Node; não exponha `BOT_HOST` à Internet sem autenticação e proteção de transporte apropriadas.

- TMDB: *This product uses the TMDB API but is not endorsed or certified by TMDB.*
- TVmaze (CC BY-SA 4.0) e Wikidata (CC0) complementam os metadados do Tape Club.
- Tipografias: Fraunces, Barlow, Barlow Condensed e Caveat (Google Fonts, SIL Open Font License).

## Licença

O projeto ainda não declara uma licença: não há arquivo `LICENSE` no material recebido. A licença deve ser escolhida pelo responsável antes de apresentar o repositório como software reutilizável ou aceitar contribuições.
