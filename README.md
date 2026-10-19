# Caisse Inter-Marin-et-Maël

La caisse du supermarché de la famille (à la maison). Écran tactile 7″ (800 × 480), douchette USB, imprimante à étiquettes 62 mm.

## Lancer la caisse

Aucun logiciel à installer : ouvrir **`index.html`** dans Chrome ou Edge, puis « Plein écran ».
Ça marche aussi en ligne avec GitHub Pages (Réglages du dépôt → Pages → branche `main`).

Tout est enregistré dans le navigateur : produits, cartes Copains, tickets du jour, réglages.

## Codes de départ

| Qui | Rôle | Code |
|---|---|---|
| Marin | Caissier | `1111` |
| Maël | Responsable | `102456` |

Les codes (4 à 6 chiffres) se changent dans **Mode responsable → Réglages**. On peut aussi imprimer un badge et le scanner pour se connecter.

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
- **Carte Copains** : la scanner pendant les courses ou au paiement. 1 tampon par euro, 10 tampons = une surprise.
- **Mode responsable** (Maël) : produits et prix, retours, annuler un ticket, étiquettes, tiroir, réimpression, réglages, clôture du jour.

## Codes-barres maison

Les vrais produits gardent leur code EAN. Pour le reste, Maël imprime une étiquette depuis **Créer une étiquette** :

```
2 · RR · PPP · cccccc · clé      rayon, produit, prix en centimes, clé de contrôle
299 · n° de carte · clé           Carte Copains
298 · n° de badge · clé           Badge caissier
```

Les codes imprimés sont de vrais EAN-13, lisibles par la douchette.

Pour ajouter un vrai produit de la maison : **Mode responsable → Changer un prix**, puis scanner le produit. La fiche s'ouvre avec le code déjà rempli.

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
```
