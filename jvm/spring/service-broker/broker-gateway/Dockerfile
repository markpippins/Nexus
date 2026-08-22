# syntax=docker/dockerfile:1
# broker-gateway — REST front door of the JVM broker stack (Spring Boot, :8081).
# Packaged for the vanadium failover tier; mirrors spring/service-registry/Dockerfile.
# Needs PostgreSQL (nexus DB, gateway schema), MongoDB, Redis, service-registry;
# configure via standard Spring env overrides (see docker/vanadium compose).
# NOTE: no Maven wrapper in this repo; parent POM com.aibizarchitect.nexus:nexus
# must be installed first — hence build context = jvm/ repo root and dockerfile
# path spring/service-broker/broker-gateway/Dockerfile.
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
# Parent POM com.aibizarchitect.nexus:nexus lives at jvm/spring/pom.xml.
COPY spring/pom.xml spring-parent.pom.xml
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -f spring-parent.pom.xml -N install
# Full shared/ reactor: gateway's dependency chain reaches several of its
# modules transitively (core, apis, adapters) via the service-broker siblings.
COPY shared/ shared/
RUN --mount=type=cache,target=/root/.m2 mvn -B -q -f shared/pom.xml install -DskipTests
# Broker reactor: build gateway plus its internal dependencies (-am), exactly
# like the documented host build. Produces the boot-executable -exec.jar.
# The service-broker aggregator also declares module ../atlas (i.e. spring/atlas).
COPY spring/atlas/ spring/atlas/
COPY spring/service-broker/ spring/service-broker/
WORKDIR /build/spring/service-broker
RUN --mount=type=cache,target=/root/.m2 mvn -B clean package -DskipTests -pl broker-gateway -am \
 && JAR=$(ls broker-gateway/target/*-exec.jar | head -1) \
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
