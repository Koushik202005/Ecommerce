const { AsyncLocalStorage } = require('node:async_hooks');
const { Pool } = require('pg');

const transactionContext = new AsyncLocalStorage();
let pool;

async function connectionString() {
  const configured = process.env.DATABASE_URL || process.env.NETLIFY_DB_URL;
  if (configured) return configured;

  if (process.env.NETLIFY) {
    const { getConnectionString } = await import('@netlify/database');
    return getConnectionString();
  }

  throw new Error('Set DATABASE_URL to a PostgreSQL connection string, or connect a Netlify Database.');
}

async function getPool() {
  if (pool) return pool;
  const url = await connectionString();
  pool = new Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX || (process.env.NETLIFY ? 1 : 5)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  pool.on('error', error => console.error('PostgreSQL pool error:', error));
  return pool;
}

function postgresStatement(sql) {
  let statement = String(sql).trim();
  const ignoreConflicts = /^INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(statement);
  if (ignoreConflicts) statement = statement.replace(/^INSERT\s+OR\s+IGNORE\s+INTO\b/i, 'INSERT INTO');
  let index = 0;
  statement = statement.replace(/\?/g, () => `$${++index}`);
  if (ignoreConflicts && !/\bON\s+CONFLICT\b/i.test(statement)) statement += ' ON CONFLICT DO NOTHING';
  statement = statement.replace(/ORDER\s+BY\s+v\.rowid\b/gi, 'ORDER BY v.name');
  return statement;
}

async function query(sql, values = []) {
  const executor = transactionContext.getStore() || await getPool();
  return executor.query(postgresStatement(sql), values);
}

const db = {
  prepare(sql) {
    return {
      async get(...values) {
        const result = await query(sql, values);
        return result.rows[0];
      },
      async all(...values) {
        const result = await query(sql, values);
        return result.rows;
      },
      async run(...values) {
        const result = await query(sql, values);
        return { changes: result.rowCount, rows: result.rows };
      },
    };
  },
  async exec(sql) {
    const executor = transactionContext.getStore() || await getPool();
    const statements = String(sql).split(/;\s*(?:\r?\n|$)/).map(item => item.trim()).filter(Boolean);
    for (const statement of statements) await executor.query(statement);
  },
  async transaction(callback) {
    // Reuse the current transaction when startup work nests transaction helpers.
    if (transactionContext.getStore()) return callback();
    const activePool = await getPool();
    const client = await activePool.connect();
    try {
      await client.query('BEGIN');
      const result = await transactionContext.run(client, callback);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
  async close() {
    if (pool) {
      const current = pool;
      pool = undefined;
      await current.end();
    }
  },
};

module.exports = { db, getPool, query, closeDatabase: () => db.close() };
