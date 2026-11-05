<p align="center">
  <img src="extension/icons/icon128.png" width="96" alt="Icône EcoQuant">
</p>

# EcoQuant – Economic News Alerts 🔔

[![GitHub license](https://img.shields.io/github/license/Damien-Codes/EcoQuant)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/Damien-Codes/EcoQuant)](https://github.com/Damien-Codes/EcoQuant/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/Damien-Codes/EcoQuant)](https://github.com/Damien-Codes/EcoQuant/issues)
![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?logo=googlechrome&logoColor=white)

**EcoQuant** est une extension Chrome qui vous prévient **avant chaque annonce économique** (NFP, CPI, taux BCE, FOMC…)
avec une fenêtre pop-up, un compte à rebours et un son. Vous choisissez les niveaux d'impact, les devises et le délai
(10 min, 30 min…). Une minute après la publication, elle vous donne **le chiffre réel face à la prévision**, et son
**calculateur de position** vous donne la bonne taille de lot en deux secondes.

🔗 **Site officiel** : [damien-codes.github.io/EcoQuant-Site](https://damien-codes.github.io/EcoQuant-Site/)

---

## 📖 Table des matières
- [Fonctionnalités](#-fonctionnalités)
- [Calculateur de position](#-calculateur-de-position)
- [Installation](#-installation)
- [Utilisation](#-utilisation)
- [Confidentialité](#-confidentialité)
- [Structure du projet](#-structure-du-projet)
- [Technologies utilisées](#-technologies-utilisées)
- [Avertissement](#%EF%B8%8F-avertissement)
- [Contribuer](#-contribuer)
- [Auteur](#-auteur)
- [Licence](#-licence)

---

## ✨ Fonctionnalités

| | |
|---|---|
| 📅 | **Calendrier économique** – Les annonces des 8 prochains jours, à l'heure de votre fuseau, avec prévision et chiffre précédent. |
| 🎯 | **Filtres** – Niveau d'impact (Fort / Moyen / Faible / jours fériés) et 9 devises : USD, EUR, GBP, JPY, CHF, CAD, AUD, NZD, CNY. |
| ⏰ | **Alertes avant la news** – 60, 30, 15, 10, 5 min avant ou à l'heure pile, plusieurs délais possibles. |
| 🪟 | **Pop-up impossible à rater** – Fenêtre au premier plan avec compte à rebours, notification système et son. |
| 📈 | **Résultat dès la publication** – Chiffre réel vs prévision : ▲ meilleur / ▼ moins bon que prévu pour la devise. |
| 🧮 | **Calculateur de position** – Taille en lots, montant risqué, valeur du pip et ratio R:R. |
| 🔕 | **Contrôle total** – Coupez une news précise d'un clic, heures silencieuses pour la nuit. |
| 🔢 | **Badge sur l'icône** – Compte à rebours de la prochaine news suivie (`12m`), couleur selon l'impact. |
| 🔒 | **Respect de la vie privée** – Aucun compte, aucun pistage : tout reste dans votre navigateur. |
| 🆓 | **Gratuit et open source** – Code disponible sur GitHub, licence MIT. |

---

## 🧮 Calculateur de position

Dans l'onglet **Calculateur de position** du popup :

1. Saisissez votre **capital** et la devise du compte (EUR, USD, GBP, CHF).
2. Indiquez votre **risque** en % ou en montant.
3. Choisissez l'**instrument** : paires forex, or, argent, indices (US30, NAS100, US500, GER40, FRA40, UK100) ou Bitcoin.
4. Entrez votre **stop loss** (et un take profit si vous voulez).

→ Vous obtenez la **taille de position** arrondie au pas de votre broker, le **montant réellement risqué**, la **valeur du pip**,
le **gain potentiel** et le **ratio R:R**. Les taux de change viennent de la BCE. Pour les indices et métaux, la valeur d'un point
dépend du broker : elle se règle dans « Avancé ».

> Exemple : 10 000 € de capital, 1 % de risque, stop de 20 pips sur EUR/USD → **0,54 lot**.

---

## 📥 Installation

### Depuis le Chrome Web Store
🔜 Bientôt disponible.

### Installation manuelle
1. Téléchargez le projet : bouton **Code → Download ZIP** sur GitHub, puis décompressez-le.
2. Ouvrez `chrome://extensions` (ou `edge://extensions`, `brave://extensions`).
3. Activez le **Mode développeur** (en haut à droite).
4. Cliquez sur **Charger l'extension non empaquetée**.
5. Sélectionnez le dossier **`extension`** (celui qui contient `manifest.json`, pas la racine du projet).
6. Épinglez l'icône 🧩 pour voir le compte à rebours sur le badge.

La page de réglages s'ouvre automatiquement à l'installation.

---

## ⚙️ Utilisation

- **Clic sur l'icône** : prochaine news suivie avec compte à rebours, calendrier du jour et des jours suivants, filtres rapides
  d'impact, et une 🔔 par news pour couper une alerte précise.
- **Réglages** (roue dentée) : impacts, devises, délais, type d'alerte (notification, pop-up, son), résultat après publication,
  heures silencieuses, source du calendrier, et boutons **Lancer une alerte de test** / **Tester un résultat**.
- **Sources** : Investing.com par défaut. Si le site refuse la requête, l'extension passe automatiquement sur Forex Factory.
  Pour débloquer Investing.com, ouvrez-le une fois dans le navigateur puis cliquez sur ⟳ dans le popup.

> 💡 Le navigateur doit rester ouvert (même réduit) pour recevoir les alertes. Sous Windows, vérifiez
> *Paramètres → Système → Notifications → Google Chrome*.

---

## 🔐 Confidentialité

- Aucun compte, aucune analytique, aucun pistage, aucune publicité.
- Vos réglages restent dans le stockage de votre navigateur (`chrome.storage`).
- L'extension contacte uniquement : **investing.com** et **nfs.faireconomy.media** (calendrier),
  **api.frankfurter.dev** (taux de change BCE pour le calculateur). Rien n'est envoyé à l'auteur.

Politique complète : [damien-codes.github.io/EcoQuant-Site/confidentialite.html](https://damien-codes.github.io/EcoQuant-Site/confidentialite.html)

---

## 📂 Structure du projet

```
EcoQuant/
├── extension/          # L'extension (à charger dans Chrome)
│   ├── manifest.json   # Déclaration Manifest V3
│   ├── background.js   # Calendrier, alarmes, notifications, résultats
│   ├── common.js       # Constantes, lecture des données, filtres, formatage
│   ├── popup.html/js   # Calendrier + onglets
│   ├── calc.js         # Calculateur de position
│   ├── options.html/js # Réglages
│   ├── alert.html/js   # Fenêtre pop-up d'alerte
│   └── offscreen.*     # Lecture du son
├── tools/
│   └── build-store.mjs # Crée le zip pour le Chrome Web Store
├── PUBLIER.md          # Guide de publication (GitHub, Chrome Web Store)
└── LICENSE
```

---

## 🛠 Technologies utilisées

- **JavaScript** (vanilla, sans dépendance) – Logique de l'extension et du calculateur
- **Chrome Extensions Manifest V3** – Service worker, `alarms`, `notifications`, `offscreen`, `declarativeNetRequest`
- **HTML5 / CSS3** – Interface du popup et des réglages
- **API Frankfurter** – Taux de change de la Banque centrale européenne
- **GitHub Pages** – Site web, dans un dépôt séparé : [EcoQuant-Site](https://github.com/Damien-Codes/EcoQuant-Site)

---

## ⚠️ Avertissement

EcoQuant est un **outil d'information**, pas un conseil en investissement. Le trading comporte un risque de perte
en capital. Les alertes peuvent être retardées ou manquées (navigateur fermé, délai des sources de données). Les données
appartiennent à leurs propriétaires ; l'extension n'est **affiliée ni à Investing.com ni à Forex Factory**.

---

## 🤝 Contribuer

Un bug, une idée ? Ouvrez une [issue](https://github.com/Damien-Codes/EcoQuant/issues) en précisant votre navigateur,
la source choisie et, si possible, une capture d'écran. Les pull requests sont les bienvenues.

Pour publier une nouvelle version : voir [PUBLIER.md](PUBLIER.md).

---

## 👤 Auteur

**Damien Pino** – Développeur indépendant

- GitHub : [@Damien-Codes](https://github.com/Damien-Codes)
- LinkedIn : [Damien Pino](https://www.linkedin.com/in/damien-pino/)
- Email : [pinodamien@gmail.com](mailto:pinodamien@gmail.com)

Mes autres extensions : [Quant Scale](https://damien-codes.github.io/QuantScale/) ·
[YouTube PiP & QR](https://chromewebstore.google.com/detail/youtube-pip-qr/khmfffompcklfkhmadlkbgiiiaoopaog)

---

## 📄 Licence

Distribué sous licence **MIT**. Voir [LICENSE](LICENSE).
