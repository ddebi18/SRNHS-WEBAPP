"""
==============================================================================
San Roque National High School (SRNHS) — Automated Gate Turnstile Engine
Biometric Edge Ingestion & Recognition Node
==============================================================================
  - Computer Vision: OpenCV FaceDetectorYN (YuNet)
  - Biometric Model: OpenCV FaceRecognizerSF (SFace / FaceNet-class 128D)
  - Matching: Cosine similarity with uniqueness margin
==============================================================================
"""

import os
import sys
import time
import json
import argparse
from typing import Dict, List, Optional, Tuple, Any

import cv2
import numpy as np
import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from local_sms_gateway import send_sms, build_attendance_message
from sms_hook import notify_recognition


DEFAULT_CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
DEFAULT_GATE_ID = os.getenv("GATE_ID", "Gate-01 (Main Turnstile)")
DEFAULT_EVENT_TYPE = os.getenv("EVENT_TYPE", "entry")
SIMILARITY_THRESHOLD = float(os.getenv("COSINE_SIMILARITY_THRESHOLD", "0.47"))
AMBIGUITY_MARGIN = float(os.getenv("COSINE_AMBIGUITY_MARGIN", "0.08"))
PROCESS_EVERY_N_FRAMES = int(os.getenv("PROCESS_EVERY_N_FRAMES", "2"))
DETECT_WIDTH = int(os.getenv("DETECT_WIDTH", "640"))

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL", os.getenv("SUPABASE_URL", ""))
SUPABASE_ANON_KEY = os.getenv("VITE_SUPABASE_ANON_KEY", os.getenv("SUPABASE_ANON_KEY", ""))
SUPABASE_READ_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_ANON_KEY)

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
YUNET_PATH = os.path.join(MODELS_DIR, "face_detection_yunet_2023mar.onnx")
SFACE_PATH = os.path.join(MODELS_DIR, "face_recognition_sface_2021dec.onnx")
YUNET_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
SFACE_URL = "https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx"


class CLAHEPreprocessor:
    def __init__(self, clip_limit: float = 2.0, tile_grid_size: Tuple[int, int] = (8, 8)):
        self.clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)

    def process(self, bgr_image: np.ndarray) -> np.ndarray:
        if bgr_image is None or bgr_image.size == 0:
            return bgr_image
        lab = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2LAB)
        l_channel, a_channel, b_channel = cv2.split(lab)
        equalized_l = self.clahe.apply(l_channel)
        merged_lab = cv2.merge((equalized_l, a_channel, b_channel))
        return cv2.cvtColor(merged_lab, cv2.COLOR_LAB2BGR)


class CosineSimilarityEngine:
    @staticmethod
    def compute_similarity(vector_a: np.ndarray, vector_b: np.ndarray) -> float:
        a = np.asarray(vector_a, dtype=np.float32).flatten()
        b = np.asarray(vector_b, dtype=np.float32).flatten()
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        similarity = np.dot(a, b) / (norm_a * norm_b)
        return float(np.clip(similarity, -1.0, 1.0))


def download_model(url: str, dest: str) -> bool:
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 10_000:
        return True
    print(f"[TurnstileNode] Downloading OpenCV model: {os.path.basename(dest)}")
    try:
        with requests.get(url, stream=True, timeout=60) as resp:
            resp.raise_for_status()
            with open(dest, "wb") as handle:
                for chunk in resp.iter_content(chunk_size=8192):
                    if chunk:
                        handle.write(chunk)
        return os.path.exists(dest) and os.path.getsize(dest) > 10_000
    except Exception as exc:
        print(f"[TurnstileNode] Model download warning: {exc}")
        return False


