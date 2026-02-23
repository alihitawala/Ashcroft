-- Iftar Events
CREATE TABLE IF NOT EXISTS iftar_events (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL DEFAULT 'Ramadan Iftar',
    event_date DATE,
    event_time TIME,
    sunset_time TIME,
    address_line1 VARCHAR(200),
    address_line2 VARCHAR(200),
    city VARCHAR(100),
    state VARCHAR(50),
    zip VARCHAR(20),
    message TEXT,
    host_name VARCHAR(100),
    host_phone VARCHAR(30),
    active BOOLEAN DEFAULT true,
    owner_id INTEGER REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Iftar Invites
CREATE TABLE IF NOT EXISTS iftar_invites (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES iftar_events(id) ON DELETE CASCADE,
    token VARCHAR(20) UNIQUE NOT NULL,
    guest_name VARCHAR(200) NOT NULL,
    guest_phone VARCHAR(30),
    guest_email VARCHAR(200),
    guest_count INTEGER DEFAULT 1,
    rsvp_status VARCHAR(20) DEFAULT 'pending' CHECK (rsvp_status IN ('pending', 'attending', 'declined', 'maybe')),
    dietary_notes TEXT,
    message_to_host TEXT,
    rsvp_at TIMESTAMPTZ,
    link_sent BOOLEAN DEFAULT false,
    link_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_iftar_invites_token ON iftar_invites(token);
CREATE INDEX idx_iftar_invites_event ON iftar_invites(event_id);
