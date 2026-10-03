#!/usr/bin/env python3
"""Run the existing full Breadth engine and serve the Decision App on loopback."""
import argparse
import json
import subprocess
import sys
import threading
import uuid
import webbrowser
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]

def day():
    return datetime.now(ZoneInfo('Europe/Bucharest')).date().isoformat()

class ScanManager:
    def __init__(self, root=ROOT, runner=None, today=day):
        self.root, self.today = Path(root), today
        self.lock = threading.Lock()
        self.active = None
        self.statefile = self.root / '_local_state' / 'breadth-daily.json'
        try: self.daily = json.loads(self.statefile.read_text())
        except (OSError, ValueError): self.daily = None
        self.runner = runner or self.execute

    def execute(self, request_id):
        logs = self.root / '_local_state'
        logs.mkdir(exist_ok=True)
        with (logs / 'breadth-scan.log').open('w', encoding='utf-8') as output:
            result = subprocess.run([sys.executable, str(self.root / 'tools/breadth-suite/run.py'),
                '--request-id', request_id, '--backtests', 'auto'], cwd=self.root,
                stdout=output, stderr=subprocess.STDOUT, timeout=2700)
        return result.returncode

    def start(self, mode):
        with self.lock:
            today = self.today()
            if mode == 'daily' and self.daily and self.daily.get('day') == today:
                return dict(self.daily), 200
            if self.active and self.active['status'] in ('queued', 'running'):
                record = dict(self.active, status='queued', reused=True)
                if mode == 'daily':
                    self.daily = record
                    self.persist_daily()
                return record, 202
            record = {'day': today, 'requestId': 'open-'+today if mode == 'daily' else 'manual-'+uuid.uuid4().hex,
                      'status': 'queued', 'requestedAt': datetime.now().astimezone().isoformat()}
            if mode == 'daily':
                self.daily = dict(record)
                self.persist_daily()
            self.active = dict(record)
            threading.Thread(target=self.finish, args=(record,), daemon=True).start()
            return record, 202

    def persist_daily(self):
        self.statefile.parent.mkdir(exist_ok=True)
        temporary = self.statefile.with_suffix('.tmp')
        temporary.write_text(json.dumps(self.daily), encoding='utf-8')
        temporary.replace(self.statefile)

    def finish(self, record):
        with self.lock: self.active['status'] = 'running'
        try: code = self.runner(record['requestId'])
        except Exception: code = 1
        with self.lock:
            self.active['status'] = 'finished' if code == 0 else 'failed'

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def permitted_host(self):
        return self.headers.get('Host') in self.server.allowed_hosts

    def reply(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.permitted_host(): return self.reply({'status':'forbidden_host'},403)
        path = unquote(urlsplit(self.path).path)
        if path == '/app/breadth-daily-config.json':
            return self.reply({'enabled':True,'endpoint':'/api/breadth/daily','manualEndpoint':'/api/breadth/scan'})
        if path == '/api/breadth/status':
            with self.server.scans.lock: state = dict(self.server.scans.active or {'status':'idle'})
            return self.reply(state)
        if path == '/':
            self.send_response(302); self.send_header('Location','/app/'); self.end_headers(); return
        parts = path.strip('/').split('/')
        if '..' in parts or parts[0].startswith(('.', '_')) or parts[0] in ('tools','original','upload'):
            return self.reply({'status':'not_found'},404)
        super().do_GET()

    def do_POST(self):
        origin = self.headers.get('Origin')
        if not self.permitted_host() or origin not in self.server.allowed_origins:
            return self.reply({'status':'forbidden'},403)
        path = urlsplit(self.path).path
        if path not in ('/api/breadth/daily','/api/breadth/scan'):
            return self.reply({'status':'not_found'},404)
        try: length = int(self.headers.get('Content-Length','0'))
        except ValueError: return self.reply({'status':'bad_request'},400)
        if length < 0 or length > 1024 or self.headers.get('Content-Type','').split(';')[0] != 'application/json':
            return self.reply({'status':'bad_request'},400)
        self.rfile.read(length)  # Client cannot choose a program, repository or command.
        state, status = self.server.scans.start('daily' if path.endswith('/daily') else 'manual')
        self.reply(state,status)

    def end_headers(self):
        self.send_header('Cache-Control','no-store')
        super().end_headers()

def serve(port=8765, open_browser=True):
    server = ThreadingHTTPServer(('127.0.0.1',port),Handler)
    port = server.server_address[1]
    server.allowed_hosts = {f'127.0.0.1:{port}',f'localhost:{port}'}
    server.allowed_origins = {'http://'+host for host in server.allowed_hosts}
    server.scans = ScanManager()
    url = f'http://127.0.0.1:{port}/app/'
    print('Trading Tools: '+url,flush=True)
    print('Prima deschidere ruleaza Breadth o data pe zi. Scaneaza acum poate rula din nou.',flush=True)
    if open_browser: webbrowser.open(url)
    try: server.serve_forever()
    except KeyboardInterrupt: pass
    finally: server.server_close()

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--no-browser',action='store_true')
    args = parser.parse_args()
    serve(args.port,not args.no_browser)
