# Production deployment runbook — three Linux servers (CentOS Stream 9)

This guide deploys **GTI Fleet Solutions** (FastAPI + React + MongoDB) to **enterprise-style production** on your cluster.


| Server           | IP               | Hostname (example) | Role                                                   |
| ---------------- | ---------------- | ------------------ | ------------------------------------------------------ |
| **Server One**   | `192.168.135.21` | `fleet-app-01`     | Nginx + React + FastAPI; **MongoDB arbiter** (`27018`) |
| **Server Two**   | `192.168.135.22` | `fleet-db-01`      | **MongoDB data node** (`27017`)                        |
| **Server Three** | `192.168.135.23` | `fleet-db-02`      | **MongoDB data node** (`27017`)                        |


**Replica set name:** `rs0` (two data members + one arbiter).

### How to read this runbook

Every step includes **Run on:** — the server where you must be logged in (SSH as `fleet` or your admin user) when you run the commands.

- **All three** — run the same commands on `.21`, then `.22`, then `.23` (three separate SSH sessions).
- `**.22` → `.23`** — you are SSH’d into `**.22`**; commands use `scp`/`ssh` to reach `**.23**`.
- **mongosh** — run only on the host shown; use `127.0.0.1` in the URI on **that same host**.

Replace placeholders: passwords, Resend keys.

**Production URL:** `https://fleet.gtiholding.com` — see [`PRODUCTION_DOMAIN.md`](PRODUCTION_DOMAIN.md) for DNS/TLS/env alignment and cutover notes.

**Companion docs:** [`DC_DEPLOYMENT_GUIDE.md`](DC_DEPLOYMENT_GUIDE.md), [`CLAUDE.md`](../CLAUDE.md).

### Application paths (app server `.21`)

Use these paths consistently in **Part E** (systemd, `rsync`, `.env`):


| Path                                 | Purpose                                          |
| ------------------------------------ | ------------------------------------------------ |
| `**/home/fleet/app`**                | Git clone / source (backend + frontend)          |
| `**/home/fleet/app/backend**`        | Python venv, `.env`, Gunicorn `WorkingDirectory` |
| `**/home/fleet/app/frontend/build**` | CRA build output (before publish)                |
| `**/var/www/fleet**`                 | Nginx static docroot (published `build/`)        |


Verified deploy layout on **fleet-app-01** uses `**/home/fleet/app`**, not `/opt/fleet/app`. If your org standardizes on `/opt/fleet`, substitute that path everywhere below.

---

## Platform assumptions (verified inventory)

- **OS:** CentOS Stream 9 (`el9`), **firewalld** (not UFW), `**dnf`**.
- **Privilege:** user `**fleet`** may need a password for `**sudo**`; remote `sudo` over `ssh` needs `**ssh -t**` (or run `install` in an interactive SSH session).
- **Python (backend):** project requires **Python 3.11+** (`[README.md](../README.md)`). EL9 default `**python3` is often 3.9.x** — install `**python3.11`** on `.21` and use it for the venv (Part E).

---

## Part A — Baseline hardening

### A1. Update system and install base tools

**Run on:** **All three** — `192.168.135.21`, `192.168.135.22`, `192.168.135.23` (repeat on each).

Purpose: Bring the OS to current security levels and install baseline packages.  
Importance: Reduces CVE exposure and supplies tools needed later.

```bash
sudo dnf -y update
sudo dnf -y install curl ca-certificates gnupg chrony git \
  policycoreutils-python-utils audit python3-audit
# Optional troubleshooting: sudo dnf -y install setroubleshoot-server
```

Optional automatic security patching:

**Run on:** **All three** — `.21`, `.22`, `.23`.

Purpose: Enable unattended security patching via a timer.  
Importance: Keeps servers patched after go-live.

```bash
sudo dnf -y install dnf-automatic
sudo systemctl enable --now dnf-automatic.timer
```

### A2. Time sync (required for MongoDB and TLS)

**Run on:** **All three** — `.21`, `.22`, `.23`.

Purpose: Ensure time is correct and continuously synced.  
Importance: Replication and TLS fail with clock drift.

```bash
sudo systemctl enable --now chronyd
chronyc tracking
```

### A3. Hostnames and `/etc/hosts`

**Run on:** **All three** — `.21`, `.22`, `.23` (same block on each).

Purpose: Add consistent name-to-IP mappings for cluster members.  
Importance: Reliable replica-set ops and troubleshooting.

```bash
sudo tee -a /etc/hosts << 'EOF'

# Fleet production cluster
192.168.135.21 fleet-app-01
192.168.135.22 fleet-db-01
192.168.135.23 fleet-db-02
EOF
```

Set persistent hostname — **one command per server**:

**Run on:** `192.168.135.21` **only**

```bash
sudo hostnamectl set-hostname fleet-app-01
```

**Run on:** `192.168.135.22` **only**

```bash
sudo hostnamectl set-hostname fleet-db-01
```

**Run on:** `192.168.135.23` **only**

```bash
sudo hostnamectl set-hostname fleet-db-02
```

### A4. Kernel and limits (MongoDB + many connections)

**Run on:** **All three** — `.21`, `.22`, `.23`.

Purpose: Tune sysctl and file-descriptor limits.  
Importance: Avoids connection limits under load.

