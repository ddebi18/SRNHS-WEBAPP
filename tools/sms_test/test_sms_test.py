#!/usr/bin/env python3
"""
Unit tests for SMSGate diagnostic & load test harness.
Run with: python -m unittest tools/sms_test/test_sms_test.py
"""

import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from tools.sms_test.sms_test import (
    Config,
    MessageRecord,
    SMSGateClient,
    calculate_percentile,
    cmd_burst,
    compute_statistics,
    load_config,
    mask_phone,
    parse_env_file,
    poll_message_status,
    validate_recipient,
)


class TestConfigAndEnv(unittest.TestCase):
    def test_parse_env_file(self):
        with tempfile.NamedTemporaryFile("w+", delete=False, suffix=".env") as tf:
            tf.write("# Comment line\n")
            tf.write("SMSGATE_USERNAME=admin_user\n")
            tf.write("SMSGATE_PASSWORD=\"secret_pass\"\n")
            tf.write("TEST_RECIPIENTS='+639171112222, +639183334444'\n")
            tf.write("SMSGATE_DEVICE_ID=dev_123\n")
            tf_path = Path(tf.name)

        try:
            parsed = parse_env_file(tf_path)
            self.assertEqual(parsed.get("SMSGATE_USERNAME"), "admin_user")
            self.assertEqual(parsed.get("SMSGATE_PASSWORD"), "secret_pass")
            self.assertEqual(parsed.get("TEST_RECIPIENTS"), "+639171112222, +639183334444")
            self.assertEqual(parsed.get("SMSGATE_DEVICE_ID"), "dev_123")
        finally:
            tf_path.unlink()

    def test_missing_credentials_raises_error(self):
        with tempfile.NamedTemporaryFile("w+", delete=False, suffix=".env") as tf:
            tf.write("SMSGATE_BASE_URL=https://api.sms-gate.app/3rdparty/v1\n")
            tf_path = Path(tf.name)

        try:
            with patch.dict(os.environ, {}, clear=True):
                with self.assertRaises(ValueError) as ctx:
                    load_config(tf_path, require_auth=True)
                self.assertIn("Missing SMSGATE_USERNAME", str(ctx.exception))
        finally:
            tf_path.unlink()

    def test_load_config_valid(self):
        with tempfile.NamedTemporaryFile("w+", delete=False, suffix=".env") as tf:
            tf.write("SMSGATE_USERNAME=user1\n")
            tf.write("SMSGATE_PASSWORD=pass1\n")
            tf.write("TEST_RECIPIENTS=+639171112222,+639183334444\n")
            tf_path = Path(tf.name)

        try:
            cfg = load_config(tf_path, require_auth=True)
            self.assertEqual(cfg.username, "user1")
            self.assertEqual(cfg.password, "pass1")
            self.assertEqual(len(cfg.test_recipients), 2)
            self.assertEqual(cfg.test_recipients[0], "+639171112222")
        finally:
            tf_path.unlink()


class TestSafetyAndMasking(unittest.TestCase):
    def test_mask_phone(self):
        self.assertEqual(mask_phone("+639171234567"), "+63917***4567")
        self.assertEqual(mask_phone("+639189998888"), "+63918***8888")
        self.assertEqual(mask_phone("123"), "***")
        self.assertEqual(mask_phone("12345678"), "123***78")

    def test_recipient_allowlist_enforcement(self):
        allowlist = ["+639171234567", "+639181234567"]

        # Allowed recipient should pass without error
        validate_recipient("+639171234567", allowlist)

        # Disallowed recipient should raise ValueError
        with self.assertRaises(ValueError) as ctx:
            validate_recipient("+639990000000", allowlist)
        self.assertIn("Safety error", str(ctx.exception))
        self.assertIn("+63999***0000", str(ctx.exception))

        # Bypass allowed for badnumber test
        validate_recipient("+639990000000", allowlist, allow_bypass=True)


