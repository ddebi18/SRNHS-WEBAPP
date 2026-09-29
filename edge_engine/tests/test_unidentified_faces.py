"""
Unit tests for unidentified and ambiguous face processing in SRNHS Turnstile Engine.
Tests:
1. No-match returns 'unidentified' with correct similarity and None student_id.
2. Top-2 candidates within margin returns 'ambiguous' with candidate list.
3. Cooldown and embedding deduplication suppresses lingering face duplicates.
4. SMS is never dispatched for unidentified or ambiguous events.
"""

import sys
import os
import time
import unittest
from unittest.mock import MagicMock, patch
import numpy as np

# Ensure edge_engine is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from gate_biometrics import (
    TurnstileGateClient,
    CosineSimilarityEngine,
    SIMILARITY_THRESHOLD,
    AMBIGUITY_MARGIN,
)


class TestUnidentifiedFaceLogic(unittest.TestCase):
    def setUp(self):
        # Create client without opening real camera or fetching real Supabase
        with patch.object(TurnstileGateClient, "load_enrolled_students"):
            self.client = TurnstileGateClient(camera_index=0, gate_id="Gate-01 (Main)")

        # Create normalized mock embeddings
        vec_a = np.zeros(128, dtype=np.float32)
        vec_a[0] = 1.0

        vec_b = np.zeros(128, dtype=np.float32)
        vec_b[1] = 1.0

        vec_c = np.zeros(128, dtype=np.float32)
        vec_c[0] = 0.7071
        vec_c[1] = 0.7071

        self.client.enrolled_roster = {
            "student-001": {
                "name": "Maria Santos",
                "lrn": "109800000001",
                "guardian_phone": "+639171112222",
                "vector": vec_a,
            },
            "student-002": {
                "name": "Juan Dela Cruz",
                "lrn": "109800000002",
                "guardian_phone": "+639173334444",
                "vector": vec_b,
            },
        }

    def test_no_match_returns_unidentified(self):
        # Vector orthogonal to both student-001 and student-002 (dot product = 0.0)
        unknown_vector = np.zeros(128, dtype=np.float32)
        unknown_vector[5] = 1.0

        outcome, matched_id, top_sim, candidates = self.client.match_face(unknown_vector)
        self.assertEqual(outcome, "unidentified")
        self.assertIsNone(matched_id)
        self.assertLess(top_sim, SIMILARITY_THRESHOLD)
        self.assertEqual(len(candidates), 0)

    def test_ambiguous_match_returns_candidates(self):
        # Vector with equal dot product to both student-001 and student-002
        # (0.7071 to each, difference = 0.0 < AMBIGUITY_MARGIN 0.08)
        ambiguous_vector = np.zeros(128, dtype=np.float32)
        ambiguous_vector[0] = 0.7071
        ambiguous_vector[1] = 0.7071

        outcome, matched_id, top_sim, candidates = self.client.match_face(ambiguous_vector)
        self.assertEqual(outcome, "ambiguous")
        self.assertIsNone(matched_id)
        self.assertGreaterEqual(top_sim, SIMILARITY_THRESHOLD)
        self.assertEqual(len(candidates), 2)
        self.assertIn("Maria Santos", [c["student_name"] for c in candidates])
        self.assertIn("Juan Dela Cruz", [c["student_name"] for c in candidates])

    def test_clear_match_returns_matched(self):
        # Vector almost identical to student-001 (cosine similarity > 0.90)
        matched_vector = np.zeros(128, dtype=np.float32)
        matched_vector[0] = 0.99
        matched_vector[2] = 0.14
        matched_vector = matched_vector / np.linalg.norm(matched_vector)

        outcome, matched_id, top_sim, candidates = self.client.match_face(matched_vector)
        self.assertEqual(outcome, "matched")
        self.assertEqual(matched_id, "student-001")
        self.assertGreaterEqual(top_sim, SIMILARITY_THRESHOLD)
        self.assertEqual(len(candidates), 0)

    @patch("gate_biometrics.send_sms")
    @patch("gate_biometrics.requests.post")
    def test_unidentified_never_triggers_sms(self, mock_post, mock_send_sms):
        dummy_vector = np.zeros(128, dtype=np.float32)
        dummy_vector[10] = 1.0
        dummy_crop = np.zeros((100, 100, 3), dtype=np.uint8)

        self.client.dispatch_unidentified_log(
            outcome="unidentified",
            similarity=0.35,
            live_vector=dummy_vector,
            face_crop=dummy_crop,
            candidates=[],
        )

        mock_send_sms.assert_not_called()

    @patch("gate_biometrics.requests.post")
    def test_dedup_suppresses_lingering_face(self, mock_post):
        face_vector = np.zeros(128, dtype=np.float32)
        face_vector[20] = 1.0

        # First appearance: should be logged
        self.client.dispatch_unidentified_log(
            outcome="unidentified",
            similarity=0.30,
            live_vector=face_vector,
            face_crop=None,
            candidates=[],
        )
        self.assertEqual(len(self.client.recent_unidentified), 1)

        # Immediate second frame with same face vector (within 15s cooldown):
        # Should be suppressed
        self.client.dispatch_unidentified_log(
            outcome="unidentified",
            similarity=0.32,
            live_vector=face_vector,
            face_crop=None,
            candidates=[],
        )
        # Count remains 1 — duplicate suppressed!
        self.assertEqual(len(self.client.recent_unidentified), 1)

        # Different face appears: should NOT be suppressed
        diff_face_vector = np.zeros(128, dtype=np.float32)
        diff_face_vector[30] = 1.0
        self.client.dispatch_unidentified_log(
            outcome="unidentified",
            similarity=0.25,
            live_vector=diff_face_vector,
            face_crop=None,
            candidates=[],
        )
        self.assertEqual(len(self.client.recent_unidentified), 2)


if __name__ == "__main__":
    unittest.main()
