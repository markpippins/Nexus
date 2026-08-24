# nexus/ansible — vanadium failover tier management

Ansible entry point for mandate #2 (failover-tier maintenance on the
standby machine). Replaces the manual steps in
`docs/VANADIUM_BRING_UP_PROMPT.md` — note that document predates the
W1–W3 rulings: registry and broker run as **containers** now, not nohup
JVM processes.

## Layout

```
ansible.cfg                 connection defaults (slow-Pi tolerant)
inventory/hosts.ini         vanadium
group_vars/vanadium.yml     paths, ports, endpoint map
playbooks/deploy-tier.yml   git sync → render .env → compose up (+W2 override) → prune
playbooks/health-check.yml  probe every tier endpoint, fail on non-200
playbooks/reboot-drill.yml  reboot → wait → verify auto-recovery → health-check
```

## Usage

```bash
cd nexus/ansible

# ship latest code + rebuild changed images + restart tier
ansible-playbook playbooks/deploy-tier.yml

# verify every health endpoint
ansible-playbook playbooks/health-check.yml

# full failover drill (does NOT touch titanium)
ansible-playbook playbooks/reboot-drill.yml
```

## Ground rules encoded from the bring-up doctrine

- Vanadium services share titanium's PostgreSQL over LAN — the tier is a
  warm standby, never a second authority. No destructive tests.
- terrain-ts is expected amber on arm64 (prebuilt x86 dist): the health
  check reports it as WARN, not FAIL, until its source is recovered (W2 backlog).
- The W2 override (`docker-compose.vanadium.yml`) runs terrain-ts
  host-networked; deploy always passes both compose files in the
  `-f` order base→override.