```bash
sudo tee /etc/sysctl.d/99-fleet-mongo.conf << 'EOF'
vm.swappiness = 1
net.core.somaxconn = 4096
fs.file-max = 980000
EOF
sudo sysctl --system

sudo tee /etc/security/limits.d/99-fleet.conf << 'EOF'
mongod soft nofile 64000
mongod hard nofile 64000
fleet soft nofile 65535
fleet hard nofile 65535
EOF
```

**Application user `fleet`**

**Run on:** `192.168.135.21` **only** (skip if user already exists).

Purpose: Dedicated runtime user and app directory.  
Importance: Least-privilege; do not run the API as root.

```bash
getent passwd fleet >/dev/null || sudo useradd -m -s /bin/bash fleet
sudo mkdir -p /home/fleet/app
sudo chown fleet:fleet /home/fleet/app
```

### A5. Firewall (firewalld)

**Run on:** **All three** — `.21`, `.22`, `.23` (enable firewalld on each).

Purpose: Start firewalld so rules persist across reboots.  
Importance: Network restrictions only apply when firewalld is active.

```bash
sudo systemctl enable --now firewalld
```

**Run on:** `192.168.135.22` **and** `192.168.135.23` **only** (DB servers — run the full block on each).

Purpose: Allow SSH and MongoDB `27017` only from cluster IPs.  
Importance: Do not expose MongoDB to the whole LAN.

```bash
sudo firewall-cmd --permanent --zone=public --add-rich-rule='rule family="ipv4" source address="192.168.135.0/24" service name="ssh" accept'

sudo firewall-cmd --permanent --zone=public --add-rich-rule='rule family="ipv4" source address="192.168.135.21/32" port port="27017" protocol="tcp" accept'
sudo firewall-cmd --permanent --zone=public --add-rich-rule='rule family="ipv4" source address="192.168.135.22/32" port port="27017" protocol="tcp" accept'
sudo firewall-cmd --permanent --zone=public --add-rich-rule='rule family="ipv4" source address="192.168.135.23/32" port port="27017" protocol="tcp" accept'

sudo firewall-cmd --reload
sudo firewall-cmd --list-all --zone=public
```

**Run on:** `192.168.135.21` **only** (app / arbiter host).

Purpose: Allow HTTP/HTTPS, SSH, and arbiter `27018` from DB nodes only.  
Importance: User-facing entry on `.21` only; arbiter not open to the world.

```bash
sudo firewall-cmd --permanent --zone=public --add-service=http
sudo firewall-cmd --permanent --zone=public --add-service=https
sudo firewall-cmd --permanent --zone=public --add-rich-rule='rule family="ipv4" source address="192.168.135.0/24" service name="ssh" accept'

sudo firewall-cmd --permanent --zone=public --add-rich-rule='rule family="ipv4" source address="192.168.135.22/32" port port="27018" protocol="tcp" accept'
sudo firewall-cmd --permanent --zone=public --add-rich-rule='rule family="ipv4" source address="192.168.135.23/32" port port="27018" protocol="tcp" accept'

sudo firewall-cmd --reload
sudo firewall-cmd --list-all --zone=public
```

**Optional — disable Cockpit**

**Run on:** **All three** — `.21`, `.22`, `.23` (if you do not use Cockpit).

Purpose: Remove unused web UI on port `9090`.  
Importance: Smaller attack surface.

```bash
sudo systemctl disable --now cockpit.socket 2>/dev/null || true
```

### A6. SSH hardening (recommended)

**Run on:** **All three** — `.21`, `.22`, `.23`.

Purpose: Disable root and password SSH logins.  
Importance: Stronger access control — confirm key login works **before** running.

```bash
sudo cp -a /etc/ssh/sshd_config /etc/ssh/sshd_config.bak.$(date +%F)
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo systemctl reload sshd
```

---

## Part B — MongoDB 7 data nodes (`.22` and `.23`)

### B1. Install MongoDB 7.x (official RPM repository)

**Run on:** `192.168.135.22` **and** `192.168.135.23` (same commands on each DB server).

Purpose: Install `mongodb-org` from MongoDB’s RPM repo.  
Importance: Supported version and `mongod` system user.

```bash
sudo tee /etc/yum.repos.d/mongodb-org-7.0.repo << 'EOF'
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/9/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://pgp.mongodb.com/server-7.0.asc
EOF

sudo dnf -y install mongodb-org
sudo systemctl disable --now mongod 2>/dev/null || true
sudo mkdir -p /var/run/mongodb
sudo chown mongod:mongod /var/run/mongodb
```

If `dnf` reports a **platform mismatch**, see [MongoDB on Red Hat](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-red-hat/) and adjust `baseurl`.

### B2. Data directory

**Run on:** `192.168.135.22` **and** `192.168.135.23`.

Purpose: Create data and log paths with correct ownership.  
Importance: Prevents startup permission errors.

```bash
sudo mkdir -p /var/lib/mongodb
sudo chown -R mongod:mongod /var/lib/mongodb
sudo mkdir -p /var/log/mongodb
sudo chown mongod:mongod /var/log/mongodb
```

### B3. Shared keyFile — create on `.22`

**Run on:** `192.168.135.22` **only**.

Purpose: Generate the replica-set internal keyFile.  
Importance: Required for inter-member authentication. MongoDB requires a **single-line** key (no embedded newlines).

```bash
openssl rand -base64 756 | tr -d '\n' | sudo tee /etc/mongodb-keyfile >/dev/null
sudo chown mongod:mongod /etc/mongodb-keyfile
sudo chmod 400 /etc/mongodb-keyfile
sudo wc -c /etc/mongodb-keyfile
sudo md5sum /etc/mongodb-keyfile
```

