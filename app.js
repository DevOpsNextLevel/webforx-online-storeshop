require('dotenv').config();
require('reflect-metadata');

const express = require('express');
const compression = require('compression');
const helmet = require('helmet');
const { DataSource, EntitySchema } = require('typeorm');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 8080);

/** Security & perf */
app.set('trust proxy', true);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());

/** Body parsing */
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

/** Entities */
const ProductEntity = new EntitySchema({
  name: 'Product',
  tableName: 'products',
  columns: {
    id: { primary: true, type: 'int', generated: true },
    name: { type: 'varchar', nullable: false },
    price: { type: 'float', nullable: false },
    image: { type: 'varchar', nullable: false },
  },
});

const OrderEntity = new EntitySchema({
  name: 'Order',
  tableName: 'orders',
  columns: {
    id: { primary: true, type: 'int', generated: true },
    name: { type: 'varchar', nullable: false },
    address: { type: 'varchar', nullable: false },
    total: { type: 'float', nullable: false },
    createdAt: { type: 'timestamp', createDate: true },
  },
  relations: {
    orderItems: {
      type: 'one-to-many',
      target: 'OrderItem',
      inverseSide: 'order',
      cascade: true,
    },
  },
});

const OrderItemEntity = new EntitySchema({
  name: 'OrderItem',
  tableName: 'order_items',
  columns: {
    id: { primary: true, type: 'int', generated: true },
    productName: { type: 'varchar', nullable: false },
    productPrice: { type: 'float', nullable: false },
    quantity: { type: 'int', nullable: false, default: 1 },
  },
  relations: {
    order: {
      type: 'many-to-one',
      target: 'Order',
      joinColumn: true,
      onDelete: 'CASCADE',
    },
  },
});

/** Optional: create DB (off for RDS) */
async function ensureDatabaseExists() {
  if ((process.env.CREATE_DB_IF_MISSING || 'false').toLowerCase() !== 'true') {
    console.log('CREATE_DB_IF_MISSING=false (skipping DB creation)');
    return;
  }
  const targetDB = process.env.DB_NAME || 'webforx_store';
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
    ssl:
      process.env.DB_SSL === 'true' ||
      (process.env.DB_HOST && process.env.DB_HOST !== 'localhost')
        ? (process.env.DB_SSL_CA_PATH
            ? { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH).toString() }
            : { rejectUnauthorized: false })
        : false,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: 'postgres',
  };
  const client = new Client(dbConfig);
  await client.connect();
  const result = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDB]);
  if (result.rowCount === 0) {
    await client.query(`CREATE DATABASE "${targetDB}"`);
    console.log(`Database "${targetDB}" created.`);
  } else {
    console.log(`Database "${targetDB}" already exists.`);
  }
  await client.end();
}

/** Optional: upload /static to S3 on startup */
async function uploadStaticFilesToS3() {
  if ((process.env.STARTUP_UPLOAD_STATIC || 'false').toLowerCase() !== 'true') {
    console.log('STARTUP_UPLOAD_STATIC=false (skipping S3 upload)');
    return;
  }
  if (!process.env.S3_BUCKET || !process.env.S3_REGION) {
    console.log('S3_BUCKET/S3_REGION missing; skipping S3 upload.');
    return;
  }
  const { S3Client } = require('@aws-sdk/client-s3');
  const { Upload } = require('@aws-sdk/lib-storage');
  const s3Client = new S3Client({
    region: process.env.S3_REGION,
    credentials: process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY
      ? { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY }
      : undefined, // prefer IAM role
  });
  const dir = path.join(__dirname, 'static');
  if (!fs.existsSync(dir)) {
    console.log('No /static dir; skipping S3 upload.');
    return;
  }
  for (const file of fs.readdirSync(dir)) {
    const upload = new Upload({
      client: s3Client,
      params: { Bucket: process.env.S3_BUCKET, Key: file, Body: fs.createReadStream(path.join(dir, file)) },
    });
    await upload.done();
    console.log(`Uploaded ${file}`);
  }
}

