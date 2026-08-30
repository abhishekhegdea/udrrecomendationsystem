const { Client } = require('pg');

async function check() {
  const client = new Client({ connectionString: 'postgresql://udr:secret@localhost:5433/udrcrafts' });
  await client.connect();
  const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'Brand'");
  console.log(res.rows);
  await client.end();
}

check().catch(console.error);
