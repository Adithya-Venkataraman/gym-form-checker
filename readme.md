# 🏋️ Gym Form Checker

A complete mobile application for real-time exercise detection and form analysis using computer vision.

## System Overview

| Layer        | Tech                         | Mode            |
| ------------ | ---------------------------- | --------------- |
| Mobile App   | React Native + Expo          | iOS + Android   |
| On-Device ML | TensorFlow.js + MoveNet      | Offline, <200ms |
| Backend      | FastAPI + Python             | Upload analysis |
| Storage      | AsyncStorage + SQLite        | Local history   |
| Deployment   | Render (backend) + EAS (app) | Production      |

---

## Project Structure

```
gym-form-checker/
├── frontend/          # React Native Expo app
│   └── src/
│       ├── screens/   # App screens (Camera, Upload, Results, History)
│       ├── components/# Reusable UI + skeleton overlay
│       ├── hooks/     # usePoseDetection, useRepCounter, etc.
│       ├── utils/     # angle calculations, exercise rules
│       ├── services/  # API client, TTS, storage
│       └── config/    # Exercise definitions (modular system)
├── backend/           # FastAPI server
│   └── app/
│       ├── api/       # Route handlers
│       ├── ml/        # Pose detection pipeline
│       ├── models/    # Pydantic schemas
│       └── services/  # Video processing, storage
└── ml/                # Standalone ML utilities
    ├── exercises/     # Exercise configs (JSON)
    └── utils/         # Angle math, keypoint helpers
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.10+
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (optional, for builds)

---

## 1. Frontend Setup

```bash
cd frontend
npm install
npx expo start
```

Scan QR code with Expo Go app on your device.

**Environment variables** (create `frontend/.env`):

```
EXPO_PUBLIC_API_URL=https://your-backend.onrender.com
```

---

## 2. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Environment variables** (create `backend/.env`):

```
DATABASE_URL=sqlite:///./gymform.db
UPLOAD_DIR=./uploads
MAX_VIDEO_SIZE_MB=100
SECRET_KEY=your-secret-key-here
```

---

## 3. Deploy Backend to Render

1. Push backend/ to a GitHub repository
2. Create a new **Web Service** on [render.com](https://render.com)
3. Set build command: `pip install -r requirements.txt`
4. Set start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables from `.env`

---

## API Documentation

Once running, visit `http://localhost:8000/docs` for interactive Swagger UI.

### Endpoints

| Method | Path                       | Description                      |
| ------ | -------------------------- | -------------------------------- |
| POST   | `/api/v1/upload-video`     | Upload video for analysis        |
| GET    | `/api/v1/results/{job_id}` | Poll analysis results            |
| GET    | `/api/v1/exercises`        | List supported exercises         |
| POST   | `/api/v1/analyze-frame`    | Single frame analysis (fallback) |
| GET    | `/api/v1/history`          | Get workout history              |
| POST   | `/api/v1/auth/register`    | Register user                    |
| POST   | `/api/v1/auth/login`       | Login                            |

### Response Format

```json
{
  "job_id": "abc123",
  "status": "complete",
  "exercise": "squat",
  "confidence": 0.94,
  "rep_count": 12,
  "form_score": 78,
  "mistakes": [
    { "type": "knee_collapse", "severity": "high", "frames": [34, 67, 89] }
  ],
  "suggestions": ["Keep knees tracking over toes", "Go slightly deeper"],
  "keypoints_per_frame": []
}
```

---

## Supported Exercises

- **Squat** — knee angle, back angle, knee cave detection
- **Push-up** — elbow angle, body line, full extension
- **Deadlift** — spine neutrality, hip hinge, bar path
- **Lunge** — knee tracking, torso upright
- **Plank** — hip sag, body alignment
- _(Easily extendable via JSON config)_

---

## Key Features

- Real-time pose estimation (<200ms on device)
- Auto exercise detection (no manual selection)
- Rep counting via angle thresholds
- Color-coded skeleton overlay (green = correct, red = error)
- Voice feedback via TTS
- Camera position guidance
- Low lighting detection
- Multi-person: auto-selects primary subject
- Session history with progress tracking
- Demo mode with preloaded videos
- Full offline live detection
- Personalized calibration (height, difficulty)
- Confidence scoring

---

## Demo Mode

The app ships with 3 demo videos under `frontend/assets/demo/`:

- `demo_squat.mp4`
- `demo_pushup.mp4`
- `demo_deadlift.mp4`

Access via the **Demo** tab without requiring a camera.
