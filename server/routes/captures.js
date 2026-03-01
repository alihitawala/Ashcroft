const { Router } = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const capturesService = require('../services/captures-service');

const router = Router();

// ─── Multer Setup ───

const UPLOADS_DIR = '/home/ashcroft/www/app/uploads/captures';
const THUMBS_DIR = path.join(UPLOADS_DIR, 'thumbs');

// Ensure directories exist
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(THUMBS_DIR, { recursive: true });

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (req, file, cb) => {
    const id = req.params.id || 'new';
    const ts = Date.now();
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `capture_${id}_${ts}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed: jpg, png, webp, gif'));
    }
  },
});

// ─── Thumbnail Helper ───

async function generateThumbnail(srcPath, captureId) {
  const ts = Date.now();
  const thumbFilename = `capture_${captureId}_${ts}_thumb.jpg`;
  const thumbPath = path.join(THUMBS_DIR, thumbFilename);
  // Auto-rotate original based on EXIF orientation first
  const rotatedBuf = await sharp(srcPath).rotate().toBuffer();
  await fs.promises.writeFile(srcPath, rotatedBuf);

  await sharp(srcPath)
    .resize(400, null, { withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toFile(thumbPath);
  return `/app/uploads/captures/thumbs/${thumbFilename}`;
}

function cleanupFile(filePath) {
  try { if (filePath) fs.unlinkSync(filePath); } catch (e) { /* ignore */ }
}

// ─── EXIF Metadata Extraction ───
async function extractExifMetadata(filePath) {
  try {
    const metadata = await sharp(filePath).metadata();
    const exif = {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      space: metadata.space,
      density: metadata.density,
    };
    // Extract GPS from EXIF if available
    if (metadata.exif) {
      try {
        const ExifReader = require('exif-reader');
        const parsed = ExifReader(metadata.exif);
        if (parsed?.gps?.GPSLatitude && parsed?.gps?.GPSLongitude) {
          exif.lat = parsed.gps.GPSLatitude;
          exif.lng = parsed.gps.GPSLongitude;
        }
        if (parsed?.image?.Make) exif.cameraMake = parsed.image.Make;
        if (parsed?.image?.Model) exif.cameraModel = parsed.image.Model;
        if (parsed?.exif?.DateTimeOriginal) exif.dateTaken = parsed.exif.DateTimeOriginal;
      } catch (e) { /* exif parsing optional */ }
    }
    return exif;
  } catch (e) {
    console.error('EXIF extraction failed:', e.message);
    return {};
  }
}

// ─── Image Analysis via Vision AI ───
async function analyzeImage(filePath) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return null;

  try {
    const imageBuffer = await fs.promises.readFile(filePath);
    const base64 = imageBuffer.toString('base64');
    const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${groqKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: `Analyze this image. Return ONLY valid JSON, no explanation:
{"description":"1-2 sentence natural description of what's in the image","tags":["tag1","tag2","tag3"]}

Rules:
- Description should be specific and useful (what, where, who if recognizable, mood/setting)
- Tags: 2-4 MAXIMUM, only the most relevant. Use lowercase single words.
- Good tags: specific subjects (sunset, garden, food, beach, dog, birthday, concert)
- Bad tags: generic/obvious (photo, image, picture, nice, good)
- If you see food, name the dish type. If you see a place, name the type of place.
- If you see plants/garden, identify plant types if possible.` },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } }
          ]
        }],
        temperature: 0.2,
        max_tokens: 200,
      }),
    });
    clearTimeout(timeout);

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Image analysis failed:', e.message);
    return null;
  }
}

// ─── Captures ───

router.get('/recent', async (req, res) => {
  try {
    const captures = await capturesService.getRecentCaptures(req.user.id, 5);
    res.json(captures);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await capturesService.getCaptures(req.user.id, req.query);
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/', upload.single('image'), async (req, res) => {
  try {
    const data = req.body;

    // Parse tags if sent as JSON string (multipart sends strings)
    if (typeof data.tags === 'string') {
      try { data.tags = JSON.parse(data.tags); } catch (e) { data.tags = []; }
    }
    if (typeof data.checklist === 'string') {
      try { data.checklist = JSON.parse(data.checklist); } catch (e) { data.checklist = null; }
    }
    // Parse booleans from multipart
    if (typeof data.shared === 'string') data.shared = data.shared === 'true';
    if (typeof data.pinned === 'string') data.pinned = data.pinned === 'true';

    // If file uploaded, set type to photo
    if (req.file) {
      data.type = data.type || 'photo';
    }

    const capture = await capturesService.createCapture(req.user.id, data);

    // Handle image upload after creation (need the ID)
    if (req.file) {
      try {
        // Rename file with actual capture ID
        const ext = path.extname(req.file.filename);
        const ts = Date.now();
        const newFilename = `capture_${capture.id}_${ts}${ext}`;
        const newPath = path.join(UPLOADS_DIR, newFilename);
        fs.renameSync(req.file.path, newPath);

        const imagePath = `/app/uploads/captures/${newFilename}`;
        const thumbPath = await generateThumbnail(newPath, capture.id);

        // Extract EXIF metadata
        const exifData = await extractExifMetadata(newPath);

        // Update capture with image paths + metadata
        const updateData = {
          image_path: imagePath,
          image_thumb_path: thumbPath,
          image_metadata: exifData,
        };

        // Use EXIF GPS if capture has no location
        if (!data.latitude && exifData.lat && exifData.lng) {
          updateData.latitude = exifData.lat;
          updateData.longitude = exifData.lng;
        }

        const updated = await capturesService.updateCapture(req.user.id, capture.id, updateData);

        // Analyze image with vision AI in background (don't block response)
        analyzeImage(newPath).then(async (analysis) => {
          if (!analysis) return;
          const aiUpdate = {};
          if (analysis.description) aiUpdate.image_description = analysis.description;

          // Merge AI tags with existing tags
          if (analysis.tags && analysis.tags.length) {
            const existingTags = (updated.tags || []).map(t => t.name);
            const newTags = [...new Set([...existingTags, ...analysis.tags])];
            aiUpdate.tags = newTags;
          }

          if (Object.keys(aiUpdate).length) {
            await capturesService.updateCapture(req.user.id, capture.id, aiUpdate);
            console.log(`[Captures] AI analysis complete for #${capture.id}: ${analysis.description?.slice(0,60)}...`);
          }
        }).catch(e => console.error('Background image analysis error:', e.message));

        return res.status(201).json(updated);
      } catch (imgErr) {
        console.error('Image processing failed:', imgErr);
        cleanupFile(req.file.path);
        // Still return the capture, just without image
      }
    }

    res.status(201).json(capture);
  } catch (err) {
    if (req.file) cleanupFile(req.file.path);
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const capture = await capturesService.getCaptureById(req.user.id, parseInt(req.params.id));
    if (!capture) return res.status(404).json({ error: 'Not found' });
    res.json(capture);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const capture = await capturesService.updateCapture(req.user.id, parseInt(req.params.id), req.body);
    if (!capture) return res.status(404).json({ error: 'Not found' });
    res.json(capture);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const hard = req.query.hard === 'true';
    const capture = await capturesService.deleteCapture(req.user.id, parseInt(req.params.id), hard);
    if (!capture) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Image Upload for Existing Capture ───

router.post('/:id/image', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });

  const captureId = parseInt(req.params.id);
  try {
    // Verify capture exists and belongs to user
    const existing = await capturesService.getCaptureById(req.user.id, captureId);
    if (!existing) {
      cleanupFile(req.file.path);
      return res.status(404).json({ error: 'Capture not found' });
    }

    const imagePath = `/app/uploads/captures/${req.file.filename}`;
    const thumbPath = await generateThumbnail(req.file.path, captureId);

    const updated = await capturesService.updateCapture(req.user.id, captureId, {
      image_path: imagePath,
      image_thumb_path: thumbPath,
    });

    res.json(updated);
  } catch (err) {
    cleanupFile(req.file.path);
    console.error(err);
    res.status(500).json({ error: 'Image upload failed' });
  }
});

// ─── Link Preview ───

router.post('/preview-link', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });
    const preview = await capturesService.fetchLinkPreview(url);
    res.json(preview);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Tags ───

router.get('/tags/all', async (req, res) => {
  try {
    const tags = await capturesService.getTags(req.user.id);
    res.json(tags);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/tags', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const tag = await capturesService.createTag(req.user.id, req.body);
    res.status(201).json(tag);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Tag already exists' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/tags/:id', async (req, res) => {
  try {
    const tag = await capturesService.updateTag(req.user.id, parseInt(req.params.id), req.body);
    if (!tag) return res.status(404).json({ error: 'Not found' });
    res.json(tag);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/tags/:id', async (req, res) => {
  try {
    const tag = await capturesService.deleteTag(req.user.id, parseInt(req.params.id));
    if (!tag) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Multer Error Handler ───

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
