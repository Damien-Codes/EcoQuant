# EcoQuant — extension Chrome / Edge / Brave

Extension **100 % gratuite** : calendrier économique dans ton navigateur + alerte pop-up avant chaque news (10 min, 30 min… au choix),
filtrée par niveau d'impact (Fort / Moyen / Faible) et par devise, résultat dès la publication et calculateur de position.

Site : https://damien-codes.github.io/EcoQuant-Site/

## Installation (2 minutes)

1. Utilise le dossier `extension/` de ce projet (celui qui contient `manifest.json`).
2. Ouvre la page des extensions :
   - Chrome : `chrome://extensions`
   - Edge : `edge://extensions`
   - Brave : `brave://extensions`
3. Active le **Mode développeur** (interrupteur en haut à droite, ou à gauche sur Edge).
4. Clique sur **Charger l'extension non empaquetée** et choisis le dossier `extension/`.
   ⚠ Si tu avais chargé l'ancien dossier (la racine du projet), retire-la et recharge depuis `extension/`.
5. Épingle l'icône (puzzle 🧩 → épingle) pour voir le badge avec le compte à rebours.

La page de réglages s'ouvre automatiquement à l'installation.

## Utilisation

- **Clic sur l'icône** : calendrier sur 8 jours (heure locale), prochaine news suivie avec compte à rebours,
  filtres d'impact rapides, et une cloche par news pour couper l'alerte d'une news précise.
- **Badge sur l'icône** : `12m` = prochaine news suivie dans 12 min (couleur = impact). Sinon, nombre de news suivies restantes aujourd'hui.
- **Réglages** (roue dentée) : niveaux d'impact, devises, délais (60/30/15/10/5 min ou à l'heure, plusieurs possibles),
  type d'alerte (notification système, fenêtre pop-up, son), heures silencieuses, bouton **Lancer une alerte de test**.
- **Fenêtre d'alerte** : compte à rebours en direct, prévision / précédent, bouton « Me rappeler à l'heure » et lien Investing.com.
- **Résultat après publication** (source Investing.com) : 1 min après chaque news suivie, notification avec le chiffre réel vs la prévision
  (▲ vert = meilleur que prévu pour la devise, ▼ rouge = moins bon). Réessaie chaque minute jusqu’à 6 fois si le chiffre tarde.
  Le chiffre réel s’affiche aussi dans le popup et dans la fenêtre d’alerte si elle est encore ouverte. Bouton « Tester un résultat » dans les Réglages.

## Calculateur de position

Onglet **Calculateur de position** du popup : capital + devise du compte, risque (% ou montant), instrument, stop et take profit
→ taille en lots (arrondie vers le bas au pas du broker), montant réellement risqué, valeur du pip, gain potentiel et ratio R:R.
Taux de change BCE récupérés sur api.frankfurter.dev (saisie manuelle possible dans « Avancé »). Pour les indices et métaux,
la valeur d'un point pour 1 lot dépend du broker : elle est modifiable dans « Avancé » et mémorisée par instrument.

## Publier sur le Chrome Web Store

Depuis la racine du projet :

```
node tools/build-store.mjs
```

→ `dist/ecoquant-<version>.zip`, à envoyer sur https://chrome.google.com/webstore/devconsole.

## À savoir

- Le navigateur doit être **ouvert** (même réduit) pour recevoir les alertes.
- Windows : si aucune notification n'apparaît, vérifie *Paramètres → Système → Notifications → Google Chrome* (et le mode « Ne pas déranger »).
  macOS : *Réglages Système → Notifications → Google Chrome → Autoriser*.
- **Source des données** (Réglages → *Source du calendrier*) :
  - **Investing.com** (par défaut) : le calendrier de https://www.investing.com/economic-calendar, d'hier à J+7, rafraîchi toutes les heures.
    Investing.com a un anti-robot strict : s'il refuse la requête, l'extension **bascule automatiquement sur Forex Factory**
    (message orange dans le popup) et retente Investing.com 30 min plus tard. Pour débloquer : ouvre une fois investing.com
    dans le navigateur (ça pose le cookie anti-robot), puis clique sur ⟳ dans le popup.
  - **Forex Factory** : flux public très fiable (mêmes news : NFP, CPI, FOMC…), mais limité à la semaine en cours.
- Les deux sources donnent les mêmes heures (vérifié : BoE 12:00 UTC, NFP 13:30 UTC). Changer de source réinitialise les cloches coupées.
- Mise à jour du code : remplace les fichiers du dossier puis clique sur ⟳ dans `chrome://extensions`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `manifest.json` | Déclaration de l'extension (Manifest V3) |
| `background.js` | Récupère le calendrier (Investing.com, secours Forex Factory), programme les alarmes, déclenche notification + pop-up + son |
| `common.js` | Constantes, réglages par défaut, lecture des données Investing.com / Forex Factory, filtres et formatage partagés |
| `popup.html/js` | Calendrier affiché au clic sur l'icône (+ onglet calculateur) |
| `calc.js` | Calculateur de position |
| `options.html/js` | Page de réglages |
| `alert.html/js` | Fenêtre pop-up d'alerte |
| `offscreen.html/js` | Joue le son (un service worker ne peut pas jouer d'audio) |
| `styles.css` | Styles communs |
