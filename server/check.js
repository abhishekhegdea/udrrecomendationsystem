const { Client } = require('pg');

async function check() {
  const client = new Client({ connectionString: 'postgresql://udr:secret@localhost:5433/udrcrafts' });
  await client.connect();
  const res = await client.query('SELECT count(*) FROM "State"');
  console.log('States:', res.rows[0].count);
  if (res.rows[0].count === '0') {
    console.log('Seeding...');
    const countryRes = await client.query(`INSERT INTO "Country" (id, name) VALUES ('c1', 'India') RETURNING id`);
    const stateRes1 = await client.query(`INSERT INTO "State" (id, name, "countryId") VALUES ('s1', 'Maharashtra', 'c1') RETURNING id`);
    await client.query(`INSERT INTO "City" (id, name, "stateId") VALUES ('ci1', 'Mumbai', 's1')`);
    
    const stateRes2 = await client.query(`INSERT INTO "State" (id, name, "countryId") VALUES ('s2', 'Delhi', 'c1') RETURNING id`);
    await client.query(`INSERT INTO "City" (id, name, "stateId") VALUES ('ci2', 'New Delhi', 's2')`);
    console.log('Done seeding!');
  }
  await client.end();
}

check().catch(console.error);
