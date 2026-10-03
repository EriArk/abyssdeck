#!/usr/bin/env python3
"""Host-only adapter replacement, one exact idle native profile at a time.

Build the target from the existing application image, changing adapter files only.
Keeps the private profile and the stopped previous container; never replays work.
"""
import argparse
from contextlib import ExitStack
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import time
import uuid


def run(args, **kw):
    return subprocess.run(args, check=True, **kw)


def output(args):
    return subprocess.check_output(args, text=True)


def inspect(name):
    return json.loads(output(['docker', 'inspect', name]))[0]


def request(name, operation, **fields):
    # The bound account comes from this container's private local configuration.
    script = """import {readFileSync,existsSync} from 'node:fs';import http from 'node:http';
const b=JSON.parse(readFileSync('/data/native-adapter/'+(existsSync('/data/native-adapter/binding.json')?'binding.json':'enrollment.json')));
const r=http.request({socketPath:'/data/native-adapter/adapter.sock',path:'/v1',method:'POST',headers:{'Content-Type':'application/json'}},s=>{let data='';s.on('data',c=>data+=c);s.on('end',()=>{const v=JSON.parse(data);if(s.statusCode!==200||v.ok!==true){console.error(v.code);process.exitCode=1;}else console.log(JSON.stringify(v.result));});});
r.on('error',()=>{process.exitCode=1;});r.setTimeout(25000,()=>r.destroy());
r.end(JSON.stringify({...INPUT,userId:b.userId}));""".replace('INPUT', json.dumps(dict(operation=operation, **fields)))
    p = run(['docker', 'exec', '-i', name, 'node', '--input-type=module', '-'], input=script, text=True, capture_output=True)
    return json.loads(p.stdout)


def assert_idle(user_id):
    script = """import {readFileSync} from 'node:fs';import {join} from 'node:path';import {DatabaseSync} from 'node:sqlite';
const c=JSON.parse(readFileSync('/config/config.json'));const id=USER;
const path=c.nativeGpt?.userId===id?c.hub.databasePath:join(c.team.root,'users',id,'app.db');
const d=new DatabaseSync(path,{readOnly:true});
// An idle receipt records an observed stopped stream, not an active writer.
// Keep it intact; fresh native activity admission below still checks generation.
for(const [table,where] of [['gpt_jobs',"status IN ('queued','preparing','running')"],['gpt_native_operations',"state IN ('preparing','running')"],['gpt_project_operations',"state='pending'"],['commands',"scope='gpt-native-workspace' AND state='pending'"]])
 if(d.prepare('SELECT count(*) n FROM '+table+' WHERE '+where).get().n)throw Error('ACTIVE_GPT_WORK');
d.close();console.log('idle');""".replace('USER', json.dumps(user_id))
    run(['docker', 'exec', '-i', 'codex-web-engine', 'node', '--input-type=module', '-'], input=script, text=True, capture_output=True)


def clone_args(old, image, profile, proof):
    c, h = old['Config'], old['HostConfig']
    args = ['docker', 'create', '--name', old['Name'].lstrip('/'), '--hostname', c['Hostname'],
            '--user', c['User'], '--network', h['NetworkMode'], '--restart', h['RestartPolicy']['Name']]
    if h.get('Init'): args += ['--init']
    if h.get('ReadonlyRootfs'): args += ['--read-only']
    for flag, key in [('--memory', 'Memory'), ('--memory-swap', 'MemorySwap'), ('--shm-size', 'ShmSize'), ('--pids-limit', 'PidsLimit')]:
        if h.get(key): args += [flag, str(h[key])]
    if h.get('NanoCpus'): args += ['--cpus', str(h['NanoCpus'] / 1e9)]
    if c.get('StopTimeout'): args += ['--stop-timeout', str(c['StopTimeout'])]
    for value in h.get('CapDrop') or []: args += ['--cap-drop', value]
    for value in h.get('SecurityOpt') or []:
        if value.startswith('seccomp={'):
            path = proof / 'seccomp.json'
            path.write_text(value[len('seccomp='):])
            value = 'seccomp=' + str(path)
        args += ['--security-opt', value]
    for dest, opts in (h.get('Tmpfs') or {}).items(): args += ['--tmpfs', dest + ':' + opts]
    for value in c.get('Env') or []: args += ['--env', value]
    for key, value in (c.get('Labels') or {}).items(): args += ['--label', key + '=' + value]
    args += ['--mount', 'type=bind,src=' + str(profile) + ',dst=/data', image]
    if c.get('Cmd'): args += c['Cmd']
    return args


def assert_native_idle(name, completed_turn=None):
    activity = request(name, 'workspace', action='activity')
    if not activity['ready']: raise RuntimeError('NATIVE_NOT_IDLE')
    if not activity['generating']: return
    if not completed_turn: raise RuntimeError('NATIVE_NOT_IDLE')
    # Host operator has identified the selected conversation. A stale Stop button
    # cannot override the exact canonical final, but a newer node invalidates proof.
    conversation, node = completed_turn
    graph = request(name, 'readConversationGraph', conversationId=conversation)
    message = graph.get('mapping', {}).get(node, {}).get('message') or {}
    if (graph.get('current_node') != node or message.get('author', {}).get('role') != 'assistant'
            or message.get('channel') != 'final' or message.get('status') != 'finished_successfully'
            or message.get('end_turn') is not True):
        raise RuntimeError('NATIVE_TURN_NOT_COMPLETE')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ['name', 'expected', 'image', 'profile', 'state', 'revision']:
        parser.add_argument('--' + key, required=True)
    parser.add_argument('--completed-turn', nargs=2, metavar=('CONVERSATION', 'NODE'),
                        help='Exact canonical final for the operator-observed selected chat with a stale Stop indicator')
    parser.add_argument('--owner-recovery-reason',
                        help='Explicit owner-authorized recovery of a hung client; bypass native idle only, retain Hub writer admission')
    args = parser.parse_args()
    with ExitStack() as locks:
        return replace(args, locks)


