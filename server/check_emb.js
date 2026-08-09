const { Client } = require('pg');

async function check() {
  const client = new Client({ connectionString: 'postgresql://udr:secret@localhost:5433/udrcrafts' });
  await client.connect();
  const res = await client.query("SELECT id, name, embedding IS NULL as is_null_emb FROM \"Product\" LIMIT 10");
  console.log(res.rows);
  await client.end();
}

check().catch(console.error);
