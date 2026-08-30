const { Client } = require('pg');

async function check() {
  const client = new Client({ connectionString: 'postgresql://udr:secret@localhost:5433/udrcrafts' });
  await client.connect();
  const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log(res.rows.map(r => r.table_name));
  await client.end();
}

check().catch(console.error);
