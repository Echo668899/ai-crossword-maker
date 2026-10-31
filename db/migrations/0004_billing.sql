-- Phase 09: Hybrid billing ledger (orders, subscriptions, payment events, entitlements).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  sku TEXT NOT NULL,
  plan_version TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_session_id TEXT,
  provider_payment_id TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_provider_session
  ON orders(provider, provider_session_id)
  WHERE provider_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  sku TEXT NOT NULL,
  plan_version TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_subscription_id TEXT NOT NULL,
  provider_customer_id TEXT,
  status TEXT NOT NULL,
  current_period_start TEXT,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider, provider_subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  type TEXT NOT NULL,
  order_id TEXT,
  payload_json TEXT NOT NULL,
  processed_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(provider, provider_event_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events(order_id);

CREATE TABLE IF NOT EXISTS entitlement_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  source TEXT NOT NULL,
  source_id TEXT,
  kind TEXT NOT NULL,
  amount INTEGER,
  remaining INTEGER,
  project_id TEXT,
  plan_version TEXT NOT NULL,
  starts_at TEXT,
  ends_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entitlement_user_kind ON entitlement_grants(user_id, kind);
CREATE INDEX IF NOT EXISTS idx_entitlement_source ON entitlement_grants(source, source_id);

CREATE TABLE IF NOT EXISTS billing_customers (
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_customer_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, provider),
  UNIQUE(provider, provider_customer_id)
);
