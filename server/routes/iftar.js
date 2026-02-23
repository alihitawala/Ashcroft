const { Router } = require('express');
const { pool } = require('../db');
const { authenticate } = require('../middleware/auth');
const crypto = require('crypto');
const router = Router();

function generateToken() {
  return crypto.randomBytes(6).toString('base64url'); // ~8 chars, URL-safe
}

// ─── Public Routes (no auth) ───

// View invite by token
router.get('/invite/:token', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.*, e.title, e.event_date, e.event_time, e.sunset_time,
              e.address_line1, e.address_line2, e.city, e.state, e.zip,
              e.message, e.host_name, e.host_phone, e.active
       FROM iftar_invites i
       JOIN iftar_events e ON e.id = i.event_id
       WHERE i.token = $1`,
      [req.params.token]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Invitation not found' });
    if (!result.rows[0].active) return res.status(410).json({ error: 'This event is no longer active' });
    
    const invite = result.rows[0];
    res.json({
      token: invite.token,
      guest_name: invite.guest_name,
      rsvp_status: invite.rsvp_status,
      guest_count: invite.guest_count,
      dietary_notes: invite.dietary_notes,
      message_to_host: invite.message_to_host,
      guest_email: invite.guest_email || null,
      event: {
        title: invite.title,
        event_date: invite.event_date,
        event_time: invite.event_time,
        sunset_time: invite.sunset_time,
        address_line1: invite.address_line1,
        address_line2: invite.address_line2,
        city: invite.city,
        state: invite.state,
        zip: invite.zip,
        message: invite.message,
        host_name: invite.host_name
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit RSVP
router.put('/invite/:token/rsvp', async (req, res) => {
  try {
    const { rsvp_status, guest_count, dietary_notes, message_to_host } = req.body;
    if (!['attending', 'declined', 'maybe'].includes(rsvp_status)) {
      return res.status(400).json({ error: 'Invalid RSVP status' });
    }
    const result = await pool.query(
      `UPDATE iftar_invites SET rsvp_status = $1, guest_count = $2, 
       dietary_notes = $3, message_to_host = $4, rsvp_at = NOW(), updated_at = NOW()
       WHERE token = $5 RETURNING *`,
      [rsvp_status, guest_count || 1, dietary_notes || null, message_to_host || null, req.params.token]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Invitation not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save guest email for reminder
router.put('/invite/:token/email', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const result = await pool.query(
      `UPDATE iftar_invites SET guest_email = $1, updated_at = NOW() WHERE token = $2 RETURNING id, guest_email`,
      [email.trim().toLowerCase(), req.params.token]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Invitation not found' });
    res.json({ success: true, email: result.rows[0].guest_email });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Authenticated Routes (admin) ───

// Get event dashboard
router.get('/events', authenticate, async (req, res) => {
  try {
    const events = await pool.query(
      `SELECT * FROM iftar_events WHERE owner_id IN (SELECT id FROM users WHERE household_id = $1) ORDER BY event_date DESC`,
      [req.user.household_id]
    );
    const result = [];
    for (const evt of events.rows) {
      const invites = await pool.query(
        'SELECT * FROM iftar_invites WHERE event_id = $1 ORDER BY created_at',
        [evt.id]
      );
      const stats = {
        total_invited: invites.rows.length,
        attending: invites.rows.filter(i => i.rsvp_status === 'attending').reduce((s, i) => s + (i.guest_count || 1), 0),
        declined: invites.rows.filter(i => i.rsvp_status === 'declined').length,
        maybe: invites.rows.filter(i => i.rsvp_status === 'maybe').reduce((s, i) => s + (i.guest_count || 1), 0),
        pending: invites.rows.filter(i => i.rsvp_status === 'pending').length,
        total_expected: invites.rows.filter(i => ['attending', 'maybe'].includes(i.rsvp_status)).reduce((s, i) => s + (i.guest_count || 1), 0)
      };
      result.push({ ...evt, invites: invites.rows, stats });
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create event
router.post('/events', authenticate, async (req, res) => {
  try {
    const { title, event_date, event_time, sunset_time, address_line1, address_line2,
            city, state, zip, message, host_name, host_phone } = req.body;
    const result = await pool.query(
      `INSERT INTO iftar_events (title, event_date, event_time, sunset_time, address_line1, 
       address_line2, city, state, zip, message, host_name, host_phone, owner_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [title || 'Ramadan Iftar', event_date, event_time || null, sunset_time || null,
       address_line1, address_line2 || null, city, state, zip, message || null,
       host_name, host_phone || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update event
router.put('/events/:id', authenticate, async (req, res) => {
  try {
    const fields = ['title','event_date','event_time','sunset_time','address_line1','address_line2',
                    'city','state','zip','message','host_name','host_phone','active'];
    const sets = [];
    const params = [];
    fields.forEach(f => {
      if (req.body[f] !== undefined) { params.push(req.body[f]); sets.push(`${f}=$${params.length}`); }
    });
    if (!sets.length) return res.status(400).json({ error: 'Nothing to update' });
    params.push(req.params.id, req.user.household_id);
    const result = await pool.query(
      `UPDATE iftar_events SET ${sets.join(', ')} WHERE id=$${params.length-1} AND owner_id IN (SELECT id FROM users WHERE household_id=$${params.length}) RETURNING *`,
      params
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create invite(s)
router.post('/events/:id/invites', authenticate, async (req, res) => {
  try {
    const { guests } = req.body; // [{name, phone?, email?}]
    if (!guests || !guests.length) return res.status(400).json({ error: 'guests array required' });
    
    const results = [];
    for (const g of guests) {
      const token = generateToken();
      const row = await pool.query(
        `INSERT INTO iftar_invites (event_id, token, guest_name, guest_phone, guest_email)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [req.params.id, token, g.name, g.phone || null, g.email || null]
      );
      results.push(row.rows[0]);
    }
    res.status(201).json(results);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete invite
router.delete('/invites/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM iftar_invites WHERE id = $1 
       AND event_id IN (SELECT id FROM iftar_events WHERE owner_id IN (SELECT id FROM users WHERE household_id = $2)) RETURNING id`,
      [req.params.id, req.user.household_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark invite link as sent
router.put('/invites/:id/sent', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE iftar_invites SET link_sent = true, link_sent_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND event_id IN (SELECT id FROM iftar_events WHERE owner_id IN (SELECT id FROM users WHERE household_id = $2)) RETURNING *`,
      [req.params.id, req.user.household_id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send reminder emails to attending/maybe guests with emails
router.post('/events/:id/send-reminders', authenticate, async (req, res) => {
  try {
    const event = await pool.query('SELECT * FROM iftar_events WHERE id=$1 AND owner_id IN (SELECT id FROM users WHERE household_id=$2)', [req.params.id, req.user.household_id]);
    if (!event.rows[0]) return res.status(404).json({ error: 'Event not found' });
    const e = event.rows[0];

    const invites = await pool.query(
      `SELECT * FROM iftar_invites WHERE event_id=$1 AND rsvp_status IN ('attending','maybe') AND guest_email IS NOT NULL AND guest_email != ''`,
      [req.params.id]
    );
    if (!invites.rows.length) return res.json({ sent: 0, message: 'No guests with emails to remind' });

    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.REMINDER_EMAIL_USER, pass: process.env.REMINDER_EMAIL_PASS }
    });

    const eventDate = new Date(e.event_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const fmtTime = (t) => { if(!t) return ''; const [h,m] = t.split(':').map(Number); const ap = h>=12?'PM':'AM'; const h12 = h%12||12; return m ? `${h12}:${String(m).padStart(2,'0')} ${ap}` : `${h12} ${ap}`; };
    const addr = [e.address_line1, e.address_line2, [e.city, e.state, e.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ');
    const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(addr)}`;

    let sent = 0;
    const errors = [];
    for (const inv of invites.rows) {
      const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:Arial,sans-serif">
<div style="max-width:500px;margin:0 auto;padding:32px 20px">
  <div style="text-align:center;padding:28px 24px;background:rgba(255,255,255,0.05);border:1px solid rgba(212,165,71,0.3);border-radius:16px">
    <p style="font-family:serif;font-size:18px;color:#d4a547;margin:0 0 8px">بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</p>
    <h1 style="font-family:Georgia,serif;font-size:28px;margin:0 0 4px;color:#d4a547">Ramadan Mubarak 🌙</h1>
    <p style="color:#ccc;font-size:14px;margin:0 0 20px">A gentle reminder for tomorrow's Iftar</p>
    <hr style="border:none;border-top:1px solid rgba(212,165,71,0.2);margin:16px 0">
    <p style="font-family:Georgia,serif;font-size:18px;color:#fff;margin:0 0 20px;font-style:italic">Dear ${inv.guest_name},</p>
    <p style="color:#ccc;font-size:15px;line-height:1.6;margin:0 0 24px">We're looking forward to having you join us for Iftar tomorrow! Here's a quick reminder of the details:</p>
    <div style="background:rgba(212,165,71,0.08);border-radius:12px;padding:20px;text-align:left;margin:0 0 24px">
      <p style="margin:0 0 10px;color:#fff;font-size:15px">📅 <strong>${eventDate}</strong></p>
      <p style="margin:0 0 10px;color:#fff;font-size:15px">⏰ <strong>${fmtTime(e.event_time)} onwards</strong></p>
      <p style="margin:0 0 10px;color:#fff;font-size:15px">🌅 <strong>Sunset at ${fmtTime(e.sunset_time)}</strong></p>
      <p style="margin:0;color:#fff;font-size:15px">📍 <a href="${mapsUrl}" style="color:#f5d799;text-decoration:none;border-bottom:1px solid rgba(212,165,71,0.4)">${addr}</a></p>
    </div>
    <a href="${mapsUrl}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#d4a547,#e8bf6a);color:#0a0e1a;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px">Open in Google Maps</a>
    <p style="color:#888;font-size:13px;margin:24px 0 0;font-style:italic">With love from the ${e.host_name} family 🤲</p>
  </div>
  <p style="text-align:center;color:#555;font-size:11px;margin:16px 0 0">You received this because you RSVP'd to our Iftar invitation.</p>
</div>
</body></html>`;

      try {
        await transporter.sendMail({
          from: `"${e.host_name} Family" <${process.env.REMINDER_EMAIL_USER}>`,
          to: inv.guest_email,
          subject: `🌙 Reminder: Iftar Tomorrow — ${eventDate}`,
          html
        });
        sent++;
      } catch (err) {
        errors.push({ guest: inv.guest_name, error: err.message });
      }
    }
    res.json({ sent, total: invites.rows.length, errors });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
