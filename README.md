# Web Forx Online Storeshop

Node.js + Express + TypeORM + PostgreSQL. Containerized and ready for AWS ECS Fargate behind an ALB and (optionally) CloudFront.

## 1) Run locally (Docker Compose)

```bash
cp .env.example .env
docker compose up --build
# app: http://localhost:8080
# db:  localhost:5432 (postgres/postgres)
```

## 2) Run tests (Node.js test runner)

```bash
npm install
npm test
npm run test:watch
```

Tests use mocked repositories for fast HTTP checks without a DB.

## 3) Run integration tests (PostgreSQL)

Start a local Postgres (or use an existing one):

```bash
docker compose up -d db
```

Then run the integration suite:

```bash
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASS=postgres DB_SSL=false \
  npm run test:integration
```

Run everything in one go:

```bash
npm run test:all
```
