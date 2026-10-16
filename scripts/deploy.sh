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
# Volvo CAD (approved for the site by Jakub, kept out of git): optimised GLB from a local folder into the build.
# Served only with the app's login cookie (deploy/nginx.conf, /models/). Missing file → the app falls back.
VOLVO_REAR="${VOLVO_REAR_GLB:-/workspace/fs-spec/test-local/volvo/zadek-ni-meshopt.glb}"
if [ -f "$VOLVO_REAR" ]; then mkdir -p dist/models/volvo && cp "$VOLVO_REAR" dist/models/volvo/rear.glb; echo "Volvo rear CAD: $(du -h "$VOLVO_REAR" | cut -f1)"
else echo "WARNING: $VOLVO_REAR missing – Volvo CAD not deployed (app falls back)"; fi

$SSH "$HOST" "mkdir -p $DIR/dist"
# server has no rsync: stream tarballs. dist is replaced in place (it is a bind mount, keep the inode)
tar -czf - -C deploy docker-compose.yml nginx.conf | $SSH "$HOST" "tar -xzf - -C $DIR"
tar -czf - -C dist . | $SSH "$HOST" "find $DIR/dist -mindepth 1 -delete && tar -xzf - -C $DIR/dist"
# up -d is a no-op when nothing changed. nginx.conf is a single-file bind mount: tar replaces the inode, so the
# container keeps the old file until it is restarted → restart only when the config differs from the running one.
$SSH "$HOST" "cd $DIR && docker compose up -d && if docker exec frame-studio cat /etc/nginx/conf.d/default.conf | cmp -s - nginx.conf; then docker exec frame-studio nginx -s reload; else docker restart frame-studio >/dev/null && echo 'nginx config changed: container restarted'; fi"
echo "Deployed: https://frame.propoj.app/"
