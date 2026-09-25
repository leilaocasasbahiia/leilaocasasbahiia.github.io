CREATE TABLE IF NOT EXISTS zg_orders (
  id UUID PRIMARY KEY,
  access_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  customer JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS zg_orders_created_idx ON zg_orders (created_at DESC);
