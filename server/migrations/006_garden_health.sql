-- 006_garden_health.sql — Garden health assessments & photo tracking

CREATE TABLE IF NOT EXISTS garden_health_assessments (
    id SERIAL PRIMARY KEY,
    plant_id INTEGER REFERENCES garden_plants(id) ON DELETE CASCADE,
    photo_url TEXT,
    thumbnail_url TEXT,
    overall_score INTEGER,
    overall_trend VARCHAR(10) CHECK (overall_trend IN ('improving', 'stable', 'declining')),
    leaf_health INTEGER,
    hydration_level INTEGER,
    pest_damage INTEGER,
    disease_signs INTEGER,
    growth_vigor INTEGER,
    fruit_status INTEGER,
    root_health INTEGER,
    bark_condition INTEGER,
    ai_summary TEXT,
    ai_details JSONB,
    ai_recommendations JSONB,
    ai_season_notes TEXT,
    comparison_notes TEXT,
    assessed_by INTEGER REFERENCES users(id),
    assessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_health_plant ON garden_health_assessments(plant_id, assessed_at DESC);

CREATE TABLE IF NOT EXISTS garden_plant_photos (
    id SERIAL PRIMARY KEY,
    plant_id INTEGER REFERENCES garden_plants(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    thumbnail_url TEXT,
    caption TEXT,
    ai_description TEXT,
    assessment_id INTEGER REFERENCES garden_health_assessments(id) ON DELETE SET NULL,
    taken_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    uploaded_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_photos_plant ON garden_plant_photos(plant_id, taken_at DESC);

ALTER TABLE garden_plants ADD COLUMN IF NOT EXISTS latest_photo_url TEXT;
ALTER TABLE garden_plants ADD COLUMN IF NOT EXISTS latest_thumbnail_url TEXT;
ALTER TABLE garden_plants ADD COLUMN IF NOT EXISTS latest_assessment_id INTEGER REFERENCES garden_health_assessments(id);
ALTER TABLE garden_plants ADD COLUMN IF NOT EXISTS overall_health_score INTEGER;
ALTER TABLE garden_plants ADD COLUMN IF NOT EXISTS health_trend VARCHAR(10);
ALTER TABLE garden_plants ADD COLUMN IF NOT EXISTS sunlight VARCHAR(50);
ALTER TABLE garden_plants ADD COLUMN IF NOT EXISTS usda_zone VARCHAR(10) DEFAULT '9b';
ALTER TABLE garden_plants ADD COLUMN IF NOT EXISTS photo_count INTEGER DEFAULT 0;
ALTER TABLE garden_plants ADD COLUMN IF NOT EXISTS fingerprint_hash TEXT;

ALTER TABLE garden_logs ADD COLUMN IF NOT EXISTS assessment_id INTEGER REFERENCES garden_health_assessments(id);
