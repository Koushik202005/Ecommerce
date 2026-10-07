const { ensureDatabase, closeDatabase } = require('../server');

async function main() {
  try {
    await ensureDatabase();
    console.log('PostgreSQL schema is current and the default store is initialized.');
  } finally {
    await closeDatabase();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
