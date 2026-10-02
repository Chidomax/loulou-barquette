# Relier Loulou Barquette à un logiciel de caisse

Tout se règle dans l'espace équipe, onglet **Caisse** (réservé au gérant).

## Trois façons, selon la caisse
1. **Sans configuration** : onglet Commandes, bouton « Tickets cuisine » (impression 58/80 mm) ou « CSV pour la caisse » (fichier importable partout).
2. **Envoi automatique (webhook)** : la caisse fournit une adresse https ; le site y envoie chaque commande dès sa confirmation, puis à chaque étape.
3. **Lecture (API)** : la caisse interroge le site avec une clé secrète.

## Envoi automatique
`POST` en JSON : `{ "evenement": "commande.recue", "envoyeLe": "...", "commande": { ... } }`

Événements : `commande.recue`, `commande.preparation`, `commande.prete`, `commande.en_livraison`, `commande.livree`, `commande.recuperee`, `commande.annulee` (et `test`).

En-têtes : `X-Loulou-Event`, `X-Loulou-Timestamp`, `X-Loulou-Signature: sha256=<hex>` où la signature est le HMAC-SHA256, avec le secret affiché dans l'onglet Caisse, du texte `horodatage + "." + corps`. Répondre par un code 2xx ; sinon trois nouveaux essais (30 s, 2 min, 8 min).

## Lecture
`GET https://hardy-kookabura-888.eu-west-1.convex.site/caisse/commandes?depuis=<ms>` avec `Authorization: Bearer <clé>`.
Réponse : `{ "commandes": [...], "prochainDepuis": <ms> }` (réutiliser `prochainDepuis` à l'appel suivant). Ajouter `&format=csv` pour un CSV (séparateur `;`, UTF-8). 120 requêtes par minute au maximum.

## Contenu d'une commande (version 1)
`numero`, `creeLe`, `statut`, `statutLibelle`, `mode` (`livraison`, `a_emporter`, `sur_place`), `quartier`, `adresse`, `client { nom, telephone }`, `note`, `lignes [{ article, quantite, prixUnitaire, total }]`, `sousTotal`, `fraisLivraison`, `remise`, `total` (TTC, EUR), `paiement { methode, emetteurTitre, montantTitre, montantCarte, payeTitre, payeCarte, reglee, resteAEncaisser }`, `livreur`.
