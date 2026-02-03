const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { Client } = require('pg');

process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'postgres';
process.env.DB_HOST = process.env.DB_HOST || 'localhost';
process.env.DB_PORT = process.env.DB_PORT || '5432';
process.env.DB_USER = process.env.DB_USER || 'postgres';
process.env.DB_PASS = process.env.DB_PASS || 'postgres';
process.env.DB_NAME = process.env.DB_NAME || `webforx_store_test_${Date.now()}`;
process.env.DB_SSL = 'false';
process.env.CREATE_DB_IF_MISSING = 'true';
process.env.TYPEORM_SYNC = 'true';
process.env.STARTUP_UPLOAD_STATIC = 'false';
process.env.PORT = '0';
process.env.HOST = '127.0.0.1';
process.env.SEED_PRODUCTS_JSON = JSON.stringify([
  { name: 'Integration Donut', price: 4.2, image: 'test.jpg' },
]);

const {
  startServer,
  destroyDataSource,
  AppDataSource,
} = require('../../app');

let server;
let baseUrl;

async function dropDatabase() {
  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: 'postgres',
  });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${process.env.DB_NAME}"`);
  await client.end();
}

before(async () => {
  server = await startServer();
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unexpected server address');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await destroyDataSource();
  await dropDatabase();
});

test('GET /healthz returns ok', async () => {
  const response = await fetch(`${baseUrl}/healthz`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ok');
});

test('GET /products shows seeded products', async () => {
  const response = await fetch(`${baseUrl}/products`);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /Integration Donut/);
});

test('POST /checkout creates an order', async () => {
  const cartData = JSON.stringify([
    { id: 1, name: 'Integration Donut', price: 4.2, quantity: 1 },
  ]);
  const payload = new URLSearchParams({
    name: 'Grace Hopper',
    address: '42 Fleet St',
    cartData,
  });

  const response = await fetch(`${baseUrl}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload,
  });

  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /Thank you for your order!/);

  const orderRepo = AppDataSource.getRepository('Order');
  const count = await orderRepo.count();
  assert.equal(count, 1);
});
