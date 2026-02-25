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
