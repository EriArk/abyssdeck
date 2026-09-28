#!/bin/bash
# Administrative prerequisites only. Does not expose a workspace, port or host shell.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
account=codex-workspaces
workspace_home=/var/lib/codex-workspaces
if [[ ${1:-} != --apply ]]; then
  cat <<'TEXT'
Installs Ubuntu's podman, uidmap, slirp4netns and fuse-overlayfs packages.
Creates the dedicated locked codex-workspaces service account and private home.
Enables that account's systemd user manager for rootless resource accounting.
Checks rootless Podman and cgroup v2. Does not modify Docker, disable AppArmor,
open ports, copy credentials, create project containers or grant Hub runtime access.
Run with sudo and --apply to perform these steps. No password is stored.
TEXT
  exit 0
fi
[[ $EUID == 0 ]] || { echo 'Run this step with sudo in your terminal.' >&2; exit 1; }
source /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || { echo 'This preparation is reviewed for Ubuntu 24.04 only.' >&2; exit 1; }
[[ -f /sys/fs/cgroup/cgroup.controllers ]] || { echo 'cgroup v2 is required.' >&2; exit 1; }
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends podman uidmap slirp4netns fuse-overlayfs
if getent passwd "$account" >/dev/null; then
  [[ $(getent passwd "$account" | cut -d: -f6) == "$workspace_home" ]] || { echo 'Existing account has a different home; no changes made to it.' >&2; exit 1; }
  [[ $(getent passwd "$account" | cut -d: -f7) == /usr/sbin/nologin ]] || { echo 'Existing account is not the dedicated service account.' >&2; exit 1; }
else
  [[ ! -e $workspace_home ]] || { echo 'Destination already exists without the service account; inspect it manually.' >&2; exit 1; }
  useradd --create-home --home-dir "$workspace_home" --shell /usr/sbin/nologin --user-group "$account"
fi
[[ ! -L $workspace_home && $(stat -c %U "$workspace_home") == "$account" ]] || { echo 'Unexpected home ownership/type.' >&2; exit 1; }
chmod 0700 "$workspace_home"
for file in /etc/subuid /etc/subgid; do
  awk -F: -v account="$account" '$1==account && $3>=65536 {found=1} END{exit !found}' "$file" || { echo "Missing subordinate ID allocation in $file; stopped without guessing a range." >&2; exit 1; }
done
loginctl enable-linger "$account"
uid=$(id -u "$account")
systemctl start "user@$uid.service"
runuser -u "$account" -- env --ignore-environment --chdir="$workspace_home" HOME="$workspace_home" USER="$account" LOGNAME="$account" PATH=/usr/sbin:/usr/bin:/sbin:/bin XDG_RUNTIME_DIR="/run/user/$uid" DBUS_SESSION_BUS_ADDRESS="unix:path=/run/user/$uid/bus" /usr/bin/podman info --format json |
  python3 -c 'import json,sys; v=json.load(sys.stdin); h=v["host"]; assert h["security"]["rootless"] is True; assert h["cgroupVersion"]=="v2"; print("Rootless prerequisites ready; project workspaces are not enabled yet.")'
