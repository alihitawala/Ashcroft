const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

// Sharp for thumbnail generation
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  // Try global
  try {
    sharp = require(path.join(process.env.NODE_PATH || '/home/ashcroft/.npm-global/lib/node_modules', 'sharp'));
  } catch (e2) {
    console.error('Sharp not available:', e2.message);
  }
}

const router = Router();
router.use(authenticate);

const UPLOAD_DIR = '/home/ashcroft/www/public/uploads/garden/';
const THUMB_DIR = '/home/ashcroft/www/public/uploads/garden/thumbnails/';

// Ensure directories exist
[UPLOAD_DIR, THUMB_DIR].forEach(d => { try { fs.mkdirSync(d, { recursive: true }); } catch(e) {} });

// Configure multer for photo uploads
const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed!'), false);
  }
});

// Helper: access control WHERE clause
const ACCESS_CHECK = `((access = 'private' AND owner_id = $__uid) OR 
  (access = 'household' AND owner_id IN (SELECT id FROM users WHERE household_id = $__hid)) OR
  (access = 'admin' AND $__role = 'admin'))`;

function accessWhere(paramOffset) {
  return ACCESS_CHECK
    .replace('$__uid', `$${paramOffset}`)
    .replace('$__hid', `$${paramOffset + 1}`)
    .replace('$__role', `$${paramOffset + 2}`);
}

function accessParams(req) {
  return [req.user.id, req.user.household_id, req.user.role];
}

// Helper: check plant access, returns plant row or null
async function checkPlantAccess(plantId, req) {
  const result = await pool.query(
    `SELECT * FROM garden_plants WHERE id=$1 AND ${accessWhere(2)}`,
    [plantId, ...accessParams(req)]
  );
  return result.rows[0] || null;
}

// Helper: generate thumbnail
async function autoRotate(filename) {
  if (!sharp) return;
  const src = path.join(UPLOAD_DIR, filename);
  const tmp = src + '.tmp';
  await sharp(src).rotate().toFile(tmp);
  const fs2 = require('fs');
  fs2.renameSync(tmp, src);
}

