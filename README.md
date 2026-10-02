# Loulou Barquette — application de commande

Commande en ligne, paiement, suivi du livreur en direct et espace restaurant pour **Loulou Barquette**, 13 Impasse Longchamps, Tsoundzou 2, 97600 Mamoudzou.

- **Clients** : carte, tacos à composer, panier, paiement par carte ou titre-restaurant, compte et points de fidélité, écran d'attente animé, suivi du livreur, application installable sur téléphone.
- **Restaurant** (`/equipe`) : commandes en temps réel avec alerte sonore, accès cuisine partagé + code personnel par employé, ruptures, pause, horaires, ticket 80 mm, historique des actions, paiements, connexion au logiciel de caisse, modification du site.

## Démarrer en local
```bash
npm install
cp .env.example .env.local      # puis compléter les valeurs
npx convex dev                  # relie un déploiement Convex et génère convex/_generated
npm run dev                     # http://localhost:3000
```
Variables serveur (Convex) : `npx convex env set ADMIN_EMAILS vous@exemple.com`, puis les clés Stripe et l'envoi des e-mails (voir `CLAUDE.md`).

## Continuer avec Claude Code
Ouvrez le dossier dans Claude Code : le fichier `CLAUDE.md` décrit l'architecture, les règles de sécurité à respecter et les dépendances à la plateforme Macaly.

## Documentation
- `GUIDE-GERANT.md` : utilisation au quotidien par le responsable et l'équipe.
- `SECURITE.md` : modèle de sécurité et de confidentialité.
- `CAISSE.md` : connexion à un logiciel de caisse (webhook, API, CSV).
- `CAHIER-RECETTE.md` : tests de réception avant la mise en service.