class TestClientAndPolling(unittest.TestCase):
    def setUp(self):
        self.config = Config(
            base_url="https://api.sms-gate.app/3rdparty/v1",
            username="u",
            password="p",
            device_id="dev_1",
            test_recipients=["+639171234567"],
        )

    def test_dry_run_send(self):
        client = SMSGateClient(self.config, dry_run=True)
        res = client.send_message("+639171234567", "SRNHS test")
        self.assertTrue(res["id"].startswith("dry_run_"))
        self.assertEqual(res["http_status"], 200)

    def test_polling_stops_on_terminal_state(self):
        client = SMSGateClient(self.config)
        client.get_status = MagicMock(return_value={
            "id": "msg_001",
            "state": "Delivered",
            "delivered_at": "2026-09-29T06:00:05Z",
            "http_status": 200,
            "error": "",
        })

        rec = MessageRecord(
            index=1,
            masked_recipient="+63917***4567",
            message_id="msg_001",
            first_state="Queued",
        )

        updated = poll_message_status(client, rec, submit_epoch=100.0, timeout_sec=10.0, poll_interval_sec=0.01)
        self.assertEqual(updated.final_state, "Delivered")
        self.assertEqual(updated.delivered_at, "2026-09-29T06:00:05Z")

    def test_polling_stops_on_timeout(self):
        client = SMSGateClient(self.config)
        client.get_status = MagicMock(return_value={
            "id": "msg_002",
            "state": "Pending",
            "http_status": 200,
            "error": "",
        })

        rec = MessageRecord(
            index=2,
            masked_recipient="+63917***4567",
            message_id="msg_002",
            first_state="Pending",
        )

        updated = poll_message_status(client, rec, submit_epoch=100.0, timeout_sec=0.05, poll_interval_sec=0.02)
        self.assertEqual(updated.final_state, "Pending")
        self.assertIn("Timed out", updated.error)


class TestBurstAndSafetyCaps(unittest.TestCase):
    @patch("tools.sms_test.sms_test.load_config")
    @patch("tools.sms_test.sms_test.write_results_csv")
    def test_burst_cap_and_confirmation(self, mock_write, mock_cfg):
        mock_cfg.return_value = Config(
            base_url="https://test",
            username="u",
            password="p",
            device_id=None,
            test_recipients=["+639171234567"],
        )

        # When prompt is answered with 'n', burst cancels
        args = MagicMock()
        args.count = 100
        args.interval = 0
        args.yes = False
        args.dry_run = False
        args.timeout = 10
        args.poll_interval = 1

        with patch("builtins.input", return_value="n"):
            cmd_burst(args)
            mock_write.assert_not_called()

    @patch("tools.sms_test.sms_test.load_config")
    @patch("tools.sms_test.sms_test.write_results_csv")
    def test_consecutive_failure_abort(self, mock_write, mock_cfg):
        mock_cfg.return_value = Config(
            base_url="https://test",
            username="u",
            password="p",
            device_id=None,
            test_recipients=["+639171234567"],
        )

        args = MagicMock()
        args.count = 10
        args.interval = 0
        args.yes = True
        args.dry_run = False
        args.timeout = 5
        args.poll_interval = 1

        with patch("tools.sms_test.sms_test.SMSGateClient.send_message", return_value={
            "id": "",
            "state": "Error",
            "http_status": 500,
            "error": "Server Down",
        }):
            cmd_burst(args)
            # Should have written only 5 records before aborting
            args_written = mock_write.call_args[0][1]
            self.assertEqual(len(args_written), 5)


class TestStatistics(unittest.TestCase):
    def test_compute_statistics(self):
        records = [
            MessageRecord(
                index=1,
                masked_recipient="+63917***1111",
                submitted_at="2026-09-29T06:00:00+00:00",
                delivered_at="2026-09-29T06:00:02+00:00",
                final_state="Delivered",
                submit_to_delivered_sec="2.0",
            ),
            MessageRecord(
                index=2,
                masked_recipient="+63917***2222",
                submitted_at="2026-09-29T06:00:05+00:00",
                delivered_at="2026-09-29T06:00:09+00:00",
                final_state="Delivered",
                submit_to_delivered_sec="4.0",
            ),
            MessageRecord(
                index=3,
                masked_recipient="+63917***3333",
                submitted_at="2026-09-29T06:00:10+00:00",
                final_state="Failed",
                error="Network unreachable",
            ),
        ]

        stats = compute_statistics(records)
        self.assertEqual(stats["total"], 3)
        self.assertEqual(stats["delivered"], 2)
        self.assertEqual(stats["failed"], 1)
        self.assertAlmostEqual(stats["success_rate"], 66.666, places=2)
        self.assertEqual(stats["min_delivery_sec"], 2.0)
        self.assertEqual(stats["max_delivery_sec"], 4.0)
        self.assertEqual(stats["median_delivery_sec"], 3.0)
        self.assertEqual(stats["longest_gap_sec"], 7.0)  # Between 06:00:02 and 06:00:09

    def test_percentile_calculation(self):
        data = [1.0, 2.0, 3.0, 4.0, 5.0]
        self.assertEqual(calculate_percentile(data, 50.0), 3.0)
        self.assertEqual(calculate_percentile(data, 0.0), 1.0)
        self.assertEqual(calculate_percentile(data, 100.0), 5.0)


if __name__ == "__main__":
    unittest.main()