class OpenCvFaceNetEngine:
    """
    OpenCV YuNet detector + SFace (FaceNet-class) 128D embeddings.
    Detection runs on a downscaled frame so the live preview stays smooth.
    """

    def __init__(self):
        self.detector = None
        self.recognizer = None
        self.haar = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
        self._load()

    def _load(self) -> None:
        yunet_ok = download_model(YUNET_URL, YUNET_PATH)
        sface_ok = download_model(SFACE_URL, SFACE_PATH)
        if yunet_ok and hasattr(cv2, "FaceDetectorYN"):
            try:
                self.detector = cv2.FaceDetectorYN.create(YUNET_PATH, "", (DETECT_WIDTH, DETECT_WIDTH), 0.7, 0.3, 5000)
            except Exception as exc:
                print(f"[TurnstileNode] YuNet init warning: {exc}")
        if sface_ok and hasattr(cv2, "FaceRecognizerSF"):
            try:
                self.recognizer = cv2.FaceRecognizerSF.create(SFACE_PATH, "")
            except Exception as exc:
                print(f"[TurnstileNode] SFace init warning: {exc}")

        if self.detector is None:
            print("[TurnstileNode] Using Haar fallback detector. Install OpenCV 4.8+ for YuNet accuracy.")
        if self.recognizer is None:
            print("[TurnstileNode] SFace model missing — matching disabled until the OpenCV FaceNet model is available.")

    def detect(self, frame: np.ndarray) -> List[Tuple[int, int, int, int, np.ndarray]]:
        h, w = frame.shape[:2]
        scale = DETECT_WIDTH / float(max(w, 1))
        if scale > 1:
            scale = 1.0
        small = cv2.resize(frame, (max(1, int(w * scale)), max(1, int(h * scale)))) if scale < 1 else frame
        faces: List[Tuple[int, int, int, int, np.ndarray]] = []

        if self.detector is not None:
            self.detector.setInputSize((small.shape[1], small.shape[0]))
            _, detections = self.detector.detect(small)
            if detections is not None:
                for det in detections:
                    x, y, bw, bh = det[:4]
                    x = int(max(0, x / scale))
                    y = int(max(0, y / scale))
                    bw = int(bw / scale)
                    bh = int(bh / scale)
                    if bw < 80 or bh < 80:
                        continue
                    face_row = det.copy()
                    face_row[:4] = [x, y, bw, bh]
                    # YuNet landmarks are still in the downscaled frame. Map
                    # them to the original frame before SFace alignCrop().
                    face_row[4:14] = face_row[4:14] / scale
                    faces.append((x, y, bw, bh, face_row))
            return faces

        gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
        boxes = self.haar.detectMultiScale(gray, scaleFactor=1.2, minNeighbors=6, minSize=(70, 70))
        for (x, y, bw, bh) in boxes:
            x = int(x / scale)
            y = int(y / scale)
            bw = int(bw / scale)
            bh = int(bh / scale)
            if bw >= 80 and bh >= 80:
                faces.append((x, y, bw, bh, np.array([x, y, bw, bh], dtype=np.float32)))
        return faces

    def embed(self, frame: np.ndarray, face_row: np.ndarray) -> Optional[np.ndarray]:
        if self.recognizer is None or face_row is None or len(face_row) < 4:
            return None
        try:
            aligned = self.recognizer.alignCrop(frame, face_row)
            feature = self.recognizer.feature(aligned)
            vec = np.asarray(feature, dtype=np.float32).flatten()
            norm = np.linalg.norm(vec)
            if norm > 1e-6:
                vec = vec / norm
            return vec
        except Exception:
            return None


