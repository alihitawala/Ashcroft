#!/usr/bin/env node
/**
 * Eid ul-Fitr Invite Manager
 * Usage:
 *   node eid-invite.js add "Guest Name" [phone] [email]
 *   node eid-invite.js list
 *   node eid-invite.js links
 */
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  user: 'ashcroft',
  database: 'ashcroft_app',
  host: '/var/run/postgresql',
});

const EID_EVENT_ID = 16;
const BASE_URL = 'https://ashcroft.cloud/eid-party/?t=';

function genToken() {
  return crypto.randomBytes(6).toString('base64url');
}

async function addGuest(name, phone, email) {
  const token = genToken();
  const res = await pool.query(
    `INSERT INTO iftar_invites (event_id, token, guest_name, guest_phone, guest_email)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, token, guest_name`,
    [EID_EVENT_ID, token, name, phone || null, email || null]
  );
  const row = res.rows[0];
  console.log(`✅ Added: ${row.guest_name}`);
  console.log(`   Link: ${BASE_URL}${row.token}`);
  return row;
}

async function listGuests() {
  const res = await pool.query(
    `SELECT i.id, i.token, i.guest_name, i.guest_phone, i.rsvp_status, 
            i.guest_count, i.message_to_host, i.link_sent, i.rsvp_at
     FROM iftar_invites i WHERE i.event_id = $1 ORDER BY i.id`,
    [EID_EVENT_ID]
  );
  if (!res.rows.length) { console.log('No guests yet.'); return; }
  
  const counts = { pending: 0, attending: 0, maybe: 0, declined: 0, total: 0 };
  console.log('\n🌙 Eid ul-Fitr Guest List\n');
  console.log('─'.repeat(80));
  for (const g of res.rows) {
    const status = g.rsvp_status === 'attending' ? '🎉' : g.rsvp_status === 'maybe' ? '🤔' : g.rsvp_status === 'declined' ? '❌' : '⏳';
    const sent = g.link_sent ? '📨' : '📝';
    console.log(`${status} ${g.guest_name.padEnd(25)} ${(g.rsvp_status || 'pending').padEnd(12)} Guests: ${g.guest_count || '-'}  ${sent}  ${BASE_URL}${g.token}`);
    counts[g.rsvp_status || 'pending']++;
    if (g.rsvp_status === 'attending') counts.total += (g.guest_count || 1);
    if (g.message_to_host) console.log(`   💬 "${g.message_to_host}"`);
  }
  console.log('─'.repeat(80));
  console.log(`\n📊 Summary: ${res.rows.length} invited | 🎉 ${counts.attending} attending (${counts.total} guests) | 🤔 ${counts.maybe} maybe | ❌ ${counts.declined} declined | ⏳ ${counts.pending} pending\n`);
}

async function showLinks() {
  const res = await pool.query(
    `SELECT guest_name, token FROM iftar_invites WHERE event_id = $1 ORDER BY id`,
    [EID_EVENT_ID]
  );
  if (!res.rows.length) { console.log('No guests yet.'); return; }
  console.log('\n🔗 Invite Links\n');
  for (const g of res.rows) {
    console.log(`${g.guest_name}: ${BASE_URL}${g.token}`);
  }
  console.log('');
}

async function main() {
  const [,, cmd, ...args] = process.argv;
  try {
    switch (cmd) {
      case 'add': await addGuest(args[0], args[1], args[2]); break;
      case 'list': await listGuests(); break;
      case 'links': await showLinks(); break;
      default: console.log('Usage: node eid-invite.js <add|list|links> [args]'); break;
    }
  } finally { await pool.end(); }
}

main().catch(e => { console.error(e); process.exit(1); });