/** TypeORM DS */
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
  ssl:
    process.env.DB_SSL === 'true' ||
    (process.env.DB_HOST && process.env.DB_HOST !== 'localhost')
      ? (process.env.DB_SSL_CA_PATH
          ? { ca: fs.readFileSync(process.env.DB_SSL_CA_PATH).toString() }
          : { rejectUnauthorized: false })
      : false,
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASS || 'postgres',
  database: process.env.DB_NAME || 'webforx_store',
  synchronize: (process.env.TYPEORM_SYNC || 'true').toLowerCase() === 'true',
  logging: false,
  entities: [ProductEntity, OrderEntity, OrderItemEntity],
});

/** Render page */
function renderPage(title, content) {
  return `
  <!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>${title}</title>
    <link rel="stylesheet" href="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/css/bootstrap.min.css"/>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css"/>
    <style>
      body { padding-top: 50px; } .container { max-width: 800px; }
      .fireworks-container { position: absolute; pointer-events: none; }
      .firework { position: absolute; width: 8px; height: 8px; background: gold; border-radius: 50%; opacity: 1; animation: firework-animation 0.8s ease-out forwards; }
      @keyframes firework-animation { 0% { transform: translate(0,0); opacity:1; } 100% { transform: translate(var(--dx), var(--dy)); opacity:0; } }
    </style>
  </head>
  <body>
    <div class="container">${content}</div>
    <script src="https://code.jquery.com/jquery-3.5.1.slim.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/popper.js@1.16.1/dist/umd/popper.min.js"></script>
    <script src="https://stackpath.bootstrapcdn.com/bootstrap/4.5.2/js/bootstrap.min.js"></script>
  </body>
  </html>`;
}

/** Local static (if present) */
const staticDir = path.join(__dirname, 'static');
if (fs.existsSync(staticDir)) {
  app.use('/static', express.static(staticDir, {
    setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=31536000, immutable'),
  }));
}

/** Hero image URL (S3 or local) */
const heroImageUrl =
  (process.env.S3_BUCKET && process.env.S3_REGION)
    ? `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/shop.svg`
    : '/static/shop.svg';

/** Health endpoints */
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/readyz', (_req, res) => AppDataSource.isInitialized ? res.send('ready') : res.status(503).send('not ready'));

/** Home */
app.get('/', (_req, res) => {
  const content = `
    <div class="hero-banner" style="position:relative; background:url('${heroImageUrl}') center/cover no-repeat; height:500px;">
      <div style="position:absolute; inset:0; background:rgba(0,0,0,0.5);">
        <div class="d-flex h-100 align-items-center justify-content-center">
          <div class="text-center text-white">
            <h1 class="display-3">Welcome to Web Forx Online Storeshop</h1>
            <p class="lead">Modern, simple, and fast shopping — powered by AWS.</p>
            <a class="btn btn-primary btn-lg" href="/products">Browse Products</a>
          </div>
        </div>
      </div>
    </div>`;
  res.send(renderPage('Web Forx Online Storeshop', content));
});

