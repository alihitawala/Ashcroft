const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const { pool } = require('../db');
const { processImage, UPLOADS_BASE } = require('../utils/image-processor');

// Multer setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(UPLOADS_BASE, 'uploads');
        require('fs').mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
        cb(null, name);
    },
});
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only images allowed'));
    },
    limits: { fileSize: 50 * 1024 * 1024 },
});

// ─── Upload ───
router.post('/upload', (req, res, next) => {
    upload.array('photos', 50)(req, res, (err) => {
        if (err) { console.error('[UPLOAD] Multer error:', err); return res.status(400).json({ error: err.message }); }
        next();
    });
}, async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }
        const results = [];
        for (const file of req.files) {
            const processed = await processImage(file.path, file.filename);
            const originalPath = `/uploads/photos/uploads/${file.filename}`;
            const r = await pool.query(`
                INSERT INTO photos (user_id, filename, original_path, thumbnail_path, medium_path,
                    width, height, file_size, mime_type, taken_at, camera_model, lens, focal_length,
                    aperture, shutter_speed, iso, gps_lat, gps_lon, blurhash, dominant_colors, album_id)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
                RETURNING *
            `, [
                req.user.id, file.originalname, originalPath,
                processed.thumbnail_path, processed.medium_path,
                processed.width, processed.height, processed.file_size, processed.mime_type,
                processed.taken_at, processed.camera_model, processed.lens, processed.focal_length,
                processed.aperture, processed.shutter_speed, processed.iso,
                processed.gps_lat, processed.gps_lon, processed.blurhash,
                processed.dominant_colors ? JSON.stringify(processed.dominant_colors) : null,
                req.body.album_id || null,
            ]);
            results.push(r.rows[0]);
        }
        res.json({ photos: results });
    } catch (err) {
        console.error('Upload error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── List photos ───
router.get('/photos', async (req, res) => {
    try {
        const { album_id, favorite, search, tag, date_from, date_to, color, limit = 200, offset = 0 } = req.query;
        let query = 'SELECT * FROM photos WHERE user_id = $1';
        const params = [req.user.id];
        let idx = 2;

        if (album_id) { query += ` AND album_id = $${idx++}`; params.push(album_id); }
        if (favorite === 'true') { query += ' AND is_favorite = true'; }
        if (search) {
            query += ` AND (ai_description ILIKE $${idx} OR $${idx+1} = ANY(ai_tags) OR filename ILIKE $${idx})`;
            params.push(`%${search}%`, search.toLowerCase());
            idx += 2;
        }
        if (tag) { query += ` AND $${idx++} = ANY(ai_tags)`; params.push(tag.toLowerCase()); }
        if (date_from) { query += ` AND (taken_at >= $${idx++} OR created_at >= $${idx-1})`; params.push(date_from); }
        if (date_to) { query += ` AND (taken_at <= $${idx++} OR created_at <= $${idx-1})`; params.push(date_to); }
        if (color) {
            query += ` AND dominant_colors->>'primary' = $${idx++}`;
            params.push(color);
        }

        query += ` ORDER BY COALESCE(taken_at, created_at) DESC LIMIT $${idx++} OFFSET $${idx++}`;
        params.push(parseInt(limit), parseInt(offset));

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error('List photos error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Single photo ───
router.get('/photos/:id', async (req, res) => {
    try {
        const r = await pool.query('SELECT * FROM photos WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Similar photos ───
router.get('/photos/:id/similar', async (req, res) => {
    try {
        const photo = await pool.query('SELECT * FROM photos WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        if (!photo.rows[0]) return res.status(404).json({ error: 'Not found' });
        const p = photo.rows[0];
        const tags = p.ai_tags || [];
        const primaryColor = p.dominant_colors?.primary || null;

        let r;
        if (tags.length > 0) {
            r = await pool.query(`
                SELECT *, 
                    (SELECT COUNT(*) FROM unnest(ai_tags) t WHERE t = ANY($3::text[])) as tag_overlap
                FROM photos 
                WHERE user_id = $1 AND id != $2
                ORDER BY tag_overlap DESC, COALESCE(taken_at, created_at) DESC
                LIMIT 12
            `, [req.user.id, req.params.id, tags]);
        } else {
            r = await pool.query(`
                SELECT * FROM photos WHERE user_id = $1 AND id != $2
                ORDER BY COALESCE(taken_at, created_at) DESC LIMIT 12
            `, [req.user.id, req.params.id]);
        }
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Colors endpoint ───
router.get('/colors', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT dominant_colors->>'primary' as color, COUNT(*) as count
            FROM photos WHERE user_id = $1 AND dominant_colors IS NOT NULL
            GROUP BY dominant_colors->>'primary'
            ORDER BY count DESC LIMIT 30
        `, [req.user.id]);
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Collections (auto-generated smart collections) ───
router.get('/collections', async (req, res) => {
    try {
        const collections = [];
        
        // Recent (last 7 days)
        const recent = await pool.query(`
            SELECT COUNT(*) as count, MIN(thumbnail_path) as cover
            FROM photos WHERE user_id = $1 AND created_at > NOW() - INTERVAL '7 days'
        `, [req.user.id]);
        if (parseInt(recent.rows[0].count) > 0) {
            collections.push({ id: 'recent', name: 'Recent', emoji: '🕐', count: parseInt(recent.rows[0].count), cover: recent.rows[0].cover, filter: { date_from: new Date(Date.now() - 7*86400000).toISOString().slice(0,10) } });
        }

        // Favorites
        const favs = await pool.query(`
            SELECT COUNT(*) as count, MIN(thumbnail_path) as cover
            FROM photos WHERE user_id = $1 AND is_favorite = true
        `, [req.user.id]);
        if (parseInt(favs.rows[0].count) > 0) {
            collections.push({ id: 'favorites', name: 'Favorites', emoji: '❤️', count: parseInt(favs.rows[0].count), cover: favs.rows[0].cover, filter: { favorite: 'true' } });
        }

        // Tag-based collections
        const tagCollections = [
            { id: 'nature', name: 'Nature & Trees', emoji: '🌲', tags: ['tree', 'forest', 'redwood', 'redwood tree', 'giant tree', 'ancient tree', 'old-growth tree', 'old-growth forest', 'nature', 'trail'] },
            { id: 'people', name: 'People & Celebrations', emoji: '🎉', tags: ['birthday', 'celebration', 'couple', 'man', 'people', 'portrait'] },
            { id: 'places', name: 'Places & Travel', emoji: '✈️', tags: ['car', 'bridge', 'walking', 'wooden bridge', 'footbridge'] },
        ];

        for (const tc of tagCollections) {
            const r = await pool.query(`
                SELECT COUNT(*) as count, MIN(thumbnail_path) as cover
                FROM photos WHERE user_id = $1 AND ai_tags && $2::text[]
            `, [req.user.id, tc.tags]);
            if (parseInt(r.rows[0].count) > 0) {
                collections.push({ id: tc.id, name: tc.name, emoji: tc.emoji, count: parseInt(r.rows[0].count), cover: r.rows[0].cover, filter: { tag: tc.tags[0] } });
            }
        }

        res.json(collections);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Share ───
router.post('/share', async (req, res) => {
    try {
        const { photo_id, album_id } = req.body;
        const token = crypto.randomBytes(16).toString('hex');
        
        if (photo_id) {
            // Create a share for single photo - store in photo_shares table or use album approach
            // For simplicity, create a one-photo album
            const photo = await pool.query('SELECT * FROM photos WHERE id = $1 AND user_id = $2', [photo_id, req.user.id]);
            if (!photo.rows[0]) return res.status(404).json({ error: 'Photo not found' });
            
            const album = await pool.query(
                `INSERT INTO photo_albums (user_id, name, description, shared, share_token, cover_photo_id)
                 VALUES ($1, $2, 'Shared photo', true, $3, $4) RETURNING *`,
                [req.user.id, `Shared: ${photo.rows[0].filename}`, token, photo_id]
            );
            await pool.query('UPDATE photos SET album_id = $1 WHERE id = $2', [album.rows[0].id, photo_id]);
            res.json({ token, url: `/app/shared.html?token=${token}` });
        } else if (album_id) {
            await pool.query('UPDATE photo_albums SET shared = true, share_token = $1 WHERE id = $2 AND user_id = $3', [token, album_id, req.user.id]);
            res.json({ token, url: `/app/shared.html?token=${token}` });
        } else {
            res.status(400).json({ error: 'photo_id or album_id required' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Public shared endpoint (no auth needed) ───
router.get('/shared/:token', async (req, res) => {
    try {
        const album = await pool.query('SELECT * FROM photo_albums WHERE share_token = $1 AND shared = true', [req.params.token]);
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
});

// ─── Update photo ───
router.patch('/photos/:id', async (req, res) => {
    try {
        const { is_favorite, album_id, ai_description, ai_tags } = req.body;
        const sets = [];
        const params = [req.params.id, req.user.id];
        let idx = 3;

        if (is_favorite !== undefined) { sets.push(`is_favorite = $${idx++}`); params.push(is_favorite); }
        if (album_id !== undefined) { sets.push(`album_id = $${idx++}`); params.push(album_id); }
        if (ai_description !== undefined) { sets.push(`ai_description = $${idx++}`); params.push(ai_description); }
        if (ai_tags !== undefined) { sets.push(`ai_tags = $${idx++}`); params.push(ai_tags); }

        if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

        const r = await pool.query(
            `UPDATE photos SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
            params
        );
        if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Delete photo ───
router.delete('/photos/:id', async (req, res) => {
    try {
        const r = await pool.query('DELETE FROM photos WHERE id = $1 AND user_id = $2 RETURNING *', [req.params.id, req.user.id]);
        if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
        res.json({ deleted: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── AI Analyze ───
router.post('/photos/:id/analyze', async (req, res) => {
    try {
        const { ai_description, ai_tags } = req.body;
        const r = await pool.query(
            `UPDATE photos SET ai_description = $3, ai_tags = $4, ai_analyzed_at = NOW()
             WHERE id = $1 AND user_id = $2 RETURNING *`,
            [req.params.id, req.user.id, ai_description, ai_tags]
        );
        if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Search ───
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json([]);
        const r = await pool.query(`
            SELECT * FROM photos WHERE user_id = $1 AND (
                ai_description ILIKE $2
                OR filename ILIKE $2
                OR EXISTS (SELECT 1 FROM unnest(ai_tags) tag WHERE tag ILIKE $2)
            )
            ORDER BY COALESCE(taken_at, created_at) DESC LIMIT 100
        `, [req.user.id, `%${q}%`]);
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Albums ───
router.get('/albums', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT a.*, COUNT(p.id) as photo_count,
                   (SELECT thumbnail_path FROM photos WHERE id = a.cover_photo_id) as cover_thumb
            FROM photo_albums a
            LEFT JOIN photos p ON p.album_id = a.id
            WHERE a.user_id = $1
            GROUP BY a.id ORDER BY a.created_at DESC
        `, [req.user.id]);
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/albums', async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ error: 'Name required' });
        const token = crypto.randomBytes(16).toString('hex');
        const r = await pool.query(
            `INSERT INTO photo_albums (user_id, name, description, share_token) VALUES ($1,$2,$3,$4) RETURNING *`,
            [req.user.id, name, description || null, token]
        );
        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/albums/:id', async (req, res) => {
    try {
        const { name, description, cover_photo_id, shared } = req.body;
        const sets = [];
        const params = [req.params.id, req.user.id];
        let idx = 3;
        if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name); }
        if (description !== undefined) { sets.push(`description = $${idx++}`); params.push(description); }
        if (cover_photo_id !== undefined) { sets.push(`cover_photo_id = $${idx++}`); params.push(cover_photo_id); }
        if (shared !== undefined) { sets.push(`shared = $${idx++}`); params.push(shared); }
        if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
        const r = await pool.query(`UPDATE photo_albums SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`, params);
        if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
        res.json(r.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/albums/:id', async (req, res) => {
    try {
        await pool.query('UPDATE photos SET album_id = NULL WHERE album_id = $1', [req.params.id]);
        const r = await pool.query('DELETE FROM photo_albums WHERE id = $1 AND user_id = $2 RETURNING *', [req.params.id, req.user.id]);
        if (!r.rows[0]) return res.status(404).json({ error: 'Not found' });
        res.json({ deleted: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/albums/:id/photos', async (req, res) => {
    try {
        const r = await pool.query(
            'SELECT * FROM photos WHERE album_id = $1 AND user_id = $2 ORDER BY COALESCE(taken_at, created_at) DESC',
            [req.params.id, req.user.id]
        );
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Stats ───
router.get('/stats', async (req, res) => {
    try {
        const counts = await pool.query('SELECT COUNT(*) as total, SUM(file_size) as total_size FROM photos WHERE user_id = $1', [req.user.id]);
        const tags = await pool.query(`
            SELECT tag, COUNT(*) as count FROM photos, unnest(ai_tags) tag
            WHERE user_id = $1 GROUP BY tag ORDER BY count DESC LIMIT 50
        `, [req.user.id]);
        const cameras = await pool.query(`
            SELECT camera_model, COUNT(*) as count FROM photos
            WHERE user_id = $1 AND camera_model IS NOT NULL GROUP BY camera_model ORDER BY count DESC
        `, [req.user.id]);
        const lenses = await pool.query(`
            SELECT lens, COUNT(*) as count FROM photos
            WHERE user_id = $1 AND lens IS NOT NULL GROUP BY lens ORDER BY count DESC
        `, [req.user.id]);
        const dateRange = await pool.query(`
            SELECT MIN(COALESCE(taken_at, created_at)) as earliest, MAX(COALESCE(taken_at, created_at)) as latest
            FROM photos WHERE user_id = $1
        `, [req.user.id]);
        const dayOfWeek = await pool.query(`
            SELECT EXTRACT(DOW FROM COALESCE(taken_at, created_at)) as dow, COUNT(*) as count
            FROM photos WHERE user_id = $1 GROUP BY dow ORDER BY dow
        `, [req.user.id]);
        const hourOfDay = await pool.query(`
            SELECT EXTRACT(HOUR FROM COALESCE(taken_at, created_at)) as hour, COUNT(*) as count
            FROM photos WHERE user_id = $1 AND taken_at IS NOT NULL GROUP BY hour ORDER BY hour
        `, [req.user.id]);
        const colors = await pool.query(`
            SELECT dominant_colors->>'primary' as color, COUNT(*) as count
            FROM photos WHERE user_id = $1 AND dominant_colors IS NOT NULL
            GROUP BY dominant_colors->>'primary' ORDER BY count DESC LIMIT 20
        `, [req.user.id]);
        const isoStats = await pool.query(`
            SELECT iso, COUNT(*) as count FROM photos
            WHERE user_id = $1 AND iso IS NOT NULL GROUP BY iso ORDER BY count DESC LIMIT 10
        `, [req.user.id]);
        const apertureStats = await pool.query(`
            SELECT aperture, COUNT(*) as count FROM photos
            WHERE user_id = $1 AND aperture IS NOT NULL GROUP BY aperture ORDER BY count DESC LIMIT 10
        `, [req.user.id]);

        res.json({
            total: parseInt(counts.rows[0].total),
            total_size: parseInt(counts.rows[0].total_size || 0),
            tags: tags.rows,
            cameras: cameras.rows,
            lenses: lenses.rows,
            date_range: dateRange.rows[0],
            day_of_week: dayOfWeek.rows,
            hour_of_day: hourOfDay.rows,
            colors: colors.rows,
            iso_stats: isoStats.rows,
            aperture_stats: apertureStats.rows,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Map ───
router.get('/map', async (req, res) => {
    try {
        const r = await pool.query(
            'SELECT id, filename, thumbnail_path, gps_lat, gps_lon, taken_at, ai_description FROM photos WHERE user_id = $1 AND gps_lat IS NOT NULL AND gps_lon IS NOT NULL',
            [req.user.id]
        );
        res.json(r.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Timeline ───
router.get('/timeline', async (req, res) => {
    try {
        const r = await pool.query(`
            SELECT id, filename, thumbnail_path, medium_path, original_path, width, height,
                   blurhash, is_favorite, ai_description, ai_tags, taken_at, created_at,
                   camera_model, lens, focal_length, aperture, shutter_speed, iso, dominant_colors,
                   DATE(COALESCE(taken_at, created_at)) as photo_date
            FROM photos WHERE user_id = $1
            ORDER BY COALESCE(taken_at, created_at) DESC
        `, [req.user.id]);
        const groups = {};
        for (const photo of r.rows) {
            const d = photo.photo_date?.toISOString?.()?.slice(0,10) || 'Unknown';
            if (!groups[d]) groups[d] = [];
            groups[d].push(photo);
        }
        res.json(Object.entries(groups).map(([date, photos]) => ({ date, photos })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Scan directory ───
router.post('/scan', async (req, res) => {
    try {
        const baseDirEntries = await fs.readdir(UPLOADS_BASE, { withFileTypes: true });
        const scanDirs = [];
        for (const entry of baseDirEntries) {
            if (entry.isDirectory() && !['thumbnails', 'medium', 'uploads'].includes(entry.name)) {
                scanDirs.push({ dir: path.join(UPLOADS_BASE, entry.name), prefix: `/uploads/photos/${entry.name}/` });
            }
        }

        let imported = 0, skipped = 0;
        const errors = [];

        for (const { dir, prefix } of scanDirs) {
            let files;
            try { files = await fs.readdir(dir); } catch { continue; }
            for (const file of files) {
                if (!/\.(jpe?g|png|webp|gif|tiff?)$/i.test(file)) continue;
                const existing = await pool.query('SELECT id FROM photos WHERE original_path = $1', [`${prefix}${file}`]);
                if (existing.rows.length > 0) { skipped++; continue; }
                try {
                    const filePath = path.join(dir, file);
                    const processed = await processImage(filePath, file);
                    await pool.query(`
                        INSERT INTO photos (user_id, filename, original_path, thumbnail_path, medium_path,
                            width, height, file_size, mime_type, taken_at, camera_model, lens, focal_length,
                            aperture, shutter_speed, iso, gps_lat, gps_lon, blurhash, dominant_colors)
                        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
                    `, [
                        req.user.id, file, `${prefix}${file}`,
                        processed.thumbnail_path, processed.medium_path,
                        processed.width, processed.height, processed.file_size, processed.mime_type,
                        processed.taken_at, processed.camera_model, processed.lens, processed.focal_length,
                        processed.aperture, processed.shutter_speed, processed.iso,
                        processed.gps_lat, processed.gps_lon, processed.blurhash,
                        processed.dominant_colors ? JSON.stringify(processed.dominant_colors) : null,
                    ]);
                    imported++;
                } catch (e) {
                    errors.push({ file, error: e.message });
                }
            }
        }
        res.json({ imported, skipped, errors });
    } catch (err) {
        console.error('Scan error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ─── Public share (no auth) — exported for mounting separately ───
router.getPublicPhoto = async (req, res) => {
    try {
        const { token } = req.query;
        if (!token) return res.status(400).json({ error: 'Token required' });
        const album = await pool.query('SELECT * FROM photo_albums WHERE share_token = $1 AND shared = true', [token]);
        if (album.rows[0]) {
            const photos = await pool.query(
                `SELECT id, filename, thumbnail_path, medium_path, original_path, width, height, blurhash, 
                        ai_description, ai_tags, taken_at, camera_model, lens, focal_length, aperture, 
                        shutter_speed, iso FROM photos WHERE album_id = $1 
                 ORDER BY COALESCE(taken_at, created_at) DESC`,
                [album.rows[0].id]
            );
            return res.json({ album: album.rows[0], photos: photos.rows });
        }
        res.status(404).json({ error: 'Share not found' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

module.exports = router;
