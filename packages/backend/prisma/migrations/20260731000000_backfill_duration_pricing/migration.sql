-- Backfill DurationPricing to the canonical 1-12 month continuous discount curve.
-- Previously only 1/3/6/12 months were seeded; the seed guard (`if (exists) return`)
-- skipped backfilling existing databases, so any month without a row silently fell back
-- to the nearest configured duration in the frontend (e.g. 8 months charged as 6 months).
-- Idempotent: upserts by the unique "months" column.
-- Deterministic ids are used so re-runs never collide with cuid() rows.

INSERT INTO "duration_pricings" ("id", "months", "multiplierBps", "label", "isActive", "sortOrder", "createdAt")
VALUES
  ('dur_seed_01', 1, 10000, '1个月', true, 1, CURRENT_TIMESTAMP),
  ('dur_seed_02', 2, 9700, '2个月', true, 2, CURRENT_TIMESTAMP),
  ('dur_seed_03', 3, 9500, '3个月', true, 3, CURRENT_TIMESTAMP),
  ('dur_seed_04', 4, 9200, '4个月', true, 4, CURRENT_TIMESTAMP),
  ('dur_seed_05', 5, 8900, '5个月', true, 5, CURRENT_TIMESTAMP),
  ('dur_seed_06', 6, 8600, '6个月', true, 6, CURRENT_TIMESTAMP),
  ('dur_seed_07', 7, 8400, '7个月', true, 7, CURRENT_TIMESTAMP),
  ('dur_seed_08', 8, 8100, '8个月', true, 8, CURRENT_TIMESTAMP),
  ('dur_seed_09', 9, 7800, '9个月', true, 9, CURRENT_TIMESTAMP),
  ('dur_seed_10', 10, 7500, '10个月', true, 10, CURRENT_TIMESTAMP),
  ('dur_seed_11', 11, 7300, '11个月', true, 11, CURRENT_TIMESTAMP),
  ('dur_seed_12', 12, 7000, '12个月', true, 12, CURRENT_TIMESTAMP)
ON CONFLICT ("months") DO UPDATE SET
  "multiplierBps" = EXCLUDED."multiplierBps",
  "label" = EXCLUDED."label",
  "isActive" = EXCLUDED."isActive",
  "sortOrder" = EXCLUDED."sortOrder";
