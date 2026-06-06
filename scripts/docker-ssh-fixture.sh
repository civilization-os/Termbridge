#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-test}"
NAME="${LINSSH_DOCKER_NAME:-linssh-it}"
IMAGE="${LINSSH_IT_IMAGE:-lscr.io/linuxserver/openssh-server:latest}"
PORT="${LINSSH_IT_PORT:-2222}"
USERNAME="${LINSSH_IT_USERNAME:-linssh}"
PASSWORD="${LINSSH_IT_PASSWORD:-linssh-pass}"
REMOTE_DIR="${LINSSH_IT_REMOTE_DIR:-/config/linssh-sftp}"

docker_cmd() {
  if command -v docker >/dev/null 2>&1; then
    docker "$@"
    return
  fi

  if command -v podman >/dev/null 2>&1; then
    podman "$@"
    return
  fi

  if command -v dnf >/dev/null 2>&1; then
    dnf install -y podman
    podman "$@"
    return
  fi

  if command -v yum >/dev/null 2>&1; then
    yum install -y podman
    podman "$@"
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    apt-get update
    apt-get install -y docker.io
    docker "$@"
    return
  fi

  echo "No docker or podman command found, and no supported package manager is available." >&2
  exit 1
}

start() {
  docker_cmd rm -f "$NAME" >/dev/null 2>&1 || true
  docker_cmd run -d \
    --name "$NAME" \
    --network host \
    -e PUID=1000 \
    -e PGID=1000 \
    -e TZ=UTC \
    -e PASSWORD_ACCESS=true \
    -e USER_NAME="$USERNAME" \
    -e USER_PASSWORD="$PASSWORD" \
    "$IMAGE" \
    >/dev/null

  for _ in $(seq 1 60); do
    if node -e "const net=require('node:net'); const s=net.connect(${PORT}, '127.0.0.1'); s.on('connect',()=>{s.end(); process.exit(0)}); s.on('error',()=>process.exit(1)); setTimeout(()=>process.exit(1), 1000);" >/dev/null 2>&1; then
      docker_cmd exec "$NAME" sh -c "echo 'root:${PASSWORD}' | chpasswd && chmod u+s /bin/busybox && mkdir -p '$REMOTE_DIR' && echo fixture > '$REMOTE_DIR/source.txt' && chown -R '$USERNAME':users '$REMOTE_DIR'" >/dev/null
      return
    fi
    sleep 1
  done

  docker_cmd logs "$NAME" >&2 || true
  echo "SSH fixture did not become ready on 127.0.0.1:${PORT}" >&2
  exit 1
}

stop() {
  docker_cmd rm -f "$NAME" >/dev/null 2>&1 || true
}

case "$ACTION" in
  start)
    start
    ;;
  stop)
    stop
    ;;
  test)
    start
    trap stop EXIT
    LINSSH_IT_HOST=127.0.0.1 \
      LINSSH_IT_PORT="$PORT" \
      LINSSH_IT_USERNAME="$USERNAME" \
      LINSSH_IT_PASSWORD="$PASSWORD" \
      LINSSH_IT_REMOTE_DIR="$REMOTE_DIR" \
      pnpm vitest run src/**/*.integration.test.ts
    ;;
  *)
    echo "Usage: $0 {start|stop|test}" >&2
    exit 2
    ;;
esac
