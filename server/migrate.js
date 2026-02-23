const { pool } = require('./db');

const schema = `
CREATE TABLE IF NOT EXISTS households (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  theme VARCHAR(50) DEFAULT 'dark',
  settings JSONB DEFAULT '{}',
  household_id INTEGER REFERENCES households(id),
  household_role VARCHAR(20) DEFAULT 'member' CHECK (household_role IN ('head', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_lists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  access VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (access IN ('private', 'household', 'admin')),
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  due_date DATE,
  status VARCHAR(20) DEFAULT 'todo' CHECK (status IN ('todo', 'in_progress', 'done')),
  list_id INTEGER REFERENCES task_lists(id) ON DELETE CASCADE,
  created_by INTEGER REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  access VARCHAR(20) DEFAULT 'private' CHECK (access IN ('private', 'household', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  time TIME,
  end_time TIME,
  type VARCHAR(20) DEFAULT 'one-time' CHECK (type IN ('one-time', 'recurring')),
  recurrence_rule VARCHAR(255),
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  access VARCHAR(20) DEFAULT 'private' CHECK (access IN ('private', 'household', 'admin')),
  reminder_before INTEGER[] DEFAULT '{}',
  category VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grocery_lists (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  access VARCHAR(20) NOT NULL DEFAULT 'household' CHECK (access IN ('private', 'household', 'admin')),
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS grocery_items (
  id SERIAL PRIMARY KEY,
  list_id INTEGER REFERENCES grocery_lists(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100),
  quantity VARCHAR(100),
  checked BOOLEAN DEFAULT false,
  recurring BOOLEAN DEFAULT false,
  added_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notes (
  id SERIAL PRIMARY KEY,
  title VARCHAR(500),
  content TEXT,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  access VARCHAR(20) DEFAULT 'private' CHECK (access IN ('private', 'household', 'admin')),
  tags TEXT[] DEFAULT '{}',
  folder VARCHAR(255),
  pinned BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kanban_boards (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  shared_with INTEGER[] DEFAULT '{}',
  access VARCHAR(20) DEFAULT 'private' CHECK (access IN ('private', 'household', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kanban_columns (
  id SERIAL PRIMARY KEY,
  board_id INTEGER REFERENCES kanban_boards(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kanban_cards (
  id SERIAL PRIMARY KEY,
  column_id INTEGER REFERENCES kanban_columns(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  due_date DATE,
  labels TEXT[] DEFAULT '{}',
  assigned_to INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS garden_plants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  species VARCHAR(255),
  type VARCHAR(50) DEFAULT 'fruit_tree' CHECK (type IN ('fruit_tree', 'vegetable', 'herb', 'flower', 'succulent', 'houseplant', 'shrub', 'vine', 'other')),
  location VARCHAR(255),
  planted_date DATE,
  photo_url TEXT,
  notes TEXT,
  health_status VARCHAR(20) DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'needs_attention', 'sick', 'dormant', 'new')),
  watering_frequency VARCHAR(50),
  last_watered DATE,
  last_fertilized DATE,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  access VARCHAR(20) DEFAULT 'household' CHECK (access IN ('private', 'household', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS garden_logs (
  id SERIAL PRIMARY KEY,
  plant_id INTEGER REFERENCES garden_plants(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('watering', 'fertilizing', 'pruning', 'harvest', 'treatment', 'photo', 'note', 'planting')),
  notes TEXT,
  photo_url TEXT,
  logged_by INTEGER REFERENCES users(id),
  logged_at TIMESTAMPTZ DEFAULT NOW()
);
`;

async function migrate() {
  try {
    await pool.query(schema);
    console.log('✅ Migration complete — all tables created');
  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await pool.end();
  }
}

migrate();
