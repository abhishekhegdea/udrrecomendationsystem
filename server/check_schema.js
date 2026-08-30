const { Client } = require('pg');

async function check() {
  const client = new Client({ connectionString: 'postgresql://udr:secret@localhost:5433/udrcrafts' });
  await client.connect();
  const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'UserBehaviour'");
  console.log(res.rows.map(r => r.column_name));
  await client.end();
}

check().catch(console.error);
