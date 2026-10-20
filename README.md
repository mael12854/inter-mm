# Caisse Inter-Marin-et-Maël

La caisse du supermarché de la famille (à la maison). Écran tactile 7″ (800 × 480), douchette USB, imprimante à étiquettes 62 mm.

## Lancer la caisse

Aucun logiciel à installer : ouvrir **`index.html`** dans Chrome ou Edge, puis « Plein écran ».
En ligne, le site est publié par Vercel à chaque mise à jour de la branche `main`.

Tout est partagé par **Supabase** (projet « Inter-Marin-et-Maël ») : catalogue, cartes Copains, tickets, clôtures, codes et réglages. La caisse est la même sur tous les appareils.

## Compte du magasin (Supabase)

Au premier lancement, chaque appareil demande le **compte du magasin** (e-mail + mot de passe), une seule fois. Ensuite Marin et Maël entrent avec leurs codes, comme d'habitude.

- **Premier compte** : sur l'écran « Compte du magasin », toucher **Créer le compte du magasin**, confirmer l'e-mail reçu, puis **Se connecter**. Le premier compte créé devient automatiquement le compte du magasin.
- **Autres appareils** : se connecter avec le même e-mail et mot de passe.
- Un autre compte créé ensuite n'a accès à rien.
- **Sans internet**, la caisse continue de marcher. Les ventes attendent sur l'appareil et partent dès que la connexion revient (voyant « Supabase » en haut : vert = à jour, orange = envoi en attente, rouge = hors ligne).
- La **clôture du jour** a besoin d'internet : elle compte les tickets de tous les appareils.
- Réglages → **Déconnecter cet appareil** ou **Recharger depuis Supabase**.

La structure de la base est dans `supabase/migrations/`.

Crédit Domestique est un autre projet Supabase (« Credit-Domestique ») : la caisse utilise ses fonctions `login_account` et `respond_charge`. Les montants sont en centimes des deux côtés.

## Codes de départ

| Qui | Rôle | Code |
|---|---|---|
| Marin | Caissier | `1111` |
| Maël | Responsable | `102456` |

Les codes (4 à 6 chiffres) se changent dans **Mode responsable → Réglages**. On peut aussi imprimer un badge et le scanner pour se connecter.

Quand Marin tient la caisse, Maël doit taper son code (ou scanner son badge) pour :
- ouvrir le **mode responsable** (touche « Appeler Maël ») ;
- **Annuler ligne** ;
- **Prix manuel** (aussi depuis l'écran « Oups ! »).

La **Remise** reste libre. Quand Maël est connecté lui-même, rien ne lui est demandé.

## La douchette

La douchette USB tape le code comme un clavier, puis « Entrée ». La caisse reconnaît la frappe rapide et ajoute l'article directement. Un vrai clavier marche aussi : les chiffres vont dans la zone de saisie.

- **Multiplier** : taper `3`, `×`, puis scanner.
- **Code abîmé** : taper les 13 chiffres au pavé, puis `OK`.
- **Changer la quantité d'une ligne** : la sélectionner, taper `5`, `×`, puis `OK`.

## Écrans

- **Caisse** : liste des articles, total, pavé, touches de fonction (Annuler ligne, Prix manuel, Remise, Sans code, Mettre en attente / Reprendre, Appeler Maël, Payer).
- **Bip !** en vert à chaque article, en bandeau si on enchaîne. **Oups !** en jaune si le code est inconnu.
- **Sans code** : fruits, légumes, boulangerie… au poids (en grammes) ou à la pièce.
- **Paiement** : carte, pièces, billets. On peut payer une partie par carte et le reste en espèces. La caisse calcule le rendu et les pièces à rendre.
- **Crédit Domestique** : sur « Comment on paie ? », touche **Crédit Domestique**, choisis qui paie, puis la personne tape son **code express**. L'argent passe de son compte à celui du magasin (« INTER-MARIN-ET-MAËL »), comme la cantine. S'il n'y a pas assez sur le compte, la caisse prend ce qu'il y a et le reste se paie autrement.
  - **Sans contact** : après avoir choisi qui paie, touche **Sans contact · sur le téléphone**. La caisse envoie la demande ; la personne l'accepte dans Crédit Domestique sur son téléphone (comme la cantine), et la caisse voit tout de suite que c'est payé. « Annuler » sur la caisse retire la demande.
- **Carte Copains** : la scanner pendant les courses ou au paiement. 1 tampon par euro, 10 tampons = une surprise.
- **Mode responsable** (Maël) : catalogue, retours, annuler un ticket, étiquettes, tiroir, réimpression, réglages, clôture du jour.
- **Catalogue** (Mode responsable → Catalogue) : chercher un article par nom ou code, filtrer par rayon, **ajouter**, **modifier** (nom, prix, vente à la pièce / au kilo / à la barquette, rayon, code-barres), **dupliquer**, **supprimer** (✕ au bout de la ligne), ou imprimer son étiquette.

## Codes-barres maison

Les vrais produits gardent leur code EAN. Pour le reste, Maël imprime une étiquette depuis **Créer une étiquette** :

```
2 · RR · PPP · cccccc · clé      rayon, produit, prix en centimes, clé de contrôle
299 · n° de carte · clé           Carte Copains
298 · n° de badge · clé           Badge caissier
```

Les codes imprimés sont de vrais EAN-13, lisibles par la douchette.

Pour ajouter un vrai produit de la maison : **Mode responsable → Catalogue**, puis scanner le produit. S'il est déjà connu, sa fiche s'ouvre ; sinon une nouvelle fiche s'ouvre avec le code déjà rempli.

## Imprimante

L'impression passe par la fenêtre d'impression du navigateur : choisir l'imprimante à étiquettes, papier 62 mm, marges à zéro.
Tickets en rouleau continu 62 mm, étiquettes 62 × 29 mm.

## Fichiers

```
index.html        page de la caisse
css/caisse.css    couleurs, polices et mise en page (guide de marque)
js/ean.js         codes-barres EAN-13
js/data.js        rayons, produits de départ, sauvegarde, sons
js/app.js         écrans et fonctionnement de la caisse
js/cloud.js       synchronisation avec Supabase (file d'attente hors ligne)
js/credit.js      paiement par Crédit Domestique
js/config.js      adresse du projet Supabase et clé publique
js/vendor/        bibliothèque Supabase (supabase-js 2.117.2)
supabase/         migrations de la base
```