Expect roughly **1008 bytes** (length varies slightly). Record the **md5** — the same value must appear on `.23` and `.21` after copy.

### B3b. Copy keyFile to `.23` (avoid `/tmp` → SELinux `user_tmp_t`)

**Run on:** `192.168.135.22` **only** (SSH session on `.22`; commands reach `.23` over the network).

Purpose: Same keyFile on the second data node.  
Importance: Mismatched keys or wrong SELinux context break the replica set.

**Why not `scp` to `/tmp` then `mv`:** Files moved from `/tmp` often keep context `**user_tmp_t`**, which can block `mongod` from reading the key (`bad file` / auth failures). Use `**install` straight into `/etc**`.

**On `.22`:**

```bash
sudo install -o fleet -g fleet -m 600 /etc/mongodb-keyfile /home/fleet/mongodb-keyfile.staging
scp /home/fleet/mongodb-keyfile.staging fleet@192.168.135.23:~/
rm -f /home/fleet/mongodb-keyfile.staging
```

**On `.23`** — open an interactive SSH session (`ssh -t fleet@192.168.135.23`), then:

```bash
sudo install -o mongod -g mongod -m 400 ~/mongodb-keyfile.staging /etc/mongodb-keyfile
rm -f ~/mongodb-keyfile.staging
sudo md5sum /etc/mongodb-keyfile
sudo ls -Z /etc/mongodb-keyfile
```

`md5sum` on `.23` must **match `.22`**. Context should be `**etc_t**` (not `user_tmp_t`).

**Do not copy to `.21` here** — do that in **Part C1b** after `mongodb-org` is installed on `.21`.

**Note:** `fleet` cannot read `/etc/mongodb-keyfile` (mode `400`, owner `mongod`) — always use `**sudo scp`** or the staging pattern above, not plain `scp` as `fleet`.

### B4. `mongod.conf` for data nodes

**Run on:** `192.168.135.22` **only** (use this exact `bindIp`).

Purpose: Configure data node for `rs0` with loopback + LAN bind.  
Importance: Local `mongosh` and peer replication both work.

```bash
sudo tee /etc/mongod.conf << 'EOF'
storage:
  dbPath: /var/lib/mongodb
  wiredTiger:
    engineConfig:
      cacheSizeGB: 6

systemLog:
  destination: file
  path: /var/log/mongodb/mongod.log
  logAppend: true

net:
  port: 27017
  bindIp: 127.0.0.1,192.168.135.22

processManagement:
  fork: false
  pidFilePath: /var/run/mongodb/mongod.pid
  timeZoneInfo: /usr/share/zoneinfo

replication:
  replSetName: rs0

security:
  authorization: disabled
  keyFile: /etc/mongodb-keyfile
EOF
```

**Run on:** `192.168.135.23` **only** (same as above but `bindIp` uses `.23`).

Purpose: Same config as `.22` with this host’s LAN IP.  
Importance: Each data node must bind to its own address.

```bash
sudo tee /etc/mongod.conf << 'EOF'
storage:
  dbPath: /var/lib/mongodb
  wiredTiger:
    engineConfig:
      cacheSizeGB: 6

systemLog:
  destination: file
  path: /var/log/mongodb/mongod.log
  logAppend: true

net:
  port: 27017
  bindIp: 127.0.0.1,192.168.135.23

processManagement:
  fork: false
  pidFilePath: /var/run/mongodb/mongod.pid
  timeZoneInfo: /usr/share/zoneinfo

replication:
  replSetName: rs0

security:
  authorization: disabled
  keyFile: /etc/mongodb-keyfile
EOF
```

`authorization: disabled` is **temporary** until Part D2–D3.

### B5. SELinux (MongoDB data path)

**Run on:** `192.168.135.22` **and** `192.168.135.23`.

Purpose: Label MongoDB data directory for SELinux.  
Importance: Avoids denials on non-default paths.

```bash
sudo semanage fcontext -a -t mongod_var_lib_t '/var/lib/mongodb(/.*)?' 2>/dev/null || true
sudo restorecon -Rv /var/lib/mongodb
```

### B6. Start `mongod`

**Run on:** `192.168.135.22` **and** `192.168.135.23` (start on each after config is in place).

Purpose: Enable and start MongoDB.  
Importance: Confirms config is valid before replica-set init.

```bash
sudo mongod -f /etc/mongod.conf --configExpand none --configCheck
sudo systemctl enable --now mongod
sudo systemctl status mongod --no-pager
ss -tlnp | grep 27017
```

**Verify `keyFile` is in the config** (on each data node):

```bash
sudo grep -A3 '^security:' /etc/mongod.conf
```

If `rs.initiate` later reports **Authentication failed** on a peer and that host’s log says **started without a --keyFile parameter**, the `security.keyFile` block is missing or not applied — re-apply **B4** and restart `mongod` on that host.

---

## Part C — MongoDB arbiter on `.21`

### C1. Install `mongodb-org`

**Run on:** `192.168.135.21` **only**.

Purpose: Install MongoDB packages and create the `mongod` user on the app host.  
Importance: Required before `chown mongod:mongod` on the keyFile.

