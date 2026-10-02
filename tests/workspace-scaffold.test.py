import sys
from pathlib import Path
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ops/workspaces'))
from acceptance import clear_empty_scaffold

class Scaffold(unittest.TestCase):
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
