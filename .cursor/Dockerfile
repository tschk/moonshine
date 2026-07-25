FROM oven/bun:1.3-debian

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        build-essential \
        unzip \
        xz-utils \
    && rm -rf /var/lib/apt/lists/*

# Dart SDK (arch-aware) for moonshine_jaspr
RUN ARCH="$(uname -m)" \
    && case "$ARCH" in \
         aarch64|arm64) DART_ARCH=arm64 ;; \
         x86_64|amd64) DART_ARCH=x64 ;; \
         *) echo "unsupported arch: $ARCH" >&2; exit 1 ;; \
       esac \
    && curl -fsSL "https://storage.googleapis.com/dart-archive/channels/stable/release/latest/sdk/dartsdk-linux-${DART_ARCH}-release.zip" -o /tmp/dart.zip \
    && unzip -q /tmp/dart.zip -d /opt \
    && rm /tmp/dart.zip \
    && ln -sf /opt/dart-sdk/bin/dart /usr/local/bin/dart

ENV PATH="/opt/dart-sdk/bin:${PATH}"
WORKDIR /workspace
