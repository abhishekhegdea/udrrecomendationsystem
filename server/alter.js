const { Client } = require('pg');
async function run() {
  const client = new Client({ connectionString: 'postgresql://udr:secret@localhost:5433/udrcrafts' });
  await client.connect();
  await client.query('ALTER TABLE "Product" ALTER COLUMN embedding TYPE vector(384)');
  console.log('Successfully altered embedding to vector(384)');
  await client.end();
}
run().catch(console.error);
