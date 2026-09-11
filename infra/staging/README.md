# Déploiement & environnements — mémo

## 3 environnements, 3 bases séparées

| Env | Où | Hôte DB | Notes |
|-----|-----|---------|-------|
| **Local** | Docker sur le PC | `localhost:5432` | `.env` + `packages/database/.env` du repo |
| **Staging** | NAS, projet Docker `neofilm-staging` | `100.95.244.3:5443` (Tailscale) | images `:staging`, `neofilmapitest.alkaya.fr` (TLS en amont, SSL=None dans NPM) |
| **Prod** | NAS, projet Docker `neofilm` | `100.95.244.3:5433` (Tailscale) | images `:latest`, `neofilmapi.alkaya.fr` — **ne pas toucher** |

Les 3 bases s'appellent toutes `neofilm` : c'est **l'hôte** qui change, pas le nom.

## Ce qu'un `git push main` déclenche

- ✅ **Vercel** redéploie en PROD les 4 fronts : `web-admin`, `web-partner`,
  `web-advertiser`, `web-portal` (ils écoutent `main`). → push main = prod Vercel immédiat.
- ❌ **NAS** (`api`, `tv`, `tv-legacy`, `coworking`) : **rien** d'automatique.
  Déploiement manuel : `docker build` → push Docker Hub → `pull` + `up` sur le NAS.
- ❌ **APK Android** : rien (build + OTA séparés).

Il n'y a **aucun** GitHub Actions. `push main` n'est PAS un déploiement complet.

## Où pointe une APK Android (⚠️ à retenir)

L'URL du backend est **codée en dur** dans `apps/<app>/android/app/build.gradle.kts`
(`CW_APP_URL` / `TV_APP_URL`), par build type.

**État actuel : debug ET release pointent sur la PROD** pour les 3 apps.
=> une APK buildée aujourd'hui (même debug) parle à la **prod**.

**Convention cible :**
- `debug`   → staging (`https://neofilmapitest.alkaya.fr/...`)
- `release` → prod   (`https://neofilmapi.alkaya.fr/...`)

Le build APK exige le **SDK Android** (pas encore installé sur le poste).

## Workflow

1. Bosser sur la branche **`dev`**.
2. Déployer sur **staging** : build/push images `:staging`, puis sur le NAS
   `cd /volume2/docker/neofilm-staging && sudo docker compose -p neofilm-staging up -d`.
3. Valider sur staging.
4. Merger `dev → main` **seulement quand prêt à déployer pour de vrai**
   (Vercel part tout seul ; le NAS demande un build/pull `:latest` manuel).

## Tester l'anti-VM/navigateur (feature device-class)

- **Navigateur** : ouvrir `https://neofilmapitest.alkaya.fr/coworking` dans Chrome
  → classé `BROWSER` → écran masqué (pas de vues comptées). Testable **sans APK**.
- **Émulateur/VM** : nécessite une **APK debug buildée depuis `dev`** (contient
  `getDeviceIntegrity()` natif) pointant sur staging → donc SDK Android requis.
