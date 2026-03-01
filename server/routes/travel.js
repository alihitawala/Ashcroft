const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

// ─── Geocode Proxy (avoids CORS) ───
router.get('/geocode', async (req, res) => {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json([]);
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1&accept-language=en`;
        const resp = await fetch(url, { headers: { 'User-Agent': 'ashcroft-cloud/1.0' } });
        const data = await resp.json();
        const results = data.map(r => {
            const a = r.address || {};
            const place = a.city || a.town || a.village || a.state || r.name || '';
            const country = a.country || '';
            return { place, country, display: r.display_name, lat: r.lat, lon: r.lon };
        });
        res.json(results);
    } catch (e) {
        res.json([]);
    }
});

// ─── Helper: fetch with timeout ───
async function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        return res;
    } finally {
        clearTimeout(timer);
    }
}

// ─── Helper: Extract JSON from potentially messy AI response ───
function extractJSON(text) {
    // Strip markdown code blocks
    let cleaned = text.replace(/```json?\s*/gi, '').replace(/```/g, '').trim();
    // Find first { to last }
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
        throw new Error('No JSON object found in response');
    }
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    return JSON.parse(cleaned);
}

// ─── Helper: Fetch Wikipedia Image ───
const WIKI_HEADERS = { 'User-Agent': 'ashcroft-cloud/1.0 (ali@ashcroft.cloud)', 'Accept': 'application/json' };

async function wikiImage(query) {
    try {
        const title = query.replace(/ /g, '_');
        const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=pageimages&pithumbsize=800&format=json&origin=*`;
        const resp = await fetch(url, { headers: WIKI_HEADERS });
        const text = await resp.text();
        const data = JSON.parse(text);
        const pages = data.query?.pages || {};
        for (const pid of Object.keys(pages)) {
            const src = pages[pid]?.thumbnail?.source;
            if (src) return src;
        }
        // Fallback: search
        const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1&prop=pageimages&pithumbsize=800&format=json&origin=*`;
        const resp2 = await fetch(searchUrl, { headers: WIKI_HEADERS });
        const text2 = await resp2.text();
        const data2 = JSON.parse(text2);
        const pages2 = data2.query?.pages || {};
        for (const pid of Object.keys(pages2)) {
            const src = pages2[pid]?.thumbnail?.source;
            if (src) return src;
        }
        return null;
    } catch (e) {
        console.log('[Travel] wikiImage error for:', query, e.message);
        return null;
    }
}

// ─── List Trips ───
router.get('/trips', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, destination, country, source_city, hero_image, status, created_at, updated_at
             FROM travel_trips WHERE user_id = $1 ORDER BY updated_at DESC`,
            [req.user.id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Create Trip ───
router.post('/trips', async (req, res) => {
    try {
        const { destination, country, start_date, end_date, num_days, source_city } = req.body;
        if (!destination || typeof destination !== 'string' || destination.trim().length === 0) {
            return res.status(400).json({ error: 'Destination is required' });
        }
        if (destination.length > 200) {
            return res.status(400).json({ error: 'Destination too long (max 200 chars)' });
        }
        const days = num_days ? Math.min(Math.max(parseInt(num_days), 1), 14) : 5;
        const { rows } = await pool.query(
            `INSERT INTO travel_trips (user_id, destination, country, start_date, end_date, num_days, source_city)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [req.user.id, destination.trim(), country ? country.trim() : null, start_date || null, end_date || null, days, source_city ? source_city.trim() : null]
        );
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Get Full Trip ───
router.get('/trips/:id', async (req, res) => {
    try {
        const tripId = req.params.id;
        const trip = await pool.query(
            'SELECT * FROM travel_trips WHERE id = $1 AND user_id = $2',
            [tripId, req.user.id]
        );
        if (!trip.rows[0]) return res.status(404).json({ error: 'Trip not found' });

        const days = await pool.query(
            'SELECT * FROM travel_days WHERE trip_id = $1 ORDER BY day_number',
            [tripId]
        );

        const dayIds = days.rows.map(d => d.id);
        let activities = [];
        if (dayIds.length) {
            const act = await pool.query(
                `SELECT * FROM travel_activities WHERE day_id = ANY($1) ORDER BY sort_order`,
                [dayIds]
            );
            activities = act.rows;
        }

        const restaurants = await pool.query(
            'SELECT * FROM travel_restaurants WHERE trip_id = $1', [tripId]
        );
        const stays = await pool.query(
            'SELECT * FROM travel_stays WHERE trip_id = $1', [tripId]
        );

        const daysWithActivities = days.rows.map(day => ({
            ...day,
            activities: activities.filter(a => a.day_id === day.id)
        }));

        res.json({
            ...trip.rows[0],
            days: daysWithActivities,
            restaurants: restaurants.rows,
            stays: stays.rows
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Update Trip ───
router.put('/trips/:id', async (req, res) => {
    try {
        const tripId = req.params.id;
        const { destination, country, status, hero_image, weather_summary, transport_notes, visa_info, packing_list, budget_estimate, source_city, flights_info } = req.body;
        const { rows } = await pool.query(
            `UPDATE travel_trips SET
                destination = COALESCE($3, destination),
                country = COALESCE($4, country),
                status = COALESCE($5, status),
                hero_image = COALESCE($6, hero_image),
                weather_summary = COALESCE($7, weather_summary),
                transport_notes = COALESCE($8, transport_notes),
                visa_info = COALESCE($9, visa_info),
                packing_list = COALESCE($10, packing_list),
                budget_estimate = COALESCE($11, budget_estimate),
                source_city = COALESCE($12, source_city),
                flights_info = COALESCE($13, flights_info),
                updated_at = NOW()
             WHERE id = $1 AND user_id = $2 RETURNING *`,
            [tripId, req.user.id, destination, country, status, hero_image, weather_summary, transport_notes, visa_info,
             packing_list ? JSON.stringify(packing_list) : null,
             budget_estimate ? JSON.stringify(budget_estimate) : null,
             source_city, flights_info]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Trip not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Update Single Activity ───
router.patch('/trips/:tripId/activities/:activityId', async (req, res) => {
    try {
        const { tripId, activityId } = req.params;

        // Verify trip ownership
        const trip = await pool.query(
            'SELECT id FROM travel_trips WHERE id = $1 AND user_id = $2',
            [tripId, req.user.id]
        );
        if (!trip.rows[0]) return res.status(404).json({ error: 'Trip not found' });

        // Verify activity belongs to this trip
        const actCheck = await pool.query(
            `SELECT a.id FROM travel_activities a
             JOIN travel_days d ON a.day_id = d.id
             WHERE a.id = $1 AND d.trip_id = $2`,
            [activityId, tripId]
        );
        if (!actCheck.rows[0]) return res.status(404).json({ error: 'Activity not found' });

        const fields = ['time_slot', 'title', 'description', 'location_name', 'address',
            'latitude', 'longitude', 'duration_hours', 'estimated_cost', 'currency',
            'category', 'tips', 'booking_url', 'image_url', 'sort_order'];

        const updates = [];
        const values = [activityId];
        let paramIdx = 2;

        for (const field of fields) {
            if (req.body[field] !== undefined) {
                updates.push(`${field} = $${paramIdx}`);
                values.push(req.body[field]);
                paramIdx++;
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        const { rows } = await pool.query(
            `UPDATE travel_activities SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
            values
        );

        // Update trip's updated_at
        await pool.query('UPDATE travel_trips SET updated_at = NOW() WHERE id = $1', [tripId]);

        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Delete Trip ───
router.delete('/trips/:id', async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            'DELETE FROM travel_trips WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Trip not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Generate Itinerary ───
router.post('/trips/:id/generate', async (req, res) => {
    const tripId = req.params.id;

    try {
        const trip = await pool.query(
            'SELECT * FROM travel_trips WHERE id = $1 AND user_id = $2',
            [tripId, req.user.id]
        );
        if (!trip.rows[0]) return res.status(404).json({ error: 'Trip not found' });

        const { destination, country, num_days: tripDays, source_city, start_date, end_date } = trip.rows[0];
        const numDays = tripDays || 5;
        if (!destination || destination.trim().length === 0) {
            return res.status(400).json({ error: 'Trip has no destination set' });
        }

        const dest = country ? `${destination}, ${country}` : destination;

        // Build date context
        let dateContext = '';
        if (start_date) {
            const startStr = new Date(start_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
            const endStr = end_date ? new Date(end_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;
            dateContext = endStr ? `Travel dates: ${startStr} to ${endStr}.` : `Starting: ${startStr}.`;
        }

        // Source city / flight context
        let flightContext = '';
        if (source_city) {
            flightContext = `Traveler is flying from ${source_city}. Include specific airport codes for departure and arrival, recommended airlines, typical flight duration, and approximate ticket prices in flights_info.`;
        }

        // Update status to planning
        await pool.query("UPDATE travel_trips SET status = 'planning', updated_at = NOW() WHERE id = $1", [tripId]);

        // ─── Brave Search Research ───
        const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY;
        let researchData = '';

        const searchQueries = [
            `top 20 things to do in ${dest} tourist attractions`,
            `best restaurants ${dest} local food must eat`,
            `how to get around ${dest} transport metro bus taxi apps`,
            `weather ${dest} what to pack clothing`,
            `travel budget ${dest} daily cost accommodation food`,
            `visa requirements ${dest} for US citizens entry`,
            `best hotels ${dest} budget mid-range luxury recommendations`,
            `hidden gems ${dest} off the beaten path local secrets`
        ];

        if (BRAVE_API_KEY) {
            const searchPromises = searchQueries.map(async (query) => {
                try {
                    const searchRes = await fetchWithTimeout(
                        `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`,
                        { headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': BRAVE_API_KEY } },
                        10000
                    );
                    const data = await searchRes.json();
                    if (data.web?.results) {
                        let section = `\n### ${query}\n`;
                        data.web.results.forEach(r => {
                            section += `- ${r.title}: ${r.description || ''}\n`;
                        });
                        return section;
                    }
                } catch (e) {
                    console.error('Brave search error:', e.message);
                }
                return '';
            });

            const results = await Promise.all(searchPromises);
            researchData = results.join('');
        }

        const researchBlock = researchData
            ? `\n\nHere is real-time research data about ${dest} from the web. Use this to make the itinerary accurate and specific:\n${researchData}`
            : `\nUse your knowledge to create a comprehensive, specific travel itinerary for ${dest}. Include real place names, real restaurant names, real hotel names, and accurate coordinates.`;

        // ─── Groq Generation ───
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) {
            await pool.query("UPDATE travel_trips SET status = 'draft', updated_at = NOW() WHERE id = $1", [tripId]);
            return res.status(500).json({ error: 'GROQ_API_KEY not configured' });
        }

        const prompt = `You are an elite travel planner and travel blogger creating a stunning ${numDays}-day itinerary for ${dest}.
${dateContext ? dateContext + '\n' : ''}${flightContext ? flightContext + '\n' : ''}${researchBlock}

Return ONLY valid JSON (no markdown, no code blocks, no explanation) matching this exact structure:
{
  "weather_summary": "Detailed weather for the trip dates including temperature ranges (highs/lows in °F and °C), humidity, rain likelihood, sunrise/sunset times, and what to expect each day",
  "transport_notes": "Specific transport info: airport name and code, distance to city center, metro/bus lines with costs, ride-hailing apps (Uber/Grab/etc), taxi fare estimates, day passes, tips for getting around cheaply and safely",
  "visa_info": "Visa requirements for US, EU, UK, and Australian citizens. Include visa-on-arrival info, costs, duration, and any gotchas",
  ${source_city ? '"flights_info": "Detailed flight info from ' + source_city + ': departure airport code, arrival airport code, recommended airlines (budget and premium), typical flight duration (direct and with stops), approximate round-trip ticket prices (economy and business), best booking tips, and layover city options if no direct flights",' : ''}
  "budget_estimate": {
    "budget_per_day_usd": 50,
    "mid_per_day_usd": 120,
    "luxury_per_day_usd": 300,
    "breakdown": "Detailed breakdown: budget ($X hotel + $X food + $X transport + $X activities = $X/day); mid-range ($X hotel + ...); luxury ($X hotel + ...)"
  },
  "packing_list": {
    "clothing": [{"name": "item", "reason": "why needed for this specific trip", "essential": true}],
    "electronics": [{"name": "item", "reason": "why", "essential": true}],
    "documents": [{"name": "item", "reason": "why", "essential": true}],
    "toiletries": [{"name": "item", "reason": "why", "essential": false}],
    "misc": [{"name": "item", "reason": "why", "essential": false}]
  },
  "days": [
    {
      "day_number": 1,
      "title": "Catchy theme title like 'Temple Hopping & Street Food Paradise' or 'Island Vibes & Sunset Magic'",
      "summary": "2-3 vivid sentences setting the scene for this day, written like a travel blog intro",
      "playlist": "Suggested playlist mood and 2-3 song suggestions that match the day's vibe",
      "activities": [
        {
          "time_slot": "morning",
          "title": "Specific place/activity name",
          "description": "Vivid 2-3 sentence description written like a travel blog. Paint a picture of the experience — sights, sounds, smells. Make the reader feel like they're there.",
          "location_name": "Exact venue/landmark name",
          "address": "Full street address",
          "latitude": 35.6762,
          "longitude": 139.6503,
          "duration_hours": 2.0,
          "estimated_cost": 15.00,
          "currency": "USD",
          "category": "sightseeing",
          "tips": "INSIDER TIP: Be specific — 'arrive before 7am to see monks chanting and avoid tour buses' or 'ask for the off-menu special yakitori set'. Include: best photo spot, what to wear/bring, booking requirements (advance booking needed? walk-in? tickets?), transit time from previous activity.",
          "image_search_query": "Senso-ji Temple Tokyo sunrise",
          "sort_order": 1
        }
      ]
    }
  ],
  "restaurants": [
    {
      "name": "Real restaurant name",
      "cuisine": "Specific cuisine type",
      "price_range": "$$",
      "address": "Full address",
      "latitude": 35.6762,
      "longitude": 139.6503,
      "description": "Atmosphere, vibe, what makes it special. Written engagingly.",
      "must_try_dishes": "Signature Dish 1 ($X) — why it's amazing, Signature Dish 2 ($X) — what makes it unique",
      "reservation_needed": false,
      "best_time": "Best time to visit and expected wait",
      "dress_code": "Casual / Smart casual / etc"
    }
  ],
  "stays": [
    {
      "name": "Real hotel/hostel name",
      "tier": "budget",
      "price_per_night": 40,
      "currency": "USD",
      "address": "Full address",
      "latitude": 35.6762,
      "longitude": 139.6503,
      "notes": "Neighborhood description and vibe, walkability score (X/10), nearby attractions within walking distance, breakfast included?, unique amenities, what makes this the best pick in its tier"
    }
  ]
}

IMPORTANT RULES:
- Generate EXACTLY ${numDays} days in the "days" array
- Each day MUST have exactly 3 activities: morning, afternoon, evening
- Each activity MUST have an "image_search_query" — a concise search phrase for finding a photo of that specific place (e.g. "Fushimi Inari Shrine Kyoto torii gates")
- Include 8-10 restaurants: mix of street food ($), casual ($$), upscale ($$$), and fine dining ($$$$)
- Include 3 stays: one budget/hostel, one mid-range, one luxury
- ALL coordinates must be realistic lat/lng for ${dest} (not 0,0!)
- ALL prices must be realistic for the local economy in USD equivalent
- Each day needs a catchy, unique theme title and a playlist suggestion
- Packing list should be grouped by category with 3-5 items each, tailored to this specific destination and weather
- Categories must be one of: sightseeing, culture, food, nature, shopping, nightlife, adventure
- Tips should be genuinely useful INSIDER knowledge — specific times, secret spots, local hacks. NOT generic advice.
- Each tip should mention: best photo spot, what to wear/bring, and whether advance booking is needed
- sort_order within each day: morning=1, afternoon=2, evening=3
- Descriptions should be vivid and blog-like — make the reader excited to visit
- Budget breakdown should be granular with specific examples`;

        async function callGroq(attempt = 1) {
            console.log(`[Travel] Groq generation attempt ${attempt} for trip ${tripId} (${dest})`);
            const groqRes = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${groqKey}`,
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: 'You are a world-class travel expert and blogger. Return ONLY valid JSON. No markdown, no code blocks, no explanation text before or after the JSON. The response must start with { and end with }.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.5,
                    max_tokens: 8000,
                }),
            }, 90000);

            if (!groqRes.ok) {
                const errBody = await groqRes.text();
                console.error(`[Travel] Groq API error (attempt ${attempt}):`, groqRes.status, errBody);
                throw new Error(`AI service error (${groqRes.status})`);
            }

            const groqData = await groqRes.json();
            const content = groqData.choices?.[0]?.message?.content;
            if (!content) throw new Error('AI returned empty response');

            try {
                return extractJSON(content);
            } catch (parseErr) {
                console.error(`[Travel] JSON parse error (attempt ${attempt}):`, parseErr.message, '\nFirst 500 chars:', content.substring(0, 500));
                if (attempt < 2) {
                    console.log('[Travel] Retrying generation...');
                    return callGroq(attempt + 1);
                }
                throw new Error('AI returned invalid format after 2 attempts');
            }
        }

        let itinerary;
        try {
            itinerary = await callGroq();
        } catch (err) {
            console.error('[Travel] Generation failed:', err.message);
            await pool.query("UPDATE travel_trips SET status = 'draft', updated_at = NOW() WHERE id = $1", [tripId]);
            if (err.name === 'AbortError') {
                return res.status(504).json({ error: 'AI generation timed out. Please try again.' });
            }
            return res.status(502).json({ error: err.message || 'Generation failed. Please try again.' });
        }

        // ─── Fetch Real Images from Wikipedia ───
        console.log('[Travel] Fetching images from Wikipedia...');
        const heroImage = await wikiImage(destination);

        // Fetch activity images in parallel (max 5 concurrent)
        const imagePromises = [];
        for (const day of (itinerary.days || [])) {
            for (const act of (day.activities || [])) {
                const query = act.image_search_query || act.location_name || act.title;
                imagePromises.push(
                    wikiImage(query).then(url => { act.image_url = url; })
                );
            }
        }
        // Process in batches of 5 to be nice to Wikipedia
        for (let i = 0; i < imagePromises.length; i += 5) {
            await Promise.all(imagePromises.slice(i, i + 5));
        }
        console.log('[Travel] Images fetched');

        // ─── Save to Database ───
        // Clear existing data
        const existingDays = await pool.query('SELECT id FROM travel_days WHERE trip_id = $1', [tripId]);
        if (existingDays.rows.length) {
            const dayIds = existingDays.rows.map(d => d.id);
            await pool.query('DELETE FROM travel_activities WHERE day_id = ANY($1)', [dayIds]);
        }
        await pool.query('DELETE FROM travel_days WHERE trip_id = $1', [tripId]);
        await pool.query('DELETE FROM travel_restaurants WHERE trip_id = $1', [tripId]);
        await pool.query('DELETE FROM travel_stays WHERE trip_id = $1', [tripId]);

        // Update trip metadata
        await pool.query(
            `UPDATE travel_trips SET
                weather_summary = $2, transport_notes = $3, visa_info = $4,
                budget_estimate = $5, packing_list = $6, hero_image = $7,
                flights_info = $8, status = 'ready', updated_at = NOW()
             WHERE id = $1`,
            [tripId, itinerary.weather_summary, itinerary.transport_notes, itinerary.visa_info,
             JSON.stringify(itinerary.budget_estimate), JSON.stringify(itinerary.packing_list),
             heroImage, itinerary.flights_info || null]
        );

        // Insert days and activities
        for (const day of (itinerary.days || [])) {
            const dayRes = await pool.query(
                'INSERT INTO travel_days (trip_id, day_number, title, summary, playlist) VALUES ($1,$2,$3,$4,$5) RETURNING id',
                [tripId, day.day_number, day.title, day.summary, day.playlist || null]
            );
            const dayId = dayRes.rows[0].id;

            for (const act of (day.activities || [])) {
                await pool.query(
                    `INSERT INTO travel_activities (day_id, time_slot, title, description, location_name, address,
                        latitude, longitude, duration_hours, estimated_cost, currency, category, tips, booking_url, image_url, sort_order)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
                    [dayId, act.time_slot, act.title, act.description, act.location_name, act.address,
                     act.latitude, act.longitude, act.duration_hours, act.estimated_cost, act.currency || 'USD',
                     act.category, act.tips, act.booking_url || null, act.image_url || null, act.sort_order || 0]
                );
            }
        }

        // Insert restaurants
        for (const r of (itinerary.restaurants || [])) {
            // Append extra details to description if present
            let desc = r.description || '';
            if (r.best_time) desc += `\n🕐 Best time: ${r.best_time}`;
            if (r.dress_code) desc += `\n👔 Dress code: ${r.dress_code}`;

            await pool.query(
                `INSERT INTO travel_restaurants (trip_id, name, cuisine, price_range, address, latitude, longitude,
                    description, must_try_dishes, reservation_needed, url)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                [tripId, r.name, r.cuisine, r.price_range, r.address, r.latitude, r.longitude,
                 desc, r.must_try_dishes, r.reservation_needed || false, r.url || null]
            );
        }

        // Insert stays
        const normalizeTier = (t) => {
            if (!t) return 'mid';
            const l = t.toLowerCase().trim();
            if (l.includes('budget') || l.includes('hostel')) return 'budget';
            if (l.includes('luxury') || l.includes('premium') || l.includes('high')) return 'luxury';
            return 'mid';
        };
        for (const s of (itinerary.stays || [])) {
            await pool.query(
                `INSERT INTO travel_stays (trip_id, name, tier, price_per_night, currency, address, latitude, longitude, url, notes)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                [tripId, s.name, normalizeTier(s.tier), s.price_per_night, s.currency || 'USD', s.address,
                 s.latitude, s.longitude, s.url || null, s.notes]
            );
        }

        // Return full trip
        const fullTrip = await pool.query('SELECT * FROM travel_trips WHERE id = $1', [tripId]);
        const daysResult = await pool.query('SELECT * FROM travel_days WHERE trip_id = $1 ORDER BY day_number', [tripId]);
        const allDayIds = daysResult.rows.map(d => d.id);
        let allActivities = [];
        if (allDayIds.length) {
            const actResult = await pool.query('SELECT * FROM travel_activities WHERE day_id = ANY($1) ORDER BY sort_order', [allDayIds]);
            allActivities = actResult.rows;
        }
        const restResult = await pool.query('SELECT * FROM travel_restaurants WHERE trip_id = $1', [tripId]);
        const stayResult = await pool.query('SELECT * FROM travel_stays WHERE trip_id = $1', [tripId]);

        const daysWithAct = daysResult.rows.map(day => ({
            ...day,
            activities: allActivities.filter(a => a.day_id === day.id)
        }));

        console.log(`[Travel] Successfully generated ${numDays}-day itinerary for ${dest} (trip ${tripId})`);

        res.json({
            ...fullTrip.rows[0],
            days: daysWithAct,
            restaurants: restResult.rows,
            stays: stayResult.rows
        });

    } catch (err) {
        console.error('[Travel] Generate error:', err);
        try {
            await pool.query("UPDATE travel_trips SET status = 'draft', updated_at = NOW() WHERE id = $1", [tripId]);
        } catch (_) {}
        res.status(500).json({ error: 'Generation failed: ' + err.message });
    }
});

// ─── Delete Activity ───
router.delete('/trips/:tripId/activities/:activityId', async (req, res) => {
    try {
        const { tripId, activityId } = req.params;
        const trip = await pool.query('SELECT id FROM travel_trips WHERE id = $1 AND user_id = $2', [tripId, req.user.id]);
        if (!trip.rows[0]) return res.status(404).json({ error: 'Trip not found' });

        const { rowCount } = await pool.query('DELETE FROM travel_activities WHERE id = $1', [activityId]);
        if (!rowCount) return res.status(404).json({ error: 'Activity not found' });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Share Trip ───
router.post('/trips/:id/share', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `UPDATE travel_trips SET share_token = gen_random_uuid(), updated_at = NOW()
             WHERE id = $1 AND user_id = $2 RETURNING share_token`,
            [req.params.id, req.user.id]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Trip not found' });
        res.json({ share_token: rows[0].share_token, url: `https://ashcroft.cloud/app/travel-public.html?token=${rows[0].share_token}` });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── Unshare Trip ───
router.delete('/trips/:id/share', async (req, res) => {
    try {
        await pool.query(
            'UPDATE travel_trips SET share_token = NULL, updated_at = NOW() WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

// ─── Wikipedia Image Proxy ───
router.get('/image-search', async (req, res) => {
    const q = req.query.q;
    if (!q) return res.json({ url: null });
    try {
        const result = await wikiImage(q);
        res.json({ url: result || null });
    } catch (e) {
        res.json({ url: null });
    }
});
