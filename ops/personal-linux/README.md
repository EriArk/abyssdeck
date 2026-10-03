# Personal Linux host preparation

Owner-approved direction: [personal Linux and Companion contract](../../docs/PERSONAL_LINUX.md).
This is an additive host-preparation package, not a replacement for the installed
Podman broker and not a member enrollment endpoint.

On Ubuntu 24.04 with cgroup v2, at least 64 GiB free in `/var/lib` and 5 GiB
currently available RAM for the two disposable probes:

```sh
python3 prepare.py           # read-only plan and route/capacity preflight
sudo python3 prepare.py --apply
```

For the delivered version use `apply-bundle.py`, which verifies `manifest.json`
and every source hash first. The wrapper accepts only no arguments or `--apply`.
The manifest records the Git revision; no private key or credential is packaged.

Installation uses supported Ubuntu packages and the official Incus Ubuntu 24.04
image. The first image's immutable fingerprint is recorded before creating the
second probe. No image alias is consulted again for that run. No host account is
added to the Incus administrator group. No host SSH configuration, router, public
listener, existing disk, Hub, GPT or Companion process is modified/restarted.

The only persistent additions are the Incus packages/service, `cw-personal`
project/pool/profile, `cwpersonal0` bridge, a scoped nftables table and its systemd
unit, and private installation receipts under `/var/lib/codex-personal-linux`.
The loop pool is a new bounded file managed by Incus, not an existing block disk.
The global Incus default profile is untouched. A collision, changed policy or
uncertain creation without a confirmed object stops preparation rather than
adopting/recreating/reformatting anything.

Real verification starts two separately mapped disposable system containers.
It tests package installation, persistent systemd service, exact SSH host key and
disposable user key, binary SFTP, file/service persistence after restart, resource
limits, private host/sibling denial, public HTTPS and a 2-GiB test root-disk quota.
No Codex or personal account is required. After success the exact labelled probes
are stopped/deleted; after failure they are stopped and retained for diagnosis.
Test SSH private keys are ephemeral. Ordinary personal instances are never selected
by name prefix alone: deletion requires the exact recorded probe ID and marker.

Successful repeated installation returns the dated existing receipt, without
rerunning or claiming fresh acceptance. Read the sanitized, credential-free report:

```sh
cat /var/lib/codex-personal-linux-readiness.json
```

`hostAccepted` and `userActivated` are separate. The latter remains false here.
SSH access through Tailscale and service publication are subsequent broker/route
integration; the probes publish no listener outside their private bridge.
Do not remove the firewall when stopping preparation. Do not flush Docker/UFW
tables to make a networking check pass; diagnose the interaction instead.

Source/control-plane regressions (Linux):

```sh
python3 tests/personal-linux.test.py
```

Passing these tests does not establish actual kernel/network isolation. Only the
administrator's real-host run can supply that evidence. Backup/restore, live
migration, nested Docker and member use remain explicitly unactivated.
