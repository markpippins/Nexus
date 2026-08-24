# syntax=docker/dockerfile:1
# broker-gateway — the service-broker MONOLITH FACADE (W1 ruling, 2026-08-23).
# BrokerGatewayApplication aggregates file/login/user-access/user-creation/
# search/admin-logging/discovery in-process; this image is ONE deployable for
# the vanadium failover tier. No per-module split (module images only IF a
# module ever needs independent scaling).
#
# Build context MUST be the jvm/ repo root:
#   docker build -f spring/service-broker/broker-gateway/Dockerfile -t nexus-vanadium/broker-gateway .
# (No Maven wrapper in this repo; parent POM com.aibizarchitect.nexus:nexus
# must be installed first — same pattern as spring/service-registry.)
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
# Parent POM com.aibizarchitect.nexus:nexus lives at jvm/spring/pom.xml.
COPY spring/pom.xml spring-parent.pom.xml
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -f spring-parent.pom.xml -N install
# Shared API modules the gateway (and its reactor deps) compile against but
# which live outside the service-broker aggregator — install first so the
# container build is self-contained (normally provided by host ~/.m2).
# NOTE: both are standalone POMs (no <parent> block), same as registry used.
COPY shared/broker-service-api/pom.xml shared/broker-service-api/
COPY shared/broker-service-api/src shared/broker-service-api/src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -f shared/broker-service-api/pom.xml install
COPY shared/user-api/pom.xml shared/user-api/
COPY shared/user-api/src shared/user-api/src
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -f shared/user-api/pom.xml install
# The full service-broker reactor (aggregator POM requires every module
# dir to exist), then build gateway + its intra-reactor deps (-am).
# The ../atlas module lives outside this tree — stripped for image builds.
COPY spring/service-broker/ spring/service-broker/
RUN sed -i '\|<module>\.\./atlas</module>|d' spring/service-broker/pom.xml
WORKDIR /build/spring/service-broker
# -Dmdep.skip: user-access-service has a dependency:copy execution without
# artifactItems (host-launch layout helper); its target/libs output is not
# consumed by any downstream Maven build, so skip it in-image.
RUN --mount=type=cache,target=/root/.m2 mvn -B clean package -DskipTests -q -pl broker-gateway -am -Dmdep.skip=true \
 && JAR=$(ls broker-gateway/target/*.jar | grep -v original | head -1) \
 && ln -s "$(basename "$JAR")" broker-gateway/target/app.jar

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*
COPY --from=build /build/spring/service-broker/broker-gateway/target/app.jar app.jar
EXPOSE 8081
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -sf http://127.0.0.1:8081/actuator/health || exit 1
CMD ["java", "-jar", "app.jar"]
