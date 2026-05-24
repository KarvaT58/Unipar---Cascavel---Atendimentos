# Deploy SSH

Guia curto para subir o Unipar Atendimentos em um servidor Linux com SSH,
PostgreSQL, Nginx e PM2.

## 1. Requisitos

- Node.js LTS instalado.
- PostgreSQL ativo.
- Nginx instalado.
- PM2 instalado globalmente: `npm install -g pm2`.
- Repositorio clonado no servidor.

## 2. Variaveis de ambiente

Crie o `.env` a partir do exemplo:

```bash
cp .env.example .env
nano .env
```

Em producao, confira principalmente:

```bash
NODE_ENV="production"
SESSION_SECRET="uma-chave-com-32-caracteres-ou-mais"
DATABASE_URL="postgresql://usuario:senha@localhost:5432/unipar_atendimentos?schema=public"
LOCAL_DATA_ONLY="false"
AUTH_OFFLINE_FALLBACK="false"
LOCAL_AUTH_USER_SEED="false"
ALLOW_LOCAL_DATA_IN_PRODUCTION="false"
```

O modo local salva dados em `.local-data/` e e apenas para desenvolvimento.
Em producao ele fica bloqueado por padrao, mesmo que `LOCAL_DATA_ONLY` seja
ligado sem querer.

## 3. Instalar, preparar banco e compilar

```bash
npm ci
npm run prisma:generate
npm run prisma:push
npm run build
```

Enquanto o projeto ainda nao usa migrations versionadas, `prisma db push` e o
comando usado para sincronizar o schema. Quando o sistema estabilizar, troque o
fluxo de producao para migrations.

## 4. Rodar com PM2

```bash
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

Comandos uteis:

```bash
pm2 status
pm2 logs unipar-atendimentos
pm2 restart unipar-atendimentos
```

## 5. Nginx

Exemplo de bloco de site:

```nginx
server {
    listen 80;
    server_name seu-dominio.com.br;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    location /api/realtime {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/access-requests/stream {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Depois:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Configure HTTPS com Certbot ou outra solucao de certificado antes de uso real.

## 6. Healthcheck

Com o app rodando:

```bash
curl -fsS http://127.0.0.1:3000/api/health
```

Em producao, o healthcheck deve retornar `ok: true` apenas com PostgreSQL
configurado e acessivel.

## 7. Uploads e avatar

O avatar do perfil ainda e salvo como base64 no estado do app. Isso e pratico
para a fase atual, mas aumenta o tamanho do estado se muitos usuarios enviarem
imagens grandes. O codigo ja limita e comprime a imagem; no futuro, o ideal e
salvar arquivos em storage dedicado, como disco persistente, S3 ou similar.

## 8. Dependencias

`npm audit` pode apontar vulnerabilidades moderadas transitivas em Next/Prisma.
Nao rode `npm audit fix --force` sem revisar, porque ele pode instalar versoes
incompativeis. Atualize Next e Prisma quando houver versoes compativeis que
corrijam os avisos.
