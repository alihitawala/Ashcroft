const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

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
        if (!destination) return res.status(400).json({ error: 'Destination is required' });
        const { rows } = await pool.query(
            `INSERT INTO travel_trips (user_id, destination, country)
             VALUES ($1, $2, $3) RETURNING *`,
            [req.user.id, destination, country || null]
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

        // Nest activities under days
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
    try {
        const tripId = req.params.id;
        const trip = await pool.query(
            'SELECT * FROM travel_trips WHERE id = $1 AND user_id = $2',
            [tripId, req.user.id]
        );
        if (!trip.rows[0]) return res.status(404).json({ error: 'Trip not found' });

        const { destination, country } = trip.rows[0];
        const dest = country ? `${destination}, ${country}` : destination;

        // Update status to planning
        await pool.query("UPDATE travel_trips SET status = 'planning', updated_at = NOW() WHERE id = $1", [tripId]);

        // Search for travel info using Brave Search API
        const BRAVE_API_KEY = process.env.BRAVE_SEARCH_API_KEY || process.env.BRAVE_API_KEY;
        let researchData = '';

        const searchQueries = [
            `top attractions and things to do in ${dest}`,
            `best restaurants and food in ${dest}`,
            `transport guide getting around ${dest}`,
            `weather ${dest} best time to visit`,
            `budget travel tips ${dest} costs`,
            `things to know before visiting ${dest} travel tips`
        ];

        if (BRAVE_API_KEY) {
            for (const query of searchQueries) {
                try {
                    const searchRes = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5`, {
                        headers: { 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'X-Subscription-Token': BRAVE_API_KEY }
                    });
                    const data = await searchRes.json();
                    if (data.web?.results) {
                        researchData += `\n\n### ${query}\n`;
                        data.web.results.forEach(r => {
                            researchData += `- ${r.title}: ${r.description || ''}\n`;
                        });
                    }
                } catch (e) {
                    console.error('Brave search error:', e.message);
                }
            }
        }

        if (!researchData) {
            researchData = `Please use your knowledge to create a comprehensive travel itinerary for ${dest}. Include popular attractions, local restaurants, transportation tips, weather info, budget estimates, and packing suggestions.`;
        }

        // Use Groq to generate itinerary
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) return res.status(500).json({ error: 'GROQ_API_KEY not configured' });

        const prompt = `You are a travel planning expert. Based on this research about ${dest}, create a detailed 5-day travel itinerary.

Research:
${researchData}

Return ONLY valid JSON (no markdown, no code blocks) with this exact structure:
{
  "weather_summary": "Brief weather overview and best time to visit",
  "transport_notes": "How to get around, airport info, public transport tips",
  "visa_info": "Visa requirements for common nationalities",
  "budget_estimate": {"budget_per_day_usd": 50, "mid_per_day_usd": 120, "luxury_per_day_usd": 300},
  "packing_list": ["item1", "item2", "item3"],
  "days": [
    {
      "day_number": 1,
      "title": "Day title",
      "summary": "Brief day overview",
      "activities": [
        {
          "time_slot": "morning",
          "title": "Activity name",
          "description": "What to do and why it's great",
          "location_name": "Place name",
          "address": "Full address",
          "latitude": 0.0,
          "longitude": 0.0,
          "duration_hours": 2.0,
          "estimated_cost": 15.00,
          "currency": "USD",
          "category": "sightseeing",
          "tips": "Helpful tips for this activity",
          "sort_order": 1
        }
      ]
    }
  ],
  "restaurants": [
    {
      "name": "Restaurant name",
      "cuisine": "Cuisine type",
      "price_range": "$$",
      "address": "Address",
      "latitude": 0.0,
      "longitude": 0.0,
      "description": "Why visit",
      "must_try_dishes": "Dish1, Dish2",
      "reservation_needed": false
    }
  ],
  "stays": [
    {
      "name": "Hotel name",
      "tier": "budget",
      "price_per_night": 40,
      "currency": "USD",
      "address": "Address",
      "latitude": 0.0,
      "longitude": 0.0,
      "notes": "Brief description"
    }
  ]
}

Rules:
- Each day must have 3 activities (morning, afternoon, evening)
- Include 6-8 restaurants covering different cuisines and price ranges
- Include 3 stays (one budget, one mid-range, one luxury)
- Use realistic coordinates, prices, and addresses
- Categories: sightseeing, culture, food, nature, shopping, nightlife, adventure
- Keep descriptions concise but informative
- Include practical tips for each activity`;

        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    { role: 'system', content: 'You are a travel expert. Return ONLY valid JSON, no markdown, no explanation, no code blocks.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 8000,
            }),
        });

        const groqData = await groqRes.json();
        const content = groqData.choices?.[0]?.message?.content;
        if (!content) return res.status(500).json({ error: 'AI generation failed' });

        const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
        let itinerary;
        try {
            itinerary = JSON.parse(jsonStr);
        } catch (e) {
            console.error('JSON parse error:', e.message, '\nContent:', jsonStr.substring(0, 500));
            return res.status(500).json({ error: 'Failed to parse AI response' });
        }

        // Clear existing data for this trip
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
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
