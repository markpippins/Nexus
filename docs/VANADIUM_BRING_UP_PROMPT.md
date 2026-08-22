# Vanadium Failover Tier — Bring-Up Briefing

**Audience:** engineers on the vanadium host (192.168.1.82, Raspberry Pi 5, aarch64, Debian 13, Docker 29.x). This assumes **no prior knowledge of Nexus**. Read top to bottom; every command has been verified from titanium unless marked otherwise.

## What you are deploying

Nexus is our agent-operations platform. Most of it runs on one machine ("titanium", 192.168.1.120) including its PostgreSQL database and Redis. You are standing up a **failover copy of the service tier** on vanadium:

- The **17 legacy TypeScript services** (REST APIs over shared PostgreSQL schemas)
- The **service-registry** (JVM/Spring Boot, port 8085) — services announce themselves to it via heartbeats
- The **broker-gateway** (JVM/Spring Boot, port 8081)

Your services will **not** get their own database. They connect over LAN to **titanium's PostgreSQL** (already reachable: verified `192.168.1.120:5432` open from vanadium). One exception: your **service-registry instance gets its own database** (`vanadium_registry`, already created on titanium's PostgreSQL for you) so the two registry instances don't overwrite each other's data.

## 0. Prerequisites check (5 min)

```bash
# Docker present?
docker --version                      # expect 29.x
# Can you reach titanium's database and redis?
timeout 3 bash -c 'cat </dev/null >/dev/tcp/192.168.1.120/5432' && echo PG-OK
```

Toolchain for the two JVM services (Debian 13 packages):

```bash
sudo apt update && sudo apt install -y openjdk-21-jdk maven git
java -version   # expect 21.x
mvn -version
```

## 1. Get the code (~10 min, repo is ~large)

```bash
cd ~
git clone --depth 1 --branch dev https://github.com/markpippins/nexus.git
cd ~/nexus
```

If you have SSH keys registered with the repo you may use the git remote instead of HTTPS.

## 2. Start the TypeScript tier (30–45 min first build)

The whole tier is defined as one compose file. Builds run natively on your arm64 machine.

```bash
cd ~/nexus/docker/vanadium
cp .env.example .env
nano .env    # make exactly these edits:
```

