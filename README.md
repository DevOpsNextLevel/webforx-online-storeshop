# Web Forx Online Storeshop

Modern online store demo built with Node.js, Express, TypeORM, and PostgreSQL. Ships with a Dockerized local stack and a production-ready ECS Fargate task definition.

## Overview

- **UI:** Server-rendered pages (home, products, cart, checkout)
- **Data:** `products`, `orders`, `order_items` via TypeORM
- **Infra-ready:** Docker, ECS Fargate, ALB, optional CloudFront and S3

## Local Deployment (Docker Compose)

```bash
cp .env.example .env
docker compose up --build
```

- App: `http://localhost:8080`
- Postgres: `localhost:5432` (`postgres/postgres`)

Stop containers:

```bash
docker compose down
```

## Local Development (Node)

```bash
npm install
npm run dev
```

Environment variables (examples):

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`
- `TYPEORM_SYNC=true` to auto-create tables

## Testing

Unit/HTTP tests (mocked repositories, no DB):

```bash
npm test
npm run test:watch
```

Integration tests (PostgreSQL required):

```bash
docker compose up -d db
DB_HOST=localhost DB_PORT=5432 DB_USER=postgres DB_PASS=postgres DB_SSL=false \
  npm run test:integration
```

Run all tests:

```bash
npm run test:all
```

## Cloud Deployment (AWS ECS Fargate)

### 1) Build & Push Image to ECR

```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 108188564905.dkr.ecr.us-east-1.amazonaws.com

docker build -t webforx-online-storeshop:latest .
docker tag webforx-online-storeshop:latest 108188564905.dkr.ecr.us-east-1.amazonaws.com/webforx-online-storeshop:latest
docker push 108188564905.dkr.ecr.us-east-1.amazonaws.com/webforx-online-storeshop:latest
```

### 2) Provision Dependencies

- **RDS Postgres** (or Aurora) with network access from ECS
- **Secrets Manager** entry for `DB_SECRET` JSON: `{ host, port, username, password, dbname }`
- **ALB** + target group on port `8080`
- **(Optional) S3** bucket for static assets
- **(Optional) CloudFront** in front of ALB/S3

### 3) Register ECS Task Definition

Use `taskdef.json` as a base. It defines:

- Image, CPU/memory, port `8080`
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_SSL`
- `DB_SECRET` from Secrets Manager
- Health check on `/healthz`

Register and run the task definition, then create an ECS service in the same VPC/subnets as your ALB.

### 4) Run the Service

- Create ECS Service (Fargate) with desired count
- Attach to ALB target group
- Set security groups to allow ALB → ECS on port `8080`

### 5) Optional Static Upload

Set `STARTUP_UPLOAD_STATIC=true` and provide `S3_BUCKET`/`S3_REGION` to upload `/static` on startup.

## Helpful Endpoints

- `GET /healthz` (liveness)
- `GET /readyz` (readiness)

## Repo Files

- `app.js`: Express app + TypeORM setup
- `Dockerfile`: Production image
- `docker-compose.yml`: Local stack
- `taskdef.json`: ECS task definition
