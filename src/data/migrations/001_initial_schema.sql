-- =============================================================================
-- Esquema inicial para el Bot de Finanzas Personales
-- =============================================================================

-- Tabla de perfiles
CREATE TABLE IF NOT EXISTS profiles (
  telegram_id BIGINT PRIMARY KEY,
  username TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  preferences JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de categorías
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT REFERENCES profiles(telegram_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('gasto', 'ingreso')),
  emoji TEXT DEFAULT '📁',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Tabla de transacciones
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES profiles(telegram_id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('gasto', 'ingreso')),
  amount DECIMAL(15,2) NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- Índices para mejor rendimiento
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_transactions_user_date 
  ON transactions(user_id, transaction_date);

CREATE INDEX IF NOT EXISTS idx_transactions_user_type 
  ON transactions(user_id, type);

CREATE INDEX IF NOT EXISTS idx_transactions_category 
  ON transactions(category_id);

CREATE INDEX IF NOT EXISTS idx_categories_user 
  ON categories(user_id);

-- =============================================================================
-- Row Level Security (RLS)
-- =============================================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Políticas para perfiles
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (telegram_id = (current_setting('app.current_telegram_id', true))::bigint);

CREATE POLICY "Users can insert own profile" ON profiles
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (telegram_id = (current_setting('app.current_telegram_id', true))::bigint);

-- Políticas para categorías
CREATE POLICY "Users can manage own categories" ON categories
  FOR ALL USING (user_id = (current_setting('app.current_telegram_id', true))::bigint);

-- Políticas para transacciones
CREATE POLICY "Users can manage own transactions" ON transactions
  FOR ALL USING (user_id = (current_setting('app.current_telegram_id', true))::bigint);

-- =============================================================================
-- Datos iniciales: Categorías por defecto
-- =============================================================================

INSERT INTO categories (name, type, emoji, is_default) VALUES
  ('comida', 'gasto', '🍔', true),
  ('transporte', 'gasto', '🚗', true),
  ('servicios', 'gasto', '💡', true),
  ('mercado', 'gasto', '🛒', true),
  ('salud', 'gasto', '💊', true),
  ('entretenimiento', 'gasto', '🎬', true),
  ('educación', 'gasto', '📚', true),
  ('otros', 'gasto', '📦', true),
  ('salario', 'ingreso', '💰', true),
  ('freelance', 'ingreso', '💻', true),
  ('inversión', 'ingreso', '📈', true),
  ('regalo', 'ingreso', '🎁', true),
  ('otro', 'ingreso', '💵', true)
ON CONFLICT DO NOTHING;