/** Products */
app.get('/products', async (_req, res) => {
  try {
    const repo = AppDataSource.getRepository('Product');
    const products = await repo.find();

    let html = `
      <div class="d-flex justify-content-end align-items-center mb-3" style="position: relative;">
        <button class="btn btn-secondary" onclick="location.href='/cart'" id="cartButton">
          <span id="cartIcon"><i class="fas fa-shopping-cart"></i></span> Cart (<span id="cartCount">0</span>)
        </button>
      </div>
      <h1 class="mb-4">Our Products</h1>
      <div class="list-group">`;

    products.forEach((p) => {
      const imageUrl =
        (process.env.S3_BUCKET && process.env.S3_REGION)
          ? `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION}.amazonaws.com/${p.image}`
          : `/static/${p.image}`;
      html += `
        <div class="list-group-item d-flex justify-content-between align-items-center">
          <div class="d-flex align-items-center">
            <img src="${imageUrl}" alt="${p.name}" style="width:250px; height:250px; object-fit:cover; margin-right:15px;" />
            <div>
              <h5 class="mb-1">${p.name}</h5>
              <p class="mb-1">$${p.price.toFixed(2)}</p>
            </div>
          </div>
          <button class="btn btn-success" onclick="addToCart(${p.id}, '${p.name.replace(/'/g, "\\'")}', ${p.price})">Add to Cart</button>
        </div>`;
    });

    html += `</div>
      <div class="text-center mt-4"><button class="btn btn-primary" onclick="location.href='/cart'">Go to Cart</button></div>
      <script>
        function addToCart(id, name, price) {
          let cart = sessionStorage.getItem('cart'); cart = cart ? JSON.parse(cart) : [];
          const it = cart.find(i => i.id === id); if (it) it.quantity += 1; else cart.push({ id, name, price, quantity: 1 });
          sessionStorage.setItem('cart', JSON.stringify(cart)); updateCartCount(); showFireworks();
        }
        function updateCartCount() {
          let cart = sessionStorage.getItem('cart'); cart = cart ? JSON.parse(cart) : [];
          const total = cart.reduce((s,i)=>s+i.quantity,0); document.getElementById('cartCount').innerText = total;
        }
        function showFireworks() {
          const cartButton = document.getElementById('cartButton'); const rect = cartButton.getBoundingClientRect();
          const container = document.createElement('div'); container.className='fireworks-container';
          container.style.left = rect.left+'px'; container.style.top = rect.top+'px';
          container.style.width = rect.width+'px'; container.style.height = rect.height+'px'; document.body.appendChild(container);
          for (let i=0;i<10;i++){ const s=document.createElement('div'); s.className='firework';
            const a=Math.random()*2*Math.PI; const d=Math.random()*30;
            s.style.setProperty('--dx',(Math.cos(a)*d)+'px'); s.style.setProperty('--dy',(Math.sin(a)*d)+'px'); container.appendChild(s);}
          setTimeout(()=>container.remove(),1000);
        }
        document.addEventListener('DOMContentLoaded', updateCartCount);
      </script>`;
    res.send(renderPage('Products - Web Forx Online Storeshop', html));
  } catch (e) {
    console.error('Error fetching products:', e);
    res.status(500).send('Error fetching products');
  }
});

/** Cart */
app.get('/cart', (_req, res) => {
  const content = `
    <h1>Your Cart</h1>
    <div id="cartContainer"></div>
    <a class="btn btn-primary mt-3" href="/checkout">Proceed to Checkout</a>
    <script>
      function renderCart() {
        let cart = sessionStorage.getItem('cart'); let container = document.getElementById('cartContainer');
        if (!cart || JSON.parse(cart).length === 0) { container.innerHTML = '<p>Your cart is empty.</p>'; return; }
        cart = JSON.parse(cart); let html = '<ul class="list-group">';
        cart.forEach(item => { html += '<li class="list-group-item d-flex justify-content-between align-items-center">' +
          item.name + ' - $' + item.price.toFixed(2) + ' x ' + item.quantity + '</li>'; });
        html += '</ul>'; container.innerHTML = html;
      }
      document.addEventListener('DOMContentLoaded', renderCart);
    </script>`;
  res.send(renderPage('Your Cart - Web Forx Online Storeshop', content));
});

