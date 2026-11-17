-- Budget v2: миграция существующей базы D1 (данные не трогает).
-- Выполните ОДИН раз в Cloudflare → D1 → budget → Console (или: npx wrangler d1 execute budget --remote --file migrations.sql).
-- Новый worker.js делает то же самое автоматически при первом запросе, так что этот шаг — подстраховка.
-- Если какая-то строка ответит «duplicate column name» — значит колонка уже есть, это нормально, просто выполните остальные.
ALTER TABLE tx ADD COLUMN note TEXT;
ALTER TABLE tx ADD COLUMN type TEXT;
ALTER TABLE tx ADD COLUMN link INTEGER;
