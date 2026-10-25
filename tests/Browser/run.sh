#!/usr/bin/env bash
# Drives the real website in Chromium through a company's whole workflow, on a
# fresh database: the deployment's Super Admin and permission list, nothing else.
#
#   tests/Browser/run.sh            # headless; screenshots of each step in storage/logs/browser-tests/
#   HEADED=1 tests/Browser/run.sh   # watch it in a browser window
#
# Needs PHP, the built assets (npm run build) and Playwright with Chromium:
#   npm install --global playwright && npx playwright install chromium
set -euo pipefail

root="$(cd "$(dirname "$0")/../.." && pwd)"
port="${BROWSER_TEST_PORT:-8123}"
work="$(mktemp -d)"
out="$root/storage/logs/browser-tests"
rm -rf "$out" && mkdir -p "$out"

export APP_ENV=local APP_DEBUG=true APP_URL="http://127.0.0.1:$port" DB_CONNECTION=sqlite DB_DATABASE="$work/app.sqlite" \
    SESSION_DRIVER=file CACHE_STORE=file QUEUE_CONNECTION=sync MAIL_MAILER=log BRANCH_DOMAINS_ENABLED=false

touch "$DB_DATABASE"
cd "$root"
php artisan migrate --force --quiet
php artisan db:seed --class=PermissionSeeder --force --quiet
php artisan db:seed --class=CurrencyRateSeeder --force --quiet
php artisan tinker --execute 'App\Models\User::factory()->superAdmin()->create(["name" => "مالك الشركة", "username" => "owner", "password" => "Strong-Pass-2026"]);' > /dev/null

php artisan serve --host=127.0.0.1 --port="$port" > "$out/server.log" 2>&1 &
server=$!
trap 'kill $server 2>/dev/null; rm -rf "$work"' EXIT
for _ in $(seq 1 50); do curl -s -o /dev/null "http://127.0.0.1:$port/login" && break; sleep 0.2; done

NODE_PATH="${NODE_PATH:-$(npm root --global)}" BASE_URL="http://127.0.0.1:$port" OUT_DIR="$out" \
    node "$root/tests/Browser/company-workflow.cjs"
