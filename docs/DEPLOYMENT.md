# 🚀 Guide de déploiement — MISTERDOU-PRO

## Prérequis

- Node.js 20+, pnpm 9+
- PostgreSQL 15+ (réseau interne)
- Redis 7+ ( BullMQ : file d'attente + cron jobs)
- Compte Cloudflare R2 (2 buckets : `misterdou-kyc` privé, `misterdou-media` public)
- Compte agrégateur de paiement (Wave / Orange Money) + URL de webhook configurée

## 1. Variables d'environnement

Copier `.env.example` → `.env` puis renseigner :

```bash
# Base
DATABASE_URL="postgresql://user:pass@host:5432/misterdou"
REDIS_URL="redis://host:6379"
WEB_URL="https://misterdou.pro"
API_PORT=4000

# Secrets (openssl rand -hex 32 pour chacun)
JWT_SECRET=""
TWOFA_MASTER_KEY=""        # 32 bytes hex — secrets TOTP chiffrés
EFCRED_MASTER_KEY=""       # 32 bytes hex — identifiants eFootball chiffrés
PAYTECH_WEBHOOK_SECRET=""

# R2 (Cloudflare)
R2_ACCOUNT_ID=""
R2_ACCESS_KEY_ID=""
R2_SECRET_ACCESS_KEY=""
R2_BUCKET_KYC="misterdou-kyc"
R2_BUCKET_MEDIA="misterdou-media"

# E-mail (transactionnel)
SMTP_URL="smtp://user:pass@smtp.host:587"
SMTP_FROM="MISTERDOU <no-reply@misterdou.pro>"

# Paiement
PAYTECH_API_KEY=""         # usage serveur uniquement — jamais côté client
PAYTECH_API_SECRET=""

# Rate limit global (req/min)
RATE_LIMIT_GLOBAL_MAX=100
```

⚠️ **Les clés de chiffrement ne doivent jamais être régénérées après coup** — les données chiffrées (identifiants, TOTP) deviendraient illisibles. Prévoir une sauvegarde sécurisée de `JWT_SECRET`, `TWOFA_MASTER_KEY`, `EFCRED_MASTER_KEY`.

## 2. Build & migration

```bash
pnpm install
pnpm --filter api prisma:generate
pnpm --filter api prisma:migrate   # ou prisma migrate deploy en prod
pnpm --filter api build
pnpm --filter web build
```

## 3. Tests avant mise en ligne

```bash
# Unitaires
pnpm --filter api test

# E2E (base de test — jamais la prod !)
DATABASE_URL="postgresql://.../misterdou_test" pnpm --filter api test:e2e
```

Les tests e2e vérifient : achat concurrent (un seul gagnant), rejeu webhook (zéro double-crédit), séquestre vendeur (net 85 %).

## 4. Démarrage

```bash
# API (Fastify)
NODE_ENV=production pnpm --filter api start:prod

# Web (Next.js)
pnpm --filter web start
```

Le scheduler démarre automatiquement avec l'API si `REDIS_URL` est défini :
- `*/5 min` : libération des commandes expirées (> 15 min)
- `08h00` : échéances de financement en retard
- `09h00` : rappels de mensualités (3 j avant)
- `minuit` : fin des mises en avant échues

## 5. Premiers pas après déploiement

1. **Créer le compte ADMIN initial** (script SQL ou inscription puis promotion manuelle en base)
2. **Activer la 2FA immédiatement** : `POST /api/v1/2fa/setup` → scanner le QR (app Google Authenticator/Authy) → `POST /api/v1/2fa/enable`
3. **Configurer le webhook de paiement** vers `https://api.misterdou.pro/api/v1/payments/webhook/paytech` avec le secret `X-PayTech-Secret`
4. **Vérifier les buckets R2** (politiques d'accès)
5. **Repasser la checklist** `docs/SECURITY-REVIEW.md` — toutes les cases ☐ doivent être traitées

## 6. Architecture recommandée

```
[CDN / WAF] → [Web Next.js] → [API Fastify]
                                ├── PostgreSQL (interne)
                                ├── Redis (interne — BullMQ)
                                └── R2 (KYC privé / médias public)
```

- HTTPS obligatoire partout (redirection automatique HTTP → HTTPS)
- Documentation Swagger (`/api/docs`) : protéger ou désactiver en prod
- Monitoring : surveiller les 5xx, les jobs BullMQ en échec, et la latence du webhook

## 7. Sauvegardes

- PostgreSQL : dump quotidien + rétention 30 j, **test de restauration mensuel**
- Secrets : coffre sécurisé (hors repo)
- R2 : versioning activé sur le bucket KYC

---

*Voir `docs/SECURITY-REVIEW.md` pour la checklist complète pré-déploiement.*
