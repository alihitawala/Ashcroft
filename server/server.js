require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');

const { authenticate } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const taskRoutes = require('./routes/tasks');
const eventRoutes = require('./routes/events');
const groceryRoutes = require('./routes/grocery');
const noteRoutes = require('./routes/notes');
const kanbanRoutes = require('./routes/kanban');
const gardenRoutes = require('./routes/garden');
const flightRoutes = require('./routes/flights');
const galleryRoutes = require('./routes/gallery');
const sportsRoutes = require('./routes/sports');
const capturesRoutes = require('./routes/captures');
const travelRoutes = require('./routes/travel');

const app = express();
const PORT = process.env.PORT || 3456;

// Middleware
app.use(helmet());
app.use(cors({
  origin: ['https://ashcroft.cloud', 'http://localhost:3456'],
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Static file serving for uploads
app.use('/uploads', express.static('/home/ashcroft/www/public/uploads'));
app.use('/app/uploads', express.static('/home/ashcroft/www/app/uploads'));

// Public gallery share (before authenticated routes)
app.use('/api/gallery/shared', (req, res) => {
    const token = req.path.slice(1); // remove leading /
    if (!token) return res.status(400).json({ error: 'Token required' });
    const { pool } = require('./db');
    (async () => {
        try {
            const album = await pool.query('SELECT * FROM photo_albums WHERE share_token = $1 AND shared = true', [token]);
            if (!album.rows[0]) return res.status(404).json({ error: 'Share not found' });
            const photos = await pool.query(
                `SELECT id, filename, thumbnail_path, medium_path, original_path, width, height, blurhash, 
                        ai_description, ai_tags, taken_at, camera_model, lens, focal_length, aperture, 
                        shutter_speed, iso, dominant_colors
                 FROM photos WHERE album_id = $1 ORDER BY COALESCE(taken_at, created_at) DESC`,
                [album.rows[0].id]
            );
            res.json({ album: album.rows[0], photos: photos.rows });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    })();
});

// Public travel share (no auth) — must be before task routes which catch /api/*
app.get('/api/travel/public/:token', async (req, res) => {
    try {
        const { pool } = require('./db');
        const trip = await pool.query('SELECT * FROM travel_trips WHERE share_token = $1', [req.params.token]);
        if (!trip.rows[0]) return res.status(404).json({ error: 'Trip not found' });
        const t = trip.rows[0];
        const days = await pool.query('SELECT * FROM travel_days WHERE trip_id = $1 ORDER BY day_number', [t.id]);
        const dayIds = days.rows.map(d => d.id);
        let activities = [];
        if (dayIds.length) {
            const act = await pool.query('SELECT * FROM travel_activities WHERE day_id = ANY($1) ORDER BY sort_order', [dayIds]);
            activities = act.rows;
        }
        const restaurants = await pool.query('SELECT * FROM travel_restaurants WHERE trip_id = $1', [t.id]);
        const stays = await pool.query('SELECT * FROM travel_stays WHERE trip_id = $1', [t.id]);
        const daysWithActivities = days.rows.map(day => ({ ...day, activities: activities.filter(a => a.day_id === day.id) }));
        delete t.user_id; delete t.share_token;
        res.json({ ...t, days: daysWithActivities, restaurants: restaurants.rows, stays: stays.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Routes
app.use('/api/auth', authRoutes);
const iftarRoutes = require('./routes/iftar');
app.use('/api/iftar', iftarRoutes);  // Public routes handle their own auth — must be before taskRoutes
app.use('/api', taskRoutes);
app.use('/api/events', eventRoutes);
app.use('/api', groceryRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/kanban', kanbanRoutes);
app.use('/api/garden', authenticate, gardenRoutes);
app.use('/api/flights', flightRoutes);
app.get('/api/public/gallery', galleryRoutes.getPublicPhoto);
app.use('/api/gallery', authenticate, galleryRoutes);

app.use('/api/sports', authenticate, sportsRoutes);
app.use('/api/captures', authenticate, capturesRoutes);
app.use('/api/travel', authenticate, travelRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 ashcroft-api running on port ${PORT}`);
  });
}

module.exports = app;