async function generateThumbnail(filename) {
  if (!sharp) return null;
  const src = path.join(UPLOAD_DIR, filename);
  const thumbName = filename.replace(/\.[^.]+$/, '.jpg');
  const dest = path.join(THUMB_DIR, thumbName);
  await sharp(src).rotate().resize(400, null, { withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(dest);
  return `/uploads/garden/thumbnails/${thumbName}`;
}

// ─── Zones CRUD ───
router.get('/zones', async (req, res) => {
  try {
    // Filter zones: only show zones owned by users in the same household
    const result = await pool.query(
      `SELECT gz.*, (SELECT COUNT(*) FROM garden_plants gp WHERE gp.zone_id = gz.id) AS plant_count
       FROM garden_zones gz
       WHERE gz.owner_id IN (SELECT id FROM users WHERE household_id = $1)
       ORDER BY gz.sort_order, gz.name`,
      [req.user.household_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/zones', async (req, res) => {
  try {
    const { name, description, sort_order } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const result = await pool.query(
      `INSERT INTO garden_zones (name, slug, description, sort_order, owner_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, slug, description || null, sort_order ?? 0, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/zones/:id', async (req, res) => {
  try {
    const { name, description, sort_order } = req.body;
    const sets = [];
    const params = [];
    const maybeSet = (val, col) => {
      if (val !== undefined) { params.push(val); sets.push(`${col}=$${params.length}`); }
    };
    maybeSet(name, 'name');
    maybeSet(description, 'description');
    maybeSet(sort_order, 'sort_order');
    if (name !== undefined) {
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      params.push(slug);
      sets.push(`slug=$${params.length}`);
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    sets.push('updated_at=NOW()');
    params.push(req.params.id);
    const result = await pool.query(
      `UPDATE garden_zones SET ${sets.join(', ')} WHERE id=$${params.length} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/zones/:id', async (req, res) => {
  try {
    // Unassign plants first
    await pool.query('UPDATE garden_plants SET zone_id = NULL WHERE zone_id = $1', [req.params.id]);
    const result = await pool.query('DELETE FROM garden_zones WHERE id=$1 RETURNING *', [req.params.id]);
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/zones/:id/photo', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    await autoRotate(req.file.filename);
    const photoUrl = `/uploads/garden/${req.file.filename}`;
    const thumbnailUrl = await generateThumbnail(req.file.filename);
    const result = await pool.query(
      'UPDATE garden_zones SET photo_url=$1, thumbnail_url=$2, updated_at=NOW() WHERE id=$3 RETURNING *',
      [photoUrl, thumbnailUrl, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ─── Dashboard ───
// Watering schedule — plants due for watering, grouped by urgency
router.get('/watering-schedule', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT gp.id, gp.name, gp.type, gp.water_gallons, gp.watering_interval_days, 
              gp.next_watering, gp.last_watered, gp.watering_frequency, gp.health_status,
              gp.latest_thumbnail_url, gp.zone_id, gz.name AS zone_name
       FROM garden_plants gp
       LEFT JOIN garden_zones gz ON gz.id = gp.zone_id
       WHERE ${accessWhere(1).replace(/\baccess\b/g, 'gp.access').replace(/\bowner_id\b/g, 'gp.owner_id')} AND gp.next_watering IS NOT NULL
       ORDER BY gp.next_watering ASC`,
      accessParams(req)
    );
    const today = new Date().toISOString().split('T')[0];
    const plants = result.rows.map(p => {
      const daysUntil = Math.ceil((new Date(p.next_watering) - new Date(today)) / 86400000);
      let urgency = 'upcoming';
      if (daysUntil < 0) urgency = 'overdue';
      else if (daysUntil === 0) urgency = 'today';
      else if (daysUntil <= 2) urgency = 'soon';
      return { ...p, days_until_watering: daysUntil, urgency };
    });
    res.json({
      overdue: plants.filter(p => p.urgency === 'overdue'),
      today: plants.filter(p => p.urgency === 'today'),
      soon: plants.filter(p => p.urgency === 'soon'),
      upcoming: plants.filter(p => p.urgency === 'upcoming'),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/plants/dashboard', async (req, res) => {
  try {
    const plants = await pool.query(
      `SELECT id, name, species, type, location, health_status, 
              latest_photo_url, latest_thumbnail_url, overall_health_score, 
              health_trend, photo_count
       FROM garden_plants WHERE ${accessWhere(1)} ORDER BY name`,
      accessParams(req)
    );

    // Get top 3 urgent recommendations across all plants
    const recs = await pool.query(
      `SELECT gha.plant_id, gp.name as plant_name, gha.ai_recommendations
       FROM garden_health_assessments gha
       JOIN garden_plants gp ON gp.id = gha.plant_id
       WHERE gha.id IN (SELECT latest_assessment_id FROM garden_plants WHERE latest_assessment_id IS NOT NULL AND ${accessWhere(1)})
       AND gha.ai_recommendations IS NOT NULL`,
      accessParams(req)
    );

    // Flatten and sort recommendations by urgency
    const urgencyOrder = { urgent: 0, soon: 1, routine: 2 };
    const allRecs = [];
    for (const row of recs.rows) {
      const items = Array.isArray(row.ai_recommendations) ? row.ai_recommendations : [];
      for (const r of items) {
        // Items can be strings or objects — normalize to objects
        const rec = typeof r === 'string'
          ? { description: r, urgency: 'routine', plant_id: row.plant_id, plant_name: row.plant_name }
          : { ...r, plant_id: row.plant_id, plant_name: row.plant_name };
        allRecs.push(rec);
      }
    }
    allRecs.sort((a, b) => (urgencyOrder[a.urgency] ?? 2) - (urgencyOrder[b.urgency] ?? 2));

    const needsAttention = plants.rows.filter(p => 
      p.health_status === 'needs_attention' || p.health_status === 'sick'
    ).length;

    res.json({
      plants: plants.rows,
      recommendations: allRecs.slice(0, 3),
      needs_attention_count: needsAttention
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Plants CRUD ───
router.get('/plants', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT gp.*, gz.name AS zone_name, gz.slug AS zone_slug
       FROM garden_plants gp
       LEFT JOIN garden_zones gz ON gz.id = gp.zone_id
       WHERE ${accessWhere(1).replace(/\baccess\b/g, 'gp.access').replace(/\bowner_id\b/g, 'gp.owner_id')}
       ORDER BY gp.name`,
      accessParams(req)
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/plants', async (req, res) => {
  try {
    const { 
      name, species, type = 'fruit_tree', location, planted_date, 
      photo_url, notes, health_status = 'new', watering_frequency, 
      last_watered, last_fertilized, access = 'household', sunlight, usda_zone
    } = req.body;
    
    if (!name) return res.status(400).json({ error: 'Name is required' });
    
    const result = await pool.query(
      `INSERT INTO garden_plants 
       (name, species, type, location, planted_date, photo_url, notes, health_status, 
        watering_frequency, last_watered, last_fertilized, owner_id, access, sunlight, usda_zone, planting_method, zone_id) 
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [name, species, type, location, planted_date, photo_url, notes, health_status, 
       watering_frequency, last_watered, last_fertilized, req.user.id, access, sunlight || null, usda_zone || '9b', req.body.planting_method || 'in_ground', req.body.zone_id || null]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/plants/:id', async (req, res) => {
  try {
    const { 
      name, species, type, location, planted_date, photo_url, notes, 
      health_status, watering_frequency, last_watered, last_fertilized, access,
      sunlight, usda_zone, planting_method
    } = req.body;
    
    const sets = [];
    const params = [];
    const maybeSet = (val, col) => {
      if (val !== undefined) { params.push(val); sets.push(`${col}=$${params.length}`); }
    };
    maybeSet(name, 'name'); maybeSet(species, 'species'); maybeSet(type, 'type');
    maybeSet(location, 'location'); maybeSet(planted_date, 'planted_date');
    maybeSet(photo_url, 'photo_url'); maybeSet(notes, 'notes');
    maybeSet(health_status, 'health_status'); maybeSet(watering_frequency, 'watering_frequency');
    maybeSet(last_watered, 'last_watered'); maybeSet(last_fertilized, 'last_fertilized');
    maybeSet(access, 'access'); maybeSet(sunlight, 'sunlight'); maybeSet(usda_zone, 'usda_zone');
    maybeSet(planting_method, 'planting_method');
    if (req.body.zone_id !== undefined) { params.push(req.body.zone_id); sets.push(`zone_id=$${params.length}`); }
    
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    
    sets.push('updated_at=NOW()');
    params.push(req.params.id);
    const idIdx = params.length;
    params.push(...accessParams(req));
    
    const result = await pool.query(
      `UPDATE garden_plants SET ${sets.join(', ')} WHERE id=$${idIdx} AND ${accessWhere(idIdx + 1)} RETURNING *`,
      params
    );
    
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/plants/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM garden_plants WHERE id=$1 AND ${accessWhere(2)} RETURNING *`,
      [req.params.id, ...accessParams(req)]
    );
    
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Plant Logs ───
router.get('/plants/:id/logs', async (req, res) => {
  try {
    const plant = await checkPlantAccess(req.params.id, req);
    if (!plant) return res.status(404).json({ error: 'Plant not found' });
    
    const result = await pool.query(
      `SELECT gl.*, u.name as logged_by_name FROM garden_logs gl 
       LEFT JOIN users u ON gl.logged_by = u.id 
       WHERE gl.plant_id = $1 ORDER BY gl.logged_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/plants/:id/logs', async (req, res) => {
  try {
    const { type, notes, photo_url } = req.body;
    if (!type) return res.status(400).json({ error: 'Type is required' });
    
    const plant = await checkPlantAccess(req.params.id, req);
    if (!plant) return res.status(404).json({ error: 'Plant not found' });
    
    const result = await pool.query(
      `INSERT INTO garden_logs (plant_id, type, notes, photo_url, logged_by) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.id, type, notes, photo_url, req.user.id]
    );
    
    if (type === 'watering') {
      // Update last_watered AND auto-advance next_watering, snapped to nearest weekend
      await pool.query(
        `UPDATE garden_plants SET last_watered = CURRENT_DATE, 
         next_watering = CASE WHEN watering_interval_days IS NOT NULL THEN
           -- Calculate raw next date, then snap to nearest Sat/Sun
           (CURRENT_DATE + watering_interval_days * INTERVAL '1 day')::date +
           CASE EXTRACT(DOW FROM (CURRENT_DATE + watering_interval_days * INTERVAL '1 day'))
             WHEN 1 THEN -1  -- Mon → Sun
             WHEN 2 THEN -2  -- Tue → Sun
             WHEN 3 THEN 3   -- Wed → Sat
             WHEN 4 THEN 2   -- Thu → Sat
             WHEN 5 THEN 1   -- Fri → Sat
             ELSE 0           -- Sat(6)/Sun(0) → keep
           END
         ELSE next_watering END,
         updated_at = NOW() WHERE id = $1`, [req.params.id]);
    } else if (type === 'fertilizing') {
      await pool.query('UPDATE garden_plants SET last_fertilized = CURRENT_DATE, updated_at = NOW() WHERE id = $1', [req.params.id]);
    }
    
    const full = await pool.query(
      `SELECT gl.*, u.name as logged_by_name FROM garden_logs gl 
       LEFT JOIN users u ON gl.logged_by = u.id WHERE gl.id = $1`,
      [result.rows[0].id]
    );
    res.status(201).json(full.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Photo Upload (legacy) ───
router.post('/upload', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    await autoRotate(req.file.filename);
    const photoUrl = `/uploads/garden/${req.file.filename}`;
    const thumbnailUrl = await generateThumbnail(req.file.filename);
    res.json({ url: photoUrl, thumbnail_url: thumbnailUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ─── Plant Photos ───
router.post('/plants/:id/photos', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    await autoRotate(req.file.filename);
    
    const plant = await checkPlantAccess(req.params.id, req);
    if (!plant) return res.status(404).json({ error: 'Plant not found' });
    
    const photoUrl = `/uploads/garden/${req.file.filename}`;
    const thumbnailUrl = await generateThumbnail(req.file.filename);
    const { caption } = req.body;
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const photo = await client.query(
        `INSERT INTO garden_plant_photos (plant_id, photo_url, thumbnail_url, caption, uploaded_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [req.params.id, photoUrl, thumbnailUrl, caption || null, req.user.id]
      );
      
      await client.query(
        `UPDATE garden_plants SET latest_photo_url=$1, latest_thumbnail_url=$2, 
         photo_count=COALESCE(photo_count,0)+1, updated_at=NOW() WHERE id=$3`,
        [photoUrl, thumbnailUrl, req.params.id]
      );
      
      await client.query('COMMIT');
      res.status(201).json(photo.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Upload and Assess (combined) ───
router.post('/plants/:id/photos/upload-and-assess', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    await autoRotate(req.file.filename);
    
    const plant = await checkPlantAccess(req.params.id, req);
    if (!plant) return res.status(404).json({ error: 'Plant not found' });
    
    const photoUrl = `/uploads/garden/${req.file.filename}`;
    const thumbnailUrl = await generateThumbnail(req.file.filename);
    const { caption } = req.body;
    
    // Parse assessment data if provided as JSON string field
    let assessData = null;
    if (req.body.assessment) {
      try { assessData = typeof req.body.assessment === 'string' ? JSON.parse(req.body.assessment) : req.body.assessment; }
      catch(e) { return res.status(400).json({ error: 'Invalid assessment JSON' }); }
    }
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      let assessmentId = null;
      let assessmentRow = null;
      
      if (assessData) {
        const a = assessData;
        const score = a.overall_score;
        const healthStatus = score > 80 ? 'healthy' : score >= 50 ? 'needs_attention' : 'sick';
        
        const assess = await client.query(
          `INSERT INTO garden_health_assessments 
           (plant_id, photo_url, thumbnail_url, overall_score, overall_trend,
            leaf_health, hydration_level, pest_damage, disease_signs, growth_vigor,
            fruit_status, root_health, bark_condition,
            ai_summary, ai_details, ai_recommendations, ai_season_notes, comparison_notes, assessed_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
          [req.params.id, photoUrl, thumbnailUrl, score, a.overall_trend || 'stable',
           a.leaf_health, a.hydration_level, a.pest_damage, a.disease_signs, a.growth_vigor,
           a.fruit_status || null, a.root_health || null, a.bark_condition || null,
           a.ai_summary, a.ai_details ? JSON.stringify(a.ai_details) : null,
           a.ai_recommendations ? JSON.stringify(a.ai_recommendations) : null,
           a.ai_season_notes || null, a.comparison_notes || null, req.user.id]
        );
        assessmentId = assess.rows[0].id;
        assessmentRow = assess.rows[0];
        
        await client.query(
          `UPDATE garden_plants SET latest_assessment_id=$1, overall_health_score=$2, 
           health_trend=$3, health_status=$4, updated_at=NOW() WHERE id=$5`,
          [assessmentId, score, a.overall_trend || 'stable', healthStatus, req.params.id]
        );
      }
      
      const photo = await client.query(
        `INSERT INTO garden_plant_photos (plant_id, photo_url, thumbnail_url, caption, assessment_id, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.params.id, photoUrl, thumbnailUrl, caption || null, assessmentId, req.user.id]
      );
      
      await client.query(
        `UPDATE garden_plants SET latest_photo_url=$1, latest_thumbnail_url=$2, 
         photo_count=COALESCE(photo_count,0)+1, updated_at=NOW() WHERE id=$3`,
        [photoUrl, thumbnailUrl, req.params.id]
      );
      
      await client.query('COMMIT');
      res.status(201).json({ photo: photo.rows[0], assessment: assessmentRow });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Health Assessment ───
router.post('/plants/:id/assess', async (req, res) => {
  try {
    const plant = await checkPlantAccess(req.params.id, req);
    if (!plant) return res.status(404).json({ error: 'Plant not found' });
    
    const a = req.body;
    if (a.overall_score === undefined) return res.status(400).json({ error: 'overall_score is required' });
    
    const score = a.overall_score;
    const healthStatus = score > 80 ? 'healthy' : score >= 50 ? 'needs_attention' : 'sick';
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      const assess = await client.query(
        `INSERT INTO garden_health_assessments 
         (plant_id, photo_url, thumbnail_url, overall_score, overall_trend,
          leaf_health, hydration_level, pest_damage, disease_signs, growth_vigor,
          fruit_status, root_health, bark_condition,
          ai_summary, ai_details, ai_recommendations, ai_season_notes, comparison_notes, assessed_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
        [req.params.id, a.photo_url || null, a.thumbnail_url || null, score, a.overall_trend || 'stable',
         a.leaf_health, a.hydration_level, a.pest_damage, a.disease_signs, a.growth_vigor,
         a.fruit_status || null, a.root_health || null, a.bark_condition || null,
         a.ai_summary || null, a.ai_details ? JSON.stringify(a.ai_details) : null,
         a.ai_recommendations ? JSON.stringify(a.ai_recommendations) : null,
         a.ai_season_notes || null, a.comparison_notes || null, req.user.id]
      );
      
      await client.query(
        `UPDATE garden_plants SET latest_assessment_id=$1, overall_health_score=$2, 
         health_trend=$3, health_status=$4, updated_at=NOW() WHERE id=$5`,
        [assess.rows[0].id, score, a.overall_trend || 'stable', healthStatus, req.params.id]
      );
      
      await client.query('COMMIT');
      res.status(201).json(assess.rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Timeline ───
router.get('/plants/:id/timeline', async (req, res) => {
  try {
    const plant = await checkPlantAccess(req.params.id, req);
    if (!plant) return res.status(404).json({ error: 'Plant not found' });
    
    const result = await pool.query(
      `SELECT p.*, 
              a.overall_score, a.overall_trend, a.leaf_health, a.hydration_level,
              a.pest_damage, a.disease_signs, a.growth_vigor, a.fruit_status,
              a.ai_summary, a.ai_recommendations
       FROM garden_plant_photos p
       LEFT JOIN garden_health_assessments a ON a.id = p.assessment_id
       WHERE p.plant_id = $1
       ORDER BY p.taken_at DESC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Health History ───
router.get('/plants/:id/health-history', async (req, res) => {
  try {
    const plant = await checkPlantAccess(req.params.id, req);
    if (!plant) return res.status(404).json({ error: 'Plant not found' });
    
    const result = await pool.query(
      `SELECT assessed_at as date, overall_score, leaf_health, hydration_level,
              pest_damage, disease_signs, growth_vigor, fruit_status, 
              root_health, bark_condition, overall_trend
       FROM garden_health_assessments
       WHERE plant_id = $1
       ORDER BY assessed_at ASC`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Garden Supplies Routes ───

// List supplies inventory
router.get('/supplies', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM garden_supplies WHERE owner_id IN (SELECT id FROM users WHERE household_id = $1) ORDER BY category, name`,
      [req.user.household_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add a supply
router.post('/supplies', async (req, res) => {
  try {
    const { name, category, brand, quantity, unit, quantity_remaining, purchase_date,
            expiry_date, purchase_price, home_depot_url, home_depot_sku, notes,
            covers_categories, applicable_plants, product_image_url } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'name and category required' });
    
    const result = await pool.query(
      `INSERT INTO garden_supplies 
       (name, category, brand, quantity, unit, quantity_remaining, purchase_date,
        expiry_date, purchase_price, home_depot_url, home_depot_sku, notes,
        covers_categories, applicable_plants, product_image_url, owner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [name, category, brand || null, quantity || null, unit || null,
       quantity_remaining ?? quantity ?? null, purchase_date || null,
       expiry_date || null, purchase_price || null, home_depot_url || null,
       home_depot_sku || null, notes || null,
       JSON.stringify(covers_categories || []), JSON.stringify(applicable_plants || []),
       product_image_url || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a supply
router.put('/supplies/:id', async (req, res) => {
  try {
    const fields = ['name','category','brand','quantity','unit','quantity_remaining',
                    'purchase_date','expiry_date','purchase_price','home_depot_url',
                    'home_depot_sku','notes','covers_categories','applicable_plants','product_image_url'];
    const sets = [];
    const params = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        params.push(['covers_categories','applicable_plants'].includes(f) ? JSON.stringify(req.body[f]) : req.body[f]);
        sets.push(`${f}=$${params.length}`);
      }
    });
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    sets.push('updated_at=NOW()');
    params.push(req.params.id);
    const idIdx = params.length;
    params.push(req.user.household_id);
    const ownerIdx = params.length;
    const result = await pool.query(
      `UPDATE garden_supplies SET ${sets.join(', ')} WHERE id=$${idIdx} AND owner_id IN (SELECT id FROM users WHERE household_id=$${ownerIdx}) RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a supply
router.delete('/supplies/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM garden_supplies WHERE id=$1 AND owner_id IN (SELECT id FROM users WHERE household_id=$2) RETURNING id`,
      [req.params.id, req.user.household_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get product catalog
router.get('/product-catalog', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM garden_product_catalog WHERE active = true ORDER BY category, name'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Smart shopping list — aggregate recommendations across all plants, cross-reference with inventory
router.get('/shopping-list', async (req, res) => {
  try {
    const recsResult = await pool.query(
      `SELECT gha.plant_id, gp.name as plant_name, gha.ai_recommendations
       FROM garden_health_assessments gha
       JOIN garden_plants gp ON gp.id = gha.plant_id
       WHERE gha.id IN (SELECT latest_assessment_id FROM garden_plants WHERE latest_assessment_id IS NOT NULL AND ${accessWhere(1)})
       AND gha.ai_recommendations IS NOT NULL`,
      accessParams(req)
    );
    
    const suppliesResult = await pool.query(
      `SELECT * FROM garden_supplies WHERE owner_id IN (SELECT id FROM users WHERE household_id = $1) AND (quantity_remaining IS NULL OR quantity_remaining > 0)`,
      [req.user.household_id]
    );
    
    const catalogResult = await pool.query(
      'SELECT * FROM garden_product_catalog WHERE active = true'
    );
    
    // Aggregate needs by category
    const needs = {};
    for (const row of recsResult.rows) {
      const items = Array.isArray(row.ai_recommendations) ? row.ai_recommendations : [];
      for (const rec of items) {
        const cat = rec.category || rec.action || 'general';
        const urgency = rec.urgency || rec.priority || 'routine';
        if (!needs[cat]) needs[cat] = { category: cat, plants: [], recommendations: [], urgency: 'routine' };
        needs[cat].plants.push({ id: row.plant_id, name: row.plant_name });
        needs[cat].recommendations.push({ ...rec, plant_id: row.plant_id, plant_name: row.plant_name });
        if (urgency === 'urgent' || urgency === 'high') needs[cat].urgency = 'urgent';
        else if ((urgency === 'soon' || urgency === 'medium') && needs[cat].urgency !== 'urgent') needs[cat].urgency = 'soon';
      }
    }
    
    res.json({
      needs: Object.values(needs),
      supplies: suppliesResult.rows,
      catalog: catalogResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Garden Plans Routes ───

// List plans
router.get('/plans', async (req, res) => {
  try {
    const plans = await pool.query(
      `SELECT * FROM garden_plans WHERE owner_id IN (SELECT id FROM users WHERE household_id = $1) ORDER BY 
       CASE status WHEN 'active' THEN 0 ELSE 1 END, planned_date DESC`,
      [req.user.household_id]
    );
    // Get steps for each plan
    const result = [];
    for (const plan of plans.rows) {
      const steps = await pool.query(
        'SELECT * FROM garden_plan_steps WHERE plan_id = $1 ORDER BY step_order',
        [plan.id]
      );
      result.push({ ...plan, steps: steps.rows });
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single plan
router.get('/plans/:id', async (req, res) => {
  try {
    const plan = await pool.query(
      'SELECT * FROM garden_plans WHERE id = $1 AND owner_id IN (SELECT id FROM users WHERE household_id = $2)',
      [req.params.id, req.user.household_id]
    );
    if (!plan.rows[0]) return res.status(404).json({ error: 'Not found' });
    const steps = await pool.query(
      'SELECT * FROM garden_plan_steps WHERE plan_id = $1 ORDER BY step_order',
      [req.params.id]
    );
    res.json({ ...plan.rows[0], steps: steps.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create plan with steps
router.post('/plans', async (req, res) => {
  try {
    const { title, description, planned_date, steps } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });
    
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const plan = await client.query(
        `INSERT INTO garden_plans (title, description, planned_date, owner_id)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [title, description || null, planned_date || null, req.user.id]
      );
      const planId = plan.rows[0].id;
      
      const stepRows = [];
      if (steps && steps.length > 0) {
        for (let i = 0; i < steps.length; i++) {
          const s = steps[i];
          const row = await client.query(
            `INSERT INTO garden_plan_steps 
             (plan_id, step_order, section, title, description, supply_id, plant_ids, plant_names, step_type, is_warning)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [planId, i + 1, s.section || null, s.title, s.description || null,
             s.supply_id || null, JSON.stringify(s.plant_ids || []),
             JSON.stringify(s.plant_names || []), s.step_type || 'action', s.is_warning || false]
          );
          stepRows.push(row.rows[0]);
        }
      }
      
      await client.query('COMMIT');
      res.status(201).json({ ...plan.rows[0], steps: stepRows });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Complete a step
router.put('/plans/:planId/steps/:stepId/complete', async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await pool.query(
      `UPDATE garden_plan_steps SET completed = true, completed_at = NOW(), 
       notes = COALESCE($3, notes) 
       WHERE id = $1 AND plan_id = $2 RETURNING *`,
      [req.params.stepId, req.params.planId, notes || null]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    
    // Check if all steps complete → mark plan complete
    const remaining = await pool.query(
      'SELECT COUNT(*) as cnt FROM garden_plan_steps WHERE plan_id = $1 AND completed = false AND is_warning = false',
      [req.params.planId]
    );
    if (parseInt(remaining.rows[0].cnt) === 0) {
      await pool.query(
        "UPDATE garden_plans SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1",
        [req.params.planId]
      );
    }
    
    // Also log to plant care logs
    const step = result.rows[0];
    const plantIds = Array.isArray(step.plant_ids) ? step.plant_ids : [];
    const typeMap = { spray: 'treatment', fertilize: 'fertilizing', water: 'watering', prune: 'pruning', cleanup: 'note', inspect: 'note', action: 'note' };
    const logType = typeMap[step.step_type] || 'note';
    for (const pid of plantIds) {
      await pool.query(
        'INSERT INTO garden_logs (plant_id, type, notes, logged_by) VALUES ($1,$2,$3,$4)',
        [pid, logType, step.title + (notes ? ' — ' + notes : ''), req.user.id]
      );
      if (logType === 'watering') await pool.query('UPDATE garden_plants SET last_watered=CURRENT_DATE, updated_at=NOW() WHERE id=$1', [pid]);
      if (logType === 'fertilizing') await pool.query('UPDATE garden_plants SET last_fertilized=CURRENT_DATE, updated_at=NOW() WHERE id=$1', [pid]);
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Uncomplete a step
router.put('/plans/:planId/steps/:stepId/uncomplete', async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE garden_plan_steps SET completed = false, completed_at = NULL 
       WHERE id = $1 AND plan_id = $2 RETURNING *`,
      [req.params.stepId, req.params.planId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    // Reactivate plan if it was completed
    await pool.query(
      "UPDATE garden_plans SET status = 'active', completed_at = NULL, updated_at = NOW() WHERE id = $1 AND status = 'completed'",
      [req.params.planId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a plan
router.delete('/plans/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM garden_plans WHERE id = $1 AND owner_id IN (SELECT id FROM users WHERE household_id = $2) RETURNING id',
      [req.params.id, req.user.household_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── AI Plant Analysis ───
router.post('/ai/analyze', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) return res.status(503).json({ error: 'AI service not configured' });

    const imageBase64 = fs.readFileSync(req.file.path).toString('base64');
    const mimeType = req.file.mimetype;
    const mode = req.body.mode || 'identify';
    const isProduct = req.body.product_photo === 'true' || req.body.product_photo === true;

    let prompt;

    if (isProduct) {
      prompt = `Analyze this garden product/supply photo. Return ONLY valid JSON (no markdown, no explanation) with this structure:
{
  "name": "product name",
  "brand": "brand name or null",
  "category": "fertilizer|pesticide|soil|tool|other",
  "npk_ratio": "N-P-K string or null",
  "instructions": "brief usage instructions",
  "suggested_quantity_unit": "unit of measurement"
}`;
    } else if (mode === 'assess') {
      let plantContext = '';
      if (req.body.plant_id) {
        const plant = await pool.query('SELECT name, species, overall_health_score FROM garden_plants WHERE id=$1', [req.body.plant_id]);
        if (plant.rows[0]) {
          const p = plant.rows[0];
          plantContext = `\nThis is "${p.name}" (${p.species || 'unknown species'}). Previous health score: ${p.overall_health_score || 'none'}.`;
        }
      }
      prompt = `You are a plant health expert. Assess this plant's health.${plantContext}
Return ONLY valid JSON (no markdown, no explanation):
{
  "health": {
    "overall_score": 0-100,
    "dimensions": {
      "leaf_health": 0-100, "hydration_level": 0-100, "pest_damage": 0-100,
      "disease_signs": 0-100, "growth_vigor": 0-100, "fruit_status": 0-100,
      "root_health": 0-100, "bark_condition": 0-100
    },
    "summary": "2-3 sentence assessment",
    "recommendations": [{"priority": "high|medium|low", "action": "short action", "details": "explanation"}]
  }
}`;
    } else {
      prompt = `You are a plant identification and health expert. Identify this plant and assess its health.
Return ONLY valid JSON (no markdown, no explanation):
{
  "species": "Scientific name",
  "common_name": "Common name",
  "type": "fruit_tree|flower|shrub|herb|vegetable|succulent",
  "health": {
    "overall_score": 0-100,
    "dimensions": {
      "leaf_health": 0-100, "hydration_level": 0-100, "pest_damage": 0-100,
      "disease_signs": 0-100, "growth_vigor": 0-100, "fruit_status": 0-100,
      "root_health": 0-100, "bark_condition": 0-100
    },
    "summary": "2-3 sentence assessment",
    "recommendations": [{"priority": "high|medium|low", "action": "short action", "details": "explanation"}]
  },
  "sunlight": "full_sun|partial_sun|partial_shade|full_shade",
  "usda_zone": "zone string e.g. 9b"
}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [{
            role: 'user',
            content: [
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
              { type: 'text', text: prompt }
            ]
          }],
          temperature: 0.3,
          max_tokens: 1500,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errBody = await response.text();
        console.error('Groq API error:', response.status, errBody);
        return res.status(503).json({ error: 'AI analysis failed', details: `Groq returned ${response.status}` });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      if (!content) return res.status(503).json({ error: 'AI returned empty response' });

      // Parse JSON robustly - strip markdown code blocks
      let jsonStr = content.trim();
      jsonStr = jsonStr.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      // Try to find JSON object
      const firstBrace = jsonStr.indexOf('{');
      const lastBrace = jsonStr.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
      }

      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseErr) {
        console.error('Failed to parse AI response:', content);
        return res.status(503).json({ error: 'AI returned invalid JSON', raw: content });
      }

      res.json(parsed);
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr.name === 'AbortError') {
        return res.status(503).json({ error: 'AI analysis timed out (15s)' });
      }
      throw fetchErr;
    } finally {
      // Clean up uploaded file
      try { fs.unlinkSync(req.file.path); } catch (e) {}
    }
  } catch (err) {
    console.error('AI analyze error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
