const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const ALI_PASS = 'TempAli2026!';
const SABA_PASS = 'TempSaba2026!';

async function seed() {
  try {
    const aliHash = await bcrypt.hash(ALI_PASS, 12);
    const sabaHash = await bcrypt.hash(SABA_PASS, 12);

    // Household
    const household = (await pool.query(
      `INSERT INTO households (name) VALUES ($1) ON CONFLICT DO NOTHING RETURNING id`,
      ['Ashcroft']
    )).rows[0] || (await pool.query('SELECT id FROM households WHERE name = $1', ['Ashcroft'])).rows[0];

    // Users
    const ali = (await pool.query(
      `INSERT INTO users (email, password_hash, name, role, household_id, household_role) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (email) DO UPDATE SET password_hash=$2, household_id=$5, household_role=$6 RETURNING id`,
      ['ali@ashcroft.cloud', aliHash, 'Ali', 'admin', household.id, 'head']
    )).rows[0];

    const saba = (await pool.query(
      `INSERT INTO users (email, password_hash, name, role, household_id, household_role) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (email) DO UPDATE SET password_hash=$2, household_id=$5, household_role=$6 RETURNING id`,
      ['saba@ashcroft.cloud', sabaHash, 'Saba', 'user', household.id, 'member']
    )).rows[0];

    // Task lists
    await pool.query(
      `INSERT INTO task_lists (name, access, owner_id) VALUES ('Personal', 'private', $1) ON CONFLICT DO NOTHING`,
      [ali.id]
    );
    await pool.query(
      `INSERT INTO task_lists (name, access, owner_id) VALUES ('Personal', 'private', $1) ON CONFLICT DO NOTHING`,
      [saba.id]
    );
    await pool.query(
      `INSERT INTO task_lists (name, access, owner_id) VALUES ('Household', 'household', $1) ON CONFLICT DO NOTHING`,
      [ali.id]
    );

    // Grocery list
    await pool.query(
      `INSERT INTO grocery_lists (name, access, owner_id) VALUES ('Grocery', 'household', $1) ON CONFLICT DO NOTHING`,
      [ali.id]
    );

    // Kanban board
    const board = (await pool.query(
      `INSERT INTO kanban_boards (name, owner_id, shared_with, access) VALUES ('Ali & Bittu', $1, $2, 'household') RETURNING id`,
      [ali.id, [saba.id]]
    )).rows[0];

    const columns = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'];
    for (let i = 0; i < columns.length; i++) {
      await pool.query(
        'INSERT INTO kanban_columns (board_id, name, position) VALUES ($1,$2,$3)',
        [board.id, columns[i], i]
      );
    }

    console.log('✅ Seed complete');
    console.log(`\n🔑 Temporary Passwords:`);
    console.log(`   Ali  (ali@ashcroft.cloud):  ${ALI_PASS}`);
    console.log(`   Saba (saba@ashcroft.cloud): ${SABA_PASS}`);
  } catch (err) {
    console.error('❌ Seed failed:', err);
  } finally {
    await pool.end();
  }
}

seed();
