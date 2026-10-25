from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, select, text
from sqlalchemy.engine import Connection

from app.api.v1.api import router as api_router
from app.core.config import settings
from app.core.security import get_password_hash
from app.db.base import Base
from app.db.session import AsyncSessionLocal, engine
from app.models.user import Role, User


async def seed_admin() -> None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == "admin@devorbit.io"))
        if result.scalar_one_or_none() is None:
            admin = User(
                full_name="DevOrbit Admin",
                email="admin@devorbit.io",
                phone_number="+910000000000",
                password_hash=get_password_hash("admin123"),
                role=Role.ADMIN,
                skills=["Admin", "Operations"],
            )
            session.add(admin)
            await session.commit()


def ensure_workflow_schema(connection: Connection) -> None:
    timestamp_type = "TIMESTAMP WITH TIME ZONE" if connection.dialect.name == "postgresql" else "DATETIME"
    migrations = {
        "project_milestones": {
            "staging_url": "VARCHAR(255)",
            "github_url": "VARCHAR(255)",
            "client_rating": "INTEGER",
            "client_review": "TEXT",
            "sla_hours": "INTEGER NOT NULL DEFAULT 72",
            "due_at": timestamp_type,
            "escrow_locked": "BOOLEAN NOT NULL DEFAULT FALSE",
            "sla_breach_penalized": "BOOLEAN NOT NULL DEFAULT FALSE",
        },
        "project_change_requests": {
            "extra_developer_payout": "NUMERIC(10, 2) NOT NULL DEFAULT 0",
            "timeline_extension_days": "INTEGER NOT NULL DEFAULT 0",
            "status": "VARCHAR(20) NOT NULL DEFAULT 'PENDING'",
        },
        "maintenance_subscriptions": {
            "auto_debit_enabled": "BOOLEAN NOT NULL DEFAULT FALSE",
            "billing_status": "VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'",
        },
    }
    inspector = inspect(connection)
    for table_name, columns in migrations.items():
        if not inspector.has_table(table_name):
            continue
        existing = {column["name"] for column in inspector.get_columns(table_name)}
        for column_name, column_type in columns.items():
            if column_name not in existing:
                connection.execute(
                    text(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_type}")
                )


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(ensure_workflow_schema)
    await seed_admin()
    yield


app = FastAPI(title=settings.PROJECT_NAME, version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
