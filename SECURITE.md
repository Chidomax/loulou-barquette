# Sécurité et confidentialité — Loulou Barquette (application de commande)

## Accès et droits (vérifiés côté serveur à chaque action, pas seulement à l'écran)
- **Responsable** : compte personnel ouvert par un code à 6 chiffres reçu par e-mail (valable 15 min, pas de mot de passe à voler). Accès complet : prix, carte, horaires, finances, employés, caisse, historique. Défini dans `ADMIN_EMAILS` ou invité par un autre responsable.
- **Équipe et livreurs (téléphone personnel)** : compte individuel par code e-mail, révocable ; retirer un compte ferme immédiatement ses sessions sans déconnecter la cuisine.
- **Accès cuisine partagé** (tablette, ordinateur du restaurant) : identifiant + mot de passe d'au moins 10 caractères, conservé uniquement sous forme d'empreinte PBKDF2-SHA256 (120 000 itérations, sel aléatoire). 5 erreurs = verrouillage 15 min, 10 tentatives max par 15 min. Session = jeton aléatoire de 256 bits stocké sur l'appareil, empreinte SHA-256 côté serveur, 30 jours (« rester connecté ») ou 12 h. Le responsable voit les appareils connectés et peut en déconnecter un ou tous ; changer le mot de passe ferme toutes les sessions. Aucun droit responsable sur cet accès.
- **Employés en cuisine** : prénom + code personnel de 4 à 6 chiffres (empreinte PBKDF2, codes trop simples refusés), 5 erreurs = blocage 15 min. Chaque action importante exige un employé identifié et lui est attribuée. Le responsable peut retirer un employé sans déconnecter la tablette.
- **Limites de l'équipe** : annulation seulement avant préparation et avec motif ; refus avec motif d'une liste ; retard annoncé de 5 à 30 min ; pause de 15 ou 30 min avec motif (3 h cumulées max) ; recherche limitée aux 48 dernières heures ; pas d'accès aux chiffres du jour, paiements, prix, horaires, paramètres ni export clients, même par lien direct.

## Historique des actions
- Chaque action est tracée : heure, commande, auteur (personne, employé ou système), action, motif et résultat (acceptation, refus, délai, prête, remise, impression, rupture, pause, connexions, échecs de code, changements de réglages).
- L'historique n'est jamais modifié ni supprimé par l'application. Une correction (ex. « prête » → « en préparation ») ajoute une ligne avec motif, la trace initiale reste.

## Temps réel et actions simultanées
- Une seule commande, partagée en temps réel sur tous les appareils autorisés.
- Chaque action indique l'étape vue à l'écran : si un autre appareil a déjà agi, rien n'est fait et l'écran affiche « Déjà traitée sur un autre appareil ». Testé avec deux appareils qui acceptent en même temps : une seule acceptation enregistrée.
- Remise : le numéro de commande annoncé doit être saisi avant de remettre le sac au client ou au livreur. « Remise au livreur » et « livrée au client » sont deux étapes distinctes ; seule la seconde (livreur affecté ou responsable) clôt une livraison.
- Retour d'action honnête : « en cours », puis réussi ou échoué ; jamais de succès affiché avant la réponse du serveur. Bandeau visible en cas de perte de connexion.

## Commandes et paiements
- Prix, compositions, suppléments, frais de livraison et part titre-restaurant recalculés sur le serveur : un client ne peut modifier ni un montant ni une composition.
- Options (tacos) : tailles, nombres de viandes, sauces et sous-options, suppléments et formules vérifiés côté serveur ; un choix invisible n'est jamais facturé ; un ingrédient en rupture est refusé dans tous les produits qui l'utilisent.
- Ouverture, pause et horaires vérifiés par le serveur à chaque commande (testé : commande refusée pendant une pause, même en contournant l'écran).
- Paiement Stripe intégré : les données de carte ne passent jamais par le site ; webhook signé ; chaque paiement compté une fois. Commande non payée sous 30 min annulée ; jamais préparée avant paiement. Annuler ne rembourse pas automatiquement (indiqué au responsable).
- Anti-abus : 5 commandes par téléphone par 15 min, 40 par minute au total, 8 tentatives de paiement par commande par 10 min.

## Comptes clients
- Compte obligatoire pour commander (code e-mail, aucun mot de passe stocké). Le client ne voit que ses propres commandes.
- Points de fidélité : 1 point par euro, crédités une fois à la remise ; 2000 points = 5 € (dès 10 €), vérifiés et débités côté serveur, rendus en cas d'annulation.
- Suppression du compte à tout moment par le client.

## Suivi, quartiers et livreurs
- Lien de suivi : jeton aléatoire de 192 bits ; la page n'affiche ni nom, ni téléphone, ni adresse.
- Quartier et tarif déterminés par le serveur si le client partage sa position ; refus au-delà de 3 km d'un quartier desservi.
- Position du livreur enregistrée seulement pendant sa livraison, par lui seul, toutes les 3 s au plus, à Mayotte uniquement ; effacée à la remise.

## Données personnelles
- Nom, téléphone, adresse, position, notes internes et signalements anonymisés automatiquement après 30 jours (tâche planifiée chaque nuit). Sessions cuisine expirées effacées après 7 jours.
- Exports CSV (responsable uniquement) neutralisés contre l'injection de formules.

## Navigateur et application
- Politique de sécurité du contenu (CSP) : scripts limités au site et à Stripe, aucun objet embarqué, formulaires vers le site uniquement. Référent `strict-origin`.
- Application installable (PWA) : le service worker ne met jamais en cache les commandes, paiements ou comptes.
- Photos : seul le responsable peut en envoyer ; JPEG, PNG ou WebP, 8 Mo maximum, vérifiés côté serveur.

## Logiciel de caisse
- Webhook vers une adresse https publique uniquement, signé HMAC-SHA256, 3 nouveaux essais. Clé de lecture de 192 bits affichée une fois, empreinte seule conservée, révocable, 120 requêtes/min.

## À prévoir avant une mise en service réelle
- En-têtes HTTP de l'hébergeur (anti-iframe `frame-ancestors`, HSTS) à confirmer avec Macaly.
- Mentions légales, politique de confidentialité et conditions de vente (comptes clients, points, conservation des données).
- Mode « live » des paiements, acceptation des titres-restaurant auprès des émetteurs.
- Sauvegarde : export régulier de la base depuis le tableau de bord Convex et test de restauration.
- Recette complète avec le responsable (voir CAHIER-RECETTE.md).

## Outils internes (jamais appelables depuis le site)
- `users:internalInvite`, `menu:resetZones`, `options:seedTacos`, `qaCleanup:run`, `qaCleanup:setTestPoints`, `qaCleanup:testHours`, `qaCleanup:resetTestTraces` (refusé dès qu'une vraie commande existe) et `caisse:clearConfig` : réservés aux administrateurs de la base, pour la mise en place et les tests.
