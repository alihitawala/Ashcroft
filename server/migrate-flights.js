const { pool } = require('./db');

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS flight_watches (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id),
        origin VARCHAR(10) NOT NULL,
        origin_name VARCHAR(100),
        destination VARCHAR(10) NOT NULL,
        destination_name VARCHAR(100),
        depart_date_from DATE NOT NULL,
        depart_date_to DATE,
        return_date_from DATE,
        return_date_to DATE,
        trip_type VARCHAR(20) DEFAULT 'one-way',
        passengers INT DEFAULT 1,
        cabin_class VARCHAR(20) DEFAULT 'economy',
        max_price NUMERIC(10,2),
        nearby_airports BOOLEAN DEFAULT false,
        multi_city BOOLEAN DEFAULT false,
        active BOOLEAN DEFAULT true,
        access VARCHAR(20) DEFAULT 'private',
        household_id INT REFERENCES households(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS flight_prices (
        id SERIAL PRIMARY KEY,
        watch_id INT REFERENCES flight_watches(id) ON DELETE CASCADE,
        price NUMERIC(10,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        airline VARCHAR(100),
        airlines TEXT,
        stops INT DEFAULT 0,
        duration_min INT,
        outbound_departure TIMESTAMP,
        outbound_arrival TIMESTAMP,
        return_departure TIMESTAMP,
        return_arrival TIMESTAMP,
        route_summary TEXT,
        booking_url TEXT,
        source VARCHAR(20) DEFAULT 'manual',
        is_best_price BOOLEAN DEFAULT false,
        is_best_duration BOOLEAN DEFAULT false,
        raw_data JSONB,
        fetched_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_flight_prices_watch ON flight_prices(watch_id);
      CREATE INDEX IF NOT EXISTS idx_flight_prices_fetched ON flight_prices(fetched_at);
      CREATE INDEX IF NOT EXISTS idx_flight_watches_user ON flight_watches(user_id);
    `);
    console.log('✅ Flight tables created successfully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  }
}

migrate();
