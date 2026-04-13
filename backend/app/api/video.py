# backend/app/api/video.py
# Video upload and analysis result endpoints

import os
import uuid
import json
import base64
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Depends, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import cv2
import numpy as np

from app.core.config import settings
from app.core.database import get_db
from app.core.auth import get_current_user_optional
from app.models.db_models import AnalysisJob
from app.models.schemas import (
    UploadVideoResponse, VideoAnalysisResult, FormMistake,
    FrameAnalysisRequest, FrameAnalysisResponse, KeypointResult,
)
from app.services.video_processor import process_video_job
from app.ml.pose_detector import PoseDetector
from app.ml.exercise_analyzer import EXERCISES, analyze_frame

router = APIRouter()

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm"}
MAX_BYTES = settings.MAX_VIDEO_SIZE_MB * 1024 * 1024


@router.post("/upload-video", response_model=UploadVideoResponse)
async def upload_video(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    exercise_hint: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
    user_id: str | None = Depends(get_current_user_optional),
):
    """
    Upload a workout video for server-side analysis.
    Returns a job_id immediately; poll /results/{job_id} for completion.
    """
    # Validate extension
    suffix = Path(file.filename or "video.mp4").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"File type '{suffix}' not supported. Use MP4, MOV, AVI, MKV, or WebM.")

    # Read with size limit
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(413, f"File too large. Maximum {settings.MAX_VIDEO_SIZE_MB} MB allowed.")

    if len(content) < 1024:
        raise HTTPException(400, "File appears empty or corrupt.")

    # Save to disk
    job_id = str(uuid.uuid4())
    filename = f"{job_id}{suffix}"
    file_path = os.path.join(settings.UPLOAD_DIR, filename)

    with open(file_path, "wb") as f:
        f.write(content)

    # Validate exercise hint
    validated_hint = None
    if exercise_hint and exercise_hint in EXERCISES:
        validated_hint = exercise_hint

    # Create DB record
    job = AnalysisJob(
        id=job_id,
        user_id=user_id,
        status="queued",
        file_path=file_path,
        file_name=file.filename or filename,
        exercise_hint=validated_hint,
        created_at=datetime.utcnow(),
    )
    db.add(job)
    await db.commit()

    # Kick off background processing
    background_tasks.add_task(_process_in_background, job_id, file_path)

    return UploadVideoResponse(
        job_id=job_id,
        status="queued",
        message="Video received. Analysis starting — poll /results/{job_id} for updates.",
    )


async def _process_in_background(job_id: str, file_path: str) -> None:
    """Wrapper that opens its own DB session for background processing."""
    from app.core.database import AsyncSessionLocal
    from app.services.video_processor import process_video_job

    async with AsyncSessionLocal() as session:
        await process_video_job(job_id, session)


@router.get("/results/{job_id}", response_model=VideoAnalysisResult)
async def get_results(
    job_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Poll analysis status and retrieve results when complete."""
    result = await db.execute(select(AnalysisJob).where(AnalysisJob.id == job_id))
    job: AnalysisJob | None = result.scalar_one_or_none()

    if not job:
        raise HTTPException(404, f"Job '{job_id}' not found.")

    mistakes: list[FormMistake] = []
    suggestions: list[str] = []

    if job.status == "complete":
        try:
            raw_mistakes = json.loads(job.mistakes_json or "[]")
            mistakes = [FormMistake(**m) for m in raw_mistakes]
        except Exception:
            pass
        try:
            suggestions = json.loads(job.suggestions_json or "[]")
        except Exception:
            pass

    return VideoAnalysisResult(
        job_id=job.id,
        status=job.status,
        exercise=job.exercise,
        exercise_confidence=job.exercise_confidence,
        rep_count=job.rep_count,
        form_score=job.form_score,
        duration_seconds=job.duration_seconds,
        mistakes=mistakes,
        suggestions=suggestions,
        processing_time_ms=job.processing_time_ms,
        error=job.error_message,
    )


@router.post("/analyze-frame", response_model=FrameAnalysisResponse)
async def analyze_single_frame(body: FrameAnalysisRequest):
    """
    Analyze a single base64-encoded frame.
    Fallback endpoint for when on-device inference isn't available.
    Designed for occasional use — not suitable for continuous 30fps streaming.
    """
    # Decode base64 image
    try:
        img_bytes = base64.b64decode(body.image)
        np_arr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("Could not decode image")
    except Exception:
        raise HTTPException(400, "Invalid base64 image data.")

    detector = PoseDetector()
    try:
        keypoints = detector.detect(frame)
    finally:
        detector.close()

    if not keypoints:
        return FrameAnalysisResponse(keypoints=[], violations=[], confidence=0.0)

    kp_map = detector.keypoints_to_map(keypoints)

    violations: list[FormMistake] = []
    exercise_id = body.exercise
    confidence = 0.0

    if exercise_id and exercise_id in EXERCISES:
        exercise_def = EXERCISES[exercise_id]
        result = analyze_frame(kp_map, exercise_def)
        violations = [
            FormMistake(
                type=v.joint,
                severity=v.severity,
                description=v.feedback,
                frames=[v.frame_index],
                timestamp_seconds=[v.timestamp_seconds],
            )
            for v in result.violations
        ]
        confidence = 1.0 - (len(violations) * 0.1)

    return FrameAnalysisResponse(
        keypoints=[
            KeypointResult(name=kp.name, x=kp.x, y=kp.y, z=kp.z, score=kp.score)
            for kp in keypoints
        ],
        violations=violations,
        exercise=exercise_id,
        confidence=max(0.0, confidence),
    )