import errno,hashlib,json,os,sqlite3,sys,tempfile,unittest,uuid
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ops/workspaces'))
import backup

@unittest.skipUnless(sys.platform=='linux','Linux disk maintenance')
class Backup(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.disks=self.root/'disks';(self.disks/'images').mkdir(parents=True)
        self.registry=self.root/'registry.sqlite';self.owner=str(uuid.uuid4())
        self.config=self.root/'config.json';self.config.write_text(json.dumps({'uid':1001,'hubUid':1000,'image':'sha256:'+'a'*64}))
        self.image=self.disks/'images/slot0.ext4';self.image.write_bytes(b'original'+b'\0'*(1024**2-8))
        with sqlite3.connect(self.registry) as db:
            db.executescript('CREATE TABLE workspaces(owner TEXT,slot INTEGER,state TEXT,image TEXT);CREATE TABLE receipts(nonce TEXT PRIMARY KEY,owner TEXT,op TEXT,created REAL,state TEXT);')
            db.execute('INSERT INTO workspaces VALUES(?,0,?,?)',(self.owner,'ready','sha256:'+'a'*64));db.execute("INSERT INTO receipts VALUES('nonce',?,'exec',0,'accepted')",(self.owner,))
        self.team=self.root/'team';self.team.mkdir()
        with sqlite3.connect(self.team/'team.db') as db:
            db.executescript('CREATE TABLE team_meta(key TEXT,value TEXT);CREATE TABLE team_users(id TEXT);')
            db.execute("INSERT INTO team_meta VALUES('originalOwner',?)",(self.owner,));db.execute('INSERT INTO team_users VALUES(?)',(self.owner,))
            db.execute("INSERT INTO team_meta VALUES('nativeAdmission','blocked')")
        self.identity()
        self.saved=self.root/'snapshot'
        self.patches=[patch.object(backup,'ROOT',str(self.disks)),patch.object(backup,'REGISTRY',self.registry),patch.object(backup,'CONFIG',self.config),patch.object(backup,'DISK_GIB',1/1024),patch.object(backup,'quiescent',lambda *_:None)]
        for p in self.patches:p.start()
    def tearDown(self):
        for p in reversed(self.patches):p.stop()
        self.temp.cleanup()
    def identity(self):
        (self.team/'team-manifest.json').write_text(json.dumps({'kind':'codex-web-team-backup','ownerId':self.owner,'registryHash':backup.digest(self.team/'team.db')}))
    def test_roundtrip_preserves_identity_exact_bytes_previous_disk_and_uncertain_receipts(self):
        backup.create(self.saved,self.team);self.image.write_bytes(b'new'+b'\0'*(1024**2-3))
        with sqlite3.connect(self.registry) as db:db.execute("INSERT INTO receipts VALUES('new',?,'exec',1,'accepted')",(self.owner,))
        result=backup.restore(self.saved,self.team,self.team/'team.db')
        self.assertTrue(self.image.read_bytes().startswith(b'original'))
        self.assertTrue(Path(str(self.image)+result['previousSuffix']).read_bytes().startswith(b'new'))
        with sqlite3.connect(self.registry) as db:self.assertEqual(db.execute('SELECT state FROM receipts ORDER BY nonce').fetchall(),[('unknown',),('unknown',)])
        self.assertEqual(backup.verify(self.saved,self.team)['bindings'][0][0],self.owner)
    def test_corrupt_image_refuses_before_modifying_destination(self):
        backup.create(self.saved,self.team);(self.saved/'slot0.ext4').write_bytes(b'corrupt')
        with self.assertRaisesRegex(RuntimeError,'BACKUP_CHECKSUM'):backup.restore(self.saved,self.team,self.team/'team.db')
        self.assertTrue(self.image.read_bytes().startswith(b'original'))
    def test_other_owner_slot_cannot_be_replaced(self):
        backup.create(self.saved,self.team)
        with sqlite3.connect(self.registry) as db:db.execute('UPDATE workspaces SET owner=?',(str(uuid.uuid4()),))
        with self.assertRaisesRegex(RuntimeError,'RESTORE_BINDINGS_MISMATCH'):backup.restore(self.saved,self.team,self.team/'team.db')
    def test_restore_requires_blocked_hub_and_never_undoes_revocation(self):
        backup.create(self.saved,self.team)
        live=self.root/'live.db';live.write_bytes((self.team/'team.db').read_bytes())
        with sqlite3.connect(live) as db:db.execute("UPDATE team_meta SET value='allowed' WHERE key='nativeAdmission'")
        with self.assertRaisesRegex(RuntimeError,'RESTORE_ADMISSION_REQUIRED'):backup.restore(self.saved,self.team,live)
        with sqlite3.connect(live) as db:db.execute("UPDATE team_meta SET value='blocked' WHERE key='nativeAdmission'")
        with sqlite3.connect(self.registry) as db:db.execute("UPDATE workspaces SET state='revoked'")
        backup.restore(self.saved,self.team,live)
        self.assertEqual(backup.rows(self.registry)[0][2],'revoked')
    def test_symlink_and_changed_team_snapshot_rejected(self):
        backup.create(self.saved,self.team)
        (self.saved/'slot0.ext4').unlink();(self.saved/'slot0.ext4').symlink_to(self.image)
        with self.assertRaisesRegex(RuntimeError,'BACKUP_PATH_INVALID'):backup.verify(self.saved,self.team)
    def test_capture_is_not_valid_until_finalized_and_uses_no_live_files_after_resume(self):
        backup.capture(self.saved)
        self.assertFalse((self.saved/'manifest.json').exists())
        self.image.unlink();self.registry.unlink();self.config.unlink()
        backup.finalize(self.saved,self.team)
        self.assertEqual(backup.verify(self.saved,self.team)['bindings'][0][0],self.owner)
    def test_copy_corruption_before_finalization_is_rejected(self):
        backup.capture(self.saved)
        with (self.saved/'slot0.ext4').open('r+b') as file:file.write(b'wrong')
        with self.assertRaisesRegex(RuntimeError,'BACKUP_CHECKSUM'):backup.finalize(self.saved,self.team)
    def test_sparse_extent_copy_keeps_leading_middle_trailing_holes_and_exact_hash(self):
        with self.image.open('wb') as file:
            file.seek(2*1024**2);file.write(b'first')
            file.seek(6*1024**2);file.write(b'second');file.truncate(8*1024**2)
        copied=self.root/'sparse'
        info=backup.sparse_copy(self.image,copied)
        self.assertEqual(info,{'bytes':8*1024**2,'sha256':backup.digest(self.image)})
        self.assertEqual(backup.digest(copied),info['sha256'])
        self.assertLess(copied.stat().st_blocks*512,copied.stat().st_size//2)
    def test_filesystem_without_extent_support_uses_exact_linear_fallback(self):
        copied=self.root/'fallback'
        with patch.object(backup.os,'lseek',side_effect=OSError(errno.EINVAL,'unsupported')):
            info=backup.sparse_copy(self.image,copied)
        self.assertEqual(backup.digest(copied),backup.digest(self.image))
        self.assertEqual(info['sha256'],backup.digest(self.image))
    def test_unexpected_extent_io_error_is_not_treated_as_empty_disk(self):
        with patch.object(backup.os,'lseek',side_effect=OSError(errno.EIO,'disk error')):
            with self.assertRaises(OSError):backup.sparse_copy(self.image,self.root/'failed')

if __name__=='__main__':unittest.main()
