# Loulou Barquette — notes pour Claude Code

Application de commande en ligne du restaurant Loulou Barquette (Tsoundzou 2, Mamoudzou, Mayotte), façon application de livraison : site client + application installable, espace restaurant (responsable, accès cuisine partagé, livreurs), paiement en ligne, suivi en direct, connexion caisse.

Toute l'interface est en **français**. Ton client : vouvoiement partout, sauf l'écran d'attente du suivi (tutoiement choisi par le restaurant).

## Stack
- **Front** : TanStack Start (React 19, Vite 8), Tailwind CSS v4 (jetons HSL dans `src/styles.css`), lucide-react, sonner. Routes fichier dans `src/routes/`.
- **Back** : Convex (`convex/`) : base de données temps réel, fonctions, tâches planifiées, HTTP. Auth : `@convex-dev/auth`, connexion par code e-mail (`convex/ResendOTP.ts`).
- **Paiement** : Stripe Embedded Checkout (`convex/stripe.ts`, webhook `/stripe/webhook` dans `convex/http.ts`), mode via `VITE_STRIPE_MODE`.
- **Cartes** : Leaflet + OpenStreetMap (import dynamique côté client).
- **PWA** : `public/manifest.json`, `public/sw.js`, `src/lib/pwa.ts`.

## Commandes
- `npm install` puis `npx convex dev` (crée/relie un déploiement Convex et génère `convex/_generated`) et, dans un autre terminal, `npm run dev` (http://localhost:3000).
- Vérification des types : `npx tsc --noEmit -p .`
- Tests : `npm test`

## Règles d'architecture (à respecter)
- **Le serveur fait foi.** Tout prix, composition, frais de livraison, statut, droit ou horaire est recalculé/vérifié dans Convex. L'écran ne fait qu'afficher.
- **Droits** : utiliser `actor(ctx, kt, roles, needEmployee)` de `convex/access.ts` (comptes personnels `admin`/`staff`/`driver` ou appareil cuisine via le jeton `kt`). Ne jamais lever d'exception pour un refus : renvoyer `{ ok: false, code, message }` (message en français, utile à l'utilisateur).
- **Historique** : toute action métier appelle `audit(ctx, acteur, "Action", { order, detail, motif })`. Ne jamais modifier ni supprimer `auditLog` depuis l'application.
- **Concurrence** : une action sur une commande vérifie le statut attendu (`load(..., expect)` dans `convex/orders.ts`) pour qu'un second appareil ne refasse pas l'action.
- **Règles partagées** : `convex/shared.ts` (horaires de Mayotte UTC+3, `shopState`, validation et prix des options `priceSelection`) est pur et importé côté serveur ET côté écran.
- **Compatibilité des fonctions déployées** : n'ajouter que des arguments optionnels aux fonctions existantes ; ne pas retirer une fonction déjà déployée sans migration.
- **Données personnelles** : anonymisation à 30 jours (`orders.anonymizeOld`, `convex/crons.ts`). Le suivi client (`orders.track`) ne renvoie jamais nom, téléphone ou adresse.
- **Retour d'action** : côté écran, passer par `run()` de `src/lib/team.tsx` (en cours → réussi/échoué ; jamais de succès avant la réponse du serveur).

## Carte des fichiers
- `convex/orders.ts` : création de commande, suivi client, flux cuisine (accepter, refuser, délai, prête, remise, problèmes, ticket), livreurs, paiements, anonymisation.
- `convex/access.ts` : accès cuisine (mot de passe PBKDF2), sessions, employés et codes, `actor`, `audit`, historique.
- `convex/shop.ts` : ouverture, pause, horaires, acceptation automatique.
- `convex/options.ts` : ingrédients partagés, ruptures, règles des options (tacos).
- `convex/menu.ts`, `convex/appFiles.ts` : carte, contenus du site, photos.
- `convex/customers.ts` : comptes clients, fidélité. `convex/caisse.ts` : webhook et API caisse.
- `src/routes/index.tsx` (accueil + panier), `src/components/composer.tsx` (tacos), `src/routes/suivi.$token.tsx` + `src/components/waiting-art.tsx` (écran d'attente), `src/routes/equipe.tsx` + `src/components/team/*` (espace restaurant).
- Documentation métier : `GUIDE-GERANT.md`, `SECURITE.md`, `CAISSE.md`, `CAHIER-RECETTE.md`, `DESIGN.md`.

## Dépendances à la plateforme Macaly (où le projet a été créé)
- `convex/ResendOTP.ts` envoie les codes e-mail via le service Macaly (`OTP_ENDPOINT`, `SECRET_KEY`). Hors Macaly : remplacer par Resend (ou autre) dans `sendVerificationRequest`.
- `convex/macaly.ts` + `convex/appFiles.ts` stockent les photos via Macaly App Files (`MACALY_API_TOKEN`). Hors Macaly : passer au stockage de fichiers Convex (`ctx.storage`).
- `@macaly/bridge` (racine) et `@macaly/static-tagger` (vite, seulement si `DEV_BUILD`) servent l'éditeur Macaly ; ils peuvent être retirés hors Macaly.
- Le webhook Stripe lit l'en-tête `x-stripe-mode` ajouté par le proxy Macaly ; hors Macaly, fixer le mode via `VITE_STRIPE_MODE`.

## Secrets
Jamais dans Git. Copier `.env.example` en `.env.local` (front) et définir les variables serveur avec `npx convex env set NOM valeur`.
