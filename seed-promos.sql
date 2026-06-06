-- Test seed: 10 additional promo codes so the marquee scroll has enough cards
-- to look like it really "défile en permanence" (continuous scroll).
--
-- Run on the NAS:
--   sudo docker exec -i neofilm-postgres-1 psql -U postgres -d neofilm < seed-promos.sql
--
-- All listings are tied to the SAME advertiser org + screen as the existing
-- 3 seeded entries (Le Bouchon Lyonnais / Spa Détente / Café des Berges).
-- Re-running this script is safe — entries with the same titles will be skipped.

DO $$
DECLARE
  v_advertiser_id TEXT;
  v_screen_id TEXT;
  v_seed RECORD;
BEGIN
  -- Reuse the advertiser + screen that the original 3 promo codes already
  -- belong to. If none exists yet, log and exit.
  SELECT "advertiserOrgId" INTO v_advertiser_id
  FROM catalogue_listings
  WHERE "promoCode" = 'NEOFILM20'
  LIMIT 1;

  IF v_advertiser_id IS NULL THEN
    RAISE NOTICE 'No existing promo "NEOFILM20" found — run the original seed first.';
    RETURN;
  END IF;

  SELECT cls."screenId" INTO v_screen_id
  FROM catalogue_listing_screens cls
  JOIN catalogue_listings cl ON cl.id = cls."catalogueListingId"
  WHERE cl."promoCode" = 'NEOFILM20'
  LIMIT 1;

  IF v_screen_id IS NULL THEN
    RAISE NOTICE 'No screen linked to NEOFILM20 yet — link it first.';
    RETURN;
  END IF;

  -- 10 new partners, each with a promo code. Categories alternate so the
  -- emoji/icon rotation looks natural.
  FOR v_seed IN
    SELECT * FROM (VALUES
      ('Boulangerie Augustin',    'Pain au levain, viennoiseries', '22 rue de Lyon, 75012 Paris',  'BOUL10', '-10% sur la première commande', 'RESTAURANT'),
      ('Pizza Romana',            'Pizza authentique au feu de bois', '8 rue Mouffetard, 75005 Paris','PIZZA15', '-15% à emporter',                 'RESTAURANT'),
      ('Sushi Mori',              'Sushis frais, livraison rapide', '14 rue Saint-Honoré, 75001 Paris','SUSHI20', 'Soupe miso offerte',              'RESTAURANT'),
      ('Cinéma Le Grand Rex',     'Salle historique 2700 places',   '1 bd Poissonnière, 75002 Paris','CINE25',  '-25% en semaine',                 'CULTURE'),
      ('Yoga Bastille',           'Studio cosy, cours débutants',   '11 rue de la Roquette, 75011 Paris','YOGA30',  '1er cours offert',              'SPA'),
      ('Coiffure & Vous',         'Coupe femme, balayage, soins',   '37 rue Cler, 75007 Paris',     'COIF20', '-20% sur la coupe',               'SHOPPING'),
      ('Vélo Tour Paris',         'Visite guidée à vélo, 3h',       'Place du Trocadéro, 75016 Paris','VELO15', '-15€ par personne',                'SPORT'),
      ('Parfum d''Émeraude',      'Parfums et cosmétiques bio',     '52 rue Saint-Antoine, 75004 Paris','PARFUM10', '-10% sur tout le magasin',    'SHOPPING'),
      ('Le Comptoir des Vins',    'Cave à vins, dégustations',      '16 rue de Buci, 75006 Paris',  'VIN20',  '-20% sur 6 bouteilles',           'SHOPPING'),
      ('Théâtre des Marais',      'Pièces de théâtre contemporain', '37 rue Vieille du Temple, 75004 Paris','THEATRE25', '-25% sur place',          'CULTURE')
    ) AS t(title, description, address, promo_code, promo_description, category)
  LOOP
    -- Skip if a listing with this title already exists.
    IF NOT EXISTS (SELECT 1 FROM catalogue_listings WHERE title = v_seed.title) THEN
      WITH ins AS (
        INSERT INTO catalogue_listings (
          id, title, description, category, "promoCode", "promoDescription",
          address, status, "visibilityMode", "advertiserOrgId",
          keywords, "clickCount", "createdAt", "updatedAt"
        ) VALUES (
          'cl' || substr(md5(random()::text || clock_timestamp()::text), 1, 22),
          v_seed.title, v_seed.description, v_seed.category, v_seed.promo_code,
          v_seed.promo_description, v_seed.address, 'ACTIVE', 'PUB_AND_CATALOGUE',
          v_advertiser_id, ARRAY[]::TEXT[], 0, NOW(), NOW()
        )
        RETURNING id
      )
      INSERT INTO catalogue_listing_screens (id, "catalogueListingId", "screenId")
      SELECT 'cs' || substr(md5(random()::text || clock_timestamp()::text), 1, 22),
             ins.id, v_screen_id
      FROM ins;
      RAISE NOTICE 'Inserted: % (%)', v_seed.title, v_seed.promo_code;
    ELSE
      RAISE NOTICE 'Skipped (already exists): %', v_seed.title;
    END IF;
  END LOOP;
END $$;

SELECT title, "promoCode", category FROM catalogue_listings WHERE status = 'ACTIVE' ORDER BY "createdAt";
