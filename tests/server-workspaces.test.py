import base64
import importlib.util
import hashlib
import io
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import unittest
import uuid
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]/'ops/workspaces'))
from broker import Broker, Refusal, Handler, Server, authenticate, canonical, stream_process
from client import envelope
from policy import CPUS, MEMORY, PIDS, SLOTS, container_args, container_name, exec_args, firewall, slot_path, podman_command
from install import acceptance_evidence, check_mount, runtime_read, archive_image_id, load_image

A = str(uuid.uuid4()); B = str(uuid.uuid4()); IMAGE = 'sha256:'+'a'*64; KEY = b'k'*32


class Runtime(Broker):
    def __init__(self, directory):
        super().__init__(directory, IMAGE, 1001, check_slots=False)
        self.calls=[]; self.containers={}; self.fail_after_create=False

    def run(self, args, timeout=30):
        self.calls.append(args)
        if args[0]=='run':
            name=args[args.index('--name')+1]; owner=args[args.index('--label')+1].split('=',1)[1]
            if name in self.containers: raise Refusal('DUPLICATE_CREATE')
            self.containers[name]={'Config':{'Labels':{'codexweb.owner':owner}},'Image':IMAGE,'State':{'Running':True}}
            if self.fail_after_create: raise Refusal('RUNTIME_UNAVAILABLE')
            return name.encode()
        if args[0]=='inspect':
            if args[1] not in self.containers: raise Refusal('RUNTIME_UNAVAILABLE')
            return json.dumps([self.containers[args[1]]]).encode()
        if args[0] in ('start','stop'):
            self.containers[args[-1]]['State']['Running']=args[0]=='start'
            return b''
        raise AssertionError(args)


