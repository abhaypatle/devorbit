from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token, get_current_user, require_roles
from app.db.session import AsyncSessionLocal, get_db
from app.models.project import Project, ProjectMessage
from app.models.user import User
from app.schemas.project import ProjectMessageCreate, ProjectMessageRead

router = APIRouter()


class ProjectChatConnections:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, project_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[project_id].add(websocket)

    async def disconnect(self, project_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            self._connections[project_id].discard(websocket)
            if not self._connections[project_id]:
                self._connections.pop(project_id, None)

    async def broadcast(self, project_id: str, message: dict) -> None:
        async with self._lock:
            connections = tuple(self._connections.get(project_id, ()))
        stale: list[WebSocket] = []
        for connection in connections:
            try:
                await connection.send_json(message)
            except (RuntimeError, WebSocketDisconnect):
                stale.append(connection)
        for connection in stale:
            await self.disconnect(project_id, connection)


chat_connections = ProjectChatConnections()


async def _participant_project(
    project_id: str,
    current_user: User,
    db: AsyncSession,
) -> Project:
    project = await db.get(Project, project_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if current_user.role.value != "ADMIN" and current_user.id not in (
        project.client_id,
        project.assigned_developer_id,
    ):
        raise HTTPException(status_code=403, detail="Project participation required")
    return project


@router.post(
    "/projects/{project_id}/messages",
    response_model=ProjectMessageRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_project_message(
    project_id: str,
    payload: ProjectMessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProjectMessage:
    await _participant_project(project_id, current_user, db)
    message = ProjectMessage(
        project_id=project_id,
        sender_id=current_user.id,
        sender_name=current_user.full_name,
        sender_role=current_user.role.value,
        message_text=payload.message_text,
        attachment_url=str(payload.attachment_url) if payload.attachment_url else None,
        created_at=datetime.now().astimezone(),
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    await chat_connections.broadcast(
        project_id,
        ProjectMessageRead.model_validate(message).model_dump(mode="json"),
    )
    return message


@router.get("/projects/{project_id}/messages", response_model=list[ProjectMessageRead])
async def list_project_messages(
    project_id: str,
    limit: int = Query(default=100, ge=1, le=200),
    before: datetime | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProjectMessage]:
    await _participant_project(project_id, current_user, db)
    statement = select(ProjectMessage).where(ProjectMessage.project_id == project_id)
    if before is not None:
        statement = statement.where(ProjectMessage.created_at < before)
    result = await db.execute(
        statement.order_by(ProjectMessage.created_at.desc()).limit(limit)
    )
    return list(reversed(result.scalars().all()))


@router.websocket("/projects/{project_id}/messages/live")
async def project_message_socket(
    websocket: WebSocket,
    project_id: str,
    token: str = Query(...),
) -> None:
    try:
        claims = decode_access_token(token)
        user_id = claims.get("sub")
        if not isinstance(user_id, str):
            raise ValueError("Token missing subject")
    except ValueError:
        await websocket.close(code=4401)
        return

    async with AsyncSessionLocal() as db:
        user = await db.get(User, user_id)
        project = await db.get(Project, project_id)
        if user is None or project is None or (
            user.role.value != "ADMIN" and user.id not in (project.client_id, project.assigned_developer_id)
        ):
            await websocket.close(code=4403)
            return

    await chat_connections.connect(project_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await chat_connections.disconnect(project_id, websocket)
