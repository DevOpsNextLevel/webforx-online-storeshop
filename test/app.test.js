const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.TYPEORM_SYNC = 'true';
process.env.CREATE_DB_IF_MISSING = 'false';
process.env.STARTUP_UPLOAD_STATIC = 'false';
process.env.DB_SSL = 'false';

const { app, AppDataSource } = require('../app');

let server;
let baseUrl;
const products = [{ id: 1, name: 'Test Product', price: 1.99, image: 'test.jpg' }];
const orders = [];

before(async () => {
  const productRepo = {
    find: async () => products,
    count: async () => products.length,
  };
  const orderRepo = {
    save: async (order) => {
      const saved = { ...order, id: orders.length + 1 };
      orders.push(saved);
      return saved;
    },
    count: async () => orders.length,
  };
  const originalGetRepository = AppDataSource.getRepository.bind(AppDataSource);
  AppDataSource.getRepository = (entity) => {
    if (entity === 'Product') return productRepo;
    if (entity === 'Order') return orderRepo;
    return originalGetRepository(entity);
  };
  AppDataSource.isInitialized = true;

  server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
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
});

test('GET /healthz returns ok', async () => {
  const response = await fetch(`${baseUrl}/healthz`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ok');
});

test('GET /readyz returns ready when initialized', async () => {
  const response = await fetch(`${baseUrl}/readyz`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'ready');
});

test('GET /products shows seeded products', async () => {
  const response = await fetch(`${baseUrl}/products`);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /Test Product/);
});

test('POST /checkout creates an order', async () => {
  const cartData = JSON.stringify([
    { id: 1, name: 'Test Product', price: 1.99, quantity: 2 },
  ]);
  const payload = new URLSearchParams({
    name: 'Ada Lovelace',
    address: '123 Test Ave',
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

  const orderCount = orders.length;
  assert.equal(orderCount, 1);
});

test('POST /checkout rejects empty carts', async () => {
  const payload = new URLSearchParams({
    name: 'Ada Lovelace',
    address: '123 Test Ave',
    cartData: '[]',
  });

  const response = await fetch(`${baseUrl}/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload,
  });

  assert.equal(response.status, 400);
  assert.equal(await response.text(), 'Cart is empty');
});
