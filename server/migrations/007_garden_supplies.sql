-- Garden Supplies Inventory
CREATE TABLE IF NOT EXISTS garden_supplies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN (
        'fertilizer', 'pesticide', 'fungicide', 'soil_amendment', 
        'tool', 'mulch', 'pot_container', 'irrigation', 'protection', 'other'
    )),
    brand VARCHAR(100),
    quantity DECIMAL(10,2),
    unit VARCHAR(30),  -- oz, lb, gal, bag, each, etc.
    quantity_remaining DECIMAL(10,2),  -- track usage
    purchase_date DATE,
    expiry_date DATE,
    purchase_price DECIMAL(8,2),
    home_depot_url TEXT,
    home_depot_sku VARCHAR(50),
    product_image_url TEXT,
    notes TEXT,
    covers_categories JSONB DEFAULT '[]',  -- e.g. ["iron_supplement", "fungicide"] — what needs this covers
    applicable_plants JSONB DEFAULT '[]',  -- plant IDs this is recommended for
    owner_id INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_supplies_owner ON garden_supplies(owner_id);
CREATE INDEX idx_supplies_category ON garden_supplies(category);

-- Recommended products catalog (curated by Bittu)
CREATE TABLE IF NOT EXISTS garden_product_catalog (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    category VARCHAR(50) NOT NULL,
    subcategory VARCHAR(100),  -- e.g. "chelated_iron", "copper_fungicide", "10-10-10"
    brand VARCHAR(100),
    description TEXT,
    home_depot_url TEXT,
    home_depot_sku VARCHAR(50),
    price_range VARCHAR(30),  -- e.g. "$8-12"
    product_image_url TEXT,
    use_cases JSONB DEFAULT '[]',  -- e.g. ["iron_chlorosis", "yellowing_leaves"]
    applicable_plant_types JSONB DEFAULT '["all"]',
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