def replace(args, locks):
    recovery = args.owner_recovery_reason
    if recovery is not None:
        if not recovery.strip() or len(recovery) > 500:
            raise ValueError('RECOVERY_REASON_REQUIRED')
    assert re.fullmatch(r'codex-web-gpt-(?:native-lab|[a-f0-9-]{36})', args.name)
    assert re.fullmatch(r'[a-f0-9]{7,40}', args.revision)
    if args.completed_turn:
        for value in args.completed_turn: assert str(uuid.UUID(value)) == value
    assert all(re.fullmatch(r'codex-web-gpt-native:[\w.-]+', v) for v in [args.expected, args.image])
    state, profile = Path(args.state).resolve(strict=True), Path(args.profile).resolve(strict=True)
    assert str(profile) == args.profile and str(state) == args.state
    # Serialize against deployment/provisioning. Busy is a retryable wait, not permission to stop work.
    for path in [state / 'send-handoff-deploy.lock', state / 'data/team/gpt-host.lock']:
        file = locks.enter_context(path.open('a'))
        try: fcntl.flock(file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: print(json.dumps({'deferred': 'host_busy'})); return
    old = inspect(args.name); c, h = old['Config'], old['HostConfig']
    assert c['Image'] == args.expected and old['State']['Running']
    assert not h.get('PortBindings') and not h.get('Privileged') and not h.get('CapAdd')
    assert len(old['NetworkSettings']['Networks']) == 1 and h['NetworkMode'] != 'host'
    assert len(old['Mounts']) == 1 and old['Mounts'][0]['Source'] == str(profile) and old['Mounts'][0]['Destination'] == '/data'
    binding_path = profile / 'native-adapter/binding.json'
    enrolled = binding_path.exists()
    identity_path = binding_path if enrolled else profile / 'native-adapter/enrollment.json'
    binding = json.loads(identity_path.read_text())
    user_id = str(uuid.UUID(binding['userId']))
    if args.name != 'codex-web-gpt-native-lab': assert args.name == 'codex-web-gpt-' + user_id
    proof = state / ('verification-' + args.revision) / args.name
    proof.mkdir(parents=True, exist_ok=True, mode=0o700)
    if (proof / 'lease.json').exists(): raise RuntimeError('PRIOR_ATTEMPT_REQUIRES_REVIEW')
    (proof / 'before.json').write_text(json.dumps(old))
    prior = args.name + '-before-' + args.revision
    assert prior not in output(['docker', 'ps', '-a', '--format', '{{.Names}}']).splitlines()
    before = request(args.name, 'status')
    if before['manual']: raise RuntimeError('EXISTING_MANUAL_OWNER')
    assert_idle(user_id)
    if enrolled and not recovery:
        assert_native_idle(args.name, args.completed_turn)
    elif not enrolled and before['writesEnabled']:
        raise RuntimeError('UNBOUND_PROFILE_HAS_WRITER')
    # Check module access/imports as the real runtime user before touching the
    # live profile. Release archives can carry restrictive host file modes.
    run(['docker', 'run', '--rm', '--network', 'none', '--user', c['User'],
         '--entrypoint', 'node', args.image, '/opt/native/adapter/renderer.mjs'],
        stdout=subprocess.DEVNULL)
    lease = str(uuid.uuid4())
    request(args.name, 'beginManual', leaseId=lease)
    (proof / 'lease.json').write_text(json.dumps({'lease': lease, 'before': before, 'previous': prior,
                                               'ownerRecoveryReason': recovery}))

    def end_lease():
        for _ in range(40):
            try:
                request(args.name, 'endManual', leaseId=lease)
                return request(args.name, 'status')
            except (subprocess.CalledProcessError, ValueError): time.sleep(1)
        raise RuntimeError('NATIVE_SOCKET_NOT_READY')

    renamed = created = False
    try:
        assert_idle(user_id)  # Close the admission race before stopping the native process.
        assert binding_path.exists() == enrolled
        assert json.loads(identity_path.read_text()) == binding
        run(['docker', 'update', '--restart', 'no', args.name], stdout=subprocess.DEVNULL)
        run(['docker', 'stop', '--timeout', '30', args.name], stdout=subprocess.DEVNULL)
        run(['docker', 'rename', args.name, prior]); renamed = True
        run(clone_args(old, args.image, profile, proof), stdout=subprocess.DEVNULL); created = True
        run(['docker', 'start', args.name], stdout=subprocess.DEVNULL)
        assert binding_path.exists() == enrolled
        assert json.loads(identity_path.read_text()) == binding
        status = end_lease()
        assert status['instanceId'] != before['instanceId'] and not status['manual']
        (proof / 'installed.json').write_text(json.dumps({'image': args.image, 'status': status, 'previous': prior}))
        print(json.dumps({'installed': args.name, 'image': args.image, 'previous': prior}))
    except Exception:
        if created: run(['docker', 'rm', '-f', args.name], stdout=subprocess.DEVNULL)
        if renamed: run(['docker', 'rename', prior, args.name])
        run(['docker', 'update', '--restart', h['RestartPolicy']['Name'], args.name], stdout=subprocess.DEVNULL)
        run(['docker', 'start', args.name], stdout=subprocess.DEVNULL)
        end_lease()
        raise


if __name__ == '__main__':
    os.umask(0o077)
    main()
