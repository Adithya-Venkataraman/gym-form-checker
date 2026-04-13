# backend/app/core/config.py

from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Gym Form Checker API"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./gymform.db"

    # Storage
    UPLOAD_DIR: str = "./uploads"
    MAX_VIDEO_SIZE_MB: int = 100

    # Auth
    SECRET_KEY: str = "change-me-in-production-use-a-long-random-string"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    ALGORITHM: str = "HS256"

    # ML
    MEDIAPIPE_MODEL_COMPLEXITY: int = 1    # 0=lite, 1=full, 2=heavy
    FRAME_SKIP: int = 3                    # process every Nth frame for video
    MIN_DETECTION_CONFIDENCE: float = 0.5
    MIN_TRACKING_CONFIDENCE: float = 0.5

    # Processing
    MAX_VIDEO_DURATION_SECONDS: int = 300  # 5 minutes max

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()