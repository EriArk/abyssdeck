#!/usr/bin/python3
"""Host-side acceptance client. Never print the installation capability/key.

The production Hub will mint owner-scoped requests after user authorization.
This utility is for the installation owner verifying the private broker itself.
"""
import argparse
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import socket
import sys
import threading
import time
import uuid
from broker import canonical
from policy import RUNTIME


def envelope(owner, request, key):
    now = time.time()
    claim = {'owner': owner, 'issued': now, 'expires': now + 20,
             'nonce': str(uuid.uuid4()), 'digest': hashlib.sha256(canonical(request)).hexdigest()}
    return {'claim': claim, 'request': request, 'mac': hmac.new(key, canonical(claim), hashlib.sha256).hexdigest()}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--key-file', required=True)
    p.add_argument('--owner', required=True)
    p.add_argument('--socket', default=RUNTIME+'/control.sock')
    p.add_argument('--cwd', default='/workspace')
    p.add_argument('op', choices=['status', 'create', 'start', 'stop', 'revoke', 'exec'])
    p.add_argument('argv', nargs=argparse.REMAINDER)
    a = p.parse_args()
    request = {'op': a.op}
    if a.op == 'exec':
        request.update(argv=a.argv, cwd=a.cwd)
    key = Path(a.key_file).read_bytes()
    with socket.socket(socket.AF_UNIX) as s:
        s.connect(a.socket)
        s.sendall(canonical(envelope(a.owner, request, key))+b'\n')
        with s.makefile('rb') as reader:
            while line := reader.readline(65537):
                if len(line) > 65536: raise RuntimeError('FRAME_LIMIT')
                value = json.loads(line)
                if value['type'] == 'ready':
                    def input_loop():
                        try:
                            while chunk := os.read(sys.stdin.fileno(), 16384):
                                s.sendall(canonical({'type':'input','data':base64.b64encode(chunk).decode()})+b'\n')
                            s.sendall(b'{"type":"eof"}\n')
                        except OSError:
                            pass
                    threading.Thread(target=input_loop, daemon=True).start()
                elif value['type'] in ('stdout', 'stderr'):
                    stream = sys.stdout.buffer if value['type']=='stdout' else sys.stderr.buffer
                    stream.write(base64.b64decode(value['data'], validate=True)); stream.flush()
                elif value['type']=='exit':
                    return value['code'] if value['code'] >= 0 else 1
                elif value['type']=='result':
                    print(json.dumps(value['value'])); return 0
                elif value['type']=='error':
                    print(value['code'],file=sys.stderr); return 1
            return 1


if __name__ == '__main__':
    sys.exit(main())