```bash
sudo tee /etc/yum.repos.d/mongodb-org-7.0.repo << 'EOF'
[mongodb-org-7.0]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/redhat/9/mongodb-org/7.0/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://pgp.mongodb.com/server-7.0.asc
EOF

sudo dnf -y install mongodb-org
sudo mkdir -p /var/run/mongodb
sudo chown mongod:mongod /var/run/mongodb
```

### C1b. Copy keyFile from `.22` to `.21`

**Run on:** `192.168.135.22` **only** (SSH on `.22`; copies to `.21`).

Purpose: Place the same keyFile on the arbiter with correct ownership.  
Importance: Arbiter must share the key with data nodes. Use the same **staging + `install`** pattern as **B3b** (not `/tmp`).

If a bad copy exists (`fleet:fleet` or wrong md5), **run on `192.168.135.21` only** first:

```bash
sudo rm -f /etc/mongodb-keyfile
```

**On `.22`:**

```bash
sudo install -o fleet -g fleet -m 600 /etc/mongodb-keyfile /home/fleet/mongodb-keyfile.staging
scp /home/fleet/mongodb-keyfile.staging fleet@192.168.135.21:~/
rm -f /home/fleet/mongodb-keyfile.staging
```

**On `.21`** — `ssh -t fleet@192.168.135.21`, then:

```bash
sudo install -o mongod -g mongod -m 400 ~/mongodb-keyfile.staging /etc/mongodb-keyfile
rm -f ~/mongodb-keyfile.staging
```

Piping `sudo cat … | ssh … 'sudo install …'` without `**-t**` often fails with `**sudo: a terminal is required**`.

**Verify keyFile**

**Run on:** `192.168.135.21` **only**.

Purpose: Confirm permissions and SELinux before starting arbiter.  
Importance: Must be `400 mongod:mongod`; md5 must match `.22`.

```bash
sudo ls -l /etc/mongodb-keyfile
sudo stat -c '%a %U:%G %n' /etc/mongodb-keyfile
sudo md5sum /etc/mongodb-keyfile
sudo ls -Z /etc/mongodb-keyfile
```

If context is `user_tmp_t`, recreate the file with `**install**` (above) or run `sudo restorecon -v /etc/mongodb-keyfile` after `semanage fcontext` (see **Appendix — MongoDB troubleshooting**).

### C2. Arbiter paths and config

**Run on:** `192.168.135.21` **only**.

Purpose: Arbiter `mongod` on port `27018`, separate `dbPath`.  
Importance: Does not collide with app services on `.21`.

```bash
sudo mkdir -p /var/lib/mongodb-arbiter /var/log/mongodb
sudo chown mongod:mongod /var/lib/mongodb-arbiter /var/log/mongodb

sudo tee /etc/mongod-arbiter.conf << 'EOF'
storage:
  dbPath: /var/lib/mongodb-arbiter

systemLog:
  destination: file
  path: /var/log/mongodb/mongod-arbiter.log
  logAppend: true

net:
  port: 27018
  bindIp: 127.0.0.1,192.168.135.21

processManagement:
  fork: false
  pidFilePath: /var/run/mongodb/mongod-arbiter.pid
  timeZoneInfo: /usr/share/zoneinfo

replication:
  replSetName: rs0

security:
  authorization: disabled
  keyFile: /etc/mongodb-keyfile
EOF

sudo semanage fcontext -a -t mongod_var_lib_t '/var/lib/mongodb-arbiter(/.*)?' 2>/dev/null || true
sudo restorecon -Rv /var/lib/mongodb-arbiter
```

### C3. Systemd unit for arbiter

**Run on:** `192.168.135.21` **only**.

Purpose: Run arbiter under systemd.  
Importance: Starts on boot and restarts on failure.

```bash
sudo tee /etc/systemd/system/mongod-arbiter.service << 'EOF'
[Unit]
Description=MongoDB Arbiter
After=network.target

[Service]
Type=simple
User=mongod
Group=mongod
ExecStart=/usr/bin/mongod --config /etc/mongod-arbiter.conf
Restart=always
LimitNOFILE=64000

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now mongod-arbiter
sudo systemctl status mongod-arbiter --no-pager
```

---

## Part D — Initialise replica set and create users

**Prerequisites:** `mongod` running on `.22` and `.23`; `mongod-arbiter` running on `.21`; identical keyFile on all three.

### D1. Initiate replica set

**Run on:** `192.168.135.22` **only** (SSH into `.22`; use loopback URI on this host).

**Why `127.0.0.1`:** With `keyFile`, bootstrap commands need a local connection. `**bindIp`** must include `127.0.0.1` (see B4). If you see `**ECONNREFUSED 127.0.0.1`**, fix `bindIp` and `**sudo systemctl restart mongod**` on `.22`.

Purpose: Open `mongosh` for `rs.initiate`.  
Importance: Replica set does not exist until this runs once.

```bash
mongosh "mongodb://127.0.0.1:27017/?directConnection=true"
```

**Run on:** `192.168.135.22` **only** — inside the `mongosh` shell from the command above (not bash).

Purpose: Define members (two data + one arbiter).  
Importance: Hosts/ports must match running instances.

```javascript
rs.initiate({
  _id: "rs0",
  members: [
    { _id: 0, host: "192.168.135.22:27017", priority: 2 },
    { _id: 1, host: "192.168.135.23:27017", priority: 1 },
    { _id: 2, host: "192.168.135.21:27018", arbiterOnly: true }
  ]
});
rs.status();
```

Do **not** run `rs.initiate` again from `.23` if it already succeeded on `.22`.

