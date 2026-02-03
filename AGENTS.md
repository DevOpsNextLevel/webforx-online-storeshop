# Repository Guidelines

## Project Structure & Module Organization
- `app.js`: Main Express app, TypeORM entities, routes, and startup logic.
- `static/`: Product and hero images served locally or from S3.
- `test/`: Test suites (`test/app.test.js`, `test/integration/app.integration.test.js`).
- `Dockerfile`, `docker-compose.yml`: Local/production container setup.
- `taskdef.json`: ECS Fargate task definition template.

## Build, Test, and Development Commands
- `npm install`: Install dependencies.
- `npm run dev`: Run with `nodemon` for local development.
- `npm test`: Run unit/HTTP tests (mocked repositories).
- `npm run test:integration`: Run Postgres-backed integration tests.
- `npm run test:all`: Run unit + integration tests.
- `docker compose up --build`: Launch app + Postgres locally.

## Coding Style & Naming Conventions
- JavaScript (CommonJS) with 2-space indentation and semicolons.
- Routes and entities are defined directly in `app.js`.
- Keep naming explicit (e.g., `ProductEntity`, `OrderItemEntity`).
- No formatter configured; follow existing patterns and avoid inline comments unless necessary.

## Testing Guidelines
- Framework: Node.js built-in test runner (`node --test`).
- Unit tests live in `test/app.test.js` and mock repositories for speed.
- Integration tests live in `test/integration/*.test.js` and require Postgres.
- Naming: `*.test.js` files and `describe`/`test` blocks for coverage.

## Commit & Pull Request Guidelines
- Use concise, action-oriented commit messages (e.g., “Add tests, CI workflow, and docs”).
- PRs should include: summary of changes, testing results, and any deployment notes.
- If changes affect UI or deployment, include screenshots or logs when relevant.

## Security & Configuration Tips
- Prefer `DB_SECRET` (AWS Secrets Manager JSON) for credentials.
- Avoid committing `.env` or secrets; `.gitignore` already excludes them.
