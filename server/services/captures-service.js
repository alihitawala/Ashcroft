const { pool } = require('../db');

// ─── AI Enhancement ───

async function enhanceCapture(rawInput) {
  // Try Groq (fastest) → OpenAI → heuristics fallback
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey) {
    try {
      return await enhanceWithGroq(rawInput, groqKey);
    } catch (err) {
      console.error('Groq enhancement failed, falling back:', err.message);
    }
  }
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    try {
      return await enhanceWithAI(rawInput, openaiKey);
    } catch (err) {
      console.error('OpenAI enhancement failed, falling back to heuristics:', err.message);
    }
  }
  return enhanceWithHeuristics(rawInput);
}

async function enhanceWithGroq(rawInput, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{
          role: 'system',
          content: 'You are a smart note assistant. Return ONLY valid JSON, no markdown, no explanation, no code blocks.'
        }, {
          role: 'user',
          content: `Enhance this rough quick-capture into a structured note.

Raw input: "${rawInput}"

Return this exact JSON:
{"title":"Clean concise title (fix typos, proper casing)","body":"1-2 sentence natural description expanding on the thought","suggested_tags":["tag1","tag2","tag3"],"type":"text or link or checklist","checklist":null}

Rules:
- Fix all typos and grammar
- If input contains a URL, type is "link" and extract the topic from the URL slug (e.g. india-vs-zimbabwe-live-score → "India vs Zimbabwe Live Score")
- If input is a list (items after colon separated by commas, or bullet points), type is "checklist" and checklist is [{"text":"item","checked":false}]
- Tags: 2-4 MAXIMUM. Only the most specific and useful tags. Lowercase single words.
- GOOD tags: specific (cricket, saba, garden, sunset, recipe, dentist, tesla). BAD tags: generic (personal, idea, note, important, misc)
- Detect people names (e.g. saba, ali) and add as tags
- Keep the user's intent, don't over-embellish
- Title should be meaningful and descriptive`
        }],
        temperature: 0.2,
        max_tokens: 300,
      }),
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty Groq response');

    const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);

    // Extract URL if present for link type
    const urlMatch = rawInput.match(/(https?:\/\/[^\s]+)/);
    if (parsed.type === 'link' && urlMatch) {
      parsed.url = urlMatch[0];
    }

    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

async function enhanceWithAI(rawInput, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'system',
          content: `You are a smart note assistant. The user quickly captured a rough thought. Enhance it into a structured capture.

Raw input: "${rawInput}"

Return JSON only:
{
  "title": "Clean, concise title",
  "body": "Expanded description (1-2 sentences, natural tone)",
  "suggested_tags": ["tag1", "tag2", "tag3"],
  "type": "text|link|checklist",
  "checklist": null
}

Rules:
- Keep the user's intent, don't over-embellish
- Tags should be lowercase, single words or short phrases
- Detect names, places, activities, categories as tags
- If input looks like a list, make it a checklist with items as [{text, checked: false}]
- If input contains a URL, type is "link"`
        }],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty AI response');

    // Parse JSON from response (handle markdown code blocks)
    const jsonStr = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } finally {
    clearTimeout(timeout);
  }
}

function enhanceWithHeuristics(rawInput) {
  const input = rawInput.trim();
  const urlMatch = input.match(/(https?:\/\/[^\s]+)/);

  // Detect type
  let type = 'text';
  let checklist = null;

  if (urlMatch) {
    type = 'link';
  } else if (
    (input.includes(':') && input.split(/[,\n]/).length >= 3) ||
    input.match(/^\s*[-•]\s/m)
  ) {
    type = 'checklist';
    const colonIdx = input.indexOf(':');
    const itemsPart = colonIdx > -1 ? input.slice(colonIdx + 1) : input;
    const items = itemsPart.split(/[,\n]/).map(s => s.replace(/^[\s\-•]+/, '').trim()).filter(Boolean);
    if (items.length >= 2) {
      checklist = items.map(text => ({ text, checked: false }));
    } else {
      type = 'text';
    }
  }

  // Smart title: capitalize properly, fix common patterns
  const titleSource = type === 'checklist' && input.indexOf(':') > -1
    ? input.slice(0, input.indexOf(':'))
    : (urlMatch ? input.replace(urlMatch[0], '').trim() || urlMatch[0] : input);

  // Proper title case (capitalize first letter of each word, handle contractions)
  const title = smartTitleCase(titleSource).slice(0, 200);

  // Generate a body/description from the raw input
  const body = title !== input.trim() ? input.trim() : null;

  // Smart tag extraction using categories & patterns
  const suggested_tags = extractSmartTags(input);

  return { title, body, suggested_tags, type, checklist, url: urlMatch ? urlMatch[0] : undefined };
}

