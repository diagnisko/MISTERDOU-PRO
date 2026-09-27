# 🔒 Revue sécurité finale — MISTERDOU-PRO

Checklist de vérification avant mise en production. Chaque point doit être **vérifié et coché** avant le déploiement.

## 1. Secrets & environnement

| Vérification | Statut |
|---|---|
| `.env` jamais committé (`.gitignore` contient `.env`, `.env.*`) | ☐ |
| Tous les secrets en variables d'env (`JWT_SECRET`, `TWOFA_MASTER_KEY`, `EFCRED_MASTER_KEY`, `PAYTECH_WEBHOOK_SECRET`, `SMTP_URL`, `DATABASE_URL`, `REDIS_URL`, clés R2) | ☐ |
| Clés distinctes par environnement (dev / staging / prod) — jamais de réutilisation | ☐ |
| `JWT_SECRET` ≥ 64 caractères aléatoires (`openssl rand -hex 32`) | ☐ |
| Rotation des clés prévue (procédure documentée) | ☐ |

## 2. Authentification

| Vérification | Statut |
|---|---|
| Argon2id pour les mots de passe (défaut du service) | ✅ |
| Verrouillage compte : 5 échecs → 15 min (anti brute-force) | ✅ |
| Rate limits : auth 5/min, candidature 3/min, retrait 5/min, tickets 3/min, paiement 10/min | ✅ |
| Tokens JWT courte durée + refresh avec détection de réutilisation | ✅ |
| Sessions révocables (revokedAt) — logout efficace | ✅ |
| 2FA TOTP pour ADMIN/STAF (secret chiffré AES-256-GCM au repos) | ✅ Phase 10 |

## 3. Données sensibles

| Vérification | Statut |
|---|---|
| Identifiants eFootball chiffrés AES-256-GCM (`EFCRED_MASTER_KEY`) — jamais en clair en base | ✅ |
| Secrets TOTP chiffrés au repos (`TWOFA_MASTER_KEY`) | ✅ |
| Documents KYC en bucket **privé** R2 (`misterdou-kyc`) — URLs présignées courte durée, accès admin uniquement | ✅ |
| Médias publics en bucket séparé (`misterdou-media`) | ✅ |
| Validation MIME + taille côté serveur sur tous les uploads | ✅ |
| Chiffrement TLS en transit (HTTPS obligatoire — reverse proxy/CDN) | ☐ déploiement |

## 4. Paiements

| Vérification | Statut |
|---|---|
| Webhook authentifié par secret (`X-PayTech-Secret`) — secret fort et unique | ✅ |
| Idempotence webhook : `PaymentEvent @@unique([providerRef, eventType])` + statut SUCCEEDED court-circuit | ✅ |
| Montants et types de paiement **toujours calculés serveur** (jamais le client) | ✅ |
| Verrou anti double-achat (transaction FOR UPDATE) — testé e2e | ✅ |
| Séquestre vendeur (net après commission) en `pendingBalance` — jamais directement disponible | ✅ |
| Agrégateur invisible côté client — Wave / Orange Money uniquement | ✅ |
| Codes promo : PERCENT plafonné à 90 %, FIXED plafonné au montant | ✅ |

## 5. RBAC & surface d'attaque

| Vérification | Statut |
|---|---|
| Tous les endpoints protégés par `RolesGuard` + `@Roles(...)` | ✅ |
| Endpoints publics limités au strict nécessaire (catalogue, validation promo, featured) | ✅ |
| Ownership systématiquement vérifié (commandes, tickets, plans, notifications) | ✅ |
| Validation globale `whitelist + forbidNonWhitelisted` (class-validator) | ✅ |
| Helmet (CSP, en-têtes sécurité) actif | ✅ |
| CORS restreint (`WEB_URL`) — pas de wildcard en prod | ☐ vérifier env prod |
| Documentation Swagger désactivée ou protégée en prod | ☐ décision |
| Audit logs sur toutes les actions admin sensibles | ✅ |

## 6. Infrastructure

| Vérification | Statut |
|---|---|
| Postgres accessible uniquement depuis le réseau interne (pas d'exposition publique) | ☐ |
| Redis idem (`REDIS_URL` interne) | ☐ |
| Buckets R2 : privé KYC, public médias — politiques vérifiées | ☐ |
| Sauvegardes automatiques DB + test de restauration effectué | ☐ |
| Monitoring / alertes en place (erreurs 5xx, jobs cron échoués) | ☐ |
| Rate limit global (100 req/min) adapté à la charge attendue | ☐ calibrer |
| `bodyLimit` 50 Mo adapté (uploads médias via presign, pas par l'API) | ✅ |

## 7. Automatisation

| Vérification | Statut |
|---|---|
| Cron jobs BullMQ idempotents (4 jobs actifs) | ✅ |
| Nettoyage des jobs BullMQ (removeOnComplete/Fail : 100) | ✅ |
| Tests e2e des flux critiques passent (`test:e2e`) | ☐ exécuter en CI |

## 8. Avant le lancement

- [ ] Compte ADMIN initial : mot de passe fort + 2FA activée **avant** l'ouverture au public
- [ ] `PAYTECH_WEBHOOK_SECRET` configuré et testé (webhook de test)
- [ ] Limites de retrait et fenêtres de séquestre revues
- [ ] CGU / mentions légales / politique de confidentialité publiées (référence §31 financement)
- [ ] Plan de réponse à incident (contact, procédure compromission, gel des paiements)

---

*Checklist maintenue à jour à chaque phase. Toute case ☐ doit être traitée avant la mise en production.*
