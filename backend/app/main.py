# backend/app/main.py
# FastAPI application entry point

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.core.config import settings
from app.core.database import init_db
from app.api import video, exercises, history, auth, health


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    # Create upload directory
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    os.makedirs(f"{settings.UPLOAD_DIR}/thumbnails", exist_ok=True)

    # Initialize DB tables
    await init_db()

    print("✅ Gym Form Checker API ready")
    yield
    print("⏹ Shutting down")


app = FastAPI(
    title="Gym Form Checker API",
    description="Real-time exercise form analysis using computer vision",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow Expo/mobile clients
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for thumbnails
if os.path.exists(settings.UPLOAD_DIR):
    app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Routers
app.include_router(health.router, prefix="/api/v1", tags=["health"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(video.router, prefix="/api/v1", tags=["video"])
app.include_router(exercises.router, prefix="/api/v1", tags=["exercises"])
app.include_router(history.router, prefix="/api/v1", tags=["history"])