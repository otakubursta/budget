CREATE TABLE IF NOT EXISTS tx (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL, amount REAL NOT NULL,
  place TEXT, cat TEXT, cur TEXT NOT NULL DEFAULT 'USD',
  note TEXT,      -- комментарий (v2)
  type TEXT,      -- 'tr' = перевод между валютами, NULL = обычная операция (v2)
  link INTEGER    -- id второй «ноги» перевода (v2)
);
CREATE INDEX IF NOT EXISTS tx_date ON tx(date);
CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL);