function smartTitleCase(str) {
  // Fix common name misspellings/casing
  const nameMap = { 'saba': "Saba", 'ali': 'Ali', 'sabas': "Saba's", 'alis': "Ali's" };
  return str.split(' ')
    .map((w, i) => {
      const lower = w.toLowerCase().replace(/[^a-z']/g, '');
      if (nameMap[lower]) return nameMap[lower];
      // Don't capitalize small words unless first
      if (i > 0 && ['a','an','the','at','in','on','for','to','of','and','or','but','with','by'].includes(lower)) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

function extractSmartTags(input) {
  const lower = input.toLowerCase();
  const tags = new Set();

  // People detection
  const people = { 'saba': 'saba', 'ali': 'ali' };
  for (const [name, tag] of Object.entries(people)) {
    if (lower.includes(name)) tags.add(tag);
  }

  // Category patterns
  const categories = {
    food: /\b(lunch|dinner|breakfast|brunch|restaurant|eat|food|cook|recipe|meal|coffee|cafe|pizza|burger|sushi|taco|bbq|grill)\b/,
    shopping: /\b(buy|shop|store|order|purchase|amazon|target|costco|walmart|ikea|mall)\b/,
    garden: /\b(plant|garden|water|tree|flower|prune|soil|fertiliz|compost|bloom|harvest)\b/,
    travel: /\b(trip|travel|flight|hotel|airbnb|vacation|airport|passport|luggage|hike|trail)\b/,
    work: /\b(meeting|work|office|meta|team|standup|review|sprint|deadline|project|oncall)\b/,
    health: /\b(gym|workout|run|exercise|doctor|dentist|health|weight|tennis|yoga|swim)\b/,
    tech: /\b(code|bug|deploy|server|api|app|website|github|update|release|hack|build)\b/,
    home: /\b(home|house|clean|repair|fix|furniture|appliance|room|kitchen|garage|laundry)\b/,
    finance: /\b(pay|bill|mortgage|bank|invest|stock|budget|expense|subscription|insurance|tax)\b/,
    birthday: /\b(birthday|bday|party|celebration|anniversar|gift|surprise|cake)\b/,
    car: /\b(car|drive|gas|oil change|tire|mechanic|subaru|outback|service|dmv|parking)\b/,
    photo: /\b(photo|camera|picture|shoot|portrait|landscape|sunset|sunrise|snap)\b/,
    idea: /\b(idea|thought|maybe|could|should|what if|brainstorm|concept|plan)\b/,
    sports: /\b(game|match|score|soccer|football|cricket|tennis|united|madrid|watch)\b/,
  };

  for (const [tag, pattern] of Object.entries(categories)) {
    if (pattern.test(lower)) tags.add(tag);
  }

  // Place/location detection
  const places = {
    sunnyvale: 'sunnyvale', 'san francisco': 'sf', 'san jose': 'san-jose',
    'mountain view': 'mountain-view', cupertino: 'cupertino', palo: 'palo-alto',
    udaipur: 'udaipur', india: 'india',
  };
  for (const [place, tag] of Object.entries(places)) {
    if (lower.includes(place)) tags.add(tag);
  }

  // If nothing matched, extract key nouns (fallback, but smarter)
  if (tags.size === 0) {
    const stopWords = new Set(['the','and','for','with','that','this','from','need','want','have',
      'been','will','about','into','cool','really','very','just','some','was','were','are','got',
      'can','did','its','not','but','all','had','her','his','our','they','she','him','out','then',
      'than','now','also','when','what','how','who','which','there','here','back','over','after',
      'going','went','come','came','take','took','make','made','like','said','new','today','yesterday']);
    const words = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !stopWords.has(w));
    for (const w of [...new Set(words)].slice(0, 3)) tags.add(w);
  }

  return [...tags].slice(0, 6);
}

function deduplicateAndCapTags(tags) {
  // Remove short tags (<=2 chars)
  let filtered = tags.map(t => t.toLowerCase().trim()).filter(t => t.length > 2);
  // Deduplicate similar tags: if one tag is a substring/prefix of another, keep the longer one
  // e.g., "shop" and "shopping" → keep "shopping"
  const result = [];
  const sorted = [...filtered].sort((a, b) => b.length - a.length); // longest first
  for (const tag of sorted) {
    const dominated = result.some(existing =>
      existing.includes(tag) || tag.includes(existing)
    );
    if (!dominated) {
      result.push(tag);
    } else {
      // If tag contains an existing shorter one, that shorter one is already dominated by this longer one
      // Replace shorter with longer if this tag is longer
      const shorterIdx = result.findIndex(existing => tag.includes(existing) && tag.length > existing.length);
      if (shorterIdx !== -1) {
        result[shorterIdx] = tag;
      }
      // If existing contains this tag (existing is longer), skip this tag
    }
  }
  // Cap at 4
  return [...new Set(result)].slice(0, 4);
}

// ─── Link Preview ───

async function fetchLinkPreview(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ashcroft-bot/1.0)' },
    });
    clearTimeout(timeout);
    const html = await res.text();

    const og = (prop) => {
      const m = html.match(new RegExp(`<meta[^>]*property=["']og:${prop}["'][^>]*content=["']([^"']+)["']`, 'i'))
        || html.match(new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:${prop}["']`, 'i'));
      return m ? m[1] : null;
    };
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    return {
      og_title: og('title') || (titleMatch ? titleMatch[1].trim() : null),
      og_description: og('description'),
      og_image: og('image'),
    };
  } catch (err) {
    console.error('Link preview fetch failed:', err.message);
    return { og_title: null, og_description: null, og_image: null };
  }
}

// ─── CRUD ───

async function createCapture(userId, data) {
  // ─── Duplicate Detection ───
  if (data.raw_input) {
    const dupeByInput = await pool.query(
      `SELECT * FROM captures WHERE user_id = $1 AND raw_input = $2 AND archived = false
       AND captured_at > NOW() - INTERVAL '24 hours' LIMIT 1`,
      [userId, data.raw_input]
    );
    if (dupeByInput.rows.length) {
      const [capture] = await attachTags(dupeByInput.rows);
      return { ...capture, duplicate: true };
    }
  }
  // Check URL duplicate for links
  const inputUrl = data.url || (data.raw_input && data.raw_input.match(/(https?:\/\/[^\s]+)/)?.[0]);
  if (inputUrl) {
    const dupeByUrl = await pool.query(
      `SELECT * FROM captures WHERE user_id = $1 AND url = $2 AND archived = false
       AND captured_at > NOW() - INTERVAL '24 hours' LIMIT 1`,
      [userId, inputUrl]
    );
    if (dupeByUrl.rows.length) {
      const [capture] = await attachTags(dupeByUrl.rows);
      return { ...capture, duplicate: true };
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let enhanced = {};
    let aiEnhanced = false;

    if (data.raw_input) {
      enhanced = await enhanceCapture(data.raw_input);
      aiEnhanced = true;
    }

    // If link type, fetch OG metadata
    const captureUrl = data.url || enhanced.url || null;
    let ogData = {};
    if ((data.type || enhanced.type) === 'link' && captureUrl) {
      ogData = await fetchLinkPreview(captureUrl);
    }

    const type = data.type || enhanced.type || 'text';
    const title = data.title || enhanced.title || null;
    const body = data.body || enhanced.body || null;
    const checklist = data.checklist || enhanced.checklist || null;

    const result = await client.query(
      `INSERT INTO captures (user_id, type, title, body, raw_input, ai_enhanced, url, og_title, og_description, og_image,
        checklist, latitude, longitude, place_name, shared, pinned, captured_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`,
      [
        userId, type, title, body,
        data.raw_input || null, aiEnhanced,
        captureUrl,
        data.og_title || ogData.og_title || null,
        data.og_description || ogData.og_description || null,
        data.og_image || ogData.og_image || null,
        checklist ? JSON.stringify(checklist) : null,
        data.latitude || null, data.longitude || null, data.place_name || null,
        data.shared || false, data.pinned || false,
        data.captured_at || new Date(),
      ]
    );

    const capture = result.rows[0];

    // Handle tags — merge user tags with AI-suggested tags, don't let empty array override
    const userTags = (data.tags && data.tags.length > 0) ? data.tags : [];
    const aiTags = enhanced.suggested_tags || [];
    const tagNames = deduplicateAndCapTags([...new Set([...userTags, ...aiTags])]);
    const tags = await linkTags(client, userId, capture.id, tagNames);

    await client.query('COMMIT');
    return { ...capture, tags };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function linkTags(client, userId, captureId, tagNames) {
  if (!tagNames || tagNames.length === 0) return [];

  // Remove existing links
  await client.query('DELETE FROM capture_tags WHERE capture_id = $1', [captureId]);

  const tags = [];
  const colors = ['#635BFF', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#FF8C42'];

  for (const name of tagNames) {
    const cleanName = name.toLowerCase().trim().slice(0, 50);
    if (!cleanName) continue;

    // Upsert tag
    const tagResult = await client.query(
      `INSERT INTO tags (user_id, name, color) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, name) DO UPDATE SET name = tags.name RETURNING *`,
      [userId, cleanName, colors[Math.floor(Math.random() * colors.length)]]
    );
    const tag = tagResult.rows[0];
    tags.push({ id: tag.id, name: tag.name, color: tag.color });

    await client.query(
      'INSERT INTO capture_tags (capture_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [captureId, tag.id]
    );
  }

  return tags;
}

async function getRecentCaptures(userId, limit = 5) {
  const result = await pool.query(
    `SELECT c.* FROM captures c WHERE c.user_id = $1 AND c.archived = false ORDER BY c.captured_at DESC LIMIT $2`,
    [userId, limit]
  );
  return attachTags(result.rows);
}

async function getCaptures(userId, filters = {}) {
  const { page = 1, limit = 20, type, tag, shared, from, to, q, lat, lng, radius, sort = 'captured_at', shared_only } = filters;
  const offset = (page - 1) * limit;

  // Family visibility: show own captures + shared captures from family members
  const FAMILY_IDS = [1, 2]; // Ali and Saba — hardcoded for now
  const isFamilyMember = FAMILY_IDS.includes(userId);

  let where = ['c.archived = false'];
  const params = [userId];

  if (isFamilyMember) {
    // Own captures + shared captures from other family members
    const otherFamilyIds = FAMILY_IDS.filter(id => id !== userId);
    if (otherFamilyIds.length) {
      params.push(otherFamilyIds);
      where.push(`(c.user_id = $1 OR (c.user_id = ANY($${params.length}) AND c.shared = true))`);
    } else {
      where.push('c.user_id = $1');
    }
  } else {
    where.push('c.user_id = $1');
  }

  // Filter to only shared captures (from anyone visible)
  if (shared_only === 'true' || shared_only === true) {
    where.push('c.shared = true');
  }
  let joins = '';

  if (type) { params.push(type); where.push(`c.type = $${params.length}`); }
  if (shared !== undefined) { params.push(shared === 'true' || shared === true); where.push(`c.shared = $${params.length}`); }
  if (from) { params.push(from); where.push(`c.captured_at >= $${params.length}`); }
  if (to) { params.push(to); where.push(`c.captured_at <= $${params.length}`); }
  if (q) {
    params.push(q);
    where.push(`to_tsvector('english', coalesce(c.title,'') || ' ' || coalesce(c.body,'') || ' ' || coalesce(c.place_name,'') || ' ' || coalesce(c.image_description,'')) @@ plainto_tsquery('english', $${params.length})`);
  }
  if (tag) {
    params.push(Array.isArray(tag) ? tag : [tag]);
    joins += ` JOIN capture_tags ct_filter ON ct_filter.capture_id = c.id JOIN tags t_filter ON t_filter.id = ct_filter.tag_id AND t_filter.name = ANY($${params.length})`;
  }
  if (lat && lng && radius) {
    params.push(parseFloat(lat), parseFloat(lng), parseFloat(radius));
    // Approximate distance in km using lat/lng
    where.push(`c.latitude IS NOT NULL AND (
      6371 * acos(cos(radians($${params.length - 2})) * cos(radians(c.latitude)) * cos(radians(c.longitude) - radians($${params.length - 1})) + sin(radians($${params.length - 2})) * sin(radians(c.latitude)))
    ) <= $${params.length}`);
  }

  const sortCol = sort === 'created_at' ? 'c.created_at' : 'c.captured_at';
  const whereStr = where.join(' AND ');

  const userJoin = 'LEFT JOIN users u ON u.id = c.user_id';

  const countResult = await pool.query(
    `SELECT COUNT(DISTINCT c.id) FROM captures c ${joins} WHERE ${whereStr}`, params
  );
  const total = parseInt(countResult.rows[0].count);

  params.push(limit, offset);
  const result = await pool.query(
    `SELECT DISTINCT c.*, u.name as owner_name FROM captures c ${userJoin} ${joins} WHERE ${whereStr} ORDER BY ${sortCol} DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  // Fetch tags for all captures
  const captures = await attachTags(result.rows);

  return { captures, total, page: parseInt(page), limit: parseInt(limit) };
}

async function attachTags(captures) {
  if (captures.length === 0) return captures;
  const ids = captures.map(c => c.id);
  const tagResult = await pool.query(
    `SELECT ct.capture_id, t.id, t.name, t.color
     FROM capture_tags ct JOIN tags t ON t.id = ct.tag_id
     WHERE ct.capture_id = ANY($1)`, [ids]
  );
  const tagMap = {};
  for (const row of tagResult.rows) {
    if (!tagMap[row.capture_id]) tagMap[row.capture_id] = [];
    tagMap[row.capture_id].push({ id: row.id, name: row.name, color: row.color });
  }
  return captures.map(c => ({ ...c, tags: tagMap[c.id] || [] }));
}

async function getCaptureById(userId, id) {
  const FAMILY_IDS = [1, 2];
  const isFamilyMember = FAMILY_IDS.includes(userId);
  let result;
  if (isFamilyMember) {
    const otherFamilyIds = FAMILY_IDS.filter(fid => fid !== userId);
    result = await pool.query(
      `SELECT c.*, u.name as owner_name FROM captures c LEFT JOIN users u ON u.id = c.user_id
       WHERE c.id = $1 AND (c.user_id = $2 OR (c.user_id = ANY($3) AND c.shared = true))`,
      [id, userId, otherFamilyIds]
    );
  } else {
    result = await pool.query(
      'SELECT c.*, u.name as owner_name FROM captures c LEFT JOIN users u ON u.id = c.user_id WHERE c.id = $1 AND c.user_id = $2',
      [id, userId]
    );
  }
  if (!result.rows[0]) return null;
  const [capture] = await attachTags(result.rows);
  return capture;
}

async function updateCapture(userId, id, data) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const sets = [];
    const params = [];
    const fields = ['title', 'body', 'type', 'url', 'og_title', 'og_description', 'og_image',
      'image_path', 'image_thumb_path', 'image_description', 'image_metadata',
      'checklist', 'latitude', 'longitude', 'place_name', 'shared', 'pinned', 'archived', 'captured_at'];

    for (const f of fields) {
      if (data[f] !== undefined) {
        const val = (f === 'checklist' || f === 'image_metadata') ? JSON.stringify(data[f]) : data[f];
        params.push(val);
        sets.push(`${f}=$${params.length}`);
      }
    }
    sets.push('updated_at=NOW()');

    if (sets.length === 1) {
      await client.query('ROLLBACK');
      // Only updated_at, check if tags need updating
      if (!data.tags) return await getCaptureById(userId, id);
    }

    params.push(id, userId);
    const result = await client.query(
      `UPDATE captures SET ${sets.join(', ')} WHERE id=$${params.length - 1} AND user_id=$${params.length} RETURNING *`,
      params
    );
    if (!result.rows[0]) { await client.query('ROLLBACK'); return null; }

    let tags;
    if (data.tags) {
      tags = await linkTags(client, userId, id, data.tags);
    }

    await client.query('COMMIT');
    const capture = result.rows[0];
    if (!tags) {
      const [withTags] = await attachTags([capture]);
      return withTags;
    }
    return { ...capture, tags };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function deleteCapture(userId, id, hard = false) {
  if (hard) {
    const result = await pool.query('DELETE FROM captures WHERE id=$1 AND user_id=$2 RETURNING *', [id, userId]);
    return result.rows[0] || null;
  }
  const result = await pool.query(
    'UPDATE captures SET archived=true, updated_at=NOW() WHERE id=$1 AND user_id=$2 RETURNING *',
    [id, userId]
  );
  return result.rows[0] || null;
}

// ─── Tags CRUD ───

async function getTags(userId) {
  const FAMILY_IDS = [1, 2];
  const isFamilyMember = FAMILY_IDS.includes(userId);
  const otherFamilyIds = FAMILY_IDS.filter(fid => fid !== userId);

  let captureFilter;
  const params = [userId];
  if (isFamilyMember && otherFamilyIds.length) {
    params.push(otherFamilyIds);
    captureFilter = `(c.user_id = $1 OR (c.user_id = ANY($${params.length}) AND c.shared = true))`;
  } else {
    captureFilter = `c.user_id = $1`;
  }

  const result = await pool.query(
    `SELECT t.*, COUNT(ct.capture_id) as usage_count
     FROM tags t
     JOIN capture_tags ct ON ct.tag_id = t.id
     JOIN captures c ON c.id = ct.capture_id AND c.archived = false AND ${captureFilter}
     WHERE t.user_id = ANY($${params.length + 1})
     GROUP BY t.id
     HAVING COUNT(ct.capture_id) > 0
     ORDER BY usage_count DESC, t.name`,
    [...params, isFamilyMember ? FAMILY_IDS : [userId]]
  );
  return result.rows;
}

async function createTag(userId, data) {
  const result = await pool.query(
    'INSERT INTO tags (user_id, name, color) VALUES ($1, $2, $3) RETURNING *',
    [userId, data.name.toLowerCase().trim(), data.color || '#635BFF']
  );
  return result.rows[0];
}

async function updateTag(userId, id, data) {
  const sets = [];
  const params = [];
  if (data.name !== undefined) { params.push(data.name.toLowerCase().trim()); sets.push(`name=$${params.length}`); }
  if (data.color !== undefined) { params.push(data.color); sets.push(`color=$${params.length}`); }
  if (sets.length === 0) return null;
  params.push(id, userId);
  const result = await pool.query(
    `UPDATE tags SET ${sets.join(', ')} WHERE id=$${params.length - 1} AND user_id=$${params.length} RETURNING *`,
    params
  );
  return result.rows[0] || null;
}

async function deleteTag(userId, id) {
  const result = await pool.query('DELETE FROM tags WHERE id=$1 AND user_id=$2 RETURNING *', [id, userId]);
  return result.rows[0] || null;
}

module.exports = {
  createCapture, getCaptures, getRecentCaptures, getCaptureById, updateCapture, deleteCapture,
  enhanceCapture, fetchLinkPreview,
  getTags, createTag, updateTag, deleteTag,
};
