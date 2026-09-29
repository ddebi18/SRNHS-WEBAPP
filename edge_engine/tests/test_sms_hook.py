#!/usr/bin/env python3
"""
Unit tests for edge_engine/sms_hook.py.
Run with: python -m unittest edge_engine/tests/test_sms_hook.py
"""

import datetime
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import MagicMock, patch

from edge_engine.sms_hook import (
    HookConfig,
    SMSHookManager,
    mask_phone,
    notify_recognition,
)


class TestSMSHook(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.TemporaryDirectory()
        self.config = HookConfig(
            enabled=True,
            dry_run=True,
            base_url="https://api.sms-gate.app/3rdparty/v1",
            username="test_user",
            password="test_pass",
            device_id=None,
            sim_number=2,
            test_recipients=["+639916272657"],
            cooldown_seconds=600.0,
            daily_cap=5,
            send_delay_seconds=0.01,
        )

    def tearDown(self):
        try:
            self.test_dir.cleanup()
        except Exception:
            pass

    def test_phone_masking(self):
        self.assertEqual(mask_phone("+639916272657"), "+63991***2657")
        self.assertEqual(mask_phone("123"), "***")

    def test_hook_disabled_is_noop(self):
        self.config.enabled = False
        manager = SMSHookManager(self.config)
        manager.logs_dir = Path(self.test_dir.name)

        result = manager.notify("student_1", "Juan", "entry", time.time())
        self.assertFalse(result)
        self.assertEqual(manager.queue.qsize(), 0)

    def test_message_text_first_name_only(self):
        manager = SMSHookManager(self.config)
        rec_time = 1790663000.0  # arbitrary epoch
        msg = manager._format_message_text("Juan", rec_time)

        self.assertIn("SRNHS TEST: Juan recognized at", msg)
        self.assertNotIn("Dela Cruz", msg)
        self.assertNotIn("LRN", msg)
        self.assertIn("This is a system test.", msg)

    def test_cooldown_enforcement(self):
        manager = SMSHookManager(self.config)
        manager.logs_dir = Path(self.test_dir.name)

        t0 = 1000.0
        event1 = {"student_id": "std_1", "first_name": "Maria", "event_type": "entry", "timestamp": t0}
        with patch("time.time", return_value=t0):
            manager._process_event(event1)
        self.assertEqual(manager.daily_count, 1)

        # Event within 600s cooldown should be suppressed
        t1 = t0 + 100.0
        event2 = {"student_id": "std_1", "first_name": "Maria", "event_type": "exit", "timestamp": t1}
        with patch("time.time", return_value=t1):
            manager._process_event(event2)
        self.assertEqual(manager.daily_count, 1)

        # Event after cooldown expires (t0 + 601s) with different event_type
        t2 = t0 + 601.0
        event3 = {"student_id": "std_1", "first_name": "Maria", "event_type": "exit", "timestamp": t2}
        with patch("time.time", return_value=t2):
            manager._process_event(event3)
        self.assertEqual(manager.daily_count, 2)

    def test_daily_per_event_deduplication(self):
        manager = SMSHookManager(self.config)
        manager.logs_dir = Path(self.test_dir.name)
        manager.config.cooldown_seconds = 10.0  # short cooldown for test

        t0 = 1000.0
        event1 = {"student_id": "std_2", "first_name": "Pedro", "event_type": "entry", "timestamp": t0}
        with patch("time.time", return_value=t0):
            manager._process_event(event1)
        self.assertEqual(manager.daily_count, 1)

        # Even after cooldown expires, same event_type ('entry') on same day should be deduplicated
        t1 = t0 + 100.0
        event2 = {"student_id": "std_2", "first_name": "Pedro", "event_type": "entry", "timestamp": t1}
        with patch("time.time", return_value=t1):
            manager._process_event(event2)
        self.assertEqual(manager.daily_count, 1)

    def test_daily_cap_enforcement(self):
        self.config.daily_cap = 2
        manager = SMSHookManager(self.config)
        manager.logs_dir = Path(self.test_dir.name)

        t0 = 1000.0
        with patch("time.time", return_value=t0):
            manager._process_event({"student_id": "s1", "first_name": "A", "event_type": "entry", "timestamp": t0})
            manager._process_event({"student_id": "s2", "first_name": "B", "event_type": "entry", "timestamp": t0})
            manager._process_event({"student_id": "s3", "first_name": "C", "event_type": "entry", "timestamp": t0})

        self.assertEqual(manager.daily_count, 2)

    def test_queue_full_drops_gracefully(self):
        manager = SMSHookManager(self.config)
        manager.logs_dir = Path(self.test_dir.name)

        # Fill queue to MAX_QUEUE_SIZE (50)
        for i in range(50):
            manager.queue.put_nowait({
                "student_id": f"s_{i}",
                "first_name": "Test",
                "event_type": "entry",
                "timestamp": time.time(),
            })

        # 51st event should return False and not crash
        res = manager.notify("student_overflow", "Test", "entry", time.time())
        self.assertFalse(res)

    def test_auth_failure_no_retry(self):
        self.config.dry_run = False
        manager = SMSHookManager(self.config)
        manager.logs_dir = Path(self.test_dir.name)

        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.ok = False
        mock_resp.headers = {"content-type": "application/json"}
        mock_resp.json.return_value = {"message": "Invalid API Key"}

        with patch.object(manager.session, "post", return_value=mock_resp) as mock_post:
            manager._send_to_recipient(
                recipient="+639916272657",
                student_id="std_auth",
                event_type="entry",
                message_text="SRNHS TEST",
                recognition_epoch=time.time(),
            )
            # Should have called post only ONCE because 401 is non-retryable
            self.assertEqual(mock_post.call_count, 1)

    def test_exception_isolation(self):
        # Even if manager throws unexpected error, notify_recognition returns False cleanly
        with patch("edge_engine.sms_hook.get_hook_manager", side_effect=RuntimeError("Unexpected")):
            result = notify_recognition("std_err", "Crash", "entry", time.time())
            self.assertFalse(result)


if __name__ == "__main__":
    unittest.main()
