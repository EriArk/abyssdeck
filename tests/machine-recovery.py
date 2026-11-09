import copy
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
sys.path.insert(0, str(Path('ops/linux').resolve()))
import machine_recovery as recovery

class RecoveryTest(unittest.TestCase):
    def setUp(self):
        self.original = dict(machines=[dict(id='pc', type='ssh-windows')], projects=[dict(id='p',machineId='pc',workingDirectory=r'D:\Projects\Русский')], devices=[dict(id='pc',platform='windows')],auth={'unchanged':'private'},team={'unchanged':'identity'})
        self.plan = dict(format=1,configHash='test',machineId='pc',machine=dict(id='pc',type='ssh-linux',ssh={'target':'pc'},codex=dict(appServerSocket='/run/user/1000/codex.sock',persistent=True)),device=dict(id='pc',platform='linux'),paths=[{'from':'D:\\','to':'/data'}],saveNativeHistory=True)
    def test_candidate_is_scoped(self):
        result=recovery.candidate(self.original,self.plan)
        self.assertEqual(result['projects'][0]['workingDirectory'],'/data/Projects/Русский')
        self.assertEqual(result['auth'],self.original['auth'])
        self.assertEqual(result['team'],self.original['team'])
        changed=copy.deepcopy(self.plan); changed['auth']={}
        with self.assertRaisesRegex(RuntimeError,'FIELDS'): recovery.candidate(self.original,changed)
        with self.assertRaisesRegex(RuntimeError,'UNMAPPED'): recovery.path_map('C:\\lost',self.plan)
        self.assertEqual(recovery.path_map('D:\\Projects\\..\\safe',self.plan),'/data/safe')
    def test_content_receipts_identity_and_other_machine_survive(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'app.db'
            with sqlite3.connect(path) as db:
                db.executescript('CREATE TABLE catalog_projects(id TEXT PRIMARY KEY,machineId TEXT,sourceId TEXT,value TEXT); CREATE TABLE threads(id TEXT PRIMARY KEY,projectId TEXT,codexThreadId TEXT,workingDirectory TEXT,historyMode TEXT); CREATE TABLE receipts(id TEXT,state TEXT);')
                value=dict(id='p',machineId='pc',sourceId='native-project',workingDirectory=r'D:\Projects\Русский',roots=[r'D:\Projects\Русский'])
                db.execute('INSERT INTO catalog_projects VALUES(?,?,?,?)',('p','pc','native-project',json.dumps(value)))
                db.execute('INSERT INTO threads VALUES(?,?,?,?,?)',('t','p','exact-native',r'D:\Projects\Русский','paginated'))
                db.execute('INSERT INTO threads VALUES(?,?,?,?,?)',('other','other','untouched','/other','paginated'))
                db.execute("INSERT INTO receipts VALUES('send','unknown')")
            counts=recovery.transform_database(path,self.original,self.plan)
            self.assertEqual(counts,dict(projects=1,savedThreads=1))
            with sqlite3.connect(path) as db:
                self.assertEqual(db.execute("select * from threads where id='t'").fetchone(),('t','p','exact-native','/data/Projects/Русский','saved'))
                self.assertEqual(db.execute("select * from threads where id='other'").fetchone(),('other','other','untouched','/other','paginated'))
                self.assertEqual(db.execute('select state from receipts').fetchone(),('unknown',))
                value=json.loads(db.execute('select value from catalog_projects').fetchone()[0])
                self.assertEqual(value['recoverySourceId'],'native-project')
                self.assertNotIn('sourceId',value)
    def test_unmapped_path_rolls_back_whole_transaction(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'app.db'
            with sqlite3.connect(path) as db:
                db.executescript('CREATE TABLE catalog_projects(id TEXT,machineId TEXT,sourceId TEXT,value TEXT); CREATE TABLE threads(id TEXT,projectId TEXT,workingDirectory TEXT,historyMode TEXT);')
                db.execute('INSERT INTO threads VALUES(?,?,?,?)',('a','p','D:\\good','paginated'))
                db.execute('INSERT INTO threads VALUES(?,?,?,?)',('b','p','C:\\lost','paginated'))
            with self.assertRaisesRegex(RuntimeError,'UNMAPPED'): recovery.transform_database(path,self.original,self.plan)
            with sqlite3.connect(path) as db: self.assertEqual(db.execute("select workingDirectory,historyMode from threads where id='a'").fetchone(),('D:\\good','paginated'))

unittest.main()
