# backend/app/services/video_processor.py
# Processes uploaded videos: extracts frames, runs pose detection, analyzes form

import cv2
import time
import json
from pathlib import Path
from typing import Optional
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.ml.pose_detector import PoseDetector
from app.ml.exercise_analyzer import (
    EXERCISES, ExerciseAutoDetector, RepCounter,
    analyze_frame, generate_suggestions, Violation,
)
from app.models.db_models import AnalysisJob


async def process_video_job(job_id: str, db: AsyncSession) -> None:
    """
    Main entry point for background video analysis.
    Called after upload completes — runs in a background task.
    """
    start_time = time.time()

    # Fetch job from DB
    result = await db.execute(select(AnalysisJob).where(AnalysisJob.id == job_id))
    job: Optional[AnalysisJob] = result.scalar_one_or_none()

    if not job:
        return

    # Mark as processing
    job.status = "processing"
    await db.commit()

    try:
        analysis = await _run_analysis(job.file_path, job.exercise_hint)

        # Write results back
        job.status = "complete"
        job.exercise = analysis["exercise"]
        job.exercise_confidence = analysis["exercise_confidence"]
        job.rep_count = analysis["rep_count"]
        job.form_score = analysis["form_score"]
        job.duration_seconds = analysis["duration_seconds"]
        job.mistakes_json = json.dumps(analysis["mistakes"])
        job.suggestions_json = json.dumps(analysis["suggestions"])
        job.processing_time_ms = int((time.time() - start_time) * 1000)
        job.completed_at = datetime.utcnow()

    except Exception as exc:
        job.status = "failed"
        job.error_message = str(exc)[:500]
        job.completed_at = datetime.utcnow()

    await db.commit()


async def _run_analysis(file_path: str, exercise_hint: Optional[str]) -> dict:
    """
    Core video analysis logic.
    Processes frames, detects exercise, counts reps, checks form.
    """
    cap = cv2.VideoCapture(file_path)

    if not cap.isOpened():
        raise ValueError(f"Cannot open video file: {file_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / fps
    frame_skip = settings.FRAME_SKIP

    # Clamp duration
    if duration > settings.MAX_VIDEO_DURATION_SECONDS:
        raise ValueError(f"Video too long: {duration:.0f}s (max {settings.MAX_VIDEO_DURATION_SECONDS}s)")

    # Resolve exercise
    exercise_def = None
    if exercise_hint and exercise_hint in EXERCISES:
        exercise_def = EXERCISES[exercise_hint]

    detector = PoseDetector()
    auto_detector = ExerciseAutoDetector(buffer_frames=60) if not exercise_def else None
    rep_counter: Optional[RepCounter] = None
    all_violations: list[Violation] = []
    form_scores: list[float] = []
    frame_index = 0
    processed_frames = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            frame_index += 1

            # Skip frames for performance
            if frame_index % frame_skip != 0:
                continue

            processed_frames += 1

            # Detect pose
            keypoints = detector.detect(frame)
            if not keypoints:
                continue

            kp_map = detector.keypoints_to_map(keypoints)

            # Auto-detect exercise if no hint given
            if auto_detector:
                auto_detector.process_frame(kp_map)

                # Try to lock in exercise after 60 processed frames
                if processed_frames == 60 or (not exercise_def and processed_frames > 30):
                    detected_id, confidence = auto_detector.detect()
                    if detected_id and confidence > 0.4:
                        exercise_def = EXERCISES[detected_id]
                        rep_counter = RepCounter(exercise_def.rep_logic)

            # Initialize rep counter once exercise is known
            if exercise_def and rep_counter is None:
                rep_counter = RepCounter(exercise_def.rep_logic)

            if not exercise_def or not rep_counter:
                continue

            # Count reps
            rep_count, phase, is_new_rep = rep_counter.process(kp_map)

            # Analyze form
            result = analyze_frame(
                kp_map,
                exercise_def,
                phase=phase,
                frame_index=frame_index,
                fps=fps,
            )

            form_scores.append(result.form_score)
            all_violations.extend(result.violations)

    finally:
        cap.release()
        detector.close()

    # Final exercise resolution
    detected_exercise_id = None
    exercise_confidence = 0.0

    if exercise_def:
        detected_exercise_id = exercise_def.id
        if exercise_hint:
            exercise_confidence = 0.99
        elif auto_detector:
            _, exercise_confidence = auto_detector.detect()

    # Aggregate mistakes
    mistakes = _aggregate_mistakes(all_violations)

    # Form score
    avg_form_score = (
        sum(form_scores) / len(form_scores) if form_scores else 0.0
    )

    # Suggestions
    suggestions = generate_suggestions(
        detected_exercise_id or "unknown",
        all_violations,
        rep_counter.count if rep_counter else 0,
        avg_form_score,
    )

    return {
        "exercise": detected_exercise_id,
        "exercise_confidence": round(exercise_confidence, 3),
        "rep_count": rep_counter.count if rep_counter else 0,
        "form_score": round(avg_form_score, 1),
        "duration_seconds": round(duration, 1),
        "mistakes": mistakes,
        "suggestions": suggestions,
    }


def _aggregate_mistakes(violations: list[Violation]) -> list[dict]:
    """
    Deduplicate and aggregate violations across all frames.
    Groups by joint+feedback, keeps most severe, records all frame timestamps.
    """
    grouped: dict[str, dict] = {}

    for v in violations:
        key = f"{v.joint}|{v.feedback}"
        if key not in grouped:
            grouped[key] = {
                "type": v.joint,
                "severity": v.severity,
                "description": v.feedback,
                "frames": [],
                "timestamp_seconds": [],
            }
        grouped[key]["frames"].append(v.frame_index)
        grouped[key]["timestamp_seconds"].append(v.timestamp_seconds)

    # Sort by severity
    severity_order = {"high": 3, "medium": 2, "low": 1}
    result = sorted(
        grouped.values(),
        key=lambda x: severity_order.get(x["severity"], 0),
        reverse=True,
    )

    # Cap lists to avoid huge payloads
    for m in result:
        m["frames"] = m["frames"][:20]
        m["timestamp_seconds"] = [round(t, 2) for t in m["timestamp_seconds"][:20]]

    return result[:10]  # return top 10 mistake types