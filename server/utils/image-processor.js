const sharp = require('sharp');
const exifr = require('exifr');
const path = require('path');
const fs = require('fs').promises;
const { encode } = require('blurhash');
const { createCanvas, loadImage } = require('canvas');

const UPLOADS_BASE = '/home/ashcroft/www/public/uploads/photos';
const THUMB_DIR = path.join(UPLOADS_BASE, 'thumbnails');
const MEDIUM_DIR = path.join(UPLOADS_BASE, 'medium');

async function ensureDirs() {
    await fs.mkdir(THUMB_DIR, { recursive: true });
    await fs.mkdir(MEDIUM_DIR, { recursive: true });
}

async function processImage(filePath, filename) {
    await ensureDirs();
    const result = {};

    // Get image metadata and buffer
    const image = sharp(filePath);
    const metadata = await image.metadata();
    result.width = metadata.width;
    result.height = metadata.height;
    const stat = await fs.stat(filePath);
    result.file_size = stat.size;
    result.mime_type = `image/${metadata.format}`;

    // Generate thumbnail (300px wide)
    const thumbName = `thumb_${filename}`;
    const thumbPath = path.join(THUMB_DIR, thumbName);
    await sharp(filePath)
        .resize(300, null, { withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(thumbPath);
    result.thumbnail_path = `/uploads/photos/thumbnails/${thumbName}`;

    // Generate medium (1200px wide)
    const medName = `med_${filename}`;
    const medPath = path.join(MEDIUM_DIR, medName);
    await sharp(filePath)
        .resize(1200, null, { withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(medPath);
    result.medium_path = `/uploads/photos/medium/${medName}`;

    // Extract EXIF
    try {
        const exif = await exifr.parse(filePath, {
            pick: ['DateTimeOriginal', 'Make', 'Model', 'LensModel', 'FocalLength',
                   'FNumber', 'ExposureTime', 'ISO', 'GPSLatitude', 'GPSLongitude',
                   'FocalLengthIn35mmFormat'],
            gps: true,
        });
        if (exif) {
            result.taken_at = exif.DateTimeOriginal || null;
            const make = exif.Make ? exif.Make.trim() : '';
            const model = exif.Model ? exif.Model.trim() : '';
            result.camera_model = model.startsWith(make) ? model : `${make} ${model}`.trim() || null;
            result.lens = exif.LensModel || null;
            result.focal_length = exif.FocalLength ? `${Math.round(exif.FocalLength)}mm` : null;
            result.aperture = exif.FNumber ? `f/${exif.FNumber}` : null;
            result.shutter_speed = exif.ExposureTime
                ? (exif.ExposureTime < 1 ? `1/${Math.round(1/exif.ExposureTime)}s` : `${exif.ExposureTime}s`)
                : null;
            result.iso = exif.ISO || null;
            result.gps_lat = exif.latitude || null;
            result.gps_lon = exif.longitude || null;
        }
    } catch (e) {
        console.error('EXIF extraction failed:', e.message);
    }

    // Generate blurhash
    try {
        const smallBuf = await sharp(filePath)
            .resize(32, 32, { fit: 'inside' })
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
        const { data, info } = smallBuf;
        result.blurhash = encode(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
    } catch (e) {
        console.error('Blurhash failed:', e.message);
        result.blurhash = null;
    }

    // Extract dominant colors
    try {
        const { dominant } = await sharp(filePath).stats();
        // Get palette by resizing small and sampling
        const pixels = await sharp(filePath)
            .resize(8, 8, { fit: 'cover' })
            .raw()
            .toBuffer();
        const colors = [];
        for (let i = 0; i < pixels.length; i += 3) {
            colors.push(`#${pixels[i].toString(16).padStart(2,'0')}${pixels[i+1].toString(16).padStart(2,'0')}${pixels[i+2].toString(16).padStart(2,'0')}`);
        }
        // Deduplicate roughly
        const unique = [...new Set(colors)].slice(0, 5);
        result.dominant_colors = {
            primary: `#${dominant.r.toString(16).padStart(2,'0')}${dominant.g.toString(16).padStart(2,'0')}${dominant.b.toString(16).padStart(2,'0')}`,
            palette: unique,
        };
    } catch (e) {
        console.error('Color extraction failed:', e.message);
        result.dominant_colors = null;
    }

    return result;
}

module.exports = { processImage, UPLOADS_BASE };