In `.env`, replace every occurrence of `172.17.0.1` (that's "the docker bridge = same-host" shorthand used during our local testing) with **`192.168.1.120`**, and set `PG_PASS=pgpass`. Leave everything else at defaults. Quick way:

```bash
sed -i 's/172\.17\.0\.1/192.168.1.120/g; s/^PG_PASS=.*/PG_PASS=pgpass/' .env
```

Then bring it up:

```bash
docker compose up -d --build
```

First build compiles 18 containers; on a Pi expect **20–40 minutes** (npm installs dominate; layer cache makes later rebuilds fast).

### Verify (each should return HTTP 200)

| Service | Check |
|---|---|
| wind | `curl -s localhost:3300/health` |
| tackle | `curl -s localhost:3410/health` |
| kernel | `curl -s localhost:8100/health` |
| peb | `curl -s localhost:3111/health` |
| cascade | `curl -s localhost:3106/cascade/health` (note the prefix!) |
| harness | `curl -s localhost:3420/health` |
| pty | `curl -s localhost:3120/` |
| execution | `curl -s localhost:3110/health` |
| prompt-sync | `curl -s localhost:3501/health` |
| memory | `curl -s localhost:3500/health` |
| assembly | `curl -s localhost:3107/health` |
| conduit | `curl -s localhost:3104/health` |
| knowledge | `curl -s localhost:3109/health` |
| nebula | `curl -s localhost:3101/health` |
| semantics | `curl -s localhost:3160/health` |
| voyager | `curl -s localhost:3114/health` |

Known caveat: **terrain-ts** (port 8086) ships precompiled x86 node_modules and may fail to start on arm64. If it crash-loops, take it out of scope for now — `docker compose stop terrain-ts`. Everything else is arch-clean.

## 3. Build & run YOUR service-registry instance (15 min)

The registry keeps its state in PostgreSQL schema `registry` inside database **`vanadium_registry`** (we created it for you on titanium's server). On first boot it **seeds itself**: tables are auto-created (Hibernate `ddl-auto=update`) and the framework/service-type catalog loads from bundled seed files — there is nothing manual to import. What you *do* need to configure is which database and Redis it talks to.

```bash
cd ~/nexus/jvm/spring
mvn -B -q -f pom.xml -N install        # install the parent POM (repo-local)
cd ../shared && mvn -B -q clean install -DskipTests
cd ../spring/service-registry && mvn -B clean package -DskipTests
ls target/*.jar                        # expect service-registry-1.0.0-SNAPSHOT.jar
```

Run it (background, logs to file):

```bash
export SPRING_DATASOURCE_URL='jdbc:postgresql://192.168.1.120:5432/vanadium_registry?currentSchema=registry'
export SPRING_DATASOURCE_USERNAME=pguser
export SPRING_DATASOURCE_PASSWORD=pgpass
export SPRING_DATA_REDIS_HOST=127.0.0.1     # the vd-redis container you started in step 2
nohup java -jar target/service-registry-1.0.0-SNAPSHOT.jar > ~/registry.log 2>&1 &
sleep 45
curl -s http://localhost:8085/actuator/health      # expect {"status":"UP"...}
curl -s http://localhost:8085/api/v1/registry/services | head -c 400
```

**"Populating" the registry — what actually happens:**
1. First boot auto-seeds the catalog (62 frameworks, 17 service types, categories) into `vanadium_registry`.
2. After that, population is **automatic**: any service that sends heartbeats appears in the catalog. Your TS tier and broker-gateway do this on their own once pointed at the registry (next steps).
3. A service that stops heartbeating is flipped OFFLINE after ~90 s.

So "updating locally" = making sure each deployed service knows your registry's address (done via env vars below). No manual catalog editing.

## 4. Point the tier's services at YOUR registry

Add to `~/nexus/docker/vanadium/.env`, then `docker compose up -d` (recreates containers):

```
HEARTBEAT_REGISTRY_URL=http://192.168.1.82:8085
REGISTRY_URL=http://192.168.1.82:8085
```

(Variable names vary slightly per service — both spellings above cover the current code paths. Services without heartbeat config simply won't register yet; that's fine.)

Verify registration after ~1 minute:

```bash
curl -s http://localhost:8085/api/v1/registry/services | python3 -m json.tool | grep -E '"name"|"status"'
```

## 5. Build & run broker-gateway (20 min)

The gateway is the REST front door of the JVM broker stack. It needs JDK 21 + Maven (installed in step 0).

```bash
cd ~/nexus/jvm/shared && mvn -B -q clean install -DskipTests     # shared API jars
cd ../spring/service-broker
mvn -B clean package -DskipTests -pl broker-gateway -am
ls broker-gateway/target/*.jar
```

Run it:

```bash
export SERVER_PORT=8081
export SPRING_DATASOURCE_URL='jdbc:postgresql://192.168.1.120:5432/nexus'
export SPRING_DATASOURCE_USERNAME=pguser
export SPRING_DATASOURCE_PASSWORD=pgpass
# registry self-registration:
export REGISTRY_BASE_URL=http://127.0.0.1:8085   # or spring.cloud... per application.yml
nohup java -jar broker-gateway/target/broker-gateway-*.jar > ~/gateway.log 2>&1 &
sleep 40
curl -s http://localhost:8081/actuator/health
```

Check the jar's `application.yml` (`broker-gateway/src/main/resources/`) if any property name differs — the file is the source of truth, and every value can be overridden with its `UPPER_SNAKE` env equivalent or `-Dproperty.name=value`.

## 6. Acceptance checklist

- [ ] All 16 TS health endpoints return 200 (terrain-ts excluded)
- [ ] `GET /actuator/health` on :8085 → UP (your registry)
- [ ] Registry catalog shows seeded frameworks/types AND live heartbeats from vanadium services
- [ ] broker-gateway `/actuator/health` → UP, and it appears in the registry catalog
- [ ] Reboot drill: `sudo reboot`, then confirm containers came back (`restart: unless-stopped`) and restart the two JVM processes

## Ground rules while we're in bring-up mode

1. **You share production data.** Your containers point at the SAME PostgreSQL schemas the live titanium services use. Do not run destructive tests against them, and don't add load-generation.
2. **Expect duplicate heartbeats/events** for any service type that exists on both machines — that's inherent until we flip to standby-only mode. Note anything weird rather than "fixing" it locally.
3. **Don't modify titanium.** Everything you need is in the repo or on your host. If something on the titanium side looks wrong, report it — don't touch it.
4. Report results back with: container list (`docker ps`), the three health checks, and any service that refused to start (include last 20 log lines).

## Quick reference

| Thing | Value |
|---|---|
| Titanium (DB/Redis host) | 192.168.1.120 |
| DB credentials | pguser / pgpass (nexus + vanadium_registry databases) |
| Your registry | http://localhost:8085 (db: `vanadium_registry`, schema: `registry`) |
| Broker gateway | http://localhost:8081 |
| Repo / branch | github.com/markpippins/nexus @ dev |
| Compose project dir | ~/nexus/docker/vanadium |
