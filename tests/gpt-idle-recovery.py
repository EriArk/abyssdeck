import importlib.util
import json
from pathlib import Path
import sqlite3
import unittest

spec = importlib.util.spec_from_file_location('recovery', Path(__file__).resolve().parents[1]/'ops/linux/recover-idle-gpt-job.py')
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)

class Recovery(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.addCleanup(self.db.close)
        self.db.executescript('CREATE TABLE gpt_jobs(id TEXT,status TEXT,createdAt INTEGER,nativeId TEXT,requestId TEXT,text TEXT);CREATE TABLE gpt_native_receipts(jobId TEXT,deliveredAt INTEGER,payload TEXT);')
        self.db.execute("INSERT INTO gpt_jobs VALUES('job','running',1,'chat','message','hello')")
        self.db.execute("INSERT INTO gpt_native_receipts VALUES('job',2,?)", (json.dumps(dict(conversationId='chat',userMessageId='message',text='hello')),))
    def test_exact_delivered_old_job(self):
        before = self.db.total_changes
        job, receipt = recovery.recover(self.db, 'job', 3)
        self.assertEqual(job['status'], 'running')
        self.assertEqual(receipt['deliveredAt'], 2)
        self.assertEqual(before, self.db.total_changes)
    def test_no_unknown_delivery(self):
        self.db.execute('UPDATE gpt_native_receipts SET deliveredAt=NULL')
        with self.assertRaisesRegex(RuntimeError, 'DELIVERY_UNCONFIRMED'):recovery.recover(self.db,'job',3)
    def test_no_newer_job_or_changed_identity(self):
        with self.assertRaisesRegex(RuntimeError, 'JOB_CHANGED'):recovery.recover(self.db,'job',1)
        self.db.execute("UPDATE gpt_jobs SET nativeId='other'")
        with self.assertRaisesRegex(RuntimeError,'SUBMISSION_MISMATCH'):recovery.recover(self.db,'job',3)
    def test_other_work_is_not_cancelled(self):
        self.db.execute("INSERT INTO gpt_jobs VALUES('other','queued',1,'other','request','text')")
        with self.assertRaisesRegex(RuntimeError,'OTHER_GPT_WORK'):recovery.recover(self.db,'job',3)

if __name__ == '__main__':unittest.main()