**Preflight (from `.22`):**

```bash
nc -zv 192.168.135.23 27017
nc -zv 192.168.135.21 27018
```

### D2. Create users

**Run on:** Whichever host is **PRIMARY** in `rs.status()` — usually `192.168.135.22` right after D1. SSH to **that** host only.

Purpose: Create database users **while `authorization: disabled`** in `mongod.conf` / `mongod-arbiter.conf`.  
Importance: **Complete D2 before D3.** If auth is enabled before both users exist, login and `createUser` become much harder.

```bash
mongosh "mongodb://127.0.0.1:27017/?directConnection=true"
```

If PRIMARY is `**192.168.135.23**`, SSH to `**.23**` and run the same URI there (not from `.22` to `.23`’s LAN IP).

In `**mongosh**`, run **one command at a time** (do not paste bash-style `|` continuations).

#### D2a — `mongoAdmin` (inside `mongosh` on PRIMARY)

```javascript
use admin
```

```javascript
db.createUser({
  user: "mongoAdmin",
  pwd: "REPLACE_STRONG_ADMIN_PASSWORD",
  roles: [ { role: "root", db: "admin" } ]
})
```

#### D2b — `fleetapp` (authenticated as `mongoAdmin`)

Exit `mongosh`, then reconnect **as admin** (password will not echo):

```bash
mongosh "mongodb://127.0.0.1:27017/?directConnection=true" \
  -u mongoAdmin --password --authenticationDatabase admin
```

If `mongoAdmin` login fails while auth is still **disabled**, the user may not exist — repeat **D2a** only. If auth is already **enabled**, see **Appendix — MongoDB troubleshooting**.

Inside `mongosh`:

```javascript
use fleet_management
```

```javascript
db.createUser({
  user: "fleetapp",
  pwd: "REPLACE_STRONG_APP_PASSWORD",
  roles: [ { role: "readWrite", db: "fleet_management" } ]
})
```

**Verify (auth still disabled)** — optional, on PRIMARY without `-u`:

```javascript
use admin
db.getUsers()
use fleet_management
db.getUsers()
```

### D3. Enable authorization

Edit the **correct file per host** (do **not** paste YAML into bash):


| Host             | Config file                |
| ---------------- | -------------------------- |
| `192.168.135.22` | `/etc/mongod.conf`         |
| `192.168.135.23` | `/etc/mongod.conf`         |
| `192.168.135.21` | `/etc/mongod-arbiter.conf` |


**Run on:** `192.168.135.22` **and** `192.168.135.23`:

```bash
sudo sed -i 's/authorization: disabled/authorization: enabled/' /etc/mongod.conf
sudo grep -A3 '^security:' /etc/mongod.conf
```

**Run on:** `192.168.135.21` **only**:

```bash
sudo sed -i 's/authorization: disabled/authorization: enabled/' /etc/mongod-arbiter.conf
sudo grep -A3 '^security:' /etc/mongod-arbiter.conf
```

Restart order (check `rs.status()` for secondary vs primary):

**Run on:** `192.168.135.23` **only** (restart secondary first if `.23` is SECONDARY).

```bash
sudo systemctl restart mongod
```

**Run on:** `192.168.135.22` **only**.

```bash
sudo systemctl restart mongod
```

**Run on:** `192.168.135.21` **only**.

```bash
sudo systemctl restart mongod-arbiter
```

### D4. Verify MongoDB auth

**Run on:** `192.168.135.22` (recommended).

Purpose: Confirm `fleetapp` can authenticate.  
Importance: Validates `MONGO_URL` before deploying the app.

**Passwords with `/` or `!`:** URL-encode in connection strings (`/` → `%2F`, `!` → `%21`). In bash, `**!` triggers history expansion** in double-quoted strings — prefer **single-quoted** URIs or `--password` prompt.

**Option A — prompt (simplest):**

```bash
mongosh "mongodb://127.0.0.1:27017/?directConnection=true" \
  -u fleetapp --password --authenticationDatabase fleet_management \
  --eval 'db.runCommand({ ping: 1 })'
```

**Option B — replica set URI** (encode password; example assumes `P@ss/word!` → `P%40ss%2Fword%21`):

```bash
mongosh 'mongodb://fleetapp:REPLACE_URL_ENCODED_PASSWORD@192.168.135.22:27017,192.168.135.23:27017/fleet_management?replicaSet=rs0&authSource=fleet_management' --eval 'db.runCommand({ ping: 1 })'
```

Expect `{ ok: 1 }`.

**Use in backend `.env` on `.21`** (URL-encoded password in URI):

```env
MONGO_URL=mongodb://fleetapp:REPLACE_URL_ENCODED_PASSWORD@192.168.135.22:27017,192.168.135.23:27017/fleet_management?replicaSet=rs0&authSource=fleet_management
```

---

## Part E — Application stack on `.21`

All steps in Part E are `**192.168.135.21` only** unless noted.

### E1. Nginx, Python 3.11, toolchain

**Run on:** `192.168.135.21` **only**.

Purpose: Install web server and **Python 3.11+** for the backend (`[README.md](../README.md)`).  
Importance: EL9 default `python3` (3.9.x) is below project requirement; use `**python3.11`** for the venv (E4).

```bash
sudo dnf -y install nginx python3.11 python3.11-devel gcc git rsync
python3.11 --version
```

(`python3.11 -m venv` in E4 provides `pip` inside the venv.)

