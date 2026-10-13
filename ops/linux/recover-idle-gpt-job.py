#!/usr/bin/env python3
"""Owner-attested recovery after an explicit native restart, never a watchdog.

Retains the exact delivered receipt and partial answer. Idle does not assert a
canonical final answer. Unknown delivery, queued sends and active writers fail closed.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sqlite3
import time
import uuid

spec = importlib.util.spec_from_file_location('native_upgrade', Path(__file__).with_name('upgrade-native-adapter.py'))
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)


def recover(db, job_id, restart_at):
    db.row_factory = sqlite3.Row
    job = db.execute('SELECT * FROM gpt_jobs WHERE id=?', (job_id,)).fetchone()
    receipt = db.execute('SELECT * FROM gpt_native_receipts WHERE jobId=?', (job_id,)).fetchone()
    if not job or not receipt or receipt['deliveredAt'] is None:
        raise RuntimeError('DELIVERY_UNCONFIRMED')
    payload = json.loads(receipt['payload'])
    if job['status'] != 'running' or job['createdAt'] >= restart_at:
        raise RuntimeError('JOB_CHANGED')
    if not payload.get('conversationId') or job['nativeId'] != payload['conversationId'] or job['requestId'] != payload['userMessageId'] or job['text'] != payload['text']:
        raise RuntimeError('SUBMISSION_MISMATCH')
    if db.execute("SELECT 1 FROM gpt_jobs WHERE id!=? AND status IN ('running','preparing','queued') LIMIT 1", (job_id,)).fetchone():
        raise RuntimeError('OTHER_GPT_WORK')
    return dict(job), dict(receipt)


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for key in ['name', 'profile', 'state', 'job', 'restart-key', 'reason']:
        p.add_argument('--'+key, required=True)
    a = p.parse_args()
    job_id, restart_key = str(uuid.UUID(a.job)), str(uuid.UUID(a.restart_key))
    if not a.reason.strip() or len(a.reason) > 500: raise RuntimeError('OWNER_REASON_REQUIRED')
    state, profile = Path(a.state).resolve(strict=True), Path(a.profile).resolve(strict=True)
    binding = json.loads((profile/'native-adapter/binding.json').read_text())
    config = json.loads((state/'config.json').read_text())
    if config.get('nativeGpt', {}).get('userId') != binding['userId'] or a.name != 'codex-web-gpt-native-lab':
        raise RuntimeError('OWNER_BINDING_REQUIRED')
    container = native.inspect(a.name)
    if len(container['Mounts']) != 1 or container['Mounts'][0]['Source'] != str(profile):
        raise RuntimeError('PROFILE_MISMATCH')
    restart = native.request(a.name, 'restartStatus', key=restart_key)['operation']
    if not restart or restart['state'] != 'restarted': raise RuntimeError('RESTART_UNCONFIRMED')
    status = native.request(a.name, 'status')
    activity = native.request(a.name, 'workspace', action='activity')
    if status['manual'] or status['busy'] or not activity['ready'] or activity['generating']:
        raise RuntimeError('NATIVE_NOT_IDLE')
    proof = state/('verification-idle-recovery-'+job_id)
    proof.mkdir(mode=0o700, exist_ok=True)
    intent = proof/'intent.json'
    if intent.exists(): raise RuntimeError('EXISTING_RECOVERY_RECONCILE_REQUIRED')
    path = Path(config['hub']['databasePath']).resolve(strict=True)
    if not path.is_relative_to(state/'data'): raise RuntimeError('DATABASE_MISMATCH')
    lease = str(uuid.uuid4())
    with sqlite3.connect(path) as db:
        before, receipt = recover(db, job_id, restart['requestedAt'])
        record = dict(reason=a.reason, job=before, receipt=receipt, restart=restart, status=status, activity=activity, lease=lease)
        with intent.open('x') as f:
            json.dump(record, f); f.flush(); os.fsync(f.fileno())
        native.request(a.name, 'beginManual', leaseId=lease)
        try:
            db.execute('BEGIN IMMEDIATE')
            current, current_receipt = recover(db, job_id, restart['requestedAt'])
            if current != before or current_receipt != receipt: raise RuntimeError('JOB_CHANGED')
            # The manual lease admits no new adapter operation; no receipt is erased.
            db.execute("UPDATE gpt_jobs SET status='idle',updatedAt=? WHERE id=? AND status='running'", (int(time.time()*1000), job_id))
            db.execute("CREATE TABLE IF NOT EXISTS gpt_native_idle_watch(jobId TEXT PRIMARY KEY REFERENCES gpt_jobs(id),changedAt INTEGER NOT NULL,openedAt INTEGER NOT NULL DEFAULT 0)")
            db.execute('INSERT OR IGNORE INTO gpt_native_idle_watch(jobId,changedAt) VALUES(?,?)', (job_id, before['createdAt']))
            db.commit()
            after = dict(db.execute('SELECT * FROM gpt_native_receipts WHERE jobId=?', (job_id,)).fetchone())
            if after != receipt: raise RuntimeError('RECEIPT_CHANGED')
            (proof/'applied.json').write_text(json.dumps(dict(jobId=job_id,state='idle',completed=False,receiptSha256=hashlib.sha256(json.dumps(receipt,sort_keys=True).encode()).hexdigest())))
        finally:
            db.rollback()
            native.request(a.name, 'endManual', leaseId=lease)
    print(json.dumps(dict(jobId=job_id,state='idle',receiptPreserved=True)))


if __name__ == '__main__':
    os.umask(0o077)
    main()
