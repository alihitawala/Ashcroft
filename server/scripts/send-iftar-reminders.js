#!/usr/bin/env node
/**
 * Send Iftar reminder emails to attending/maybe guests with emails.
 * Usage: node send-iftar-reminders.js [--event-id=N] [--to=email] [--dry-run]
 * 
 * ⚠️  IMPORTANT: NEVER run this script without Ali's explicit confirmation
 *    of the recipients AND content. Always --dry-run first and show Ali the output.
 * 
 * Called by cron the day before an event. Finds events happening tomorrow
 * (in America/Los_Angeles timezone) or uses --event-id for a specific one.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const nodemailer = require('nodemailer');

const pool = new Pool({ user: 'ashcroft', database: 'ashcroft_app', host: '/var/run/postgresql' });

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const eventIdArg = args.find(a => a.startsWith('--event-id='));
const specificEventId = eventIdArg ? parseInt(eventIdArg.split('=')[1]) : null;
const toArg = args.find(a => a.startsWith('--to='));
const singleRecipient = toArg ? toArg.split('=')[1] : null;
const ccArg = args.find(a => a.startsWith('--cc='));
const ccRecipient = ccArg ? ccArg.split('=')[1] : null;
const apologyMode = args.includes('--apology');

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${ap}` : `${h12} ${ap}`;
}

function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

function isEidEvent(event) {
  return /eid/i.test(event.title);
}

function buildReminderHtml(event, invite) {
  const e = event;
  const eventDate = fmtDate(e.event_date);
  const addr = [e.address_line1, e.address_line2, [e.city, e.state, e.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(addr)}`;
  const eid = isEidEvent(e);

  const heading = eid ? 'Eid Mubarak! 🎉' : 'Ramadan Mubarak 🌙';
  const subtitle = eid
    ? `A friendly reminder about our ${e.title}`
    : "A gentle reminder for tomorrow's Iftar";
  const bodyText = eid
    ? `We're excited to celebrate Eid with you! Here's a quick reminder of the details:`
    : `We're looking forward to having you join us for Iftar tomorrow! Here's a quick reminder of the details:`;
  const footerText = eid
    ? `You received this because you RSVP'd to our Eid celebration.`
    : `You received this because you RSVP'd to our Iftar invitation.`;

  // Sunset line only for Iftar events
  const sunsetLine = (!eid && e.sunset_time)
    ? `<p style="margin:0 0 10px;color:#3a302a;font-size:15px">🌅 <strong>Sunset at ${fmtTime(e.sunset_time)}</strong></p>`
    : '';

  // RSVP link — eid events use /eid-party/, iftar events use /iftar/
  const rsvpPath = eid ? 'eid-party' : 'iftar';
  const rsvpUrl = `https://ashcroft.cloud/${rsvpPath}/?t=${invite.token}`;

  if (eid) {
    // Warm cream/gold theme matching eid-party invite page
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#faf5eb;font-family:Arial,sans-serif">
<div style="max-width:500px;margin:0 auto;padding:32px 20px">
  <div style="text-align:center;padding:28px 24px;background:#fefcf7;border:1px solid #f0dca0;border-radius:16px">
    <p style="font-family:serif;font-size:18px;color:#b8860b;margin:0 0 8px">بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</p>
    <h1 style="font-family:Georgia,serif;font-size:28px;margin:0 0 4px;color:#b8860b">${heading}</h1>
    <p style="color:#6b5d52;font-size:14px;margin:0 0 20px">${subtitle}</p>
    <hr style="border:none;border-top:1px solid #f0dca0;margin:16px 0">
    <p style="font-family:Georgia,serif;font-size:18px;color:#3a302a;margin:0 0 20px;font-style:italic">Dear ${invite.guest_name},</p>
    <p style="color:#6b5d52;font-size:15px;line-height:1.6;margin:0 0 24px">${bodyText}</p>
    <div style="background:rgba(184,134,11,0.08);border-radius:12px;padding:20px;text-align:left;margin:0 0 24px">
      <p style="margin:0 0 10px;color:#3a302a;font-size:15px">📅 <strong>${eventDate}</strong></p>
      <p style="margin:0 0 10px;color:#3a302a;font-size:15px">⏰ <strong>${fmtTime(e.event_time)} onwards</strong></p>
      <p style="margin:0;color:#3a302a;font-size:15px">📍 <a href="${mapsUrl}" style="color:#b8860b;text-decoration:none;border-bottom:1px solid rgba(184,134,11,0.4)">${addr}</a></p>
    </div>
    <a href="${mapsUrl}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#b8860b,#d4a843);color:#fff;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;margin:0 8px 12px">Open in Google Maps</a>
    <a href="${rsvpUrl}" style="display:inline-block;padding:12px 28px;background:#fefcf7;color:#b8860b;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;border:1.5px solid #d4a843;margin:0 8px 12px">View RSVP</a>
    <p style="color:#6b5d52;font-size:13px;margin:24px 0 0;font-style:italic">With love, ${e.host_name} 🤲</p>
  </div>
  <p style="text-align:center;color:#999;font-size:11px;margin:16px 0 0">${footerText}</p>
</div>
</body></html>`;
  }

  // Dark theme for Iftar/Ramadan events
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:Arial,sans-serif">
<div style="max-width:500px;margin:0 auto;padding:32px 20px">
  <div style="text-align:center;padding:28px 24px;background:rgba(255,255,255,0.05);border:1px solid rgba(212,165,71,0.3);border-radius:16px">
    <p style="font-family:serif;font-size:18px;color:#d4a547;margin:0 0 8px">بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</p>
    <h1 style="font-family:Georgia,serif;font-size:28px;margin:0 0 4px;color:#d4a547">${heading}</h1>
    <p style="color:#ccc;font-size:14px;margin:0 0 20px">${subtitle}</p>
    <hr style="border:none;border-top:1px solid rgba(212,165,71,0.2);margin:16px 0">
    <p style="font-family:Georgia,serif;font-size:18px;color:#fff;margin:0 0 20px;font-style:italic">Dear ${invite.guest_name},</p>
    <p style="color:#ccc;font-size:15px;line-height:1.6;margin:0 0 24px">${bodyText}</p>
    <div style="background:rgba(212,165,71,0.08);border-radius:12px;padding:20px;text-align:left;margin:0 0 24px">
      <p style="margin:0 0 10px;color:#fff;font-size:15px">📅 <strong>${eventDate}</strong></p>
      <p style="margin:0 0 10px;color:#fff;font-size:15px">⏰ <strong>${fmtTime(e.event_time)} onwards</strong></p>
      ${sunsetLine}
      <p style="margin:0;color:#fff;font-size:15px">📍 <a href="${mapsUrl}" style="color:#f5d799;text-decoration:none;border-bottom:1px solid rgba(212,165,71,0.4)">${addr}</a></p>
    </div>
    <a href="${mapsUrl}" style="display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#d4a547,#e8bf6a);color:#0a0e1a;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;margin:0 8px 12px">Open in Google Maps</a>
    <a href="${rsvpUrl}" style="display:inline-block;padding:12px 28px;background:rgba(255,255,255,0.05);color:#f5d799;text-decoration:none;border-radius:8px;font-weight:bold;font-size:15px;border:1px solid rgba(212,165,71,0.3);margin:0 8px 12px">View RSVP</a>
    <p style="color:#888;font-size:13px;margin:24px 0 0;font-style:italic">With love, ${e.host_name} 🤲</p>
  </div>
  <p style="text-align:center;color:#555;font-size:11px;margin:16px 0 0">${footerText}</p>
</div>
</body></html>`;
}

async function main() {
  console.log(`[iftar-reminders] Starting${dryRun ? ' (DRY RUN)' : ''}...`);

  let events;
  if (specificEventId) {
    events = await pool.query('SELECT * FROM iftar_events WHERE id = $1 AND active = true', [specificEventId]);
  } else {
    // Find events happening tomorrow in PT
    const tomorrow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    console.log(`[iftar-reminders] Looking for events on ${tomorrowStr}`);
    events = await pool.query('SELECT * FROM iftar_events WHERE event_date::date = $1 AND active = true', [tomorrowStr]);
  }

  if (!events.rows.length) {
    console.log('[iftar-reminders] No events found. Exiting.');
    await pool.end();
    process.exit(0);
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.REMINDER_EMAIL_USER, pass: process.env.REMINDER_EMAIL_PASS }
  });

  // Verify SMTP connection
  try {
    await transporter.verify();
    console.log('[iftar-reminders] SMTP connection verified ✅');
  } catch (err) {
    console.error('[iftar-reminders] SMTP connection FAILED ❌', err.message);
    await pool.end();
    process.exit(1);
  }

  let totalSent = 0, totalFailed = 0;

  for (const event of events.rows) {
    console.log(`[iftar-reminders] Processing event: ${event.title} (id=${event.id})`);
    
    let invites;
    if (singleRecipient) {
      invites = await pool.query(
        `SELECT * FROM iftar_invites WHERE event_id = $1 AND guest_email = $2`,
        [event.id, singleRecipient]
      );
    } else {
      invites = await pool.query(
        `SELECT * FROM iftar_invites WHERE event_id = $1 AND rsvp_status IN ('attending', 'maybe') AND guest_email IS NOT NULL AND guest_email != ''`,
        [event.id]
      );
    }

    console.log(`[iftar-reminders] Found ${invites.rows.length} guests with emails to remind`);

    for (const inv of invites.rows) {
      const html = buildReminderHtml(event, inv);
      const eventDate = fmtDate(event.event_date);
      const eid = isEidEvent(event);
      const subject = eid
        ? `🎉 Reminder: ${event.title} — ${eventDate}`
        : `🌙 Reminder: Iftar Tomorrow — ${eventDate}`;
      // If apology mode, append apology note to the email
      let finalHtml = html;
      if (apologyMode) {
        const apologyBlock = `<div style="max-width:500px;margin:16px auto 0;padding:16px 20px;text-align:center">
  <p style="font-size:13px;color:#888;line-height:1.6;margin:0">
    <strong>P.S.</strong> We apologize for the earlier email sent in error — it had incorrect event details. 
    This is the correct reminder. Sorry about the confusion! 🙏<br>— Bittu (Ali's assistant)
  </p>
</div>`;
        finalHtml = html.replace('</body>', apologyBlock + '</body>');
      }

      const mailOpts = {
        from: `"${event.host_name}" <${process.env.REMINDER_EMAIL_USER}>`,
        to: inv.guest_email,
        subject,
        html: finalHtml
      };
      if (ccRecipient) mailOpts.cc = ccRecipient;

      if (dryRun) {
        console.log(`[iftar-reminders] [DRY RUN] Would send to: ${inv.guest_email} (${inv.guest_name})`);
        totalSent++;
      } else {
        try {
          await transporter.sendMail(mailOpts);
          console.log(`[iftar-reminders] ✅ Sent to: ${inv.guest_email} (${inv.guest_name})`);
          totalSent++;
        } catch (err) {
          console.error(`[iftar-reminders] ❌ Failed for ${inv.guest_email}: ${err.message}`);
          totalFailed++;
        }
      }
    }
  }

  console.log(`[iftar-reminders] Done! Sent: ${totalSent}, Failed: ${totalFailed}`);
  await pool.end();
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('[iftar-reminders] Fatal error:', err);
  process.exit(1);
});
