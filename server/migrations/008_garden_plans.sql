CREATE TABLE IF NOT EXISTS garden_plans (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    planned_date DATE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'skipped')),
    completed_at TIMESTAMPTZ,
    owner_id INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS garden_plan_steps (
    id SERIAL PRIMARY KEY,
    plan_id INTEGER REFERENCES garden_plans(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    section VARCHAR(100),
    title VARCHAR(300) NOT NULL,
    description TEXT,
    supply_id INTEGER REFERENCES garden_supplies(id) ON DELETE SET NULL,
    plant_ids JSONB DEFAULT '[]',
    plant_names JSONB DEFAULT '[]',
    step_type VARCHAR(30) DEFAULT 'action' CHECK (step_type IN ('action', 'spray', 'fertilize', 'water', 'prune', 'cleanup', 'inspect', 'note')),
    is_warning BOOLEAN DEFAULT false,
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_plans_owner ON garden_plans(owner_id, planned_date DESC);
CREATE INDEX idx_plan_steps_plan ON garden_plan_steps(plan_id, step_order);