/** Checkout */
app.get('/checkout', (_req, res) => {
  const content = `
    <h1>Checkout</h1>
    <div id="cartSummary"></div>
    <form method="POST" action="/checkout" onsubmit="return prepareOrder()">
      <div class="form-group"><label for="name">Name:</label>
        <input type="text" class="form-control" id="name" name="name" required></div>
      <div class="form-group"><label for="address">Address:</label>
        <textarea class="form-control" id="address" name="address" rows="3" required></textarea></div>
      <input type="hidden" id="cartData" name="cartData">
      <button type="submit" class="btn btn-success">Place Order</button>
    </form>
    <script>
      function renderCartSummary() {
        let cart = sessionStorage.getItem('cart'); let summary = document.getElementById('cartSummary');
        if (!cart || JSON.parse(cart).length === 0) { summary.innerHTML = '<p>Your cart is empty.</p>'; return; }
        cart = JSON.parse(cart); let html = '<ul class="list-group mb-3">'; let total = 0;
        cart.forEach(item => { total += item.price * item.quantity;
          html += '<li class="list-group-item d-flex justify-content-between align-items-center">' +
            item.name + ' - $' + item.price.toFixed(2) + ' x ' + item.quantity + '</li>'; });
        html += '</ul><h4>Total: $' + total.toFixed(2) + '</h4>'; summary.innerHTML = html;
      }
      function prepareOrder() {
        let cart = sessionStorage.getItem('cart');
        if (!cart || JSON.parse(cart).length === 0) { alert('Your cart is empty!'); return false; }
        document.getElementById('cartData').value = cart; return true;
      }
      document.addEventListener('DOMContentLoaded', renderCartSummary);
    </script>`;
  res.send(renderPage('Checkout - Web Forx Online Storeshop', content));
});

app.post('/checkout', async (req, res) => {
  const { name, address, cartData } = req.body || {};
  let cartItems;
  try {
    cartItems = JSON.parse(cartData || '[]');
  } catch {
    return res.status(400).send('Invalid cart data');
  }
  if (!Array.isArray(cartItems) || cartItems.length === 0) {
    return res.status(400).send('Cart is empty');
  }
  const total = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

  try {
    const orderRepository = AppDataSource.getRepository('Order');
    const order = {
      name,
      address,
      total,
      orderItems: cartItems.map(i => ({ productName: i.name, productPrice: i.price, quantity: i.quantity })),
    };
    const saved = await orderRepository.save(order);
    const content = `
      <div class="text-center">
        <h1>Thank you for your order!</h1>
        <p>Your order ID is ${saved.id}.</p>
        <a class="btn btn-primary" href="/" onclick="sessionStorage.removeItem('cart')">Back to Home</a>
      </div>`;
    res.send(renderPage('Order Confirmation - Web Forx Online Storeshop', content));
  } catch (e) {
    console.error('Error processing order:', e);
    res.status(500).send('Error processing order');
  }
});

/** Startup */
let server;
ensureDatabaseExists()
  .then(uploadStaticFilesToS3)
  .then(() => AppDataSource.initialize())
  .then(async () => {
    console.log('Database connected.');
    const repo = AppDataSource.getRepository('Product');
    const count = await repo.count();
    if (count === 0) {
      const defaults = (process.env.SEED_PRODUCTS_JSON
        ? JSON.parse(process.env.SEED_PRODUCTS_JSON)
        : [
            { name: 'WFX Strawberry Delight', price: 3.0, image: 'strawberry.svg' },
            { name: 'WFX Dark Chocolate',    price: 2.5, image: 'chocolate.svg' },
            { name: 'WFX Candy Crunch',      price: 2.75, image: 'candy.svg' },
            { name: 'WFX Berry Burst',       price: 3.0, image: 'berry.svg' },
            { name: 'WFX Salted Caramel',    price: 2.5, image: 'caramel.svg' },
            { name: 'WFX Orange Zest',       price: 2.5, image: 'orange.svg' },
          ]);
      await repo.save(defaults);
      console.log('Inserted default products.');
    }
    server = app.listen(port, '0.0.0.0', () => console.log(`Server on http://0.0.0.0:${port}`));
  })
  .catch(err => { console.error('Startup error:', err); process.exit(1); });

/** Graceful shutdown */
function shutdown() {
  console.log('Shutdown signal; closing...');
  if (server) {
    server.close(() => {
      AppDataSource.destroy().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10000).unref();
  } else {
    process.exit(0);
  }
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
