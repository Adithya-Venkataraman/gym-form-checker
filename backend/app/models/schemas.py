# backend/app/models/schemas.py
# Pydantic v2 request/response schemas

from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List
from datetime import datetime


# ── Auth ──────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ── Video upload ───────────────────────────────────────────────────────────────

class UploadVideoResponse(BaseModel):
    job_id: str
    status: str
    message: str


class FormMistake(BaseModel):
    type: str
    severity: str          # low / medium / high
    description: str
    frames: List[int] = []
    timestamp_seconds: List[float] = []


class VideoAnalysisResult(BaseModel):
    job_id: str
    status: str            # queued / processing / complete / failed
    exercise: Optional[str] = None
    exercise_confidence: float = 0.0
    rep_count: int = 0
    form_score: float = 0.0
    duration_seconds: float = 0.0
    mistakes: List[FormMistake] = []
    suggestions: List[str] = []
    processing_time_ms: int = 0
    error: Optional[str] = None


# ── Frame analysis ─────────────────────────────────────────────────────────────

class FrameAnalysisRequest(BaseModel):
    image: str             # base64-encoded JPEG/PNG
    exercise: Optional[str] = None


class KeypointResult(BaseModel):
    name: str
    x: float
    y: float
    z: Optional[float] = None
    score: float


class FrameAnalysisResponse(BaseModel):
    keypoints: List[KeypointResult]
    violations: List[FormMistake] = []
    exercise: Optional[str] = None
    confidence: float = 0.0


# ── Exercises ──────────────────────────────────────────────────────────────────

class ExerciseInfo(BaseModel):
    id: str
    name: str
    preferred_view: str
    key_joints: List[str]
    supported_difficulties: List[str]


# ── History ────────────────────────────────────────────────────────────────────

class SaveWorkoutRequest(BaseModel):
    exercise: str
    rep_count: int
    form_score: float
    duration_seconds: float
    mistakes: List[FormMistake] = []
    source: str = "live"


class WorkoutHistoryItem(BaseModel):
    id: str
    exercise: str
    rep_count: int
    form_score: float
    duration_seconds: float
    mistakes_count: int
    source: str
    created_at: datetime

    class Config:
        from_attributes = True