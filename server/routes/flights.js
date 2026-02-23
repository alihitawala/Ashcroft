const { Router } = require('express');
const https = require('https');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

// ─── Amadeus helpers ───
let amadeusToken = null;
let amadeusTokenExpiry = 0;

function amadeusRequest(path, options = {}) {
  return new Promise((resolve, reject) => {
    const isTest = (process.env.AMADEUS_ENV || 'test') === 'test';
    const host = isTest ? 'test.api.amadeus.com' : 'api.amadeus.com';
    const opts = {
      hostname: host,
      path,
      method: options.method || 'GET',
      headers: { ...options.headers },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function getAmadeusToken() {
  if (amadeusToken && Date.now() < amadeusTokenExpiry - 60000) return amadeusToken;
  const isTest = (process.env.AMADEUS_ENV || 'test') === 'test';
  const key = isTest ? process.env.AMADEUS_TEST_API_KEY : process.env.AMADEUS_PROD_API_KEY;
  const secret = isTest ? process.env.AMADEUS_TEST_API_SECRET : process.env.AMADEUS_PROD_API_SECRET;
  if (!key || !secret) throw new Error('Amadeus API keys not configured');
  const body = `grant_type=client_credentials&client_id=${key}&client_secret=${secret}`;
  const res = await amadeusRequest('/v1/security/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (res.status !== 200) throw new Error(`Amadeus auth failed: ${JSON.stringify(res.data)}`);
  amadeusToken = res.data.access_token;
  amadeusTokenExpiry = Date.now() + (res.data.expires_in * 1000);
  return amadeusToken;
}

async function searchFlights(watch) {
  const token = await getAmadeusToken();
  const params = new URLSearchParams({
    originLocationCode: watch.origin,
    destinationLocationCode: watch.destination,
    departureDate: watch.depart_date_from.toISOString().split('T')[0],
    adults: String(watch.passengers || 1),
    currencyCode: 'USD',
    max: '10',
    nonStop: 'false',
  });
  if (watch.cabin_class && watch.cabin_class !== 'economy') {
    const cabinMap = { 'premium economy': 'PREMIUM_ECONOMY', 'business': 'BUSINESS', 'first': 'FIRST' };
    params.set('travelClass', cabinMap[watch.cabin_class] || 'ECONOMY');
  }
  const res = await amadeusRequest(`/v2/shopping/flight-offers?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) throw new Error(`Amadeus search failed: ${JSON.stringify(res.data)}`);
  return res.data;
}

function parseAmadeusOffers(data, watch) {
  if (!data.data || !data.data.length) return [];
  const dictionaries = data.dictionaries || {};
  const carrierNames = dictionaries.carriers || {};

  return data.data.map(offer => {
    const price = parseFloat(offer.price.total);
    const segs = offer.itineraries[0].segments;
    const totalDuration = parseDuration(offer.itineraries[0].duration);
    const airlines = [...new Set(segs.map(s => s.carrierCode))].join(', ');
    const airlineNames = [...new Set(segs.map(s => carrierNames[s.carrierCode] || s.carrierCode))].join(', ');
    const stops = segs.length - 1;
    const route = segs.map(s => s.departure.iataCode).concat(segs[segs.length - 1].arrival.iataCode).join(' → ');

    // Build detailed segments array
    const segments = segs.map((s, i) => {
      const seg = {
        carrier: s.carrierCode,
        carrierName: carrierNames[s.carrierCode] || s.carrierCode,
        flightNumber: s.carrierCode + s.number,
        aircraft: s.aircraft?.code || null,
        from: s.departure.iataCode,
        fromTerminal: s.departure.terminal || null,
        departAt: s.departure.at,
        to: s.arrival.iataCode,
        toTerminal: s.arrival.terminal || null,
        arriveAt: s.arrival.at,
        duration: s.duration ? parseDuration(s.duration) : null,
      };
      // Calculate layover to next segment
      if (i < segs.length - 1) {
        const arrTime = new Date(s.arrival.at).getTime();
        const nextDepTime = new Date(segs[i + 1].departure.at).getTime();
        seg.layoverMin = Math.round((nextDepTime - arrTime) / 60000);
        seg.layoverCity = s.arrival.iataCode;
      }
      return seg;
    });

    return {
      price, currency: offer.price.currency || 'USD',
      airline: airlines, airline_names: airlineNames,
      stops, duration_min: totalDuration,
      outbound_departure: segs[0].departure.at,
      outbound_arrival: segs[segs.length - 1].arrival.at,
      route_summary: route,
      segments,
      source: 'amadeus',
      raw_data: offer,
    };
  }).filter(offer => {
    // Apply max_stops filter
    if (watch.max_stops != null && offer.stops > watch.max_stops) return false;
    return true;
  });
}

function parseDuration(iso) {
  // PT19H30M → 1170
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  return (parseInt(m?.[1] || 0) * 60) + parseInt(m?.[2] || 0);
}

const ACCESS_FILTER = `(
  (fw.access = 'private' AND fw.user_id = $1) OR
  (fw.access = 'household' AND fw.user_id IN (SELECT id FROM users WHERE household_id = $2)) OR
  (fw.access = 'admin' AND $3 = 'admin')
)`;

// ─── List watches ───
router.get('/watches', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT fw.*,
        (SELECT price FROM flight_prices WHERE watch_id = fw.id AND is_best_price = true ORDER BY fetched_at DESC LIMIT 1) as best_price,
        (SELECT airline FROM flight_prices WHERE watch_id = fw.id AND is_best_price = true ORDER BY fetched_at DESC LIMIT 1) as best_price_airline,
        (SELECT duration_min FROM flight_prices WHERE watch_id = fw.id AND is_best_duration = true ORDER BY fetched_at DESC LIMIT 1) as best_duration,
        (SELECT airline FROM flight_prices WHERE watch_id = fw.id AND is_best_duration = true ORDER BY fetched_at DESC LIMIT 1) as best_duration_airline,
        (SELECT fetched_at FROM flight_prices WHERE watch_id = fw.id ORDER BY fetched_at DESC LIMIT 1) as last_checked,
        (SELECT price FROM flight_prices WHERE watch_id = fw.id ORDER BY fetched_at DESC LIMIT 1) as latest_price,
        (SELECT price FROM flight_prices WHERE watch_id = fw.id ORDER BY fetched_at DESC LIMIT 1 OFFSET 1) as previous_price
      FROM flight_watches fw
      WHERE ${ACCESS_FILTER}
      ORDER BY fw.created_at DESC`,
      [req.user.id, req.user.household_id, req.user.role]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Create watch ───
router.post('/watches', async (req, res) => {
  try {
    const {
      origin, origin_name, destination, destination_name,
      depart_date_from, depart_date_to, return_date_from, return_date_to,
      trip_type = 'one-way', passengers = 1, cabin_class = 'economy',
      max_price, max_stops, nearby_airports = false, access = 'private'
    } = req.body;

    if (!origin || !destination || !depart_date_from) {
      return res.status(400).json({ error: 'Origin, destination, and departure date are required' });
    }

    const result = await pool.query(
      `INSERT INTO flight_watches
        (user_id, origin, origin_name, destination, destination_name,
         depart_date_from, depart_date_to, return_date_from, return_date_to,
         trip_type, passengers, cabin_class, max_price, max_stops, nearby_airports, access, household_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [req.user.id, origin.toUpperCase(), origin_name, destination.toUpperCase(), destination_name,
       depart_date_from, depart_date_to || null, return_date_from || null, return_date_to || null,
       trip_type, passengers, cabin_class, max_price || null, max_stops != null ? max_stops : null, nearby_airports, access, req.user.household_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Update watch ───
router.put('/watches/:id', async (req, res) => {
  try {
    const fields = ['origin', 'origin_name', 'destination', 'destination_name',
      'depart_date_from', 'depart_date_to', 'return_date_from', 'return_date_to',
      'trip_type', 'passengers', 'cabin_class', 'max_price', 'max_stops', 'nearby_airports', 'active', 'access'];
    const sets = [];
    const params = [req.user.id, req.user.household_id, req.user.role, req.params.id];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        let val = req.body[f];
        if (f === 'origin' || f === 'destination') val = val.toUpperCase();
        params.push(val);
        sets.push(`${f}=$${params.length}`);
      }
    }
    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });
    sets.push('updated_at=NOW()');

    const result = await pool.query(
      `UPDATE flight_watches fw SET ${sets.join(', ')}
       WHERE fw.id=$4 AND ${ACCESS_FILTER} RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Delete watch ───
router.delete('/watches/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM flight_watches fw WHERE fw.id=$4 AND ${ACCESS_FILTER} RETURNING *`,
      [req.user.id, req.user.household_id, req.user.role, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Price history ───
router.get('/watches/:id/prices', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;
    // Verify access
    const watch = await pool.query(
      `SELECT fw.id FROM flight_watches fw WHERE fw.id=$4 AND ${ACCESS_FILTER}`,
      [req.user.id, req.user.household_id, req.user.role, req.params.id]
    );
    if (!watch.rows[0]) return res.status(404).json({ error: 'Not found' });

    const result = await pool.query(
      `SELECT * FROM flight_prices WHERE watch_id=$1 ORDER BY fetched_at DESC LIMIT $2 OFFSET $3`,
      [req.params.id, limit, offset]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Best price + duration ───
router.get('/watches/:id/best', async (req, res) => {
  try {
    const watch = await pool.query(
      `SELECT fw.id FROM flight_watches fw WHERE fw.id=$4 AND ${ACCESS_FILTER}`,
      [req.user.id, req.user.household_id, req.user.role, req.params.id]
    );
    if (!watch.rows[0]) return res.status(404).json({ error: 'Not found' });

    const bestPrice = await pool.query(
      `SELECT * FROM flight_prices WHERE watch_id=$1 AND is_best_price=true ORDER BY fetched_at DESC LIMIT 1`,
      [req.params.id]
    );
    const bestDuration = await pool.query(
      `SELECT * FROM flight_prices WHERE watch_id=$1 AND is_best_duration=true ORDER BY fetched_at DESC LIMIT 1`,
      [req.params.id]
    );
    res.json({
      best_price: bestPrice.rows[0] || null,
      best_duration: bestDuration.rows[0] || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Add price manually ───
router.post('/watches/:id/prices', async (req, res) => {
  try {
    const watch = await pool.query(
      `SELECT fw.id FROM flight_watches fw WHERE fw.id=$4 AND ${ACCESS_FILTER}`,
      [req.user.id, req.user.household_id, req.user.role, req.params.id]
    );
    if (!watch.rows[0]) return res.status(404).json({ error: 'Not found' });

    const {
      price, currency = 'USD', airline, airlines, stops = 0, duration_min,
      outbound_departure, outbound_arrival, return_departure, return_arrival,
      route_summary, booking_url, source = 'manual'
    } = req.body;

    if (!price) return res.status(400).json({ error: 'Price is required' });

    // Check if this is best price or best duration
    const existing = await pool.query(
      `SELECT MIN(price) as min_price, MIN(duration_min) as min_duration FROM flight_prices WHERE watch_id=$1`,
      [req.params.id]
    );
    const is_best_price = !existing.rows[0].min_price || parseFloat(price) <= parseFloat(existing.rows[0].min_price);
    const is_best_duration = duration_min && (!existing.rows[0].min_duration || duration_min <= existing.rows[0].min_duration);

    // If new best, unset old bests
    if (is_best_price) await pool.query(`UPDATE flight_prices SET is_best_price=false WHERE watch_id=$1`, [req.params.id]);
    if (is_best_duration) await pool.query(`UPDATE flight_prices SET is_best_duration=false WHERE watch_id=$1`, [req.params.id]);

    const result = await pool.query(
      `INSERT INTO flight_prices
        (watch_id, price, currency, airline, airlines, stops, duration_min,
         outbound_departure, outbound_arrival, return_departure, return_arrival,
         route_summary, booking_url, source, is_best_price, is_best_duration)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       RETURNING *`,
      [req.params.id, price, currency, airline, airlines, stops, duration_min || null,
       outbound_departure || null, outbound_arrival || null, return_departure || null, return_arrival || null,
       route_summary || null, booking_url || null, source, is_best_price, !!is_best_duration]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Check prices (Amadeus) ───
router.post('/watches/:id/check', async (req, res) => {
  try {
    const watch = await pool.query(
      `SELECT fw.* FROM flight_watches fw WHERE fw.id=$4 AND ${ACCESS_FILTER}`,
      [req.user.id, req.user.household_id, req.user.role, req.params.id]
    );
    if (!watch.rows[0]) return res.status(404).json({ error: 'Not found' });
    const w = watch.rows[0];

    const data = await searchFlights(w);
    const offers = parseAmadeusOffers(data, w);
    if (!offers.length) return res.json({ message: 'No flights found', saved: 0 });

    // Pick best price and best duration
    const bestByPrice = offers.reduce((a, b) => a.price < b.price ? a : b);
    const bestByDuration = offers.reduce((a, b) => (a.duration_min || 9999) < (b.duration_min || 9999) ? a : b);

    // Save best price offer
    const saved = [];
    for (const offer of [bestByPrice, bestByDuration]) {
      if (saved.find(s => s.price === offer.price && s.duration_min === offer.duration_min)) continue;
      const existing = await pool.query(
        `SELECT MIN(price) as min_price, MIN(duration_min) as min_duration FROM flight_prices WHERE watch_id=$1`,
        [w.id]
      );
      const isBest = !existing.rows[0].min_price || offer.price <= parseFloat(existing.rows[0].min_price);
      const isBestDur = offer.duration_min && (!existing.rows[0].min_duration || offer.duration_min <= existing.rows[0].min_duration);

      if (isBest) await pool.query(`UPDATE flight_prices SET is_best_price=false WHERE watch_id=$1`, [w.id]);
      if (isBestDur) await pool.query(`UPDATE flight_prices SET is_best_duration=false WHERE watch_id=$1`, [w.id]);

      const r = await pool.query(
        `INSERT INTO flight_prices (watch_id, price, currency, airline, stops, duration_min,
         outbound_departure, outbound_arrival, route_summary, source, is_best_price, is_best_duration, raw_data, segments)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [w.id, offer.price, offer.currency, offer.airline, offer.stops, offer.duration_min,
         offer.outbound_departure, offer.outbound_arrival, offer.route_summary, offer.source,
         isBest, !!isBestDur, JSON.stringify(offer.raw_data), JSON.stringify(offer.segments)]
      );
      saved.push(r.rows[0]);
    }

    res.json({ message: `Found ${offers.length} offers, saved ${saved.length}`, offers: offers.length, saved: saved.length, results: saved });
  } catch (err) {
    console.error('Flight check error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Check ALL active watches (for cron) ───
router.post('/check-all', async (req, res) => {
  try {
    const watches = await pool.query(`SELECT * FROM flight_watches WHERE active=true`);
    const results = [];
    for (const w of watches.rows) {
      try {
        const data = await searchFlights(w);
        const offers = parseAmadeusOffers(data, w);
        if (!offers.length) { results.push({ watch_id: w.id, status: 'no offers' }); continue; }

        const bestByPrice = offers.reduce((a, b) => a.price < b.price ? a : b);
        const bestByDuration = offers.reduce((a, b) => (a.duration_min || 9999) < (b.duration_min || 9999) ? a : b);

        for (const offer of [bestByPrice, bestByDuration]) {
          const existing = await pool.query(
            `SELECT MIN(price) as min_price, MIN(duration_min) as min_duration FROM flight_prices WHERE watch_id=$1`,
            [w.id]
          );
          const isBest = !existing.rows[0].min_price || offer.price <= parseFloat(existing.rows[0].min_price);
          const isBestDur = offer.duration_min && (!existing.rows[0].min_duration || offer.duration_min <= existing.rows[0].min_duration);
          if (isBest) await pool.query(`UPDATE flight_prices SET is_best_price=false WHERE watch_id=$1`, [w.id]);
          if (isBestDur) await pool.query(`UPDATE flight_prices SET is_best_duration=false WHERE watch_id=$1`, [w.id]);

          await pool.query(
            `INSERT INTO flight_prices (watch_id, price, currency, airline, stops, duration_min,
             outbound_departure, outbound_arrival, route_summary, source, is_best_price, is_best_duration, raw_data, segments)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
            [w.id, offer.price, offer.currency, offer.airline, offer.stops, offer.duration_min,
             offer.outbound_departure, offer.outbound_arrival, offer.route_summary, offer.source,
             isBest, !!isBestDur, JSON.stringify(offer.raw_data), JSON.stringify(offer.segments)]
          );
        }
        results.push({ watch_id: w.id, status: 'ok', offers: offers.length });
      } catch (e) {
        results.push({ watch_id: w.id, status: 'error', error: e.message });
      }
    }
    res.json({ checked: results.length, results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
