-- Appairage scopé par app : coworking & legacy partagent la même clé de
-- signature => même ANDROID_ID sur une box. Sans discriminant, les deux apps
-- tombaient sur la MÊME ligne `devices` (même écran). On ajoute `appVariant`
-- et on rend l'unicité composite (identifiant + variant).
--
-- SÛR EN PROD : additif. Les lignes existantes gardent appVariant = NULL et
-- sont adoptées paresseusement (backend) au 1er register/reconnect — aucun
-- écran déjà appairé n'a besoin de se ré-appairer.

ALTER TABLE "devices" ADD COLUMN IF NOT EXISTS "appVariant" TEXT;

-- Retire les uniques "seuls" (créés par l'init pour serialNumber, par db push
-- pour androidId). IF EXISTS => no-op si le nom diffère.
DROP INDEX IF EXISTS "devices_serialNumber_key";
DROP INDEX IF EXISTS "devices_androidId_key";

-- Unicité composite : une box peut porter deux appairages indépendants (un par app).
CREATE UNIQUE INDEX IF NOT EXISTS "devices_serialNumber_appVariant_key" ON "devices"("serialNumber", "appVariant");
CREATE UNIQUE INDEX IF NOT EXISTS "devices_androidId_appVariant_key" ON "devices"("androidId", "appVariant");
