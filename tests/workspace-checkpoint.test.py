import importlib.util,json,sqlite3,sys,tempfile,unittest,uuid
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ops/workspaces'))
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
        self.patches=[patch.object(backup,'CONFIG',self.config),patch.object(backup,'REGISTRY',self.registry),patch.object(cp,'ROOT',str(self.disks)),patch.object(cp,'JOURNAL',self.root/'journal.json'),patch.object(cp,'run',self.command),patch.object(cp,'check_mount',lambda *_:None)]
        for p in self.patches:p.start()
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
            if op=='top':return 'PID ARGS\n1 sleep infinity'+('\n8 node server.js' if self.busy else '')
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
        self.fail=lambda a:a==['systemctl','stop','slot0.mount']
        with self.assertRaisesRegex(RuntimeError,'INJECTED'):self.op.create()
        self.assertEqual(json.loads(cp.JOURNAL.read_text())['slots'],[0])
        self.fail=None;self.op.recover()
        self.assertIn(['systemctl','start','slot0.mount'],self.log);self.assertTrue(self.running)
        self.assertFalse(cp.JOURNAL.exists())
    def test_pair_is_published_only_after_disk_verification(self):
        def create(destination,team):
            destination.mkdir();(destination/'manifest.json').write_text('{}')
        with patch.object(backup,'create',create),patch.object(backup,'verify',side_effect=RuntimeError('CORRUPT')):
            with self.assertRaisesRegex(RuntimeError,'CORRUPT'):self.op.create()
        self.op.recover()
        self.assertFalse(list(self.dest.glob('*/complete.json')))
        self.assertTrue(self.running)
    def test_success_restores_only_original_containers_and_keeps_revocation(self):
        def create(destination,team):
            destination.mkdir();(destination/'manifest.json').write_text('{}')
        with patch.object(backup,'create',create),patch.object(backup,'verify',return_value={}):
            result=self.op.create()
        with sqlite3.connect(self.registry) as db:db.execute("UPDATE workspaces SET state='revoked'")
        self.op.recover()
        self.assertFalse(self.running);self.assertTrue((result/'complete.json').exists())
    def test_recovery_rejects_changed_binding(self):
        self.busy=True
        with self.assertRaises(RuntimeError):self.op.create()
        j=json.loads(cp.JOURNAL.read_text());j['containers']=[[self.owner,1,self.image]];cp.write(cp.JOURNAL,j)
        with self.assertRaisesRegex(RuntimeError,'CHECKPOINT_RECOVERY_BINDING'):self.op.recover()
        self.assertTrue(cp.JOURNAL.exists())

if __name__=='__main__':unittest.main()
