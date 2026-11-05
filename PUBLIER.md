# Publier EcoQuant

Ce dépôt contient **l'extension**. Le site est dans un dépôt séparé :
[Damien-Codes/EcoQuant-Site](https://github.com/Damien-Codes/EcoQuant-Site) → https://damien-codes.github.io/EcoQuant-Site/

Présentation du projet : [README.md](README.md).

## Envoyer une modification sur GitHub

Depuis ce dossier :

```bash
git add .
```

```bash
git commit -m "Décris ta modification"
```

```bash
git push
```

## Publier l'extension (Chrome Web Store)

1. Crée le zip :

```bash
node tools/build-store.mjs
```

2. Sur https://chrome.google.com/webstore/devconsole (compte développeur, frais d'inscription uniques) → **Nouvel élément**
   → envoie `dist/ecoquant-<version>.zip`.
3. Fiche : description, captures (popup, fenêtre d'alerte, calculateur), catégorie, et **règles de confidentialité** →
   https://damien-codes.github.io/EcoQuant-Site/confidentialite.html
4. Justifie les permissions : `alarms` (alertes programmées), `notifications`, `offscreen` (son), `storage` (réglages),
   `declarativeNetRequestWithHostAccess` (en-têtes attendus par Investing.com sur les requêtes du calendrier),
   accès à investing.com / nfs.faireconomy.media (calendrier) et api.frankfurter.dev (taux de change du calculateur).
5. Une fois l'extension validée, colle l'URL de sa fiche dans `src/config.ts` (`chromeStoreUrl`) du dépôt **EcoQuant-Site**
   et pousse : le bouton « Installer depuis le Store » du site s'active automatiquement.

## Nouvelle version

1. Augmente `version` dans `extension/manifest.json` (ex. `1.3.0` → `1.4.0`).
2. `node tools/build-store.mjs`, puis envoie le nouveau zip dans la console du Chrome Web Store.
3. `git add .`, `git commit`, `git push`.

> Les données viennent d'Investing.com et de Forex Factory, sans accord avec ces sites. Pour un outil gratuit et personnel ça
> passe, mais Google peut demander des précisions à la publication, et Investing.com peut bloquer des requêtes (l'extension
> bascule alors sur Forex Factory).
