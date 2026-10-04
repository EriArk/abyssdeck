import hashlib, importlib.util, json, os, time
from pathlib import Path
import shutil, sqlite3, sys, tempfile, unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'ops/workspaces'))
spec=importlib.util.spec_from_file_location('removal',ROOT/'ops/workspaces/remove-bundled-codex.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
OWNER='11111111-1111-4111-8111-111111111111';OLD='sha256:'+'a'*64;NEW='sha256:'+'b'*64
class Removal(unittest.TestCase):
 def test_legacy_idle_with_exited_children(self):
  m.idle_processes('PID PPID STATE COMMAND\n1 0 S sleep infinity\n2 1 Z [git] <defunct>\n3 1 Zs [bash] <defunct>')
 def test_reaping_init_is_idle_with_its_sleep_child(self):
  m.idle_processes('PID PPID STATE COMMAND\n1 0 S /usr/bin/tini -- sleep infinity\n2 1 S sleep infinity')
 def test_live_or_unknown_work_still_blocks(self):
  for row in ['3 1 S codex app-server','3 1 S bash','3 1 D git status','3 1 T python3 daemon.py','3 1 S [git] <defunct>']:
   with self.subTest(row=row),self.assertRaisesRegex(RuntimeError,'WORKSPACE_BACKGROUND_WORK'):
    m.idle_processes('PID PPID STATE COMMAND\n1 0 S sleep infinity\n'+row)
  with self.assertRaisesRegex(RuntimeError,'WORKSPACE_PROCESS_STATE_INVALID'):
   m.idle_processes('PID PPID STATE COMMAND\n1 sleep infinity')
 def scenario(self,fail=False):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);bundle=root/'bundle';bundle.mkdir();helpers=root/'helpers';helpers.mkdir();checkpoint=root/'checkpoint';checkpoint.mkdir();backups=root/'backups'
   cfg=root/'config.json';cfg.write_text(json.dumps({'uid':1001,'image':OLD}))
   dbpath=root/'registry.sqlite'
   with sqlite3.connect(dbpath) as db:
    db.executescript('CREATE TABLE workspaces(owner TEXT PRIMARY KEY,slot INTEGER,state TEXT,image TEXT); CREATE TABLE receipts(nonce TEXT PRIMARY KEY,owner TEXT,op TEXT,created REAL,state TEXT);')
    db.execute('INSERT INTO workspaces VALUES(?,0,?,?)',(OWNER,'ready',OLD))
    db.execute("INSERT INTO receipts VALUES('old',?,'status',?,'completed')",(OWNER,time.time()))
   keep=root/'disk.txt';keep.write_bytes(b'private-user-bytes')
   for name in ['broker.py','policy.py','checkpoint.py','remove-bundled-codex.py']:
    shutil.copyfile(ROOT/'ops/workspaces'/name,bundle/name)
   for name in ['broker.py','policy.py']:(helpers/name).write_bytes(b'old-'+name.encode())
   for name in ['checkpoint.py','policy.py']:(checkpoint/name).write_bytes(b'old-'+name.encode())
   (bundle/'runtime.tar').write_bytes(b'fixture-image')
   (bundle/'codex-removal.json').write_text(json.dumps({'owner':OWNER,'image':NEW,'files':{name:hashlib.sha256((bundle/name).read_bytes()).hexdigest() for name in ['broker.py','policy.py','checkpoint.py','remove-bundled-codex.py','runtime.tar']}}))
   name=m.container_name(OWNER);containers={name:OLD};commands=[]
   def run(args, **kwargs):
    commands.append(args)
    if args[0]=='docker':return json.dumps({'idle':True}) if 'exec' in args else ''
    if args[0]=='systemctl':return ''
    op=args[1]
    if op=='inspect':return json.dumps([{'Config':{'Labels':{'codexweb.owner':OWNER}},'Image':containers[args[2]],'State':{'Running':True}}])
    if op=='image':return NEW
    if op=='top':return 'PID PPID STATE ARGS\n1 0 S sleep infinity\n2 1 Z [git] <defunct>'
    if op=='rename':containers[args[3]]=containers.pop(args[2]);return ''
    if op=='run':containers[name]=NEW;return ''
    if op=='ps':return '\n'.join(containers)
    if op=='rm':containers.pop(args[-1]);return ''
    if op=='exec' and fail:raise RuntimeError('VERIFY_FAILED')
    return ''
   with patch.multiple(m,CONFIG=cfg,REGISTRY=dbpath,HELPERS=helpers,CHECKPOINT=checkpoint,BACKUPS=backups,FULL_RECEIPTS=1,__file__=str(bundle/'remove-bundled-codex.py')),patch.object(m,'run',side_effect=run),patch.object(m,'podman_command',return_value=['podman']),patch('sys.argv',['remove','--apply']),patch.object(m.os,'geteuid',return_value=0):
    if fail:
     with self.assertRaisesRegex(RuntimeError,'VERIFY_FAILED'):m.main()
    else:m.main()
   with sqlite3.connect(dbpath) as db:self.assertEqual(db.execute('SELECT image FROM workspaces').fetchone()[0],OLD if fail else NEW)
   self.assertEqual(keep.read_bytes(),b'private-user-bytes')
   self.assertEqual(containers[name],OLD if fail else NEW)
   self.assertEqual(json.loads(cfg.read_text())['image'],OLD if fail else NEW)
   self.assertIn(['systemctl','start',m.BROKER],commands)
   self.assertFalse(any(c[:2]==['docker','stop'] for c in commands), 'unrelated chats and caller terminal must stay alive')
   if fail:self.assertEqual((helpers/'broker.py').read_bytes(),b'old-broker.py')
   else:self.assertEqual(containers[name+'-before-codex-removal'],OLD)
 def test_exact_image_replacement_preserves_disk_and_old_container(self):self.scenario()
 def test_failed_verification_restores_exact_old_image_and_helpers(self):self.scenario(True)
if __name__=='__main__':unittest.main()
