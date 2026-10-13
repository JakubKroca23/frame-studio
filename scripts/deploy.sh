#!/usr/bin/env bash
# Build and deploy Frame Studio to server-main (https://frame.propoj.app).
# Usage: scripts/deploy.sh            (SERVER_KEY, SERVER_HOST override defaults)
set -euo pipefail
KEY="${SERVER_KEY:-/workspace/server_main.key}"
HOST="${SERVER_HOST:-ubuntu@92.5.8.24}"
DIR="/home/ubuntu/personal/projects/frame-studio"
cd "$(dirname "$0")/.."
SSH="ssh -i $KEY -o BatchMode=yes"

[ "${SKIP_BUILD:-0}" = 1 ] || { npm ci && npm run build; }

$SSH "$HOST" "mkdir -p $DIR/dist"
# server has no rsync: stream tarballs. dist is replaced in place (it is a bind mount, keep the inode)
tar -czf - -C deploy docker-compose.yml nginx.conf | $SSH "$HOST" "tar -xzf - -C $DIR"
tar -czf - -C dist . | $SSH "$HOST" "find $DIR/dist -mindepth 1 -delete && tar -xzf - -C $DIR/dist"
# up -d is a no-op when nothing changed; reload picks up nginx.conf changes
$SSH "$HOST" "cd $DIR && docker compose up -d && docker exec frame-studio nginx -s reload"
echo "Deployed: https://frame.propoj.app/"
