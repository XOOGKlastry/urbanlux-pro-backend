-- ═══════════════════════════════════════════════════════════════
-- UrbanLux Pro — Schemat bazy danych PostgreSQL (Supabase)
-- Uruchom w: Supabase Dashboard → SQL Editor → New Query
-- ═══════════════════════════════════════════════════════════════

-- ── ROZSZERZENIA ────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- ═══════════════════════════════════════════════════════════════
-- 1. SZAFKI STERUJĄCE (SON)
--    Tworzymy PRZED lamps, bo lamps może się do nich odwoływać
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS control_boxes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  numer           TEXT        NOT NULL UNIQUE,          -- np. "SON-01/ZAM"
  lat             NUMERIC(10,7) NOT NULL,
  lng             NUMERIC(10,7) NOT NULL,
  miejscowosc     TEXT,
  ulica           TEXT,
  moc_przylacza   NUMERIC(8,2),                         -- [kW]
  taryfa          TEXT,                                  -- np. "C11", "C12b"
  licznik_nr      TEXT,
  stan            TEXT DEFAULT 'dobry'
                    CHECK (stan IN ('dobry','wymaga_naprawy','zły')),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE control_boxes IS 'Szafki oświetleniowe SON z pełną lokalizacją GIS';

-- ═══════════════════════════════════════════════════════════════
-- 2. SEGMENTY DROGOWE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS road_segments (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nazwa                 TEXT,
  geojson               JSONB       NOT NULL,            -- GeoJSON LineString
  dlugosc_m             NUMERIC(10,2),                   -- [m] auto-obliczana w JS
  klasa_oswietleniowa   TEXT,                            -- ME1..ME6, CE0..CE5, S1..S7, ES, EV
  nawierzchnia          TEXT DEFAULT 'asfalt',
  szerokosc_jezdni_m    NUMERIC(5,2),
  liczba_pasow          SMALLINT DEFAULT 2,
  predkosc_max_kmh      SMALLINT DEFAULT 50,
  natezenie_ruchu       TEXT DEFAULT 'srednie',
  uczestnicy_ruchu      TEXT[],
  chodnik_strona        TEXT,
  chodnik_szerokosc_m   NUMERIC(5,2),
  chodnik_odleglosc_m   NUMERIC(5,2),
  przejscia_dla_pieszych JSONB,
  control_box_id        UUID REFERENCES control_boxes(id) ON DELETE SET NULL,
  miejscowosc           TEXT,
  ulica                 TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE road_segments IS 'Jednorodne segmenty oświetleniowe wg PN-EN 13201';
CREATE INDEX IF NOT EXISTS idx_road_segments_miejscowosc ON road_segments(miejscowosc);

-- ═══════════════════════════════════════════════════════════════
-- 3. PUNKTY ŚWIETLNE (LAMPY)
--    Rozszerzona tabela vs. stary UrbanLux
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS lamps (
  id                    TEXT        PRIMARY KEY,         -- np. "ZAM-50" lub "ULP-1718..."
  lat                   NUMERIC(10,7) NOT NULL,
  lng                   NUMERIC(10,7) NOT NULL,

  -- Dane słupa
  nr_slupa              TEXT,
  rodzaj_slupa          TEXT,
  wysokosc_slupa        NUMERIC(5,2),                    -- [m]
  stan_slupa            TEXT DEFAULT 'dobry',

  -- Dane oprawy
  rodzaj_oprawy         TEXT,
  model_oprawy          TEXT,
  moc_oprawa_w          NUMERIC(7,2),                    -- [W] — kluczowe dla audytu
  strumien_swietlny_lm  NUMERIC(10,2),                   -- [lm]
  liczba_opraw          SMALLINT DEFAULT 1,
  stan_oprawy           TEXT DEFAULT 'dobry',

  -- Wysięgnik i montaż
  kat_wysiegnika        NUMERIC(5,2) DEFAULT 0,          -- [°]
  dlugosc_wysiegnika    NUMERIC(5,2) DEFAULT 0,          -- [m]
  wysokosc_mocowania    NUMERIC(5,2),                    -- [m] może ≠ wysokosc_slupa
  odleglosc_od_krawedzi NUMERIC(5,2),                    -- [m] od krawędzi jezdni
  odleglosc_miedzy_slupami NUMERIC(6,2),                 -- [m]
  rok_instalacji        SMALLINT,

  -- Infrastruktura
  szafa_oswietleniowa   TEXT,
  rodzaj_linii          TEXT DEFAULT 'napowietrzna',

  -- Lokalizacja
  miejscowosc           TEXT,
  ulica                 TEXT,
  notes                 TEXT,
  photo                 TEXT,                            -- URL do zdjęcia

  -- Usterki
  usterka               TEXT DEFAULT 'NIE',
  usterka_typ           TEXT DEFAULT '',
  usterka_opis          TEXT DEFAULT '',

  -- Powiązania
  segment_id            UUID REFERENCES road_segments(id) ON DELETE SET NULL,

  -- Soft delete
  _deleted              BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE lamps IS 'Punkty świetlne — rozszerzona tabela wg wymagań audytu PN-EN 13201';
CREATE INDEX IF NOT EXISTS idx_lamps_miejscowosc ON lamps(miejscowosc);
CREATE INDEX IF NOT EXISTS idx_lamps_segment     ON lamps(segment_id);
CREATE INDEX IF NOT EXISTS idx_lamps_usterka     ON lamps(usterka) WHERE usterka = 'TAK';

-- ═══════════════════════════════════════════════════════════════
-- 4. AUDYTY ENERGETYCZNE
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS energy_audits (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nazwa             TEXT        NOT NULL,
  miejscowosc       TEXT,
  data_audytu       DATE        DEFAULT CURRENT_DATE,
  autor             TEXT,

  -- Taryfa i parametry
  cena_kwh          NUMERIC(6,4) NOT NULL DEFAULT 0.75,
  taryfa            TEXT DEFAULT 'C11',
  godziny_pracy_rok NUMERIC(6,1) DEFAULT 4000,

  -- Wyniki (wypełniane przez kalkulator)
  moc_istniejaca_kw             NUMERIC(10,3),
  moc_opcja1_kw                 NUMERIC(10,3),
  moc_opcja2_kw                 NUMERIC(10,3),
  moc_opcja3_kw                 NUMERIC(10,3),
  koszt_energii_rok_istniejacy  NUMERIC(12,2),
  oszczednosc_opcja1_pln_rok    NUMERIC(12,2),
  oszczednosc_opcja2_pln_rok    NUMERIC(12,2),
  oszczednosc_opcja3_pln_rok    NUMERIC(12,2),
  emisja_co2_istniejaca_kg_rok  NUMERIC(12,2),
  koszt_inwestycji_opcja1       NUMERIC(14,2),
  koszt_inwestycji_opcja2       NUMERIC(14,2),
  koszt_inwestycji_opcja3       NUMERIC(14,2),

  -- Pełne wyniki jako JSON
  wyniki_json       JSONB,

  status            TEXT DEFAULT 'roboczy'
                      CHECK (status IN ('roboczy','zatwierdzony')),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE energy_audits IS 'Audyty energetyczne oświetlenia — 3 warianty inwestycyjne';

-- ═══════════════════════════════════════════════════════════════
-- 5. OPCJE AUDYTU (3 warianty na każdy audyt)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS audit_options (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_id              UUID NOT NULL REFERENCES energy_audits(id) ON DELETE CASCADE,
  numer_opcji           SMALLINT NOT NULL CHECK (numer_opcji IN (1,2,3)),
  opis                  TEXT,
  producent             TEXT,
  model_oprawa          TEXT,
  moc_nowa_w            NUMERIC(7,2),
  cena_oprawy_pln       NUMERIC(10,2),
  koszt_montazu_pln     NUMERIC(10,2),
  koszt_infrastruktury  NUMERIC(10,2) DEFAULT 0,
  redukcja_mocy_pct     NUMERIC(5,2)  DEFAULT 0,
  sterowanie_dynamiczne BOOLEAN       DEFAULT FALSE,
  UNIQUE(audit_id, numer_opcji)
);

-- ═══════════════════════════════════════════════════════════════
-- 6. STREFY FOTOMETRYCZNE (faza 3)
-- ═══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS photometric_zones (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id    UUID REFERENCES road_segments(id) ON DELETE CASCADE,
  klasa_ce      TEXT,
  em_lux        NUMERIC(6,2),    -- wymagane śr. natężenie [lx]
  uo_min        NUMERIC(4,3),    -- min równomierność
  ul_max        NUMERIC(4,3),    -- max olśnienie przeszkadzające
  wynik_dialux  JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════
-- 7. AUTOMATYCZNY TRIGGER: updated_at dla lamps i segmentów
-- ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lamps_updated_at
  BEFORE UPDATE ON lamps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER segments_updated_at
  BEFORE UPDATE ON road_segments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════════
-- 8. DANE DEMO — Zamość (opcjonalne, do wgrania na start)
--    Odkomentuj jeśli chcesz dane startowe w Supabase
-- ═══════════════════════════════════════════════════════════════

/*
INSERT INTO lamps (id, lat, lng, nr_slupa, rodzaj_slupa, rodzaj_oprawy, model_oprawy, moc_oprawa_w, wysokosc_slupa, liczba_opraw, kat_wysiegnika, dlugosc_wysiegnika, stan_slupa, stan_oprawy, szafa_oswietleniowa, rodzaj_linii, miejscowosc, ulica, usterka, usterka_typ, usterka_opis)
VALUES
  ('ZAM-50', 50.711741, 23.213643, 'L-001', 'Słup żelbetowy', 'Sodowa',            'SGS 203',          150, 8,  1, 15, 1.5, 'dobry',  'dobry',  'SON-01', 'napowietrzna', 'Zamość', 'ul. Lipowa',       'NIE', '', ''),
  ('ZAM-51', 50.715181, 23.213332, 'L-002', 'Słup żelbetowy', 'Sodowa',            'SGS 203',          150, 8,  1, 15, 1.5, 'dobry',  'średni', 'SON-01', 'napowietrzna', 'Zamość', 'ul. Lipowa',       'NIE', '', ''),
  ('ZAM-52', 50.715266, 23.214025, 'L-003', 'Słup stalowy',   'LED',               'Philips BGP200',    80, 10, 1,  5, 2.0, 'dobry',  'dobry',  'SON-02', 'kablowa',       'Zamość', 'ul. Partyzantów',  'NIE', '', ''),
  ('ZAM-53', 50.716800, 23.253000, 'L-004', 'Słup żelbetowy', 'Rtęciowa',          'HQL 125',          125,  7, 1,  0, 1.0, 'średni', 'zły',    'SON-01', 'napowietrzna', 'Zamość', 'ul. Peowiaków',    'TAK', 'uszkodzona oprawa', 'Brak świecenia, konieczna wymiana'),
  ('ZAM-54', 50.720000, 23.250000, 'L-005', 'Słup stalowy',   'LED',               'Schreder Luma2',    70,  9, 1, 10, 2.0, 'dobry',  'dobry',  'SON-02', 'kablowa',       'Zamość', 'ul. Szczebrzeska', 'NIE', '', ''),
  ('ZAM-55', 50.718500, 23.247000, 'L-006', 'Słup żelbetowy', 'Metalohalogenkowa', 'HID 150W',         150, 10, 2,  0, 0.0, 'zły',    'średni', 'SON-03', 'napowietrzna', 'Zamość', 'Rynek Wielki',     'TAK', 'uszkodzony słup', 'Korozja podstawy'),
  ('ZAM-56', 50.722000, 23.255000, 'L-007', 'Słup stalowy',   'LED',               'Thorn Isaro Pro',   90, 10, 1,  5, 1.5, 'dobry',  'dobry',  'SON-03', 'kablowa',       'Zamość', 'ul. Zamenhoffa',   'NIE', '', ''),
  ('ZAM-57', 50.712000, 23.256000, 'L-008', 'Słup żelbetowy', 'Sodowa',            'SON-T 100W',       100,  8, 1, 20, 2.0, 'dobry',  'dobry',  'SON-01', 'napowietrzna', 'Zamość', 'ul. Hrubieszowska','NIE', '', '')
ON CONFLICT (id) DO NOTHING;
*/

-- ═══════════════════════════════════════════════════════════════
-- WERYFIKACJA — sprawdź czy tabele istnieją
-- ═══════════════════════════════════════════════════════════════
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
