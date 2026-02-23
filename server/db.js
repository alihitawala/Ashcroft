const { Pool } = require('pg');

const pool = new Pool({
  user: 'ashcroft',
  database: 'ashcroft_app',
  host: '/var/run/postgresql',
});

module.exports = { pool };