class TurnstileGateClient:
    def __init__(self, camera_index: int = DEFAULT_CAMERA_INDEX, gate_id: str = DEFAULT_GATE_ID):
        self.camera_index = camera_index
        self.gate_id = gate_id
        self.clahe = CLAHEPreprocessor()
        self.engine = OpenCvFaceNetEngine()
        self.similarity_engine = CosineSimilarityEngine()
        self.enrolled_roster: Dict[str, dict] = {}
        self.last_scan_times: Dict[str, float] = {}
        self.dedup_cooldown_seconds = 30.0
        self.unidentified_cooldown_seconds = 15.0
        self.recent_unidentified: List[Dict[str, Any]] = []
        self.load_enrolled_students()

    def upload_unidentified_capture(self, face_image: np.ndarray, prefix: str = "unidentified") -> Optional[str]:
        """
        Uploads face crop JPEG to private Supabase Storage bucket 'unidentified-captures'.
        Returns storage path (e.g. 'unidentified/20260927_120000_abc123.jpg') or None on failure.
        """
        if not (SUPABASE_URL and SUPABASE_ANON_KEY) or face_image is None or face_image.size == 0:
            return None
        try:
            ok, buf = cv2.imencode(".jpg", face_image, [cv2.IMWRITE_JPEG_QUALITY, 85])
            if not ok:
                return None
            jpeg_bytes = buf.tobytes()
            timestamp_str = time.strftime("%Y%m%d_%H%M%S")
            rand_suffix = os.urandom(4).hex()
            file_path = f"{prefix}/{timestamp_str}_{rand_suffix}.jpg"

            url = f"{SUPABASE_URL}/storage/v1/object/unidentified-captures/{file_path}"
            headers = {
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                "Content-Type": "image/jpeg",
                "x-upsert": "true",
            }
            res = requests.post(url, data=jpeg_bytes, headers=headers, timeout=5)
            if res.status_code in (200, 201):
                return file_path
            else:
                print(f"[TurnstileNode] Image upload note (status {res.status_code}): {res.text[:100]}")
                return None
        except Exception as exc:
            print(f"[TurnstileNode] Image upload warning: {exc}")
            return None


    def load_enrolled_students(self):
        print("[TurnstileNode] Fetching enrolled student roster...")
        cache_path = os.path.join(os.path.dirname(__file__), "students_cache.json")
        self.enrolled_roster = {}

        if SUPABASE_URL and SUPABASE_READ_KEY:
            try:
                response = requests.get(
                    f"{SUPABASE_URL}/rest/v1/students",
                    params={
                        "select": "id,lrn,first_name,last_name,guardian_phone,face_descriptors,face_descriptor_version",
                        "face_descriptors": "not.is.null",
                    },
                    headers={
                        "apikey": SUPABASE_READ_KEY,
                        "Authorization": f"Bearer {SUPABASE_READ_KEY}",
                    },
                    timeout=5,
                )
                response.raise_for_status()
                for item in response.json():
                    descriptors = item.get("face_descriptors") or []
                    if not descriptors or item.get("face_descriptor_version") != 2:
                        continue
                    vec = np.asarray(descriptors[0], dtype=np.float32).flatten()
                    if vec.size < 32:
                        continue
                    vec = vec / (np.linalg.norm(vec) or 1.0)
                    self.enrolled_roster[item["id"]] = {
                        "name": f'{item.get("first_name", "")} {item.get("last_name", "")}'.strip() or "Unknown",
                        "lrn": item.get("lrn", "N/A"),
                        "guardian_phone": item.get("guardian_phone", ""),
                        "vector": vec,
                    }
                print(f"[TurnstileNode] Loaded {len(self.enrolled_roster)} embedding(s) from Supabase.")
            except Exception as exc:
                print(f"[TurnstileNode] Supabase roster warning: {exc}")

        if not self.enrolled_roster and os.path.exists(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                for item in data:
                    vec = np.array(item.get("embedding") or item.get("faceDescriptors", [[]])[0], dtype=np.float32)
                    if vec.size < 32:
                        continue
                    vec = vec / (np.linalg.norm(vec) or 1.0)
                    self.enrolled_roster[item["id"]] = {
                        "name": item.get("name", "Unknown"),
                        "lrn": item.get("student_number", "N/A"),
                        "vector": vec,
                    }
                print(f"[TurnstileNode] Loaded {len(self.enrolled_roster)} embedding(s) from local cache.")
            except Exception as exc:
                print(f"[TurnstileNode] Cache load warning: {exc}")

        if SUPABASE_URL and SUPABASE_READ_KEY and not self.enrolled_roster:
            print("[TurnstileNode] No cloud FaceNet embeddings. Matching stays idle until a student is registered.")

    def match_face(self, live_vector: np.ndarray) -> Tuple[str, Optional[str], float, List[Dict[str, Any]]]:
        """
        Matches a live face vector against enrolled roster.
        Returns:
            outcome: 'matched' | 'unidentified' | 'ambiguous'
            matched_id: student ID if matched, else None
            top_similarity: float
            candidates: list of candidate profiles (for ambiguous matches)
        """
        ranked: List[Tuple[str, float]] = []
        for student_id, profile in self.enrolled_roster.items():
            sim = self.similarity_engine.compute_similarity(live_vector, profile["vector"])
            ranked.append((student_id, sim))
        ranked.sort(key=lambda item: item[1], reverse=True)
        if not ranked:
            return "unidentified", None, 0.0, []

        best_id, best_sim = ranked[0]
        second_sim = ranked[1][1] if len(ranked) > 1 else -1.0

        if best_sim < SIMILARITY_THRESHOLD:
            return "unidentified", None, best_sim, []

        if second_sim >= 0 and (best_sim - second_sim) < AMBIGUITY_MARGIN:
            candidates = [
                {
                    "student_id": ranked[0][0],
                    "student_name": self.enrolled_roster[ranked[0][0]]["name"],
                    "lrn": self.enrolled_roster[ranked[0][0]]["lrn"],
                    "similarity": round(ranked[0][1], 4),
                },
                {
                    "student_id": ranked[1][0],
                    "student_name": self.enrolled_roster[ranked[1][0]]["name"],
                    "lrn": self.enrolled_roster[ranked[1][0]]["lrn"],
                    "similarity": round(ranked[1][1], 4),
                },
            ]
            return "ambiguous", None, best_sim, candidates

        return "matched", best_id, best_sim, []

    def dispatch_attendance_log(self, student_id: str, confidence: float):
        now = time.time()
        last_time = self.last_scan_times.get(student_id, 0.0)
        if (now - last_time) < self.dedup_cooldown_seconds:
            return

        self.last_scan_times[student_id] = now
        profile = self.enrolled_roster.get(student_id, {})
        student_name = profile.get("name", "Unknown")
        lrn = profile.get("lrn", "N/A")

        print("\n=======================================================")
        print(f" [BIOMETRIC MATCH CONFIRMED] — {self.gate_id}")
        print(f" Student:    {student_name} (LRN: {lrn})")
        print(f" Cosine Sim: {confidence * 100:.2f}%")
        print(f" Timestamp:  {time.strftime('%Y-%m-%d %H:%M:%S')}")
        print("=======================================================\n")

        if SUPABASE_URL and SUPABASE_ANON_KEY:
            iso_now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            try:
                headers = {
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                }
                # 1. Post to recognition_events (primary real-time event log)
                rec_payload = {
                    "student_id": student_id,
                    "event_type": DEFAULT_EVENT_TYPE,
                    "gate": self.gate_id,
                    "confidence_score": round(confidence, 4),
                    "top_similarity_score": round(confidence, 4),
                    "status": "matched",
                    "source": "camera",
                    "captured_at": iso_now,
                }
                requests.post(f"{SUPABASE_URL}/rest/v1/recognition_events", json=rec_payload, headers=headers, timeout=3)

                # 2. Legacy gate_logs table fallback
                gate_payload = {
                    "student_id": student_id,
                    "event_type": DEFAULT_EVENT_TYPE,
                    "gate": self.gate_id,
                    "confidence": round(confidence, 4),
                    "timestamp": iso_now,
                }
                requests.post(f"{SUPABASE_URL}/rest/v1/gate_logs", json=gate_payload, headers=headers, timeout=3)
            except Exception as ex:
                print(f"[TurnstileNode] Supabase logging warning: {ex}")

        # --- Local Android SMS Gateway dispatch (non-blocking) ---
        guardian_phone = profile.get("guardian_phone", "")
        if guardian_phone:
            sms_text = build_attendance_message(student_name, lrn, DEFAULT_EVENT_TYPE, self.gate_id)
            sms_ok, sms_err = send_sms(guardian_phone, sms_text)
            sms_status = "sent" if sms_ok else "failed"
            if not sms_ok:
                print(f"[SMS] Dispatch failed for {student_name}: {sms_err}")

            if SUPABASE_URL and SUPABASE_ANON_KEY:
                try:
                    sms_log_headers = {
                        "apikey": SUPABASE_ANON_KEY,
                        "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                        "Content-Type": "application/json",
                        "Prefer": "return=minimal",
                    }
                    sms_log_payload = {
                        "student_id": student_id,
                        "phone_number": guardian_phone,
                        "message": sms_text,
                        "event_type": DEFAULT_EVENT_TYPE,
                        "status": sms_status,
                        "sent_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    }
                    requests.post(
                        f"{SUPABASE_URL}/rest/v1/sms_notifications",
                        json=sms_log_payload,
                        headers=sms_log_headers,
                        timeout=3,
                    )
                except Exception as sms_log_exc:
                    print(f"[SMS] Audit log warning: {sms_log_exc}")

        # Temporary SMSGate recognition hook (feature-flagged)
        notify_recognition(student_id, student_name.split()[0] if student_name else "Student", DEFAULT_EVENT_TYPE, now)

    def dispatch_unidentified_log(
        self,
        outcome: str,
        similarity: float,
        live_vector: np.ndarray,
        face_crop: Optional[np.ndarray],
        candidates: List[Dict[str, Any]],
    ):
        """
        Logs unidentified or ambiguous faces for security review.
        Applies a 15-second embedding similarity cooldown to deduplicate lingering faces.
        NEVER triggers SMS gateway, NEVER marks attendance.
        """
        now = time.time()
        # Clean expired records (>15s cooldown)
        self.recent_unidentified = [
            item for item in self.recent_unidentified
            if (now - item["timestamp"]) < self.unidentified_cooldown_seconds
        ]

        # Deduplication check: compare against recent embeddings
        for item in self.recent_unidentified:
            cos_sim = self.similarity_engine.compute_similarity(live_vector, item["vector"])
            if cos_sim >= 0.65:
                # Same individual lingering in front of sensor — suppress duplicate
                return

        self.recent_unidentified.append({"vector": live_vector, "timestamp": now})

        print("\n-------------------------------------------------------")
        print(f" [SECURITY LOG: {outcome.upper()} FACE DETECTED] — {self.gate_id}")
        print(f" Outcome:    {outcome}")
        print(f" Top Score:  {similarity * 100:.2f}%")
        if candidates:
            print(f" Candidates: {len(candidates)} ambiguous match(es)")
        print(f" Timestamp:  {time.strftime('%Y-%m-%d %H:%M:%S')}")
        print("-------------------------------------------------------\n")

        # Upload face crop to Supabase Storage
        captured_image_path = None
        if face_crop is not None and face_crop.size > 0:
            captured_image_path = self.upload_unidentified_capture(face_crop, prefix=outcome)

        # Log to Supabase recognition_events
        if SUPABASE_URL and SUPABASE_ANON_KEY:
            try:
                headers = {
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                }
                payload = {
                    "student_id": None,
                    "event_type": DEFAULT_EVENT_TYPE,
                    "gate": self.gate_id,
                    "confidence_score": round(similarity, 4),
                    "top_similarity_score": round(similarity, 4),
                    "status": outcome,
                    "candidate_student_ids": candidates if candidates else [],
                    "captured_image_path": captured_image_path,
                    "source": "camera",
                    "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
                requests.post(f"{SUPABASE_URL}/rest/v1/recognition_events", json=payload, headers=headers, timeout=3)
            except Exception as ex:
                print(f"[TurnstileNode] Unidentified logging warning: {ex}")

    def run(self):
        print(f"[TurnstileNode] Opening camera sensor index {self.camera_index}...")
        cap = cv2.VideoCapture(self.camera_index, cv2.CAP_DSHOW if os.name == "nt" else cv2.CAP_ANY)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        cap.set(cv2.CAP_PROP_FPS, 30)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        if not cap.isOpened():
            print(f"[TurnstileNode] Failed to open camera sensor {self.camera_index}.")
            sys.exit(1)

        print("[TurnstileNode] Video stream active. Press 'q' to quit, 's' to reload roster.")
        fps_timer = time.time()
        frame_counter = 0
        current_fps = 0.0
        frame_index = 0
        last_faces: List[Tuple[int, int, int, int, str, Optional[str], float]] = []

        try:
            while True:
                ret, frame = cap.read()
                if not ret or frame is None:
                    time.sleep(0.01)
                    continue

                frame_counter += 1
                frame_index += 1
                if time.time() - fps_timer >= 1.0:
                    current_fps = frame_counter / (time.time() - fps_timer)
                    frame_counter = 0
                    fps_timer = time.time()

                if frame_index % PROCESS_EVERY_N_FRAMES == 0:
                    normalized = self.clahe.process(frame)
                    detections = self.engine.detect(normalized)
                    overlay = []
                    fh, fw = frame.shape[:2]
                    for (x, y, w, h, face_row) in detections:
                        live_vector = self.engine.embed(normalized, face_row)
                        if live_vector is None:
                            overlay.append((x, y, w, h, "unidentified", None, 0.0))
                            continue

                        outcome, matched_id, similarity, candidates = self.match_face(live_vector)

                        # Extract padded crop for security capture if unidentified or ambiguous
                        pad_x = int(w * 0.15)
                        pad_y = int(h * 0.15)
                        face_crop = frame[
                            max(0, y - pad_y):min(fh, y + h + pad_y),
                            max(0, x - pad_x):min(fw, x + w + pad_x)
                        ].copy()

                        if outcome == "matched" and matched_id:
                            self.dispatch_attendance_log(matched_id, similarity)
                        else:
                            self.dispatch_unidentified_log(outcome, similarity, live_vector, face_crop, candidates)

                        overlay.append((x, y, w, h, outcome, matched_id, similarity))
                    last_faces = overlay

                for (x, y, w, h, outcome, matched_id, similarity) in last_faces:
                    if outcome == "matched" and matched_id:
                        student_name = self.enrolled_roster.get(matched_id, {}).get("name", "Student")
                        box_color = (0, 230, 70)
                        label = f"{student_name} ({similarity * 100:.1f}%)"
                    elif outcome == "ambiguous":
                        box_color = (0, 190, 255)
                        label = f"Ambiguous ({similarity * 100:.1f}%)"
                    else:
                        box_color = (0, 80, 255)
                        label = f"Unidentified ({max(0.0, similarity) * 100:.1f}%)"
                    cv2.rectangle(frame, (x, y), (x + w, y + h), box_color, 2)
                    cv2.rectangle(frame, (x, y - 28), (x + w, y), box_color, cv2.FILLED)
                    cv2.putText(frame, label, (x + 6, y - 8), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

                diag_text = (
                    f"SRNHS Gate | FPS: {current_fps:.1f} | OpenCV FaceNet | "
                    f"Enrolled: {len(self.enrolled_roster)}"
                )
                cv2.putText(frame, diag_text, (18, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                cv2.imshow("SRNHS Turnstile Biometric Monitor (OpenCV FaceNet)", frame)

                key = cv2.waitKey(1) & 0xFF
                if key == ord("q"):
                    break
                if key == ord("s"):
                    self.load_enrolled_students()
        finally:
            cap.release()
            cv2.destroyAllWindows()
            print("[TurnstileNode] Turnstile optical camera stream terminated.")


def main():
    parser = argparse.ArgumentParser(description="SRNHS Turnstile Biometric Edge Engine (OpenCV + FaceNet)")
    parser.add_argument("--camera", type=int, default=DEFAULT_CAMERA_INDEX, help="Webcam device index (default: 0)")
    parser.add_argument("--gate", type=str, default=DEFAULT_GATE_ID, help="Gate identifier name")
    args = parser.parse_args()
    TurnstileGateClient(camera_index=args.camera, gate_id=args.gate).run()


if __name__ == "__main__":
    main()
