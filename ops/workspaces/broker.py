#!/usr/bin/python3
"""Private, rootless workspace lifecycle and process transport. No HTTP listener.

One signed JSON line admits a connection. Exec then exchanges bounded JSON frames
over that same Unix socket. stdout/stderr stay distinct; input is never recorded.
Only the configured Hub UID can connect. Hub authenticates the actual user and
signs the exact operation; browser paths/flags/credentials are not accepted.
"""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import selectors
import select
import signal
import socket
import socketserver
import sqlite3
import struct
import subprocess
import threading
import time

from policy import HOME, RUNTIME, SLOTS, DISK_GIB, MEMORY, PIDS, CPUS
from policy import container_name, container_args, exec_args, owner_id, slot_path

MAX_FRAME = 65536
MAX_REQUEST = 65536
MAX_RECEIPTS = 50000
OPS = {'status', 'create', 'start', 'stop', 'exec', 'revoke'}


class Refusal(Exception):
    pass


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()


def authenticate(message, key, now=None):
    now = time.time() if now is None else now
    if not isinstance(message, dict) or set(message) != {'claim', 'request', 'mac'}:
        raise Refusal('AUTH_INVALID')
    claim, request = message['claim'], message['request']
    if not isinstance(claim, dict) or set(claim) != {'owner', 'issued', 'expires', 'nonce', 'digest'}:
        raise Refusal('AUTH_INVALID')
    expected = hmac.new(key, canonical(claim), hashlib.sha256).hexdigest()
    if not isinstance(message['mac'], str) or not hmac.compare_digest(expected, message['mac']):
        raise Refusal('AUTH_INVALID')
    try:
        owner_id(claim['owner']); owner_id(claim['nonce'])
    except (ValueError, TypeError, AttributeError):
        raise Refusal('AUTH_INVALID') from None
    if (type(claim['issued']) not in (int, float) or type(claim['expires']) not in (int, float)
            or not now - 30 <= claim['issued'] <= now + 2
            or not now < claim['expires'] <= claim['issued'] + 30):
        raise Refusal('AUTH_EXPIRED')
    if not isinstance(request, dict) or hashlib.sha256(canonical(request)).hexdigest() != claim['digest']:
        raise Refusal('AUTH_INVALID')
    op = request.get('op')
    if op not in OPS or set(request) != ({'op', 'argv', 'cwd'} if op == 'exec' else {'op'}):
        raise Refusal('REQUEST_INVALID')
    if op == 'exec':
        exec_args(claim['owner'], request['argv'], request['cwd'])
    return claim['owner'], claim['nonce'], request


