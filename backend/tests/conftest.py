# backend/tests/conftest.py

import pytest
import asyncio
from app.core.database import init_db


@pytest.fixture(scope="session", autouse=True)
async def setup_test_db():
    """Initialize in-memory test database before any tests run."""
    import os
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
    await init_db()
    yield