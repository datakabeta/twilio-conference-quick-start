const config = require("../config");

const { Pool } = require('pg');

const pool = new Pool({
  host: config.dbHost,
  port: config.dbPort,
  database: config.dbName,
  user: config.dbUsername,
  password: config.dbPwd
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Error connecting to the database', err.stack);
  } else {
    console.log('Connected to the database at', res.rows[0].now);
  }
});

module.exports = pool;

