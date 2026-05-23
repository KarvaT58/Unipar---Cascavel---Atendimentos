# Mapa visual do sistema

Este mapa mostra como as paginas principais se ligam hoje, usando fallback local em `.local-data` e a mesma camada pronta para persistir no Prisma/PostgreSQL quando o banco estiver disponivel.

```mermaid
flowchart LR
  Login["/login<br/>Entrar"] --> AuthAPI["POST /api/auth/login"]
  Signup["/signup<br/>Solicitar acesso"] --> AccessAPI["POST /api/access-requests"]
  Forgot["/forgot-password<br/>Recuperar senha"] --> RecoveryAPI["POST /api/password-recovery"]

  AuthAPI --> Session["Cookie auth_token<br/>/api/auth/session"]
  Session --> AppShell["(app)/layout<br/>Sidebar + Header"]

  AppShell --> Dashboard["/dashboard<br/>Indicadores"]
  AppShell --> Tickets["/atendimentos<br/>Chamados"]
  AppShell --> Chat["/chat-interno<br/>Conversas"]
  AppShell --> Groups["/grupos<br/>Grupos internos"]
  AppShell --> Team["/equipe<br/>Equipe"]
  AppShell --> Events["/anuncios-eventos<br/>Agenda e comunicados"]
  AppShell --> Loans["/emprestimos<br/>Emprestimos"]
  AppShell --> Kanban["/kanban<br/>Quadro"]
  AppShell --> Help["/ajuda<br/>Conteudo de ajuda"]
  AppShell --> Extensions["/ramais<br/>Lista de ramais"]
  AppShell --> UserCreation["/criacao-usuarios<br/>Aprovacao de usuarios"]
  AppShell --> Admin["/administracao<br/>Painel administrativo"]
  AppShell --> GenericPages["Demais paginas<br/>contatos, relatorios, canais, config"]

  Dashboard --> PrismaTickets["Prisma Ticket/User<br/>ou usuarios locais"]
  Team --> PrismaUsers["Prisma User<br/>ou auth-fallback.json"]
  UserCreation --> PrismaUsers
  UserCreation --> AccessStream["/api/access-requests/stream"]
  AccessAPI --> AccessStream

  Tickets --> Bootstrap["GET /api/bootstrap"]
  Chat --> Bootstrap
  Groups --> Bootstrap
  Events --> Bootstrap
  Loans --> Bootstrap
  Kanban --> Bootstrap
  Help --> Bootstrap
  Extensions --> Bootstrap
  Admin --> Bootstrap
  GenericPages --> Bootstrap

  Bootstrap --> StateStore["lib/server/state-store"]
  StatePut["PUT /api/state"] --> StateStore
  Realtime["/api/realtime"] --> StateStore

  StateStore --> PrismaState["Prisma AppStateDocument<br/>RealtimeEvent"]
  StateStore --> LocalState[".local-data/app-state-fallback.json"]
  PrismaUsers --> LocalAuth[".local-data/auth-fallback.json"]

  Tickets --> StatePut
  Chat --> StatePut
  Groups --> StatePut
  Events --> StatePut
  Loans --> StatePut
  Kanban --> StatePut
  Help --> StatePut
  Extensions --> StatePut
  Admin --> StatePut
  GenericPages --> StatePut
```

## Resumo por pagina

| Pagina | O que faz | Fala com |
| --- | --- | --- |
| `/login` | Autentica usuario institucional | `/api/auth/login`, `User/Session` ou fallback local |
| `/signup` | Cria pedido de acesso | `/api/access-requests`, stream de pedidos |
| `/dashboard` | Mostra metricas e grafico | `Ticket/User` no Prisma ou usuarios locais |
| `/chat-interno` | Conversas, anexos, leitura, denuncias e alertas | `/api/bootstrap`, `/api/state`, `/api/realtime` |
| `/grupos` | Grupos, participantes, admins e mensagens | `/api/bootstrap`, `/api/state`, `/api/realtime` |
| `/atendimentos` | Chamados por setor, mensagens e historico | `/api/bootstrap`, `/api/state`, painel admin |
| `/anuncios-eventos` | Agenda, lembretes e comunicados | `/api/bootstrap`, `/api/state` |
| `/emprestimos` | Solicitar, aprovar, adiar e resolver emprestimos | `/api/bootstrap`, `/api/state`, painel admin |
| `/kanban` | Colunas, cards, etiquetas e prazos | `/api/bootstrap`, `/api/state` |
| `/ajuda` e `/ramais` | Consulta conteudo criado no admin | `/api/bootstrap`, `/api/state` |
| `/criacao-usuarios` | Aprova/rejeita pedidos e gerencia usuarios | Prisma `User/AccessRequest` ou `auth-fallback.json` |
| `/administracao` | Usuarios, denuncias, chamados, emprestimos, ajuda e ramais | Estado compartilhado + acoes locais |
| Paginas genericas | CRUD simples por modulo para deixar a pagina utilizavel | `AppState.pageRecords` via `/api/state` |
