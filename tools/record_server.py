#!/usr/bin/env python3
"""Dev server for recording videos (see tools/record.js).

Serves the project like `python3 -m http.server`, but never lets the browser cache the files, and saves
anything POSTed to /__rec/<name> under the output folder (default: video/raw next to the project).

    python3 tools/record_server.py [port] [out_dir]
"""
import os
import re
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8792
OUT = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.path.join(ROOT, 'video', 'raw')
NAME = re.compile(r'^[A-Za-z0-9_.-]+(/[A-Za-z0-9_.-]+)?$')


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        name = self.path[len('/__rec/'):] if self.path.startswith('/__rec/') else ''
        if not NAME.match(name) or '..' in name:
            self.send_error(400, 'bad name')
            return
        n = int(self.headers.get('Content-Length', '0'))
        data = self.rfile.read(n)
        path = os.path.join(OUT, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as f:
            f.write(data)
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        if not self.path.startswith('/__rec/'):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    print(f'Serving {ROOT} on http://localhost:{PORT}, saving recordings to {OUT}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', PORT), partial(Handler, directory=ROOT)).serve_forever()
