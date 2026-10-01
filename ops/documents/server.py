"""Private DOCX -> fixed PDF pages; no account files or network in this container."""
import io
import os
from pathlib import Path
import select
import signal
import socket
import socketserver
import subprocess
import tempfile
import threading
import time
import zipfile
from http.server import BaseHTTPRequestHandler

INPUT_LIMIT = 32 * 1024 * 1024
OUTPUT_LIMIT = 32 * 1024 * 1024
lock = threading.Lock()


def validate_docx(data):
    if not 0 < len(data) <= INPUT_LIMIT:
        raise ValueError('input size')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        names = {entry.filename for entry in entries}
        if not {'[Content_Types].xml', 'word/document.xml'} <= names:
            raise ValueError('not DOCX')
        if len(entries) > 10000 or sum(entry.file_size for entry in entries) > 128 * 1024 * 1024:
            raise ValueError('package size')
        for entry in entries:
            if entry.flag_bits & 1 or entry.filename.lower().endswith('vbaproject.bin'):
                raise ValueError('unsupported document')
        # The converter reads the package directly. Never extract caller paths.
        if b'wordprocessingml.document.main+xml' not in archive.read('[Content_Types].xml'):
            raise ValueError('not DOCX')


def convert(data, cancelled=lambda: False):
    validate_docx(data)
    with tempfile.TemporaryDirectory(prefix='document-') as directory:
        root = Path(directory)
        source = root / 'document.docx'
        source.write_bytes(data)
        profile = root / 'profile'
        (profile / 'user').mkdir(parents=True)
        (profile / 'user/registrymodifications.xcu').write_text(
            '<?xml version="1.0" encoding="UTF-8"?>'
            '<oor:items xmlns:oor="http://openoffice.org/2001/registry">'
            '<item oor:path="/org.openoffice.Office.Common/Security/Scripting">'
            '<prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>'
            '<item oor:path="/org.openoffice.Office.Writer/Content/Update">'
            '<prop oor:name="Link" oor:op="fuse"><value>2</value></prop></item>'
            '</oor:items>', encoding='utf-8')
        child = subprocess.Popen([
            'libreoffice', '-env:UserInstallation=' + profile.as_uri(), '--headless',
            '--nologo', '--nodefault', '--nofirststartwizard',
            '--convert-to', 'pdf:writer_pdf_Export', '--outdir', str(root), str(source),
        ], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            start_new_session=True, cwd=root,
            env={'PATH': os.environ.get('PATH', '/usr/bin:/bin'), 'HOME': str(root),
                 'SAL_USE_VCLPLUGIN': 'svp', 'LANG': 'C.UTF-8'})
        started = time.monotonic()
        try:
            while child.poll() is None:
                if cancelled() or time.monotonic() - started > 60:
                    raise TimeoutError('conversion stopped')
                time.sleep(.1)
            output = root / 'document.pdf'
            if child.returncode != 0 or not output.is_file() or not 5 < output.stat().st_size <= OUTPUT_LIMIT:
                raise ValueError('conversion failed')
            result = output.read_bytes()
            if not result.startswith(b'%PDF-') or cancelled():
                raise ValueError('invalid output')
            return result
        finally:
            # Kill the entire disposable LibreOffice group before deleting its profile.
            try:
                os.killpg(child.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            child.wait()


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *_):
        pass

    def reply(self, status, body=b'{}', mime='application/json'):
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Connection', 'close')
        self.end_headers()
        self.wfile.write(body)
        self.close_connection = True

    def do_GET(self):
        self.reply(200, b'{"format":"docx","output":"pdf"}') if self.path == '/health' else self.reply(404)

    def do_POST(self):
        if self.path != '/convert/docx':
            self.reply(404)
            return
        if not lock.acquire(blocking=False):
            self.reply(429)
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if not 0 < size <= INPUT_LIMIT:
                self.reply(413)
                return
            self.connection.settimeout(75)
            data = self.rfile.read(size)
            if len(data) != size:
                raise ValueError('truncated input')

            def cancelled():
                readable, _, _ = select.select([self.connection], [], [], 0)
                return bool(readable) and self.connection.recv(1, socket.MSG_PEEK) == b''

            self.reply(200, convert(data, cancelled), 'application/pdf')
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            try:
                self.reply(422)
            except OSError:
                pass
        finally:
            lock.release()


class Server(socketserver.ThreadingMixIn, socketserver.UnixStreamServer):
    daemon_threads = True
    request_queue_size = 8


if __name__ == '__main__':
    os.umask(0o077)
    path = Path('/run/documents/documents.sock')
    # The entrypoint lock excludes another worker owning this socket.
    if path.exists():
        path.unlink()
    with Server(str(path), Handler) as server:
        path.chmod(0o600)
        print('Document pages worker ready', flush=True)
        server.serve_forever()
