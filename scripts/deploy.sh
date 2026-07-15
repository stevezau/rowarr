#!/bin/bash
# Deploy the latest built image directly to the plex host, with a health-gated
# rollback. Run AFTER the GitHub Docker workflow has published the tag. Watchtower is intentionally
# disabled on this container (its 4h poll is too slow and once raced a manual deploy into an
# outage), so this script is the single deployer.
#
# Usage:  ssh plex 'bash -s' < scripts/deploy.sh
set -uo pipefail

readonly IMAGE="ghcr.io/stevezau/shortlist:dev"   # published by CI on every master push
readonly NAME="shortlist"
readonly PORT="5959"
readonly CONFIG_VOL="/config/shortlist:/config"

echo "== pulling ${IMAGE} =="
docker pull "${IMAGE}"

echo "== recreating ${NAME} =="
# First deploy of this name has nothing to rename; guard so it doesn't abort.
if docker inspect "${NAME}" >/dev/null 2>&1; then
  docker rename "${NAME}" "${NAME}_old"
  docker stop "${NAME}_old" >/dev/null
fi
docker run -d --name "${NAME}" \
  -p "${PORT}:5959" \
  -e TZ=Australia/Sydney \
  -v "${CONFIG_VOL}" \
  -v /etc/localtime:/etc/localtime \
  --restart unless-stopped \
  --label com.centurylinklabs.watchtower.enable=false \
  "${IMAGE}" >/dev/null

echo "== waiting for health =="
ok=0
for _ in $(seq 1 25); do
  sleep 3
  if curl -fsS "http://localhost:${PORT}/api/system/health" >/dev/null 2>&1; then ok=1; break; fi
done

if [ "${ok}" = "1" ]; then
  docker rm "${NAME}_old" >/dev/null 2>&1 || true  # absent on a first deploy
  echo "== HEALTHY — deploy ok =="
  echo -n "health: "; curl -fsS "http://localhost:${PORT}/api/system/health"; echo
else
  echo "== UNHEALTHY — rolling back =="
  docker logs --tail 50 "${NAME}" 2>&1 || true
  docker stop "${NAME}" >/dev/null 2>&1 || true
  docker rm "${NAME}" >/dev/null 2>&1 || true
  if docker inspect "${NAME}_old" >/dev/null 2>&1; then
    docker rename "${NAME}_old" "${NAME}"
    docker start "${NAME}" >/dev/null
    echo "== rolled back to previous image =="
  else
    echo "== no previous container to roll back to (first deploy) =="
  fi
  exit 1
fi
