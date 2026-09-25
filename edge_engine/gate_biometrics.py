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
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np
import requests

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

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
        self.load_enrolled_students()

    def load_enrolled_students(self):
        print("[TurnstileNode] Fetching enrolled student roster...")
        cache_path = os.path.join(os.path.dirname(__file__), "students_cache.json")
        self.enrolled_roster = {}

        if SUPABASE_URL and SUPABASE_READ_KEY:
            try:
                response = requests.get(
                    f"{SUPABASE_URL}/rest/v1/students",
                    params={
                        "select": "id,lrn,first_name,last_name,face_descriptors,face_descriptor_version",
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

    def match_face(self, live_vector: np.ndarray) -> Tuple[Optional[str], float]:
        ranked: List[Tuple[str, float]] = []
        for student_id, profile in self.enrolled_roster.items():
            sim = self.similarity_engine.compute_similarity(live_vector, profile["vector"])
            ranked.append((student_id, sim))
        ranked.sort(key=lambda item: item[1], reverse=True)
        if not ranked:
            return None, 0.0

        best_id, best_sim = ranked[0]
        second_sim = ranked[1][1] if len(ranked) > 1 else -1.0
        if best_sim < SIMILARITY_THRESHOLD:
            return None, best_sim
        if second_sim >= 0 and (best_sim - second_sim) < AMBIGUITY_MARGIN:
            return None, best_sim
        return best_id, best_sim

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
            try:
                headers = {
                    "apikey": SUPABASE_ANON_KEY,
                    "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
                    "Content-Type": "application/json",
                    "Prefer": "return=minimal",
                }
                payload = {
                    "student_id": student_id,
                    "event_type": DEFAULT_EVENT_TYPE,
                    "gate": self.gate_id,
                    "confidence": round(confidence, 4),
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                }
                requests.post(f"{SUPABASE_URL}/rest/v1/gate_logs", json=payload, headers=headers, timeout=3)
            except Exception as ex:
                print(f"[TurnstileNode] Supabase logging warning: {ex}")

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
        last_faces: List[Tuple[int, int, int, int, Optional[str], float]] = []

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
                    for (x, y, w, h, face_row) in detections:
                        live_vector = self.engine.embed(normalized, face_row)
                        if live_vector is None:
                            overlay.append((x, y, w, h, None, 0.0))
                            continue
                        matched_id, similarity = self.match_face(live_vector)
                        if matched_id:
                            self.dispatch_attendance_log(matched_id, similarity)
                        overlay.append((x, y, w, h, matched_id, similarity))
                    last_faces = overlay

                for (x, y, w, h, matched_id, similarity) in last_faces:
                    if matched_id:
                        student_name = self.enrolled_roster[matched_id]["name"]
                        box_color = (0, 230, 70)
                        label = f"{student_name} ({similarity * 100:.1f}%)"
                    else:
                        box_color = (0, 165, 255)
                        label = f"Unknown ({max(0.0, similarity) * 100:.1f}%)"
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
