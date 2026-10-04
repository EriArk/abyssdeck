import importlib.util,json,os,sqlite3,sys,tempfile,unittest,uuid
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ops/workspaces'))
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ops/linux'))
import checkpoint as cp
import backup

@unittest.skipUnless(sys.platform=='linux','Linux host checkpoint')
class Checkpoint(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.state=self.root/'hub';self.state.mkdir();(self.state/'config.json').write_text(json.dumps({'team':{'enabled':True,'root':str(self.state/'data/team')},'serverWorkspaces':{'configured':True}}))
        self.dest=self.root/'backups';self.dest.mkdir()
        self.registry=self.root/'registry.sqlite';self.owner=str(uuid.uuid4());self.image='sha256:'+'a'*64
        with sqlite3.connect(self.registry) as db:
            db.executescript('CREATE TABLE workspaces(owner TEXT,slot INTEGER,state TEXT,image TEXT);CREATE TABLE receipts(nonce TEXT,owner TEXT,op TEXT,created REAL,state TEXT);')
            db.execute('INSERT INTO workspaces VALUES(?,0,?,?)',(self.owner,'ready',self.image))
        self.config=self.root/'host.json';self.config.write_text(json.dumps({'uid':1001,'hubUid':1000,'image':self.image}))
        self.disks=self.root/'disks';(self.disks/'images').mkdir(parents=True);(self.disks/'images/slot0.ext4').write_bytes(b'disk')
        self.log=[];self.running=True;self.busy=False;self.fail=None
        log=self.log
        class Frozen:
            def __init__(self,state,destination):self.destination=destination;destination.mkdir()
            def prepare(self,*_):log.append(['prepare'])
            def seal(self):log.append(['seal'])
            def grant_reader(self,*_):log.append(['reader'])
        self.patches=[patch.object(backup,'CONFIG',self.config),patch.object(backup,'REGISTRY',self.registry),patch.object(cp,'ROOT',str(self.disks)),patch.object(cp,'JOURNAL',self.root/'journal.json'),patch.object(cp,'run',self.command),patch.object(cp,'check_mount',lambda *_:None)]
        for p in self.patches:p.start()
        frozen=patch.object(cp,'FrozenHub',Frozen);frozen.start();self.patches.append(frozen)
        self.op=cp.Checkpoint({'state':str(self.state),'destination':str(self.dest),'hubGid':1000,'keep':3})
    def tearDown(self):
        for p in reversed(self.patches):p.stop()
        self.tmp.cleanup()
    def command(self,args,timeout=60):
        self.log.append(args)
        if self.fail and self.fail(args):raise RuntimeError('INJECTED')
        if args[:2]==['docker','inspect']:
            return json.dumps([{'Id':args[2]+'-id','State':{'Running':True},'Config':{'Image':'codex-web-hub:abc1234','Labels':{'org.opencontainers.image.revision':'abc1234'}},'Mounts':[{'Source':str(self.state/'config.json'),'Destination':'/config/config.json'}]}])
        if 'podman' in ' '.join(args):
            at=args.index('--cgroup-manager=systemd')+1;op=args[at]
            if op=='inspect':return json.dumps([{'Config':{'Labels':{'codexweb.owner':self.owner}},'Image':self.image,'State':{'Running':self.running}}])
            if op=='top':return 'PID PPID STATE ARGS\n1 0 S /usr/bin/tini -- sleep infinity\n2 1 S sleep infinity\n3 1 Z git'+('\n8 1 S node server.js' if self.busy else '')
            if op=='stop':self.running=False
            if op=='start':self.running=True
        if args[0]=='systemd-escape':return 'slot0.mount'
        if args[:2]==['systemctl','show']:return 'active'
        if args[:2]==['docker','run']:
            target=next(x for x in self.dest.iterdir() if x.is_dir())/'hub/codex-team-backup-fixture';target.mkdir()
            return json.dumps({'snapshot':'/snapshots/'+target.name})
        return ''
    def test_busy_hub_never_stops_containers_or_engine(self):
        self.fail=lambda a:'dist/maintenance-check.js' in a
        with self.assertRaisesRegex(RuntimeError,'INJECTED'):self.op.create()
        self.op.recover()
        self.assertFalse(any(a[:2]==['docker','stop'] for a in self.log))
        self.assertFalse(cp.JOURNAL.exists())
    def test_detached_work_refuses_without_killing_it_and_resumes_hub(self):
        self.busy=True
        with self.assertRaisesRegex(RuntimeError,'WORKSPACE_BACKGROUND_WORK'):self.op.create()
        self.op.recover()
        self.assertTrue(self.running)
        self.assertFalse(any('podman' in ' '.join(a) and 'stop' in a for a in self.log))
        self.assertIn(['docker','start',cp.GATEWAY],self.log)
    def test_unmount_failure_journals_before_effect_and_recovers_mounts(self):
        def fail(args):
            if args==['systemctl','stop','slot0.mount']:
                self.assertEqual(json.loads(cp.JOURNAL.read_text())['slots'],[0])
                return True
        self.fail=fail
        with self.assertRaisesRegex(RuntimeError,'INJECTED'):self.op.create()
        self.fail=None;self.op.recover()
        self.assertIn(['systemctl','start','slot0.mount'],self.log);self.assertTrue(self.running)
        self.assertFalse(cp.JOURNAL.exists())
    def test_pair_is_published_only_after_disk_verification(self):
        def capture(destination):
            destination.mkdir();(destination/'manifest.json').write_text('{}')
        with patch.object(backup,'capture',capture),patch.object(backup,'finalize',side_effect=RuntimeError('CORRUPT')):
            with self.assertRaisesRegex(RuntimeError,'CORRUPT'):self.op.create()
        self.op.recover()
        self.assertFalse(list(self.dest.glob('*/complete.json')))
        self.assertTrue(self.running)
    def test_success_resumes_before_verifying_and_never_mounts_live_state(self):
        def capture(destination):
            self.log.append(['capture'])
            destination.mkdir();(destination/'manifest.json').write_text('{}')
        def finalize(*_):
            self.assertTrue(self.running)
            self.assertIn(['docker','start',cp.GATEWAY],self.log)
            self.assertFalse(cp.JOURNAL.exists())
            self.log.append(['verify'])
        with patch.object(backup,'capture',capture),patch.object(backup,'finalize',finalize):
            result=self.op.create()
        invocation=next(a for a in self.log if a[:2]==['docker','run'])
        self.assertIn(f'type=bind,src={result}/frozen,dst={self.state}',invocation)
        self.assertNotIn(f'type=bind,src={self.state},dst={self.state}',invocation)
        self.assertIn('--read-only',invocation) # rootfs remains read-only
        self.assertLess(self.log.index(['prepare']),self.log.index(['docker','stop','--time','10',cp.GATEWAY]))
        self.assertLess(self.log.index(['seal']),self.log.index(['capture']))
        self.assertLess(self.log.index(['capture']),self.log.index(['docker','start',cp.GATEWAY]))
        self.assertFalse((result/'frozen').exists())
        self.assertTrue((result/'complete.json').exists())
    def test_recovery_keeps_revocation(self):
        self.op.journal={'state':str(self.state),'hub':{},'broker':True,'containers':[[self.owner,0,self.image]],'slots':[0]}
        self.op.save();self.running=False
        with sqlite3.connect(self.registry) as db:db.execute("UPDATE workspaces SET state='revoked'")
        self.op.recover()
        self.assertFalse(self.running)
    def test_recovery_rejects_changed_binding(self):
        self.op.journal={'state':str(self.state),'hub':{},'broker':True,'containers':[[self.owner,1,self.image]],'slots':[]}
        self.op.save()
        with self.assertRaisesRegex(RuntimeError,'CHECKPOINT_RECOVERY_BINDING'):self.op.recover()
        self.assertTrue(cp.JOURNAL.exists())
    def test_warm_failure_never_stops_hub_and_removes_own_staging(self):
        with patch.object(cp.FrozenHub,'prepare',side_effect=RuntimeError('COPY_FAILED')):
            with self.assertRaisesRegex(RuntimeError,'COPY_FAILED'):self.op.create()
        self.assertFalse(list(self.dest.iterdir()))
        self.assertFalse(any(a[:2]==['docker','stop'] for a in self.log))
    def test_verification_failure_happens_after_resume(self):
        def capture(path):path.mkdir()
        def failed(args):
            if args[:2]==['docker','run']:
                self.assertTrue(self.running)
                self.assertFalse(cp.JOURNAL.exists())
                return True
        self.fail=failed
        with patch.object(backup,'capture',capture):
            with self.assertRaisesRegex(RuntimeError,'INJECTED'):self.op.create()
        self.assertFalse(list(self.dest.iterdir()))
    def test_retention_keeps_three_complete_sets_and_leaves_foreign_and_incomplete(self):
        targets=[]
        for day in range(1,6):
            path=self.dest/f'checkpoint-2026100{day}T000000-{uuid.uuid4()}'
            (path/'disks').mkdir(parents=True)
            (path/'disks/manifest.json').write_text('{}')
            cp.write(path/'complete.json',{'diskManifest':backup.digest(path/'disks/manifest.json')})
            targets.append(path)
        incomplete=self.dest/f'checkpoint-20261006T000000-{uuid.uuid4()}';incomplete.mkdir()
        foreign=self.dest/'other';foreign.mkdir()
        # Ownership test is fixed to root on the installed service; fixture runs
        # as the SSH user and substitutes only the observed owner id.
        original=Path.stat
        def stat(path,*args,**kwargs):
            result=original(path,*args,**kwargs)
            if path in targets:return os.stat_result((*result[:4],0,*result[5:]))
            return result
        with patch.object(Path,'stat',stat):self.op.prune()
        self.assertEqual([p.exists() for p in targets],[False,False,True,True,True])
        self.assertTrue(incomplete.exists());self.assertTrue(foreign.exists())
    def test_busy_maintenance_lock_is_a_successful_defer(self):
        lock=self.root/'lock';lock.touch()
        with patch.object(cp,'SETTINGS',self.root/'settings.json'),patch.object(cp,'LOCK',lock),patch.object(cp.os,'geteuid',return_value=0),patch.object(sys,'argv',['checkpoint.py']),patch.object(cp.fcntl,'flock',side_effect=BlockingIOError):
            cp.SETTINGS.write_text(json.dumps(self.op.settings))
            cp.main()
        self.assertFalse(self.log)

if __name__=='__main__':unittest.main()
