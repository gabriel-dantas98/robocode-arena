# Robocode Arena — single image for workshop / VPS
# Build from repo root: docker build -t robocode-arena .

FROM eclipse-temurin:21-jdk-jammy AS engine-build
WORKDIR /src
COPY apps/engine /src/apps/engine
WORKDIR /src/apps/engine
RUN apt-get update && apt-get install -y --no-install-recommends unzip \
  && rm -rf /var/lib/apt/lists/*
# Gradle wrapper may already exist; fall back to system gradle if needed
RUN if [ -x ./gradlew ]; then ./gradlew installDist --no-daemon; \
    else apt-get update && apt-get install -y gradle && gradle installDist --no-daemon; fi

FROM oven/bun:1.2-debian AS lobby-deps
WORKDIR /src
COPY package.json ./
COPY apps/lobby/package.json ./apps/lobby/
COPY bots/package.json ./bots/
# install workspace roots used at runtime
RUN cd /src/bots && bun install \
  && cd /src/apps/lobby && bun install

FROM eclipse-temurin:21-jdk-jammy
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl ca-certificates python3 python3-pip python3-venv \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install -g tsx \
    && python3 -m venv /opt/robocode-py \
    && /opt/robocode-py/bin/pip install --no-cache-dir "robocode-tank-royale==1.0.2" \
    && rm -rf /var/lib/apt/lists/*

# Prefer venv python for lab/workshop .py bots
ENV PATH="/opt/robocode-py/bin:$PATH"

# Bun for lobby
COPY --from=oven/bun:1.2-debian /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app
COPY --from=engine-build /src/apps/engine/build/install/robocode-arena-engine /app/engine
COPY --from=lobby-deps /src/apps/lobby/node_modules /app/apps/lobby/node_modules
COPY --from=lobby-deps /src/bots/node_modules /app/bots/node_modules
COPY apps/lobby /app/apps/lobby
COPY bots /app/bots
COPY scripts /app/scripts
COPY package.json /app/package.json

RUN mkdir -p /app/data/uploads /app/data/lab /app/data/scale-results \
  && chmod +x /app/scripts/docker-entrypoint.sh

ENV JAVA_HOME=/opt/java/openjdk
ENV PATH="$JAVA_HOME/bin:/usr/local/bin:$PATH"
ENV ENGINE_PORT=7601
ENV LOBBY_PORT=7610
ENV ENGINE_URL=http://127.0.0.1:7601
ENV LOBBY_MAX_PLAYERS=40
ENV JAVA_OPTS="-Xmx768m -XX:+UseG1GC"

EXPOSE 7610 7601
ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
