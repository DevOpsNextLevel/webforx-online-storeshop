# Web Forx Online Storeshop

Node.js + Express + TypeORM + PostgreSQL. Containerized and ready for AWS ECS Fargate behind an ALB and (optionally) CloudFront.

## 1) Run locally (Docker Compose)

```bash
cp .env.example .env
docker compose up --build
# app: http://localhost:8080
# db:  localhost:5432 (postgres/postgres)
