# Loulou Barquette — recette (tests de réception)

Basé sur le cahier des besoins du 30/09/2026. À dérouler avec le responsable avant la mise en service.

| Test | Résultat attendu | Où |
|---|---|---|
| Commande réelle de test | Apparaît une seule fois sur le téléphone du responsable et sur les appareils de l'équipe, avec alerte sonore répétée | Espace restaurant → Commandes |
| Parcours complet | Acceptée → en préparation → prête → remise ; le client voit chaque étape et la fourchette horaire | Écran de suivi client |
| Deux appareils | Une action simultanée ne provoque ni doublon ni statut incohérent (« Déjà traitée sur un autre appareil ») | Deux tablettes |
| Droits employés | Accès cuisine : aucun accès aux finances, prix, paramètres ou historique complet, même par lien direct | /equipe#parametres depuis la tablette |
| Rupture / pause | Article ou ingrédient indisponible partout ; pause 15/30 min avec motif, commandes acceptées conservées | Menu et ruptures ; pastille « Restaurant ouvert » |
| Ticket / panne | Ticket 80 mm lisible ; réimpression marquée « DUPLICATA » ; bandeau en cas de perte de connexion | Volet de commande → Ticket |
| Paiement / remboursement | Paiement en attente jamais préparé ; annulation ≠ remboursement (indiqué) | Commandes, Paiements |
| Accès / reconnexion | Retrait d'un employé effectif sans déconnecter la cuisine ; appareil déconnectable à distance ; actions tracées | Paramètres → Accès cuisine et employés ; Historique |
| Tacos | M, L, XL, double viande, sans sauce, sauce à part, formule, rupture d'une sauce, passage de XL à M | Site → Composer |

## Choix retenus (à valider)
- Site mobile installable (PWA) pour clients, équipe et livreurs.
- Accès cuisine : identifiant + mot de passe partagé, puis prénom + code personnel (4 à 6 chiffres) pour chaque prise de service.
- Responsable : connexion par code reçu par e-mail (pas de mot de passe à voler).
- Pause : 15 ou 30 min pour l'équipe (jusqu'à 2 h pour le responsable), motif obligatoire, 3 h maximum cumulées.
- Délai annoncé : +5 à +30 min pour l'équipe, au-delà le responsable.
- Historique : 48 h pour l'équipe, 30 jours pour le responsable ; données personnelles anonymisées après 30 jours.
- Tacos : tailles, viandes, sauces, suppléments et prix d'exemple, à remplacer par la carte réelle.
