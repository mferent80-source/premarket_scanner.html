import importlib.util
import tempfile
import threading
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('local_server',Path(__file__).with_name('breadth-local-server.py'))
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)

class LocalScanTests(unittest.TestCase):
    def test_daily_is_persistent_and_manual_can_scan_again(self):
        with tempfile.TemporaryDirectory() as directory:
            calls=[]; finished=threading.Event()
            def runner(request_id): calls.append(request_id); finished.set(); return 0
            manager=local.ScanManager(directory,runner,lambda:'2026-10-03')
            first,_=manager.start('daily');finished.wait(1)
            # Synchronize with the final status, without spawning a second scan.
            for _ in range(100):
                with manager.lock:
                    if manager.active['status']=='finished': break
                threading.Event().wait(.01)
            second,_=manager.start('daily')
            self.assertEqual(first['requestId'],second['requestId']);self.assertEqual(len(calls),1)
            restored=local.ScanManager(directory,runner,lambda:'2026-10-03')
            restored.start('daily');self.assertEqual(len(calls),1)
            manual,_=manager.start('manual');self.assertTrue(manual['requestId'].startswith('manual-'))

    def test_running_scan_is_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            release=threading.Event()
            manager=local.ScanManager(directory,lambda _: release.wait(1) or 0,lambda:'2026-10-03')
            first,_=manager.start('daily');second,_=manager.start('manual')
            self.assertEqual(first['requestId'],second['requestId']);release.set()

    def test_next_bucharest_day_can_run_again(self):
        with tempfile.TemporaryDirectory() as directory:
            manager=local.ScanManager(directory,lambda _:0,lambda:'2026-10-04')
            manager.daily={'day':'2026-10-03','requestId':'open-2026-10-03','status':'queued'}
            record,_=manager.start('daily');self.assertEqual(record['requestId'],'open-2026-10-04')

if __name__=='__main__': unittest.main()