class Broker:
    def __init__(self, directory, image, uid, command=None, check_slots=True):
        self.directory = Path(directory)
        self.image = image
        self.uid = uid
        self.command = command or ['/usr/bin/podman', '--cgroup-manager=systemd']
        self.check_slots = check_slots
        self.lock = threading.RLock()
        self.slots_lock = threading.Lock()
        self.owners = {}
        self.streams = {}
        self.db = sqlite3.connect(self.directory / 'registry.sqlite', check_same_thread=False)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('PRAGMA synchronous=FULL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS workspaces(owner TEXT PRIMARY KEY, slot INTEGER NOT NULL UNIQUE,
            state TEXT NOT NULL, image TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS receipts(nonce TEXT PRIMARY KEY, owner TEXT NOT NULL,
            op TEXT NOT NULL, created REAL NOT NULL, state TEXT NOT NULL);
        ''')
        # Unknown executions remain unknown across a broker restart. Never redispatch.
        self.db.execute("UPDATE receipts SET state='unknown' WHERE state='accepted'")
        self.db.commit()

    def owner_lock(self, owner):
        with self.lock:
            return self.owners.setdefault(owner, threading.RLock())

    def accept(self, owner, nonce, op):
        with self.lock:
            # Capabilities expire after at most 30 seconds. Keep uncertain effects
            # for the existing 14-day reconciliation window. Completed read-only
            # status probes need only replay protection, not two weeks of storage.
            now = time.time()
            self.db.execute('DELETE FROM receipts WHERE created < ?', (now - 14 * 86400,))
            self.db.execute("DELETE FROM receipts WHERE op='status' AND state='completed' AND created < ?", (now - 300,))
            if self.db.execute('SELECT count(*) FROM receipts').fetchone()[0] >= MAX_RECEIPTS:
                # Pressure cleanup is limited to confirmed completion outside the
                # capability lifetime. Never discard accepted/unknown operations.
                self.db.execute("DELETE FROM receipts WHERE nonce IN (SELECT nonce FROM receipts WHERE state='completed' AND created < ? ORDER BY created LIMIT ?)", (now - 300, max(1, MAX_RECEIPTS // 4)))
            if self.db.execute('SELECT count(*) FROM receipts').fetchone()[0] >= MAX_RECEIPTS:
                raise Refusal('RECEIPTS_FULL')
            try:
                self.db.execute('INSERT INTO receipts VALUES(?,?,?,?,?)', (nonce, owner, op, time.time(), 'accepted'))
                self.db.commit()
            except sqlite3.IntegrityError:
                raise Refusal('REQUEST_ALREADY_ACCEPTED') from None

    def finish(self, nonce, state):
        with self.lock:
            self.db.execute('UPDATE receipts SET state=? WHERE nonce=?', (state, nonce))
            self.db.commit()

    def row(self, owner):
        with self.lock:
            row = self.db.execute('SELECT slot,state,image FROM workspaces WHERE owner=?', (owner,)).fetchone()
        if not row:
            raise Refusal('WORKSPACE_MISSING')
        return row

    def run(self, args, timeout=30):
        try:
            result = subprocess.run(self.command + args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                    stderr=subprocess.DEVNULL, timeout=timeout, check=False)
        except (subprocess.TimeoutExpired, OSError):
            raise Refusal('RUNTIME_UNAVAILABLE') from None
        if result.returncode or len(result.stdout) > 1024 * 1024:
            raise Refusal('RUNTIME_UNAVAILABLE')
        return result.stdout

    def inspect(self, owner):
        name = container_name(owner)
        # inspect failures never justify a second create/start automatically.
        try:
            rows = json.loads(self.run(['inspect', name]))
            value = rows[0]
            if value['Config']['Labels'].get('codexweb.owner') != owner:
                raise Refusal('OWNERSHIP_MISMATCH')
            if value['Image'].removeprefix('sha256:') != self.row(owner)[2].removeprefix('sha256:'):
                raise Refusal('IMAGE_MISMATCH')
            return value
        except (ValueError, KeyError, IndexError, TypeError):
            raise Refusal('RUNTIME_UNAVAILABLE') from None

    def check_slot(self, slot):
        if not self.check_slots:
            return
        path = Path(slot_path(slot))
        if path.is_symlink() or path.resolve() != path or not path.is_mount():
            raise Refusal('QUOTA_MOUNT_MISSING')
        st = path.stat()
        fs = os.statvfs(path)
        if st.st_uid != self.uid or fs.f_blocks * fs.f_frsize > DISK_GIB * 1024**3:
            raise Refusal('QUOTA_MOUNT_INVALID')

    def lifecycle(self, owner, request):
        op = request['op']
        with self.owner_lock(owner):
            if op == 'create':
                with self.slots_lock, self.lock:
                    row = self.db.execute('SELECT slot,state,image FROM workspaces WHERE owner=?', (owner,)).fetchone()
                    if row:
                        return self.status(owner)
                    used = {r[0] for r in self.db.execute('SELECT slot FROM workspaces')}
                    free = next((s for s in range(SLOTS) if s not in used), None)
                    if free is None:
                        raise Refusal('WORKSPACE_CAPACITY')
                    self.check_slot(free)
                    if self.check_slots and any(p.name != 'lost+found' for p in Path(slot_path(free)).iterdir()):
                        # A missing/damaged registry never assigns an old user's disk to someone new.
                        raise Refusal('UNCLAIMED_DISK_NOT_EMPTY')
                    # Slot ownership is committed before effects and never silently reassigned.
                    self.db.execute('INSERT INTO workspaces VALUES(?,?,?,?)', (owner, free, 'creating', self.image))
                    self.db.commit()
                self.run(container_args(owner, free, self.image), timeout=90)
                with self.lock:
                    self.db.execute("UPDATE workspaces SET state='ready' WHERE owner=?", (owner,))
                    self.db.commit()
                return self.status(owner)
            slot, state, image = self.row(owner)
            if op == 'status':
                return self.status(owner)
            if op == 'revoke':
                with self.lock:
                    self.db.execute("UPDATE workspaces SET state='revoked' WHERE owner=?", (owner,))
                    self.db.commit()
                    for connection in tuple(self.streams.get(owner, ())):
                        try:
                            connection.shutdown(socket.SHUT_RDWR)
                        except OSError:
                            pass
                # Deliberate revocation stops this workspace, never deletes its disk.
                self.inspect(owner)
                self.run(['stop', '--time', '10', container_name(owner)])
                return {'state': 'revoked'}
            if state != 'ready':
                raise Refusal('WORKSPACE_NOT_READY')
            self.check_slot(slot)
            self.inspect(owner)
            if op == 'start':
                self.run(['start', container_name(owner)])
            elif op == 'stop':
                # No implicit stop/rebuild on a read or reconnect. Hub confirms user intent.
                self.run(['stop', '--time', '10', container_name(owner)])
            else:
                raise Refusal('REQUEST_INVALID')
            return self.status(owner)

    def status(self, owner):
        slot, state, image = self.row(owner)
        if state == 'creating':
            try:
                self.inspect(owner)
            except Refusal:
                pass
            else:
                with self.lock:
                    self.db.execute("UPDATE workspaces SET state='ready' WHERE owner=? AND state='creating'", (owner,))
                    self.db.commit()
                state = 'ready'
        running = False
        if state == 'ready':
            running = self.inspect(owner)['State']['Running'] is True
        return {'state': state, 'running': running, 'image': image,
                'limits': {'diskBytes': DISK_GIB * 1024**3, 'memoryBytes': MEMORY, 'pids': PIDS, 'cpus': CPUS}}

    def execute(self, owner, request, connection):
        with self.owner_lock(owner):
            slot, state, image = self.row(owner)
            if state != 'ready':
                raise Refusal('WORKSPACE_NOT_READY')
            self.check_slot(slot)
            if not self.inspect(owner)['State']['Running']:
                raise Refusal('WORKSPACE_STOPPED')
            with self.lock:
                streams = self.streams.setdefault(owner, set())
                if len(streams) >= 8:
                    raise Refusal('EXEC_CAPACITY')
                streams.add(connection)
            try:
                process = subprocess.Popen(self.command + exec_args(owner, request['argv'], request['cwd']),
                                           stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                           start_new_session=True)
            except BaseException:
                with self.lock:
                    streams.discard(connection)
                raise
        try:
            stream_process(connection, process)
        finally:
            with self.lock:
                self.streams[owner].discard(connection)
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait()
            for stream in [process.stdin, process.stdout, process.stderr]:
                try:
                    stream.close()
                except OSError:
                    pass
            # A lost channel does not assert that its command had no effects.


def send(connection, value):
    data = memoryview(canonical(value) + b'\n')
    deadline = time.monotonic() + 30
    while data:
        left = deadline - time.monotonic()
        if left <= 0 or not select.select([], [connection], [], left)[1]:
            raise Refusal('CONSUMER_STALLED')
        try:
            count = connection.send(data, socket.MSG_DONTWAIT)
        except BlockingIOError:
            continue
        if not count:
            raise Refusal('CHANNEL_LOST')
        data = data[count:]


def stream_process(connection, process):
    """Bounded buffers with socket/pipe backpressure; no input/command/output logs."""
    connection.settimeout(None)
    send(connection, {'type': 'ready'})
    reader_error = []
    os.set_blocking(process.stdin.fileno(), False)

    def input_loop():
        try:
            with connection.makefile('rb') as reader:
                while True:
                    line = reader.readline(MAX_FRAME + 1)
                    if not line:
                        raise Refusal('CHANNEL_LOST')
                    if len(line) > MAX_FRAME or not line.endswith(b'\n'):
                        raise Refusal('FRAME_LIMIT')
                    value = json.loads(line)
                    if value == {'type': 'eof'}:
                        process.stdin.close()
                        return
                    if set(value) != {'type', 'data'} or value['type'] != 'input':
                        raise Refusal('FRAME_INVALID')
                    data = base64.b64decode(value['data'], validate=True)
                    if len(data) > 32768:
                        raise Refusal('FRAME_LIMIT')
                    pending = memoryview(data)
                    hangup = select.poll()
                    hangup.register(connection, select.POLLHUP | select.POLLERR | select.POLLRDHUP)
                    while pending:
                        if process.poll() is not None or hangup.poll(0):
                            raise Refusal('CHANNEL_LOST')
                        if not select.select([], [process.stdin], [], 1)[1]:
                            continue
                        try:
                            count = os.write(process.stdin.fileno(), pending)
                        except BlockingIOError:
                            continue
                        pending = pending[count:]
        except (OSError, ValueError, TypeError, Refusal):
            reader_error.append(True)

    # Input and output share the socket; never change its timeout from the output thread.
    # A bounded semaphore limits channels, and revocation closes even idle readers.
    reader = threading.Thread(target=input_loop, daemon=True)
    reader.start()
    try:
        with selectors.DefaultSelector() as selector:
            for stream, name in [(process.stdout, 'stdout'), (process.stderr, 'stderr')]:
                os.set_blocking(stream.fileno(), False)
                selector.register(stream, selectors.EVENT_READ, name)
            while selector.get_map():
                if reader_error:
                    raise Refusal('CHANNEL_LOST')
                for key, _ in selector.select(timeout=1):
                    data = os.read(key.fileobj.fileno(), 16384)
                    if not data:
                        selector.unregister(key.fileobj)
                    else:
                        send(connection, {'type': key.data, 'data': base64.b64encode(data).decode('ascii')})
            code = process.wait(timeout=30)
            send(connection, {'type': 'exit', 'code': code})
    finally:
        try:
            connection.shutdown(socket.SHUT_RD)
        except OSError:
            pass
        reader.join(timeout=1)


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    block_on_close = False
    slots = threading.BoundedSemaphore(32)

    def process_request(self, request, address):
        if not self.slots.acquire(blocking=False):
            request.close()
            return
        super().process_request(request, address)

    def process_request_thread(self, request, address):
        try:
            super().process_request_thread(request, address)
        finally:
            self.slots.release()

    def handle_error(self, request, address):
        # Do not include request bodies, tokens, commands or terminal content in logs.
        pass


class Handler(socketserver.BaseRequestHandler):
    def handle(self):
        connection = self.request
        nonce = None
        try:
            _, uid, _ = struct.unpack('3i', connection.getsockopt(socket.SOL_SOCKET, socket.SO_PEERCRED, 12))
            if uid != self.server.hub_uid:
                raise Refusal('PEER_DENIED')
            connection.settimeout(10)
            # Read exactly one line without swallowing any subsequent input frames.
            raw = bytearray()
            deadline = time.monotonic() + 10
            while len(raw) <= MAX_REQUEST:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise Refusal('REQUEST_TIMEOUT')
                connection.settimeout(remaining)
                char = connection.recv(1)
                if not char:
                    raise Refusal('REQUEST_INVALID')
                if char == b'\n':
                    break
                raw.extend(char)
            if len(raw) > MAX_REQUEST:
                raise Refusal('REQUEST_LIMIT')
            owner, candidate, request = authenticate(json.loads(raw), self.server.key)
            broker = self.server.broker
            broker.accept(owner, candidate, request['op'])
            nonce = candidate
            if request['op'] == 'exec':
                broker.execute(owner, request, connection)
            else:
                send(connection, {'type': 'result', 'value': broker.lifecycle(owner, request)})
            broker.finish(nonce, 'completed')
        except (Refusal, ValueError, TypeError, KeyError, OSError, subprocess.SubprocessError) as error:
            if nonce:
                self.server.broker.finish(nonce, 'unknown')
            try:
                code = str(error) if isinstance(error, Refusal) else 'REQUEST_FAILED'
                send(connection, {'type': 'error', 'code': code})
            except OSError:
                pass


def main():
    os.umask(0o077)
    config = json.loads(Path('/etc/codex-workspaces/config.json').read_text())
    key = Path('/etc/codex-workspaces/hub.key').read_bytes()
    if len(key) != 32 or os.getuid() != config['uid']:
        raise RuntimeError('BROKER_CONFIG_INVALID')
    broker = Broker(HOME, config['image'], config['uid'])
    path = RUNTIME + '/control.sock'
    # RuntimeDirectory is owned by the service. Refuse to replace anything but a stale socket.
    if os.path.lexists(path):
        import stat
        if not stat.S_ISSOCK(os.lstat(path).st_mode):
            raise RuntimeError('SOCKET_PATH_INVALID')
        with socket.socket(socket.AF_UNIX) as probe:
            try:
                probe.connect(path)
            except ConnectionRefusedError:
                os.unlink(path)
            else:
                raise RuntimeError('BROKER_ALREADY_RUNNING')
    with Server(path, Handler) as server:
        server.broker = broker
        server.hub_uid = config['hubUid']
        server.key = key
        # SO_PEERCRED + exact signed capability authorize every request. No group
        # shared with the Hub's private files is granted to the runtime account.
        os.chmod(path, 0o666)
        server.serve_forever(poll_interval=0.5)


if __name__ == '__main__':
    main()
