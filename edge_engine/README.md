# SRNHS Turnstile Biometric Edge Engine

Automated Gate Turnstile Biometric Recognition Engine developed for **San Roque National High School (SRNHS)**.

This module implements the physical terminal edge biometric processing pipeline specified in **Chapter 3 (Development & Hardware Requirements)** and **System Architecture** of the Capstone / Thesis paper.

---

## 1. Thesis Paper Alignment Matrix

| Specification | Thesis Requirement | Implementation in `edge_engine/` |
| :--- | :--- | :--- |
| **Operating System** | Windows 10 / 11 (64-bit) | Native Windows support via OpenCV and Python 3.11. |
| **Scripting Runtime** | Python (ver. 3.11) | Written in Python 3.11 with strict typing. |
| **Computer Vision** | OpenCV (ver. 4.8+) | YuNet (`cv2.FaceDetectorYN`) on a 640px working frame, CLAHE lighting normalize, Haar fallback. |
| **Biometric Model** | FaceNet-class 128D | OpenCV SFace (`cv2.FaceRecognizerSF`) 128D embeddings. Unknown faces are not assigned to the nearest student. |
| **Similarity Metric** | Cosine Similarity Engine | Vector dot product: $\text{Cosine Similarity} = \frac{u \cdot v}{\|u\| \|v\|}$. |
| **Cloud BaaS** | Supabase PostgreSQL 15+ | HTTPS POST to Supabase REST API `/rest/v1/gate_logs`. |
| **Hardware** | 1080p Optical Sensor, i3/i5 CPU | Configured for 1920x1080 USB optical sensors. |

---

## 2. Mathematical Principles

### 2.1 Lighting & Alignment Normalization (CLAHE)
The engine converts incoming BGR webcam frames into the CIE $L^*a^*b^*$ color space. Contrast-Limited Adaptive Histogram Equalization (CLAHE) with a clip limit of $2.0$ is applied exclusively to the luminance ($L$) channel, dampening outdoor campus glare and backlight shadows while preserving skin chrominance ($a^*, b^*$).

### 2.2 128D Feature Vectors & Cosine Distance
Facial regions of interest are converted into **128-dimensional numerical biometric embeddings** ($u \in \mathbb{R}^{128}$).

Because all vectors are $L_2$-normalized ($\|u\|_2 = 1, \|v\|_2 = 1$), the cosine similarity corresponds directly to Euclidean distance:
$$\text{Cosine Similarity} = \cos(\theta) = \sum_{i=1}^{128} u_i v_i$$
$$\text{Cosine Distance} = 1 - \cos(\theta) = \frac{\|u - v\|_2^2}{2}$$

A student is confirmed when cosine similarity is at least `0.47` **and** the next-best student is at least `0.08` farther. Unknown faces stay unknown.

---

## 3. Installation & Execution

### Prerequisites
- Windows 10 or 11 (64-bit)
- Python 3.11 installed and added to PATH
- USB 1080p Webcam connected
- For cloud roster loading, set `SUPABASE_URL` and the server-only `SUPABASE_SERVICE_ROLE_KEY` in the edge-engine environment. Never expose the service-role key in the frontend.

### Steps

1. Open a terminal in this directory:
   ```bash
   cd "edge_engine"
   ```

2. (Optional) Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   .\venv\Scripts\activate
   ```

3. Install requirements:
   ```bash
   pip install -r requirements.txt
   ```

4. Run the gate recognition client:
   ```bash
   python gate_biometrics.py --camera 0 --gate "Gate-01 (Main Turnstile)"
   ```

### Key Controls
- Press **`q`** to safely close the optical camera stream.
- Press **`s`** to reload the student roster from Supabase or local cache.

The browser registration flow stores descriptors in the Supabase `students.face_descriptors` column. The local JSON cache is only a fallback when Supabase is unavailable.
