# backend/tests/test_api.py
# Integration tests for Gym Form Checker API
# Run with: pytest tests/ -v

import pytest
import base64
import asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.fixture(scope="module")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture(scope="module")
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client


@pytest.fixture(scope="module")
async def auth_token(client):
    """Register a test user and return their token."""
    response = await client.post("/api/v1/auth/register", json={
        "email": "test@gymformchecker.test",
        "password": "testpassword123",
    })
    if response.status_code == 400:
        # Already registered — login instead
        response = await client.post("/api/v1/auth/login", json={
            "email": "test@gymformchecker.test",
            "password": "testpassword123",
        })
    assert response.status_code == 200
    return response.json()["access_token"]


class TestHealth:
    @pytest.mark.asyncio
    async def test_health_check(self, client):
        r = await client.get("/api/v1/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert "timestamp" in data


class TestAuth:
    @pytest.mark.asyncio
    async def test_register_new_user(self, client):
        import uuid
        email = f"newuser_{uuid.uuid4().hex[:8]}@test.com"
        r = await client.post("/api/v1/auth/register", json={
            "email": email,
            "password": "password123",
        })
        assert r.status_code == 200
        assert "access_token" in r.json()

    @pytest.mark.asyncio
    async def test_register_duplicate_fails(self, client, auth_token):
        r = await client.post("/api/v1/auth/register", json={
            "email": "test@gymformchecker.test",
            "password": "testpassword123",
        })
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client):
        r = await client.post("/api/v1/auth/login", json={
            "email": "test@gymformchecker.test",
            "password": "wrongpassword",
        })
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_short_password_rejected(self, client):
        r = await client.post("/api/v1/auth/register", json={
            "email": "short@test.com",
            "password": "short",
        })
        assert r.status_code == 422  # Pydantic validation


class TestExercises:
    @pytest.mark.asyncio
    async def test_list_exercises(self, client):
        r = await client.get("/api/v1/exercises")
        assert r.status_code == 200
        exercises = r.json()
        assert len(exercises) >= 5
        ids = [e["id"] for e in exercises]
        assert "squat" in ids
        assert "pushup" in ids
        assert "deadlift" in ids

    @pytest.mark.asyncio
    async def test_exercise_fields(self, client):
        r = await client.get("/api/v1/exercises")
        for ex in r.json():
            assert "id" in ex
            assert "name" in ex
            assert "preferred_view" in ex
            assert "key_joints" in ex


class TestHistory:
    @pytest.mark.asyncio
    async def test_history_requires_auth(self, client):
        r = await client.get("/api/v1/history")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_save_and_retrieve_workout(self, client, auth_token):
        headers = {"Authorization": f"Bearer {auth_token}"}

        # Save a workout
        r = await client.post("/api/v1/history", json={
            "exercise": "squat",
            "rep_count": 10,
            "form_score": 82.5,
            "duration_seconds": 45.0,
            "source": "live",
            "mistakes": [],
        }, headers=headers)
        assert r.status_code == 200
        workout = r.json()
        assert workout["exercise"] == "squat"
        assert workout["rep_count"] == 10

        # Retrieve history
        r = await client.get("/api/v1/history", headers=headers)
        assert r.status_code == 200
        history = r.json()
        assert len(history) >= 1
        assert any(w["exercise"] == "squat" for w in history)

    @pytest.mark.asyncio
    async def test_history_limit_param(self, client, auth_token):
        headers = {"Authorization": f"Bearer {auth_token}"}
        r = await client.get("/api/v1/history?limit=1", headers=headers)
        assert r.status_code == 200
        assert len(r.json()) <= 1


class TestVideoUpload:
    @pytest.mark.asyncio
    async def test_upload_bad_extension(self, client):
        r = await client.post(
            "/api/v1/upload-video",
            files={"file": ("workout.txt", b"not a video", "text/plain")},
        )
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_upload_empty_file(self, client):
        r = await client.post(
            "/api/v1/upload-video",
            files={"file": ("workout.mp4", b"", "video/mp4")},
        )
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_results_not_found(self, client):
        r = await client.get("/api/v1/results/nonexistent-job-id")
        assert r.status_code == 404


class TestFrameAnalysis:
    @pytest.mark.asyncio
    async def test_analyze_frame_bad_image(self, client):
        r = await client.post("/api/v1/analyze-frame", json={
            "image": "not-valid-base64!!!",
            "exercise": "squat",
        })
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_analyze_frame_blank_image(self, client):
        """A blank white image should return empty keypoints (no pose)."""
        import numpy as np
        import cv2

        blank = np.ones((480, 640, 3), dtype=np.uint8) * 255
        _, buf = cv2.imencode(".jpg", blank)
        b64 = base64.b64encode(buf.tobytes()).decode()

        r = await client.post("/api/v1/analyze-frame", json={
            "image": b64,
            "exercise": "squat",
        })
        assert r.status_code == 200
        data = r.json()
        assert "keypoints" in data
        assert isinstance(data["keypoints"], list)