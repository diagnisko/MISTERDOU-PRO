# MISTERDOU-PRO

Marketplace sécurisée d'achat et de vente de comptes eFootball.
Monorepo : application web (Next.js) + API REST (NestJS/Fastify) + PostgreSQL (Prisma) + Redis + Cloudflare R2.

## Stack

| Couche | Technologie |
|---|---|
| Frontend | Next.js 14 (App Router), Tailwind CSS, framer-motion |
| Backend | NestJS (adapter Fastify), TypeScript, Zod, OpenAPI |
| Base de données | PostgreSQL 16 + Prisma ORM |
| Cache / files | Redis + BullMQ |
| Stockage | Cloudflare R2 : bucket PRIVÉ (KYC, URLs signées 60 s) + bucket PUBLIC (médias offres) |
| Paiement | PayTech (webhooks signés + idempotents) |
| Auth | E-mail/mot de passe (argon2) OU Google OAuth · JWT + refresh rotatif · TOTP 2FA admin/staff |

## Structure

```
apps/
  web/      → Site web (landing premium + espaces client/vendeur/admin)
  api/      → API REST (réutilisable par les futures apps mobiles)
packages/
  shared/   → Types et schémas Zod partagés
prisma/     → Schéma et migrations
```

## Démarrage (développement)

```bash
# 1. Infrastructure (Postgres, Redis)
docker compose up -d

# Optionnel : stockage local hors ligne (sinon Cloudflare R2)
docker compose --profile local-storage up -d

# 2. Variables d'environnement
cp .env.example .env

# 3. Dépendances
pnpm install

# 4. Base de données
pnpm prisma migrate dev

# 5. Lancer l'API (http://localhost:4000)
pnpm --filter api dev

# 6. Lancer le web (http://localhost:3000)
pnpm --filter web dev
```

## Phases de développement

1. Architecture + base de données + authentification
2. Vérification d'identité (KYC)
3. Catalogue produits
4. Système vendeur
5. Paiements PayTech
6. Commandes
7. Paiement en plusieurs fois
8. Dashboard administrateur
9. Promotions & mises en avant
10. Support & notifications
11. Sécurité avancée
12. Optimisation performance
13. Tests
14. Déploiement production

## Sécurité — principes

- Permissions vérifiées **côté serveur uniquement** (RBAC)
- Documents KYC en stockage privé (Cloudflare R2, jamais d'URL publique, URLs signées 60 s)
- Médias des offres en bucket public (validation MIME/taille côté serveur avant upload)
- Identifiants eFootball chiffrés AES-256-GCM au repos
- Paiements confirmés uniquement via webhooks PayTech signés + idempotence
- Journal d'audit sur toutes les actions sensibles
- Aucun secret dans le code source (variables d'environnement)
