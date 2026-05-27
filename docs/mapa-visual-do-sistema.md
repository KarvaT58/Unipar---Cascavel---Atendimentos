# Mapa visual do sistema

Este mapa mostra como as páginas principais se ligam hoje, usando fallback local em `.local-data` e a mesma camada pronta para persistir no Prisma/PostgreSQL quando o banco estiver disponível.

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
  AppShell --> Loans["/emprestimos<br/>Empréstimos"]
  AppShell --> Kanban["/kanban<br/>Quadro"]
  AppShell --> Help["/ajuda<br/>Conteúdo de ajuda"]
  AppShell --> Extensions["/ramais<br/>Lista de ramais"]
  AppShell --> UserCreation["/criacao-usuarios<br/>Aprovação de usuários"]
  AppShell --> Admin["/administracao<br/>Painel administrativo"]
  AppShell --> GenericPages["Demais páginas<br/>contatos, relatórios, canais, config"]

  Dashboard --> PrismaTickets["Prisma Ticket/User<br/>ou usuários locais"]
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

## Resumo por página

| Página | O que faz | Fala com |
| --- | --- | --- |
| `/login` | Autentica usuário institucional | `/api/auth/login`, `User/Session` ou fallback local |
| `/signup` | Cria pedido de acesso | `/api/access-requests`, stream de pedidos |
| `/dashboard` | Mostra métricas e gráfico | `Ticket/User` no Prisma ou usuários locais |
| `/chat-interno` | Conversas, anexos, leitura, denúncias e alertas | `/api/bootstrap`, `/api/state`, `/api/realtime` |
| `/grupos` | Grupos, participantes, admins e mensagens | `/api/bootstrap`, `/api/state`, `/api/realtime` |
| `/atendimentos` | Chamados por setor, mensagens e histórico | `/api/bootstrap`, `/api/state`, painel admin |
| `/anuncios-eventos` | Agenda, lembretes e comunicados | `/api/bootstrap`, `/api/state` |
| `/emprestimos` | Solicitar, aprovar, adiar e resolver empréstimos | `/api/bootstrap`, `/api/state`, painel admin |
| `/kanban` | Colunas, cards, etiquetas e prazos | `/api/bootstrap`, `/api/state` |
| `/ajuda` e `/ramais` | Consulta conteúdo criado no admin | `/api/bootstrap`, `/api/state` |
| `/criacao-usuarios` | Aprova/rejeita pedidos e gerencia usuários | Prisma `User/AccessRequest` ou `auth-fallback.json` |
| `/administracao` | Usuários, denúncias, chamados, empréstimos, ajuda e ramais | Estado compartilhado + ações locais |
| Páginas genéricas | CRUD simples por módulo para deixar a página utilizável | `AppState.pageRecords` via `/api/state` |