### E2. Node.js 20 LTS (React build)

**Run on:** `192.168.135.21` **only**.

Purpose: Node 20 + yarn for `yarn build`.  
Importance: Avoid EL9 default Node 16 build failures.

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf -y install nodejs
node -v
sudo npm install -g yarn
```

### E3. Clone / deploy code

**Run on:** `192.168.135.21` **only** (as user `fleet`).

Purpose: Place application source under `/home/fleet/app`.  
Importance: Isolated deploy path for user `fleet`.

```bash
sudo -u fleet -i
cd ~
mkdir -p ~/app && cd ~/app
git clone <YOUR_GIT_URL> .
# Repo root is now /home/fleet/app (backend/, frontend/, …)
```

### E4. Python venv and dependencies

**Run on:** `192.168.135.21` **only** (continue as `fleet` in `/home/fleet/app`).

Purpose: Install backend dependencies and Gunicorn.  
Importance: Reproducible runtime separate from system Python.

```bash
cd /home/fleet/app/backend
python3.11 -m venv .venv
source .venv/bin/activate
python --version
pip install --upgrade pip wheel
pip install -r requirements.txt gunicorn
```

### E5. Backend `.env`

**Run on:** `192.168.135.21` **only** (`/home/fleet/app/backend` as `fleet`).

Purpose: Create secrets file with safe permissions.  
Importance: App reads config at startup. Use the production template in `backend/.env.example` (copy from your workstation with `scp` if the server clone is older than git).

```bash
cd /home/fleet/app/backend
cp .env.example .env
chmod 600 .env
nano .env
```

Fill every `REPLACE_*` value. **Public URL alignment** (all three must match — scheme + host, **no trailing slash**, **no `/api`**):


| Variable                                     | Phase 1 (pre-DNS)       | Phase 2 (go-live)                  |
| -------------------------------------------- | ----------------------- | ---------------------------------- |
| `CORS_ORIGINS`                               | `http://192.168.135.21` | `https://fleet.gtiholding.com` |
| `FRONTEND_URL`                               | same as `CORS_ORIGINS`  | same                               |
| `REACT_APP_BACKEND_URL` (frontend build, E6) | same origin             | same                               |


Generate secrets on the server:

```bash
python3.11 -c "import secrets; print(secrets.token_hex(32))"   # JWT_SECRET_KEY
python3.11 -c "import secrets; print(secrets.token_urlsafe(32))"  # BOOTSTRAP_TOKEN
```

Restart API after edits: `sudo systemctl restart fleet-api`

### E6. Build frontend

**Run on:** `192.168.135.21` **only** (`/home/fleet/app/frontend` as `fleet`).

**Prerequisite:** Node 20 + Yarn (**E2**). `yarn: command not found` → complete E2 first.

Purpose: Build static assets with correct API URL.  
Importance: `REACT_APP_BACKEND_URL` is **baked in at build time**. The React app calls `${REACT_APP_BACKEND_URL}/api/...`.

**No port in the URL** when Nginx listens on default **80** (HTTP) or **443** (HTTPS):

- Correct: `http://192.168.135.21` or `https://fleet.gtiholding.com`
- Wrong for this layout: `http://192.168.135.21:8000` (port 8000 is only for direct uvicorn / local dev)

**Phase 1 — before DNS/TLS:**

```bash
cd /home/fleet/app/frontend
yarn install --frozen-lockfile
export REACT_APP_BACKEND_URL="http://192.168.135.21"
yarn build
```

**Phase 2 — after DNS and HTTPS** (rebuild required):

```bash
export REACT_APP_BACKEND_URL="https://fleet.gtiholding.com"
yarn build
```

Optional: copy `frontend/.env.example` to `frontend/.env` with the same `REACT_APP_BACKEND_URL` before `yarn build`.

### E7. Publish static files for Nginx

**Run on:** `192.168.135.21` **only** (sudo).

Purpose: Deploy `build/` to Nginx docroot.  
Importance: RHEL uses user `nginx`, not `www-data`.

```bash
sudo mkdir -p /var/www/fleet
sudo rsync -a /home/fleet/app/frontend/build/ /var/www/fleet/
sudo chown -R nginx:nginx /var/www/fleet
sudo chmod -R a+rX /var/www/fleet
```

### E8. `fleet-api` systemd unit

**Run on:** `192.168.135.21` **only**.

Purpose: Run Gunicorn + Uvicorn as `fleet` on `127.0.0.1:8000` (not exposed publicly).  
Importance: Nginx proxies `/api/` to this socket. **Start before enabling Nginx** (E9).

```bash
sudo tee /etc/systemd/system/fleet-api.service << 'EOF'
[Unit]
Description=Fleet FastAPI (Gunicorn + Uvicorn)
After=network.target

[Service]
User=fleet
Group=fleet
WorkingDirectory=/home/fleet/app/backend
Environment="PATH=/home/fleet/app/backend/.venv/bin"
ExecStart=/home/fleet/app/backend/.venv/bin/gunicorn server:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 127.0.0.1:8000 \
  --timeout 120 \
  --access-logfile /var/log/fleet/access.log \
  --error-logfile /var/log/fleet/error.log
Restart=always
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

sudo mkdir -p /var/log/fleet
sudo chown fleet:fleet /var/log/fleet

sudo systemctl daemon-reload
sudo systemctl enable --now fleet-api
sudo systemctl status fleet-api --no-pager
curl -sS http://127.0.0.1:8000/health
```

