import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'ops/workspaces'))
spec=importlib.util.spec_from_file_location('slot_repair',root/'ops/workspaces/repair-empty-slots.py')
repair=importlib.util.module_from_spec(spec)
spec.loader.exec_module(repair)


class RepairReport(unittest.TestCase):
    def test_reports_nested_residue_without_contents_or_following_links(self):
        with tempfile.TemporaryDirectory() as temp:
            base=Path(temp);slot=base/'slot';outside=base/'outside'
            (slot/'home/.codex').mkdir(parents=True)
            outside.mkdir();(outside/'private.txt').write_text('external secret')
            (slot/'home/.codex/state.json').write_text('private content')
            (slot/'home/link').symlink_to(outside,target_is_directory=True)
            entries=repair.remaining_entries(slot)
            by_path={e['path']:e for e in entries}
            self.assertEqual(by_path['home/.codex/state.json']['bytes'],15)
            self.assertEqual(by_path['home/link']['kind'],'link')
            self.assertFalse(any('private.txt' in e['path'] for e in entries))
            self.assertNotIn('private content',repr(entries))
            self.assertEqual((slot/'home/.codex/state.json').read_text(),'private content')
            self.assertEqual(len(repair.remaining_entries(slot,limit=2)),2)


if __name__=='__main__':unittest.main()
