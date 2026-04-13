# backend/app/api/exercises.py

from fastapi import APIRouter
from app.models.schemas import ExerciseInfo
from app.ml.exercise_analyzer import EXERCISES

router = APIRouter()


@router.get("/exercises", response_model=list[ExerciseInfo])
async def list_exercises():
    """Return all supported exercises and their metadata."""
    return [
        ExerciseInfo(
            id=ex.id,
            name=ex.name,
            preferred_view=ex.preferred_view,
            key_joints=ex.key_joints,
            supported_difficulties=["beginner", "intermediate", "advanced"],
        )
        for ex in EXERCISES.values()
    ]