### E9. Nginx configuration

**Run on:** `192.168.135.21` **only**.

Purpose: Single public entry — React SPA from `/var/www/fleet`, API via `**/api/`** → `http://127.0.0.1:8000`.  
Importance: Browsers only talk to Nginx; FastAPI stays on loopback.

**Prerequisites:** E7 (static files), E8 (`fleet-api` active), firewalld allows **http** on `.21` (Part A5).

Use **Phase 1** first to validate the stack before DNS/TLS. Apply **Phase 2** when `fleet.gtiholding.com` resolves and certificates are ready.

#### E9a — Phase 1: HTTP only (pre-DNS)

No HTTPS redirect. Works with `http://192.168.135.21` or `http://fleet.gtiholding.com` via `/etc/hosts` on your laptop.

```bash
sudo tee /etc/nginx/conf.d/fleet.conf << 'EOF'
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/m;

upstream fleet_api {
    server 127.0.0.1:8000;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name 192.168.135.21 fleet.gtiholding.com _;

    root /var/www/fleet;
    index index.html;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location /api/ {
        proxy_pass http://fleet_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        client_max_body_size 25m;
    }

    location ~ ^/api/auth/(login|register|forgot-password|reset-password) {
        limit_req zone=auth_limit burst=5 nodelay;
        proxy_pass http://fleet_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

sudo nginx -t && sudo systemctl enable --now nginx && sudo systemctl reload nginx
```

**Verify Phase 1:**

```bash
curl -sS http://127.0.0.1/ | head -5
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1/api/auth/me
```

From a workstation on the LAN: open `http://192.168.135.21` in a browser.

#### E9b — Phase 2: HTTPS + HTTP→HTTPS redirect (go-live)

**Skip until** DNS points `fleet.gtiholding.com` → `192.168.135.21`.

**TLS certificates** — corporate CA:

```bash
sudo mkdir -p /etc/nginx/ssl
sudo cp your_fullchain.pem /etc/nginx/ssl/fleet.crt
sudo cp your_private.key /etc/nginx/ssl/fleet.key
sudo chmod 640 /etc/nginx/ssl/fleet.key
sudo chown root:nginx /etc/nginx/ssl/fleet.key
```

Let’s Encrypt:

```bash
sudo dnf -y install certbot python3-certbot-nginx
sudo certbot --nginx -d fleet.gtiholding.com
```

If using certbot, it may merge SSL into `fleet.conf`; otherwise replace Phase 1 config with:

```bash
sudo tee /etc/nginx/conf.d/fleet.conf << 'EOF'
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/m;

upstream fleet_api {
    server 127.0.0.1:8000;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name fleet.gtiholding.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name fleet.gtiholding.com;

    ssl_certificate     /etc/nginx/ssl/fleet.crt;
    ssl_certificate_key /etc/nginx/ssl/fleet.key;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_protocols TLSv1.2 TLSv1.3;

    root /var/www/fleet;
    index index.html;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location /api/ {
        proxy_pass http://fleet_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        client_max_body_size 25m;
    }

    location ~ ^/api/auth/(login|register|forgot-password|reset-password) {
        limit_req zone=auth_limit burst=5 nodelay;
        proxy_pass http://fleet_api;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

sudo nginx -t && sudo systemctl reload nginx
```

**Phase 2 checklist** (on `.21`):

1. Update `backend/.env`: `CORS_ORIGINS` and `FRONTEND_URL` → `https://fleet.gtiholding.com`
2. `sudo systemctl restart fleet-api`
3. Rebuild frontend with `REACT_APP_BACKEND_URL=https://fleet.gtiholding.com` (E6)
4. `sudo rsync -a /home/fleet/app/frontend/build/ /var/www/fleet/`
5. Apply E9b Nginx + reload

### E10. SELinux: Nginx → backend

**Run on:** `192.168.135.21` **only**.

Purpose: Allow Nginx to connect to FastAPI upstream.  
Importance: Common SELinux blocker without this boolean.

```bash
sudo setsebool -P httpd_can_network_connect 1
sudo restorecon -Rv /var/www/fleet /etc/nginx/conf.d/fleet.conf
```

### E11. Smoke tests

**Run on:** `192.168.135.21` **only**.

Purpose: Quick health check before browser testing.  
Importance: Catches API/Nginx misconfiguration early.

**API (loopback):**

```bash
curl -sS http://127.0.0.1:8000/health
```

**Phase 1 (HTTP via Nginx):**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1/
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1/api/auth/me
```

**Phase 2 (HTTPS):**

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://fleet.gtiholding.com/
```

Expected: `/health` returns JSON; `/` returns `200`; `/api/auth/me` returns `401` without a token (proves Nginx → API routing).

---

## Part F — Enterprise operations

### F1. Backups (`mongodump`)

**Run on:** `192.168.135.23` **only** (typical — run backups from the **SECONDARY**; confirm with `rs.status()` on `.22` or `.23`).

Purpose: Install `mongodump` tools.  
Importance: Backups without tools fail.

```bash
sudo dnf -y install mongodb-database-tools
```

**Run on:** `192.168.135.23` **only** — add to **root** crontab (`sudo crontab -e`).

Purpose: Nightly compressed dumps with retention.  
Importance: Recovery point objective for production data.

