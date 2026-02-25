CREATE TABLE IF NOT EXISTS sports_notifications (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  sport VARCHAR(20) NOT NULL,
  event_type VARCHAR(30) NOT NULL,
  team_or_player VARCHAR(100),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
