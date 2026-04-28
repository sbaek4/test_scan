# Local End-to-End Test Run

## 1) Prerequisites
- Docker Desktop
- Node 22+
- Git SSH access configured for `git@github.com:sbaek4/test_scan.git`

## 2) Start stack
```bash
docker compose up -d --build
```

## 3) Configure GitHub webhook
Repository: `sbaek4/test_scan`
- Payload URL: `http://localhost:3000/webhooks/github`
- Content type: `application/json`
- Secret: `dev_secret`
- Event: `Just the push event`

## 4) Trigger test run
```bash
git init
git checkout -b main
git remote add origin git@github.com:sbaek4/test_scan.git
echo "hello" > hello.txt
git add .
git commit --trailer "Made-with: Cursor" -m "chore: seed scan project"
git push -u origin main
```

## 5) Verify
- API logs: webhook accepted
- Worker logs: clone + scan complete
- DB rows in `scan_jobs`, `scan_results`, `notifications`
