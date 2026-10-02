import sys
import fcntl
from pathlib import Path
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ops/workspaces'))
from acceptance import clear_empty_scaffold, CODEX_PROBE_TARGET, CODEX_PROBE_LINKS

class Scaffold(unittest.TestCase):
    def probe(self,root):
        path=root/'home/.codex/tmp/arg0/codex-arg0ABC123'
        path.mkdir(parents=True)
        (path/'.lock').touch()
        for name in CODEX_PROBE_LINKS:(path/name).symlink_to(CODEX_PROBE_TARGET)
        return path

    def test_codex_version_residue_is_removed_idempotently(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp).resolve();self.probe(root)
            clear_empty_scaffold(root)
            self.assertEqual(list(root.iterdir()),[])
            self.assertEqual(clear_empty_scaffold(root),[])

    def test_unknown_bytes_wrong_links_and_active_lock_are_preserved(self):
        for kind in ['file','link','lock']:
            with self.subTest(kind=kind),tempfile.TemporaryDirectory() as temp:
                root=Path(temp).resolve();path=self.probe(root)
                if kind=='file':(path/'unknown').write_bytes(b'keep')
                if kind=='link':
                    (path/'apply_patch').unlink();(path/'apply_patch').symlink_to('/other/private')
                with (path/'.lock').open('r+') as lock:
                    if kind=='lock':fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
                    before={p.name:(p.readlink() if p.is_symlink() else p.read_bytes()) for p in path.iterdir()}
                    clear_empty_scaffold(root)
                    after={p.name:(p.readlink() if p.is_symlink() else p.read_bytes()) for p in path.iterdir()}
                    self.assertEqual(after,before)

    def test_actual_init_layout_becomes_empty(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp).resolve()
            for name in ['home/.codex','home/.config','home/.cache','home/.local/bin','projects','integration','services','lost+found']:
                (root/name).mkdir(parents=True,exist_ok=True)
            clear_empty_scaffold(root)
            self.assertEqual([p.name for p in root.iterdir()],['lost+found'])
            self.assertEqual(clear_empty_scaffold(root),[])
    def test_unexpected_user_bytes_and_links_are_preserved(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp).resolve();(root/'home/.codex').mkdir(parents=True)
            (root/'home/.codex/auth.json').write_bytes(b'private-fixture')
            (root/'foreign').mkdir();(root/'foreign/file').write_bytes(b'untouched')
            (root/'projects').symlink_to(root/'foreign',target_is_directory=True)
            clear_empty_scaffold(root)
            self.assertEqual((root/'home/.codex/auth.json').read_bytes(),b'private-fixture')
            self.assertTrue((root/'projects').is_symlink())
            self.assertEqual((root/'foreign/file').read_bytes(),b'untouched')

if __name__=='__main__':unittest.main()
