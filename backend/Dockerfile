# syntax=docker/dockerfile:1
#
# Aether Archive API — multi-stage build (ADR-010, ADR-029).
# The same `./mvnw verify` the CI runs is the source of truth; this image skips the tests because
# CI already ran them on the exact commit that produced the tag.
#
# The build stage uses the official Maven image rather than `./mvnw`: the wrapper re-downloads a
# distribution inside the build container and validates its SHA-256, which is an avoidable failure
# point when the base image already ships a pinned Maven. The wrapper stays the developer/CI entry
# point; the artifact is the same `pom.xml` and the same Spring Boot plugin.
FROM maven:3.9-eclipse-temurin-21 AS build

WORKDIR /workspace

# Dependencies first: a source-only change does not re-download the world.
COPY pom.xml ./
RUN mvn -B -ntp -DskipTests dependency:go-offline

COPY src src
RUN mvn -B -ntp -DskipTests package

FROM eclipse-temurin:21-jre-jammy AS runtime

# curl backs the compose healthcheck; the rest is a non-root runtime with one writable directory.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system aether \
    && useradd --system --gid aether --home-dir /app --shell /usr/sbin/nologin aether \
    && mkdir -p /app /data \
    && chown -R aether:aether /app /data

WORKDIR /app
COPY --from=build /workspace/target/*.jar /app/app.jar

USER aether
EXPOSE 8080

# The actuator health endpoint is the single readiness signal compose and the deploy smoke test use.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8080/actuator/health | grep -q '"status":"UP"' || exit 1

ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-XX:+ExitOnOutOfMemoryError", "-jar", "/app/app.jar"]
