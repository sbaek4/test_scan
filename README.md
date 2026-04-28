# Test Scan Platform

Node.js (TypeScript) + PostgreSQL + Kafka + React platform that receives GitHub webhooks, queues scan jobs, performs `git clone` based security scans, and posts callbacks to a notification webhook.

## Architecture
- `apps/api`: webhook ingress and API endpoints
- `apps/worker`: Kafka consumer, clone + scan pipeline
- `apps/web`: React dashboard
- `packages/domain`: core domain contracts and pure functions

## Local Run
1. `docker compose up -d --build`
2. Configure GitHub webhook to `http://localhost:3000/webhooks/github`
3. Push commits to watched repository

## Test
- `npm install`
- `npm test`

## Terraform
Terraform scaffold is under `infra/terraform/aws`.

## GitHub Actions Webhook Test
This repo includes `.github/workflows/webhook-smoke.yml` to send a signed webhook from GitHub Actions.

Set repository secrets before running:
- `WEBHOOK_TARGET_URL`: public base URL of your API (for example your tunnel URL)
- `WEBHOOK_SECRET`: same secret configured in your API (`WEBHOOK_SECRET`)

Then trigger:
- Push to `main`, or
- Run `Webhook Smoke Test` manually from Actions tab.

## PR Pipeline and Required Criteria
This repo includes `.github/workflows/pr-gate.yml` for PR validation.

Checks run on PRs to `main`:
- workspace tests (`npm test`)
- workspace build (`npm run build`)
- docker compose config validation (`docker compose config`)
- gate status (`pr-gate`)

To require all checks before merge:
1. GitHub -> `Settings` -> `Branches` -> branch protection rule for `main`
2. Enable `Require status checks to pass before merging`
3. Select required checks:
   - `test-and-build`
   - `docker-validate`
   - `pr-gate`
   - `send-webhook` (optional but recommended)
