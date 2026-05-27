# Unipar - Cascavel - Atendimentos

Sistema SaaS para atendimentos, chat interno, grupos, equipe, anúncios/eventos,
empréstimos, kanban e administração.

## Desenvolvimento local

Instale as dependências:

```bash
npm install
```

Para desenvolver sem PostgreSQL, copie `.env.example` para `.env` e habilite:

```bash
LOCAL_DATA_ONLY="true"
AUTH_OFFLINE_FALLBACK="true"
LOCAL_AUTH_USER_SEED="true"
LOCAL_AUTH_USER_EMAIL="dev@unipar.br"
LOCAL_AUTH_USER_PASSWORD="12345678"
```

Com isso, o app salva os dados em `.local-data/` e cria um usuário local para
login. A pasta `.local-data/` não deve ser enviada para o GitHub.

Rode o servidor:

```bash
npm run dev
```

Acesse `http://localhost:3000`.

## Produção

Em produção, use PostgreSQL e mantenha o modo local desligado:

```bash
NODE_ENV="production"
LOCAL_DATA_ONLY="false"
AUTH_OFFLINE_FALLBACK="false"
LOCAL_AUTH_USER_SEED="false"
ALLOW_LOCAL_DATA_IN_PRODUCTION="false"
```

Configure também:

```bash
SESSION_SECRET="uma-chave-com-32-caracteres-ou-mais"
DATABASE_URL="postgresql://usuario:senha@localhost:5432/unipar_atendimentos?schema=public"
```

Build:

```bash
npm run prisma:generate
npm run prisma:push
npm run build
npm run start
```

Guia completo para SSH, PM2 e Nginx:

```text
docs/deploy-ssh.md
```

## Healthcheck

Com o app rodando:

```bash
curl http://localhost:3000/api/health
```

O endpoint retorna o estado do app, modo local e conexão com banco. Em produção,
ele só deve retornar `ok: true` quando o PostgreSQL estiver configurado e
respondendo.

## Validação

Antes de publicar:

```bash
npm run lint
npm run build
```

## Observacoes

- Avatar do perfil ainda é salvo como base64 no estado do sistema. Isso é
  suficiente para a fase atual, mas o ideal futuro é mover uploads para storage
  dedicado.
- Não use `npm audit fix --force` sem revisar. O audit pode sugerir mudanças
  quebrando Next/Prisma.
