#!/usr/bin/env node
/**
 * Standalone script to create a capture for user_id=1 (Ali).
 *
 * Usage:
 *   node create-capture.js "raw text input" [--tags tag1,tag2] [--lat 37.3] [--lng -122.0] [--shared]
 *
 * Examples:
 *   node create-capture.js "lunch at dishdash with saba"
 *   node create-capture.js "https://example.com cool article"
 *   node create-capture.js "buy: milk, eggs, bread" --tags shopping,groceries
 */

const path = require('path');

// Load env from server root
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { pool } = require('../db');
const { createCapture } = require('../services/captures-service');

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = { rawInput: null, tags: [], lat: null, lng: null, shared: false };

  let i = 0;
  // First non-flag arg is raw input
  while (i < args.length) {
    if (args[i] === '--tags' && args[i + 1]) {
      result.tags = args[i + 1].split(',').map(t => t.trim()).filter(Boolean);
      i += 2;
    } else if (args[i] === '--lat' && args[i + 1]) {
      result.lat = parseFloat(args[i + 1]);
      i += 2;
    } else if (args[i] === '--lng' && args[i + 1]) {
      result.lng = parseFloat(args[i + 1]);
      i += 2;
    } else if (args[i] === '--shared') {
      result.shared = true;
      i++;
    } else if (!result.rawInput) {
      result.rawInput = args[i];
      i++;
    } else {
      i++;
    }
  }

  return result;
}

async function main() {
  const { rawInput, tags, lat, lng, shared } = parseArgs(process.argv);

  if (!rawInput) {
    console.error('Usage: node create-capture.js "raw text" [--tags t1,t2] [--lat N] [--lng N] [--shared]');
    process.exit(1);
  }

  try {
    const data = {
      raw_input: rawInput,
      tags,
      shared,
    };
    if (lat != null) data.latitude = lat;
    if (lng != null) data.longitude = lng;

    const capture = await createCapture(1, data);
    console.log(JSON.stringify(capture, null, 2));
  } catch (err) {
    console.error('Error creating capture:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