```cron
15 2 * * * mongodump --uri="mongodb://mongoAdmin:Jrfleets%2F0772%21GTI@192.168.135.23:27017/?replicaSet=rs0&authSource=admin" --out=/var/backups/mongodb/$(date +\%F) --gzip && find /var/backups/mongodb -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} \;
```

### F2. Log rotation

**Run on:** `192.168.135.21` **only**.

Purpose: Rotate FastAPI log files.  
Importance: Prevents `/var/log/fleet` from filling disk.

```bash
sudo tee /etc/logrotate.d/fleet-api << 'EOF'
/var/log/fleet/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
}
EOF
```

### F3. Security checklist (RHEL)

Apply org policy on **all three** where relevant (patching, firewalld, audit).

### F4. Rollback

**Run on:** `192.168.135.21` **only**.

```bash
sudo systemctl stop fleet-api
# restore /var/www/fleet and /home/fleet/app from backup/tag
sudo systemctl start fleet-api
sudo systemctl reload nginx
```

---

## Appendix — MongoDB troubleshooting (field notes)


| Symptom                                                                 | Likely cause                                           | Fix                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `scp: Permission denied` reading `/etc/mongodb-keyfile` on `.22`        | File is mode `400`, owner `mongod`                     | Use `**sudo scp**` or **B3b staging**                                            |
| `chown: invalid user: mongod:mongod` on `.21`                           | MongoDB not installed yet                              | **C1** before **C1b**                                                            |
| `bad file` / arbiter won’t start; `ls -Z` shows `user_tmp_t`            | Key copied via `/tmp`                                  | Re-copy with `**install`** to `/etc` (B3b / C1b)                                 |
| `chcon: … mongod_db_t: Invalid argument`                                | Wrong SELinux type name on EL9                         | Use `**etc_t**` via direct `/etc` install, or `mongod_var_lib_t` + `restorecon`  |
| `Authentication failed` on `rs.initiate` for one peer                   | Key md5 mismatch **or** peer has no `security.keyFile` | Match md5 on all hosts; verify **B4** + restart                                  |
| Log: **without a --keyFile parameter** on `.23`                         | `mongod.conf` missing `keyFile`                        | Re-apply **B4** on that host, `configCheck`, restart                             |
| `sudo: a terminal is required` over SSH                                 | Remote `sudo` without TTY                              | `**ssh -t`** or run `install` in interactive SSH                                 |
| `!GTI@…: event not found` in bash                                       | `!` in password with double quotes                     | Single-quote URI, URL-encode, or `--password` prompt                             |
| `mongoAdmin` works, `fleetapp` `createUser` **requires authentication** | Normal after first user when auth enabled              | Create `**fleetapp` logged in as `mongoAdmin`** (D2b)                            |
| Auth fails for both users after D3                                      | `fleetapp` never created, or wrong password            | Temporarily set `authorization: disabled`, fix users, re-enable D3               |
| CORS errors in browser                                                  | `CORS_ORIGINS` ≠ browser origin                        | Match `http://192.168.135.21` or `https://fleet.gtiholding.com` exactly (E5) |
| API calls go to `:8000` from browser                                    | Wrong `REACT_APP_BACKEND_URL`                          | Use origin **without** port; rebuild frontend (E6)                               |
| `yarn: command not found`                                               | Node/Yarn not installed                                | Part **E2** before E6                                                            |
| Nginx 502 on `/api/`                                                    | `fleet-api` down or SELinux                            | **E8** + **E10** `httpd_can_network_connect`                                     |
| `rsync: … /opt/fleet/app/frontend/build: No such file`                  | Wrong path; app under `/home/fleet/app`                | Use `**/home/fleet/app/frontend/build/`** (see Application paths)                |


**Config file map:**


| Host         | Role    | File                       |
| ------------ | ------- | -------------------------- |
| `.22`, `.23` | Data    | `/etc/mongod.conf`         |
| `.21`        | Arbiter | `/etc/mongod-arbiter.conf` |


---

## Part G — Port reference


| Host             | Port    | Service             |
| ---------------- | ------- | ------------------- |
| `192.168.135.21` | 22      | SSH                 |
| `192.168.135.21` | 80, 443 | Nginx               |
| `192.168.135.21` | 8000    | FastAPI (localhost) |
| `192.168.135.21` | 27018   | MongoDB arbiter     |
| `192.168.135.22` | 22      | SSH                 |
| `192.168.135.22` | 27017   | MongoDB data        |
| `192.168.135.23` | 22      | SSH                 |
| `192.168.135.23` | 27017   | MongoDB data        |


---

## Document history


| Version | Date       | Notes                                                                                           |
| ------- | ---------- | ----------------------------------------------------------------------------------------------- |
| 1.0     | 2026-05-10 | Initial runbook (Ubuntu)                                                                        |
| 2.0     | 2026-05-10 | CentOS Stream 9: dnf, firewalld, SELinux                                                        |
| 2.1     | 2026-05-11 | Every step labeled **Run on:** with explicit server IP(s)                                       |
| 2.2     | 2026-05-16 | KeyFile SELinux-safe copy, D2/D3/D4 auth flow, Python 3.11 required, troubleshooting appendix   |
| 2.3     | 2026-05-16 | Nginx Phase 1 (HTTP/pre-DNS) + Phase 2 (HTTPS), URL alignment, E8 fleet-api before Nginx        |
| 2.4     | 2026-05-19 | Application root `/home/fleet/app` (verified on fleet-app-01); path table + rsync/systemd fixes |


