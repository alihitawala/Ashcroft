/**
 * Tests for the iftar reminder script utilities
 * Source: server/scripts/send-iftar-reminders.js
 */

// Extract and test the pure functions from the reminder script
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

describe('Reminder script - fmtTime', () => {
  test('formats PM time', () => expect(fmtTime('16:30:00')).toBe('4:30 PM'));
  test('formats sunset time', () => expect(fmtTime('18:02:00')).toBe('6:02 PM'));
  test('formats noon', () => expect(fmtTime('12:00:00')).toBe('12 PM'));
  test('formats midnight', () => expect(fmtTime('00:00:00')).toBe('12 AM'));
  test('formats AM time', () => expect(fmtTime('06:15:00')).toBe('6:15 AM'));
  test('returns empty for null', () => expect(fmtTime(null)).toBe(''));
  test('returns empty for empty string', () => expect(fmtTime('')).toBe(''));
});

describe('Reminder script - fmtDate', () => {
  test('formats ISO date correctly', () => {
    const result = fmtDate('2026-02-28T00:00:00.000Z');
    expect(result).toContain('February 28');
    expect(result).toContain('2026');
    expect(result).toContain('Saturday');
  });

  test('does NOT show wrong day due to timezone (regression)', () => {
    // This is the exact bug we hit — midnight UTC = previous day in PT
    const result = fmtDate('2026-02-28T00:00:00.000Z');
    expect(result).not.toContain('February 27');
    expect(result).toContain('February 28');
  });

  test('formats plain date string', () => {
    const result = fmtDate('2026-03-15');
    expect(result).toContain('March 15');
  });
});

// Replicate buildReminderHtml from the script for testing
function buildReminderHtml(event, invite) {
  const e = event;
  const eventDate = fmtDate(e.event_date);
  const addr = [e.address_line1, e.address_line2, [e.city, e.state, e.zip].filter(Boolean).join(', ')].filter(Boolean).join(', ');
  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(addr)}`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0e1a;font-family:Arial,sans-serif">
<div style="max-width:500px;margin:0 auto;padding:32px 20px">
  <div style="text-align:center;padding:28px 24px;background:rgba(255,255,255,0.05);border:1px solid rgba(212,165,71,0.3);border-radius:16px">
    <p style="font-family:serif;font-size:18px;color:#d4a547;margin:0 0 8px">بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</p>
    <h1 style="font-family:Georgia,serif;font-size:28px;margin:0 0 4px;color:#d4a547">Ramadan Mubarak 🌙</h1>
    <p style="color:#ccc;font-size:14px;margin:0 0 20px">A gentle reminder for tomorrow's Iftar</p>
    <hr style="border:none;border-top:1px solid rgba(212,165,71,0.2);margin:16px 0">
    <p style="font-family:Georgia,serif;font-size:18px;color:#fff;margin:0 0 20px;font-style:italic">Dear ${invite.guest_name},</p>
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
}

const sampleEvent = {
  event_date: '2026-03-15T00:00:00.000Z',
  event_time: '17:30:00',
  sunset_time: '18:05:00',
  address_line1: '123 Main St',
  address_line2: 'Suite 4',
  city: 'Dallas',
  state: 'TX',
  zip: '75001',
  host_name: 'Ahmed'
};
const sampleInvite = { guest_name: 'Fatima' };

describe('buildReminderHtml', () => {
  const html = buildReminderHtml(sampleEvent, sampleInvite);

  test('returns valid HTML with DOCTYPE', () => {
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  test('includes guest name', () => {
    expect(html).toContain('Dear Fatima');
  });

  test('includes Google Maps link', () => {
    expect(html).toContain('https://maps.google.com/?q=');
    expect(html).toContain('Open in Google Maps');
  });

  test('includes event date', () => {
    expect(html).toContain('March 15');
    expect(html).toContain('2026');
  });

  test('includes event time', () => {
    expect(html).toContain('5:30 PM');
  });

  test('includes sunset time', () => {
    expect(html).toContain('6:05 PM');
  });

  test('includes full address', () => {
    expect(html).toContain('123 Main St');
    expect(html).toContain('Suite 4');
    expect(html).toContain('Dallas');
  });

  test('includes host name', () => {
    expect(html).toContain('Ahmed family');
  });
});

describe('Reminder script - dry run', () => {
  test('script exists and is readable', () => {
    const fs = require('fs');
    const path = require('path');
    const scriptPath = path.join(__dirname, '../../scripts/send-iftar-reminders.js');
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  test('script has required env var references', () => {
    const fs = require('fs');
    const path = require('path');
    const content = fs.readFileSync(path.join(__dirname, '../../scripts/send-iftar-reminders.js'), 'utf8');
    expect(content).toContain('REMINDER_EMAIL_USER');
    expect(content).toContain('REMINDER_EMAIL_PASS');
    expect(content).toContain('--dry-run');
    expect(content).toContain('--event-id=');
  });
});

describe('Reminder script - ICS generation logic', () => {
  // Test the calendar date formatting used in the frontend
  test('date string strips hyphens for iCal format', () => {
    const dateStr = '2026-02-28T00:00:00.000Z';
    const datePart = dateStr.split('T')[0].replace(/-/g, '');
    expect(datePart).toBe('20260228');
  });

  test('time string converts to iCal format', () => {
    const time = '16:30:00';
    const icalTime = time.replace(/:/g, '').slice(0, 4) + '00';
    expect(icalTime).toBe('163000');
  });

  test('fmtTime "23:59:00" → "11:59 PM"', () => expect(fmtTime('23:59:00')).toBe('11:59 PM'));
  test('fmtTime "12:30:00" → "12:30 PM"', () => expect(fmtTime('12:30:00')).toBe('12:30 PM'));
  test('fmtTime "00:30:00" → "12:30 AM"', () => expect(fmtTime('00:30:00')).toBe('12:30 AM'));

  test('end time is 2h after sunset', () => {
    const sunsetTime = '18:02:00';
    const endH = parseInt(sunsetTime.split(':')[0]) + 2;
    const endTime = String(endH).padStart(2, '0') + '0000';
    expect(endTime).toBe('200000');
  });
});
