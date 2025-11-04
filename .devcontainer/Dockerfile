FROM oven/bun:debian

# Config Bun
ENV PATH="~/.bun/bin:${PATH}"
RUN ln -s /usr/local/bin/bun /usr/local/bin/node

# Update packages
RUN if [ "debian" == "alpine" ] ; then apk update ; else apt-get update ; fi

# Install Git
RUN if [ "debian" == "alpine" ] ; then apk add git ; else apt-get install -y git ; fi

# Dynamic dev startup script (no hardcoded paths)
RUN printf '#!/usr/bin/env bash\nset -euo pipefail\nROOT=/workspaces\nif [ -d "$ROOT" ]; then cd "$ROOT"; fi\nif [ -f package.json ]; then APP_DIR="$PWD"; else APP_DIR=$(find "$ROOT" -maxdepth 2 -type f -name package.json -printf "%h\\n" | head -n1 || true); fi\nif [ -n "${APP_DIR:-}" ]; then cd "$APP_DIR"; fi\n(bun install --frozen-lockfile || bun install)\nexec bun run dev\n' > /usr/local/bin/start-dev.sh && chmod +x /usr/local/bin/start-dev.sh

# Default command runs the dev server
CMD ["/usr/local/bin/start-dev.sh"]