class Workspaces(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.broker=Runtime(self.temp.name)

    def tearDown(self):
        self.broker.db.close(); self.temp.cleanup()

    def make_archive(self, entries):
        path=Path(self.temp.name)/'runtime.tar'
        with tarfile.open(path,'w') as archive:
            for name,data in entries:
                member=tarfile.TarInfo(name);member.size=len(data)
                archive.addfile(member,io.BytesIO(data))
        return path

    def test_archive_config_identity_is_distinct_from_oci_index(self):
        config=b'{"architecture":"amd64","rootfs":{"type":"layers","diff_ids":[]}}'
        digest=hashlib.sha256(config).hexdigest()
        for name in ['blobs/sha256/'+digest,digest+'.json']:
            with self.subTest(name=name):
                path=self.make_archive([('manifest.json',json.dumps([{'Config':name}]).encode()),
                    (name,config),('index.json',json.dumps({'manifests':[{'digest':IMAGE}]}).encode())])
                self.assertEqual(archive_image_id(path),'sha256:'+digest)
                self.assertNotEqual(archive_image_id(path),IMAGE)

    def test_archive_rejects_ambiguous_and_changed_config(self):
        name='blobs/sha256/'+'a'*64
        for manifest,entries,error in [
            ([{'Config':name},{'Config':name}],[], 'REQUIRES_ONE_IMAGE'),
            ([{'Config':'../../outside'}],[], 'CONFIG_INVALID'),
            ([{'Config':name}],[(name,b'changed')], 'HASH_MISMATCH'),
            ([{'Config':name}],[(name,b'one'),(name,b'two')], 'METADATA_INVALID'),
        ]:
            with self.subTest(error=error):
                path=self.make_archive([('manifest.json',json.dumps(manifest).encode())]+entries)
                with self.assertRaisesRegex(RuntimeError,error):archive_image_id(path)

    def test_loaded_image_must_match_exact_config_digest(self):
        path=Path(self.temp.name)/'runtime.tar';path.write_bytes(b'archive')
        with patch('install.run') as run,patch('install.runtime_read',return_value=IMAGE.removeprefix('sha256:')+'\n') as read:
            load_image(['podman'],path,IMAGE)
            self.assertEqual(run.call_args.args[0],['podman','load'])
            self.assertEqual(read.call_args.args[0],['podman','image','inspect',IMAGE,'--format','{{.Id}}'])
        with patch('install.run'),patch('install.runtime_read',return_value='b'*64):
            with self.assertRaisesRegex(RuntimeError,'IMAGE_ID_MISMATCH'):load_image(['podman'],path,IMAGE)

    def test_bundle_dry_run_rejects_index_id_before_administrator_step(self):
        config=b'{"architecture":"amd64"}'
        digest=hashlib.sha256(config).hexdigest();name='blobs/sha256/'+digest
        archive=self.make_archive([('manifest.json',json.dumps([{'Config':name}]).encode()),(name,config)])
        root=Path(self.temp.name);source=Path(__file__).resolve().parents[1]/'ops/workspaces'
        files={}
        for name in ['broker.py','policy.py','host-check.py','client.py','acceptance.py','install.py','apply-bundle.py']:
            data=(source/name).read_bytes();(root/name).write_bytes(data);files[name]=hashlib.sha256(data).hexdigest()
        manifest={'files':files,'image':'sha256:'+digest,'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
                  'revision':'test','hubUser':'test','hubState':'/unused'}
        (root/'setup-manifest.json').write_text(json.dumps(manifest))
        result=subprocess.run([sys.executable,str(root/'apply-bundle.py')],capture_output=True,text=True)
        self.assertEqual(result.returncode,0,result.stderr)
        manifest['image']=IMAGE
        (root/'setup-manifest.json').write_text(json.dumps(manifest))
        result=subprocess.run([sys.executable,str(root/'apply-bundle.py')],capture_output=True,text=True)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('IMAGE_ID_MUST_MATCH_ARCHIVE_CONFIG',result.stderr)

    def test_runtime_launch_uses_private_cwd_and_clean_environment(self):
        home=Path(self.temp.name)/'service-home';home.mkdir()
        with patch('policy.HOME',str(home)):
            command=podman_command(1001)
        self.assertEqual(command[:4],['/usr/sbin/runuser','-u','codex-workspaces','--'])
        # Execute the actual env/chdir boundary unprivileged; no account switch
        # or real container is needed to verify inherited environment removal.
        launch=command[4:command.index('/usr/bin/podman')]
        probe='import os,json;print(json.dumps({"cwd":os.getcwd(),"env":dict(os.environ)}))'
        result=json.loads(subprocess.check_output(launch+[sys.executable,'-c',probe],text=True,
            cwd=self.temp.name,env=dict(os.environ,CONTAINER_HOST='wrong-socket',XDG_CONFIG_HOME='/wrong-config',HTTP_PROXY='wrong-proxy',HOME='/wrong-home')))
        self.assertEqual(result['cwd'],str(home));self.assertEqual(result['env']['HOME'],str(home))
        self.assertEqual(result['env']['XDG_RUNTIME_DIR'],'/run/user/1001')
        for name in ['CONTAINER_HOST','XDG_CONFIG_HOME','HTTP_PROXY']:self.assertNotIn(name,result['env'])

    def test_preflight_preserves_podman_error_without_command_traceback(self):
        failure=subprocess.CalledProcessError(125,['podman','ps'],stderr='cannot chdir: Permission denied\n')
        with patch('install.subprocess.check_output',side_effect=failure):
            with self.assertRaisesRegex(RuntimeError,r'PODMAN_PREFLIGHT_FAILED \(125\): cannot chdir: Permission denied'):
                runtime_read(['podman','ps'])

    def test_signed_owner_operation_and_expiry(self):
        request={'op':'create'}; signed=envelope(A,request,KEY)
        self.assertEqual(authenticate(signed,KEY)[0],A)
        changed=json.loads(json.dumps(signed)); changed['claim']['owner']=B
        with self.assertRaisesRegex(Refusal,'AUTH_INVALID'): authenticate(changed,KEY)
        changed=json.loads(json.dumps(signed)); changed['request']['op']='stop'
        with self.assertRaisesRegex(Refusal,'AUTH_INVALID'): authenticate(changed,KEY)
        with self.assertRaisesRegex(Refusal,'AUTH_EXPIRED'): authenticate(signed,KEY,now=time.time()+31)
        for request in [{'op':'create','mount':'/'},{'op':'create','owner':B},{'op':'delete'},{'op':'exec','argv':['id\0'],'cwd':'/'}]:
            with self.assertRaises((ValueError,Refusal)): authenticate(envelope(A,request,KEY),KEY)

    def test_receipt_replay_and_restart_never_reexecutes(self):
        nonce=str(uuid.uuid4()); self.broker.accept(A,nonce,'exec')
        with self.assertRaisesRegex(Refusal,'REQUEST_ALREADY_ACCEPTED'): self.broker.accept(A,nonce,'exec')
        self.broker.db.close(); self.broker=Runtime(self.temp.name)
        self.assertEqual(self.broker.db.execute('SELECT state FROM receipts').fetchone()[0],'unknown')
        with self.assertRaisesRegex(Refusal,'REQUEST_ALREADY_ACCEPTED'): self.broker.accept(B,nonce,'exec')

    def test_fixed_runtime_and_mount_policy(self):
        args=container_args(A,0,IMAGE)
        for flag in ['--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pid=private','--ipc=private','--log-driver=none','--http-proxy=false']:
            self.assertIn(flag,args)
        self.assertIn('--memory='+str(MEMORY),args); self.assertIn('--pids-limit='+str(PIDS),args)
        self.assertEqual(len([v for v in args if v.startswith('--mount=')]),1)
        self.assertIn('src='+slot_path(0)+',dst=/workspace,rw',next(v for v in args if v.startswith('--mount=')))
        self.assertNotIn('--privileged',args); self.assertFalse(any(v.startswith('--publish') for v in args))
        self.assertNotIn('--network=host',args)
        self.assertNotIn('--security-opt=seccomp=unconfined',args)
        with self.assertRaises(ValueError): container_args('../../host',0,IMAGE)
        with self.assertRaises(ValueError): container_args(A,-1,IMAGE)
        with self.assertRaises(ValueError): container_args(A,True,IMAGE)
        with self.assertRaises(ValueError): container_args(A,0,'attacker/image')

    def test_shell_arguments_stay_inside_exact_container(self):
        argv=['bash','-c','echo "$(id)"; printf test']; args=exec_args(A,argv,'/workspace')
        self.assertEqual(args[-3:],argv)
        self.assertEqual(args[args.index(container_name(A))+1:],argv)
        self.assertNotEqual(container_name(A),container_name(B))
        with self.assertRaises(ValueError): exec_args(A,[],'/')
        with self.assertRaises(ValueError): exec_args(A,['id'],'bad\0')

    def test_private_network_and_host_destinations(self):
        rules=firewall(1001)
        for value in ['meta skuid 1001','fib daddr type','100.64.0.0/10','169.254.0.0/16','127.0.0.0/8','192.168.0.0/16','meta nfproto ipv6 counter reject']:
            self.assertIn(value,rules)
        self.assertNotIn('flush ruleset',rules)

    def test_two_owners_reuse_restart_and_no_cross_source(self):
        first=self.broker.lifecycle(A,{'op':'create'}); self.broker.lifecycle(B,{'op':'create'})
        self.assertTrue(first['running']); self.assertNotEqual(self.broker.row(A)[0],self.broker.row(B)[0])
        self.broker.lifecycle(A,{'op':'create'})
        self.assertEqual(sum(c[0]=='run' for c in self.broker.calls),2)
        self.broker.lifecycle(A,{'op':'stop'})
        self.assertFalse(self.broker.status(A)['running']); self.assertTrue(self.broker.status(B)['running'])
        self.broker.lifecycle(A,{'op':'start'}); self.assertTrue(self.broker.status(A)['running'])
        self.broker.containers[container_name(A)]['Config']['Labels']['codexweb.owner']=B
        with self.assertRaisesRegex(Refusal,'OWNERSHIP_MISMATCH'): self.broker.status(A)

    def test_lost_create_confirmation_reconciles_without_run(self):
        self.broker.fail_after_create=True
        with self.assertRaises(Refusal): self.broker.lifecycle(A,{'op':'create'})
        self.assertEqual(self.broker.row(A)[1],'creating')
        result=self.broker.lifecycle(A,{'op':'create'})
        self.assertEqual(result['state'],'ready')
        self.assertEqual(sum(c[0]=='run' for c in self.broker.calls),1)

    def test_revocation_preserves_disk_and_closes_channels(self):
        self.broker.lifecycle(A,{'op':'create'}); self.broker.lifecycle(B,{'op':'create'})
        left,right=socket.socketpair(); self.broker.streams[A]={left}
        try:
            self.broker.lifecycle(A,{'op':'revoke'})
            self.assertEqual(right.recv(1),b'')
            self.assertEqual(self.broker.row(A)[1],'revoked')
            with self.assertRaisesRegex(Refusal,'WORKSPACE_NOT_READY'): self.broker.lifecycle(A,{'op':'start'})
            self.assertTrue(self.broker.status(B)['running'])
            self.assertEqual(len(self.broker.db.execute('SELECT slot FROM workspaces').fetchall()),2)
        finally:
            left.close();right.close()

    def test_capacity_cannot_reassign_or_delete_existing_volume(self):
        for _ in range(SLOTS): self.broker.lifecycle(str(uuid.uuid4()),{'op':'create'})
        with self.assertRaisesRegex(Refusal,'WORKSPACE_CAPACITY'): self.broker.lifecycle(A,{'op':'create'})
        self.assertEqual(len(self.broker.containers),SLOTS)

    def test_real_unix_peer_and_capability_before_any_operation(self):
        path=self.temp.name+'/socket'
        with Server(path,Handler) as server:
            server.broker=self.broker; server.key=KEY; server.hub_uid=os.getuid()+1
            def request(value):
                thread=threading.Thread(target=server.handle_request); thread.start()
                with socket.socket(socket.AF_UNIX) as connection:
                    connection.connect(path)
                    connection.sendall(canonical(value)+b'\n')
                    with connection.makefile('rb') as reader: result=json.loads(reader.readline())
                thread.join(2);return result
            value=envelope(A,{'op':'create'},KEY)
            self.assertEqual(request(value)['code'],'PEER_DENIED')
            self.assertEqual(self.broker.calls,[])
            server.hub_uid=os.getuid()
            self.assertEqual(request(value)['type'],'result')
            self.assertEqual(request(value)['code'],'REQUEST_ALREADY_ACCEPTED')
            self.assertEqual(sum(c[0]=='run' for c in self.broker.calls),1)

    def test_foreign_image_cannot_be_treated_as_a_workspace(self):
        self.broker.lifecycle(A,{'op':'create'})
        self.broker.containers[container_name(A)]['Image']='sha256:'+'b'*64
        with self.assertRaisesRegex(Refusal,'IMAGE_MISMATCH'):self.broker.lifecycle(A,{'op':'start'})
        with self.assertRaisesRegex(Refusal,'IMAGE_MISMATCH'):self.broker.lifecycle(A,{'op':'revoke'})
        self.assertTrue(self.broker.containers[container_name(A)]['State']['Running'])
        self.assertEqual(self.broker.row(A)[1],'revoked')

    def test_acceptance_timeout_or_invalid_evidence_stops_broker(self):
        for result in [subprocess.TimeoutExpired('acceptance',360),
                       subprocess.CompletedProcess([],0,'invalid json',''),
                       subprocess.CompletedProcess([],1,'','fixed test failure')]:
            with patch('install.subprocess.run', side_effect=([result] if not isinstance(result,Exception) else result)), patch('install.run') as stop:
                evidence=acceptance_evidence(IMAGE,'codex-workspace-broker.service')
                self.assertFalse(evidence['accepted'])
                stop.assert_called_once_with(['systemctl','stop','codex-workspace-broker.service'])

    def test_unrelated_mount_is_rejected_before_ownership_change(self):
        mount=Path('/srv/codex-workspaces/slots/0');disk=Path('/srv/codex-workspaces/images/slot0.ext4')
        info={'filesystems':[{'source':'/dev/loop9','fstype':'ext4','options':'rw,nosuid,nodev'}]}
        with patch.object(Path,'is_mount',return_value=True), patch.object(Path,'resolve',return_value=mount), \
             patch('install.subprocess.check_output',side_effect=[json.dumps(info),'/other/disk.ext4\n']):
            with self.assertRaisesRegex(RuntimeError,'DISK_BINDING_INVALID'): check_mount(mount,disk)

    def test_real_stream_binary_stdin_stdout_stderr_eof(self):
        server,client=socket.socketpair(); errors=[]
        child=subprocess.Popen([sys.executable,'-c',
            'import sys; data=sys.stdin.buffer.read();sys.stdout.buffer.write(data);sys.stderr.buffer.write(b"err")'],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        def work():
            try: stream_process(server,child)
            except Exception as e: errors.append(e)
            finally: server.close()
        thread=threading.Thread(target=work);thread.start()
        with client,client.makefile('rb') as reader:
            self.assertEqual(json.loads(reader.readline()),{'type':'ready'})
            data=bytes(range(256))*100
            client.sendall(canonical({'type':'input','data':base64.b64encode(data).decode()})+b'\n')
            client.sendall(b'{"type":"eof"}\n')
            out=b'';err=b''
            while True:
                frame=json.loads(reader.readline())
                if frame['type']=='exit': self.assertEqual(frame['code'],0);break
                if frame['type']=='stdout':out+=base64.b64decode(frame['data'])
                else:err+=base64.b64decode(frame['data'])
            self.assertEqual(out,data);self.assertEqual(err,b'err')
        thread.join(5);self.assertFalse(thread.is_alive());self.assertEqual(errors,[])
        child.stdout.close();child.stderr.close()

    def test_disconnected_sender_cannot_hold_a_blocked_stdin_forever(self):
        server,client=socket.socketpair();errors=[]
        child=subprocess.Popen([sys.executable,'-c','import time;time.sleep(30)'],
            stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        def work():
            try: stream_process(server,child)
            except Refusal as error: errors.append(str(error))
        thread=threading.Thread(target=work);thread.start()
        try:
            with client.makefile('rb') as reader:
                self.assertEqual(json.loads(reader.readline())['type'],'ready')
            client.sendall(canonical({'type':'input','data':base64.b64encode(b'x'*32768).decode()})+b'\n')
            client.close()
            thread.join(4)
            self.assertFalse(thread.is_alive())
            self.assertEqual(errors,['CHANNEL_LOST'])
        finally:
            client.close();server.close();child.kill();child.wait()
            thread.join(2)
            for stream in [child.stdin,child.stdout,child.stderr]: stream.close()


if __name__=='__main__': unittest.main()
