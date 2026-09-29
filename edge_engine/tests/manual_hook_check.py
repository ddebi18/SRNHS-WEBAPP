#!/usr/bin/env python3
"""
Manual reproduction and diagnostic check for edge_engine/sms_hook.py.
Tests notify_recognition with fake student events against real configuration.
"""

import os
import sys
import time
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from edge_engine.sms_hook import get_hook_manager, notify_recognition, load_hook_config, mask_phone

def run_diagnostics():
    print("=" * 60)
    print(" RUNNING SMS HOOK DIAGNOSTIC CHECK ")
    print("=" * 60)
    
    cfg = load_hook_config()
    print(f"1. Hook Enabled:      {cfg.enabled}")
    print(f"2. Dry Run:           {cfg.dry_run}")
    print(f"3. Base URL:          {cfg.base_url}")
    print(f"4. Username Config:   {'Configured' if cfg.username else 'MISSING'}")
    print(f"5. SIM Number:        {cfg.sim_number}")
    print(f"6. Allowlist:         {[mask_phone(r) for r in cfg.test_recipients]}")
    print(f"7. Cooldown:          {cfg.cooldown_seconds}s")
    print(f"8. Daily Cap:         {cfg.daily_cap}")
    print("-" * 60)

    manager = get_hook_manager()
    print(f"Worker thread alive:  {manager._worker_thread.is_alive()}")
    print(f"Queue empty:          {manager.queue.empty()}")
    
    print("\n[*] Sending simulated ENTRY event...")
    ok_entry = notify_recognition(
        student_id="test_student_001",
        student_first_name="Carlos",
        event_type="entry",
        timestamp=time.time(),
    )
    print(f"    notify_recognition(entry) returned: {ok_entry}")
    
    # Wait for worker to process entry
    print("[*] Waiting 5 seconds for worker dispatch...")
    time.sleep(5)
    
    print("\n[*] Sending simulated EXIT event...")
    ok_exit = notify_recognition(
        student_id="test_student_001",
        student_first_name="Carlos",
        event_type="exit",
        timestamp=time.time(),
    )
    print(f"    notify_recognition(exit) returned: {ok_exit}")

    print("[*] Waiting 5 seconds for worker dispatch...")
    time.sleep(5)
    
    print("\n[+] Diagnostic check completed.")
    print("=" * 60)

if __name__ == "__main__":
    run_diagnostics()
