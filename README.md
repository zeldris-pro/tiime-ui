# Tiime UI

Un userscript qui rend l'application web [Tiime](https://apps.tiime.fr) plus dense et plus lisible : lignes compactes, filtres par année en un clic, et des récaps des montants calculés sur tous les résultats de la recherche.

Projet personnel et non officiel, sans lien avec Tiime.

**Page de présentation :** https://tiime.zeldris.pro

## Installation

1. Installe un gestionnaire de userscripts :
   - Safari (Mac, iPhone, iPad) : [Userscripts](https://apps.apple.com/app/userscripts/id1463298887)
   - Chrome, Edge, Firefox : [Tampermonkey](https://www.tampermonkey.net) ou [Violentmonkey](https://violentmonkey.github.io)
2. Ouvre [tiime-ui.user.js](https://raw.githubusercontent.com/zeldris-pro/tiime-ui/main/tiime-ui.user.js). Le gestionnaire propose de l'installer.
3. Recharge apps.tiime.fr.

## Ce que ça change

**Transactions**
- Des lignes compactes avec un liseré à la couleur de la banque, et le tag masqué quand il répète le label.
- Une barre de comptes avec des noms courts, et un clic pour filtrer sur un compte. Les banques sont reconnues toutes seules : la couleur du liseré vient de la marque de la banque (une teinte stable pour les banques inconnues), le nom court est celui de la banque suivi de ce qui distingue le compte. Les comptes clôturés dans Tiime sont masqués.
- L'année en cours est sélectionnée à l'arrivée, avec des boutons pour passer d'une année à l'autre ou tout afficher.
- Un récap : nombre d'opérations, total, entrées et sorties, puis la somme par label, ventilations comprises. Un clic sur un label filtre la liste.
- Copier / coller une répartition. Tu copies la ventilation d'une ligne (labels et montants) et tu la colles sur une autre ligne du même montant. Le script te demande une confirmation, enregistre la ventilation dans Tiime puis rafraîchit la liste sans recharger la page.

**Factures envoyées**
- Des lignes compactes, avec le statut en pastille de couleur, en rouge quand l'échéance est dépassée.
- Un récap par année : facturé, encaissé, envoyé, brouillons et total par client.

**Factures reçues**
- Des lignes compactes, avec l'année sur la date et les factures non reliées signalées en orange.
- Des boutons d'année.

**Notes de frais**
- Des lignes compactes. À côté du nom : le nombre de dépenses ou de trajets et les kilomètres, la date de remboursement, et le détail par label au survol.
- Un récap : total, remboursé, à rembourser et brouillons, avec le détail par type et par label.

**Ailleurs**
- Fenêtre « Relier » : les transactions du même montant que le document sont en vert, celles à moins de 10 % d'écart en orange.
- Panneau d'un justificatif : il tient sans barre de défilement.

## Réglages

Il n'y a rien à régler : le script marche tel quel. Pour changer un choix automatique, les réglages sont en tête du fichier (`CONFIG`). Pour qu'ils survivent aux mises à jour, garde-les plutôt dans ton navigateur : ouvre la console de apps.tiime.fr et tape par exemple

```js
localStorage.setItem('tiime-ui-config', JSON.stringify({ nomsComptes: { 123456: 'Compte joint' }, premiereAnnee: 2020 }))
```

| Réglage | Par défaut | Rôle |
| --- | --- | --- |
| `nomsComptes` | `{}` | Nom court imposé pour un compte, la clé est l'identifiant Tiime du compte (il apparaît dans l'URL quand tu filtres sur un compte : `bank_account=…`) |
| `banques` | `{}` | Couleur imposée pour une banque, la clé est le nom du fichier logo de Tiime (visible dans l'adresse du logo, par exemple `ma_banque`) |
| `banquesExclues` | `[]` | Banques à ne jamais afficher dans la barre des comptes |
| `dateParDefaut` | `'annee'` | Filtre de date ajouté en arrivant sur Transactions, `false` pour aucun |
| `recap` | `true` | Récap des montants sur Transactions |
| `anneeFactures` | `'courante'` | Année du récap des factures envoyées au chargement, `false` pour tout |
| `premiereAnnee` | `2023` | Première année proposée dans les boutons d'année |
| `masquerTagsDoublons` | `true` | Masque le tag quand il répète le label |
| `masquerProprietaire` | `true` | Masque la colonne « Propriétaire » des notes de frais |

## Confidentialité

Tout se passe dans ton navigateur. Le script lit l'API de Tiime avec ta propre session, pour les récaps. Il n'envoie rien ailleurs et ne charge aucun fichier externe.

Il n'écrit dans Tiime qu'une seule fois : quand tu cliques sur « Coller » une répartition, après confirmation. Avant d'écrire, il vérifie que les montants sont identiques, et il refuse si une sous-ligne a déjà un justificatif ou une facture reliée.

## Limites

Tiime peut changer son interface à tout moment : une page peut alors s'afficher de travers jusqu'à la mise à jour du script. Pour revenir à l'affichage d'origine, désactive le script dans ton gestionnaire.

## Licence

MIT
