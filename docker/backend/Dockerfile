# syntax=docker/dockerfile:1.7

FROM --platform=$BUILDPLATFORM alpine:3.22 AS pocketbase-download
ARG PB_VERSION=0.40.1
ARG TARGETARCH=amd64

RUN apk add --no-cache ca-certificates curl unzip \
    && case "${TARGETARCH}" in \
         amd64) pb_arch="amd64" ;; \
         arm64) pb_arch="arm64" ;; \
         *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
       esac \
    && curl -fsSL \
       "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${pb_arch}.zip" \
       -o /tmp/pocketbase.zip \
    && unzip -q /tmp/pocketbase.zip -d /tmp/pocketbase \
    && /tmp/pocketbase/pocketbase version

FROM alpine:3.22
ARG PB_VERSION=0.40.1

LABEL org.opencontainers.image.source="https://github.com/DitisKees/homelibrary-app" \
      org.opencontainers.image.description="HomeLibrary PocketBase backend" \
      io.homelibrary.pocketbase.version="${PB_VERSION}"

RUN apk add --no-cache ca-certificates \
    && addgroup -S -g 10001 homelibrary \
    && adduser -S -D -H -u 10001 -G homelibrary homelibrary \
    && mkdir -p /pb_data /pb_migrations \
    && chown -R homelibrary:homelibrary /pb_data /pb_migrations

COPY --from=pocketbase-download /tmp/pocketbase/pocketbase /usr/local/bin/pocketbase
COPY --chown=homelibrary:homelibrary pocketbase/pb_migrations/ /pb_migrations/

USER homelibrary:homelibrary

VOLUME ["/pb_data"]
EXPOSE 8090

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=6 \
  CMD wget -q -O - http://127.0.0.1:8090/api/health >/dev/null || exit 1

ENTRYPOINT ["pocketbase"]
CMD ["serve", "--http=0.0.0.0:8090", "--dir=/pb_data", "--migrationsDir=/pb_migrations", "--automigrate=0"]
