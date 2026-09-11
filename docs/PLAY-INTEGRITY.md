# Play Integrity — anti-VM/navigateur inviolable (plan)

## Pourquoi

Le `deviceClass` actuel est **déclaratif** : le client dit "je suis HARDWARE" et
le backend le croit. On l'a démontré — un `curl` avec `deviceClass:"HARDWARE"`
(ou sans le champ) obtient un PIN. C'est un garde-fou, pas une preuve.

**Play Integrity** fait vérifier par **Google** que l'app tourne sur un vrai
appareil non émulé / non rooté. L'APK récupère un **jeton signé par Google**, le
backend le **vérifie côté serveur** → infalsifiable par un navigateur, une VM ou
un curl (aucun ne peut produire un jeton Google valide).

Fonctionne aussi pour une APK **sideloadée** (hors Play Store) : le verdict
`appRecognitionVerdict` ne sera pas `PLAY_RECOGNIZED`, mais
`deviceRecognitionVerdict = MEETS_DEVICE_INTEGRITY` suffit pour distinguer un
vrai appareil d'un émulateur/VM — c'est exactement notre besoin.

## Ce que TU dois provisionner (côté Google, je ne peux pas)

1. **Google Cloud project** (ou réutiliser celui du login Google déjà en place).
2. Activer **Play Integrity API** dans ce projet.
3. Récupérer le **cloud project number** (un entier, ex. `31047666332`).
4. Un moyen de **vérifier les jetons côté serveur**, au choix :
   - **Service account** (clé JSON) autorisé à appeler `playintegrity.googleapis.com`
     → le backend appelle `decodeIntegrityToken`. (recommandé)
   - ou déchiffrement local des jetons "classic" (plus complexe).
5. Lier l'app `com.neofilm.coworking` / `com.neofilm.tv` au projet (Play Console
   si publiée ; sinon le device verdict marche quand même en sideload).

Donne-moi : le **project number** + la **clé de service JSON** (via une variable
d'env / secret, jamais dans le repo).

## État actuel

- **Project number** : `126514179899` (constante `PLAY_INTEGRITY_PROJECT_NUMBER`
  dans `apps/coworking-app/android/app/build.gradle.kts`, utilisée par
  `setCloudProjectNumber`).
- **Natif câblé** (coworking) : dépendance `com.google.android.play:integrity`,
  pont `requestIntegrityToken(nonce)` + `getPackageName()`, résultat renvoyé au
  web via `window.__neoIntegrityResult`. ✅
- **Web câblé** : `getIntegrityToken(nonce)` (device-identity.ts), la pairing
  screen récupère un nonce (`POST /tv/integrity/nonce`) puis le token, envoyés à
  `/tv/register`. Best-effort : navigateur / vieille APK → pas de token, le
  backend décide (flag). ✅
- **Backend câblé** : `PlayIntegrityService.verify()` + 2e filtre dans
  `registerDevice`, **inerte** tant que `PLAY_INTEGRITY_ENABLED != true`. ✅
- **Reste à faire** : monter la clé JSON sur le NAS, poser les variables d'env,
  builder/déployer une APK release intégrant le client, puis activer le flag sur
  staging et tester (vraie box OK, émulateur rejeté même en trichant deviceClass).

## Côté APK (natif Kotlin) — FAIT

- Dépendance `com.google.android.play:integrity:1.4.0`.
- Avant register : nonce du backend → `IntegrityTokenRequest` avec
  `setNonce(nonce)` + `setCloudProjectNumber(126514179899)`.
- Token exposé au web via le pont (async → `window.__neoIntegrityResult`).
- L'app web l'envoie à `/tv/register` dans `integrityToken` (+ `integrityNonce`,
  `packageName`).

## Côté backend NestJS — FAIT (scaffold prêt, derrière un flag)

- `POST /tv/integrity/nonce` → génère un nonce court-vécu (anti-rejeu).
- `PlayIntegrityService.verify(token, nonce)` :
  - appelle `playintegrity.googleapis.com` avec la clé de service,
  - vérifie `requestDetails.nonce` == le nonce émis,
  - vérifie `deviceIntegrity.deviceRecognitionVerdict` contient
    `MEETS_DEVICE_INTEGRITY` (sinon émulateur/VM/rooté → rejet),
  - (option) `appIntegrity.packageName` == com.neofilm.*.
- `registerDevice` : si `PLAY_INTEGRITY_ENABLED=true`, exiger un token valide,
  sinon **fallback** sur le `deviceClass` actuel (rollout progressif).
- Env : `PLAY_INTEGRITY_ENABLED`, `PLAY_INTEGRITY_PROJECT_NUMBER`,
  `GOOGLE_APPLICATION_CREDENTIALS` (chemin de la clé JSON, monté en volume).

## Rollout sans rien casser

1. Déployer avec `PLAY_INTEGRITY_ENABLED=false` → comportement inchangé
   (garde-fou `deviceClass` seul). Code en place mais inerte.
2. Builder une APK release intégrant le client Play Integrity, la déployer sur
   la flotte réelle (OTA).
3. Une fois la flotte à jour, passer `PLAY_INTEGRITY_ENABLED=true` sur **staging**,
   valider (vraie box OK, émulateur rejeté même en trichant le `deviceClass`).
4. Activer en **prod**.

## Limites / notes

- Quotas Play Integrity (requêtes/jour) — classic requests limitées ; prévoir le
  cache du verdict par device et ne vérifier qu'au (ré)appairage, pas à chaque boot.
- Sideload : `MEETS_STRONG_INTEGRITY` peut manquer ; on se base sur
  `MEETS_DEVICE_INTEGRITY` (suffisant pour bloquer émulateurs/VM).
- Le `deviceClass` actuel reste utile comme 1er filtre (rejet immédiat sans
  round-trip Google pour les navigateurs).
