# backend/app/api/history.py

import json
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.database import get_db
from app.core.auth import get_current_user
from app.models.db_models import WorkoutSession
from app.models.schemas import SaveWorkoutRequest, WorkoutHistoryItem

router = APIRouter()


@router.get("/history", response_model=list[WorkoutHistoryItem])
async def get_history(
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Get workout history for the authenticated user."""
    result = await db.execute(
        select(WorkoutSession)
        .where(WorkoutSession.user_id == user_id)
        .order_by(desc(WorkoutSession.created_at))
        .limit(limit)
    )
    sessions = result.scalars().all()

    return [
        WorkoutHistoryItem(
            id=s.id,
            exercise=s.exercise,
            rep_count=s.rep_count,
            form_score=s.form_score,
            duration_seconds=s.duration_seconds,
            mistakes_count=len(json.loads(s.mistakes_json or "[]")),
            source=s.source,
            created_at=s.created_at,
        )
        for s in sessions
    ]


@router.post("/history", response_model=WorkoutHistoryItem)
async def save_workout(
    body: SaveWorkoutRequest,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Save a completed workout session."""
    session = WorkoutSession(
        user_id=user_id,
        exercise=body.exercise,
        rep_count=body.rep_count,
        form_score=body.form_score,
        duration_seconds=body.duration_seconds,
        mistakes_json=json.dumps([m.model_dump() for m in body.mistakes]),
        source=body.source,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)

    return WorkoutHistoryItem(
        id=session.id,
        exercise=session.exercise,
        rep_count=session.rep_count,
        form_score=session.form_score,
        duration_seconds=session.duration_seconds,
        mistakes_count=len(body.mistakes),
        source=session.source,
        created_at=session.created_at,
    )


@router.delete("/history/{session_id}", status_code=204)
async def delete_workout(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    result = await db.execute(
        select(WorkoutSession).where(
            WorkoutSession.id == session_id,
            WorkoutSession.user_id == user_id,
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(404, "Workout session not found.")

    await db.delete(session)
    await db.commit()