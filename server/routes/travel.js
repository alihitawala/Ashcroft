const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

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

// ─── List Trips ───
router.get('/trips', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT id, destination, country, hero_image, status, created_at, updated_at
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
        const { destination, country } = req.body;
        if (!destination || typeof destination !== 'string' || destination.trim().length === 0) {
            return res.status(400).json({ error: 'Destination is required' });
        }
        if (destination.length > 200) {
            return res.status(400).json({ error: 'Destination too long (max 200 chars)' });
        }
        const { rows } = await pool.query(
            `INSERT INTO travel_trips (user_id, destination, country)
             VALUES ($1, $2, $3) RETURNING *`,
            [req.user.id, destination.trim(), country ? country.trim() : null]
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
        const { destination, country, status, hero_image, weather_summary, transport_notes, visa_info, packing_list, budget_estimate } = req.body;
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
                updated_at = NOW()
             WHERE id = $1 AND user_id = $2 RETURNING *`,
            [tripId, req.user.id, destination, country, status, hero_image, weather_summary, transport_notes, visa_info,
             packing_list ? JSON.stringify(packing_list) : null,
             budget_estimate ? JSON.stringify(budget_estimate) : null]
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

        const { destination, country } = trip.rows[0];
        if (!destination || destination.trim().length === 0) {
            return res.status(400).json({ error: 'Trip has no destination set' });
        }

        const dest = country ? `${destination}, ${country}` : destination;

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
            `best hotels ${dest} budget mid-range luxury recommendations`
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

        const prompt = `You are an expert travel planner creating a detailed 5-day itinerary for ${dest}.
${researchBlock}

Return ONLY valid JSON (no markdown, no code blocks, no explanation) matching this exact structure:
{
  "weather_summary": "Detailed weather overview including temperature ranges, rainy/dry season, humidity, and best months to visit",
  "transport_notes": "Specific transport info: airport name and distance to city, metro/bus lines, ride-hailing apps (Uber/Grab/etc), taxi costs, day passes, tips for getting around cheaply",
  "visa_info": "Visa requirements for US, EU, UK, and Australian citizens. Include visa-on-arrival info, costs, and duration",
  "budget_estimate": {
    "budget_per_day_usd": 50,
    "mid_per_day_usd": 120,
    "luxury_per_day_usd": 300,
    "breakdown": "budget: $X accommodation + $X food + $X transport + $X activities; mid-range: ..."
  },
  "packing_list": ["item1 - why", "item2 - why"],
  "days": [
    {
      "day_number": 1,
      "title": "Descriptive day theme title",
      "summary": "2-3 sentence overview of what makes this day special",
      "activities": [
        {
          "time_slot": "morning",
          "title": "Specific place/activity name",
          "description": "What you'll do, why it's worth visiting, what to look for. 2-3 sentences.",
          "location_name": "Exact venue/landmark name",
          "address": "Full street address",
          "latitude": 35.6762,
          "longitude": 139.6503,
          "duration_hours": 2.0,
          "estimated_cost": 15.00,
          "currency": "USD",
          "category": "sightseeing",
          "tips": "Practical tip: best time to visit, how to skip lines, what to wear, photo spots, etc.",
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
      "description": "Why this place is special, atmosphere, what locals say about it",
      "must_try_dishes": "Dish Name 1 ($X), Dish Name 2 ($X)",
      "reservation_needed": false
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
      "notes": "What makes this stay good: location, amenities, neighborhood vibe, walkability"
    }
  ]
}

IMPORTANT RULES:
- Each day MUST have exactly 3 activities: morning, afternoon, evening
- Include 8 restaurants: mix of street food ($), casual ($$), upscale ($$$), and fine dining ($$$$)
- Include 3 stays: one budget/hostel, one mid-range, one luxury
- ALL coordinates must be realistic lat/lng for ${dest} (not 0,0!)
- ALL prices must be realistic for the local economy in USD equivalent
- Restaurant must_try_dishes should include approximate prices
- Packing list should be 8-12 items, each with a reason why
- Categories must be one of: sightseeing, culture, food, nature, shopping, nightlife, adventure
- Tips should be genuinely useful insider knowledge, not generic advice
- Addresses should be as specific as possible
- sort_order within each day: morning=1, afternoon=2, evening=3
- Budget breakdown should explain what the money goes to`;

        let groqData;
        try {
            const groqRes = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${groqKey}`,
                },
                body: JSON.stringify({
                    model: 'llama-3.3-70b-versatile',
                    messages: [
                        { role: 'system', content: 'You are a world-class travel expert. Return ONLY valid JSON. No markdown, no code blocks, no explanation text before or after the JSON. The response must start with { and end with }.' },
                        { role: 'user', content: prompt }
                    ],
                    temperature: 0.4,
                    max_tokens: 8000,
                }),
            }, 60000); // 60s timeout for generation

            if (!groqRes.ok) {
                const errBody = await groqRes.text();
                console.error('Groq API error:', groqRes.status, errBody);
                await pool.query("UPDATE travel_trips SET status = 'draft', updated_at = NOW() WHERE id = $1", [tripId]);
                return res.status(502).json({ error: `AI service error (${groqRes.status}). Please try again.` });
            }

            groqData = await groqRes.json();
        } catch (err) {
            console.error('Groq fetch error:', err.message);
            await pool.query("UPDATE travel_trips SET status = 'draft', updated_at = NOW() WHERE id = $1", [tripId]);
            if (err.name === 'AbortError') {
                return res.status(504).json({ error: 'AI generation timed out. Please try again.' });
            }
            return res.status(502).json({ error: 'Failed to reach AI service. Please try again.' });
        }

        const content = groqData.choices?.[0]?.message?.content;
        if (!content) {
            await pool.query("UPDATE travel_trips SET status = 'draft', updated_at = NOW() WHERE id = $1", [tripId]);
            return res.status(502).json({ error: 'AI returned empty response. Please try again.' });
        }

        // Parse JSON - strip markdown if present
        const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        let itinerary;
        try {
            itinerary = JSON.parse(jsonStr);
        } catch (e) {
            console.error('JSON parse error:', e.message, '\nContent:', jsonStr.substring(0, 500));
            await pool.query("UPDATE travel_trips SET status = 'draft', updated_at = NOW() WHERE id = $1", [tripId]);
            return res.status(502).json({ error: 'AI returned invalid format. Please try again.' });
        }

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
                budget_estimate = $5, packing_list = $6, status = 'ready', updated_at = NOW()
             WHERE id = $1`,
            [tripId, itinerary.weather_summary, itinerary.transport_notes, itinerary.visa_info,
             JSON.stringify(itinerary.budget_estimate), JSON.stringify(itinerary.packing_list)]
        );

        // Insert days and activities
        for (const day of (itinerary.days || [])) {
            const dayRes = await pool.query(
                'INSERT INTO travel_days (trip_id, day_number, title, summary) VALUES ($1,$2,$3,$4) RETURNING id',
                [tripId, day.day_number, day.title, day.summary]
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
            await pool.query(
                `INSERT INTO travel_restaurants (trip_id, name, cuisine, price_range, address, latitude, longitude,
                    description, must_try_dishes, reservation_needed, url)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
                [tripId, r.name, r.cuisine, r.price_range, r.address, r.latitude, r.longitude,
                 r.description, r.must_try_dishes, r.reservation_needed || false, r.url || null]
            );
        }

        // Insert stays
        for (const s of (itinerary.stays || [])) {
            await pool.query(
                `INSERT INTO travel_stays (trip_id, name, tier, price_per_night, currency, address, latitude, longitude, url, notes)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
                [tripId, s.name, s.tier, s.price_per_night, s.currency || 'USD', s.address,
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

        res.json({
            ...fullTrip.rows[0],
            days: daysWithAct,
            restaurants: restResult.rows,
            stays: stayResult.rows
        });

    } catch (err) {
        console.error('Generate error:', err);
        // Reset status on unexpected errors
        try {
            await pool.query("UPDATE travel_trips SET status = 'draft', updated_at = NOW() WHERE id = $1", [tripId]);
        } catch (_) {}
        res.status(500).json({ error: 'Generation failed: ' + err.message });
    }
});

// ─── Update Activity ───
router.patch('/trips/:tripId/activities/:activityId', async (req, res) => {
    try {
        const { tripId, activityId } = req.params;
        // Verify trip ownership
        const trip = await pool.query('SELECT id FROM travel_trips WHERE id = $1 AND user_id = $2', [tripId, req.user.id]);
        if (!trip.rows[0]) return res.status(404).json({ error: 'Trip not found' });

        const { title, description, duration_hours, estimated_cost, tips, sort_order } = req.body;
        const { rows } = await pool.query(
            `UPDATE travel_activities SET
                title = COALESCE($2, title),
                description = COALESCE($3, description),
                duration_hours = COALESCE($4, duration_hours),
                estimated_cost = COALESCE($5, estimated_cost),
                tips = COALESCE($6, tips),
                sort_order = COALESCE($7, sort_order)
             WHERE id = $1 RETURNING *`,
            [activityId, title, description, duration_hours, estimated_cost, tips, sort_order]
        );
        if (!rows[0]) return res.status(404).json({ error: 'Activity not found' });
        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
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
