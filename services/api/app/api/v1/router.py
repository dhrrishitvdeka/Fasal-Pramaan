"""API v1 router aggregation."""

from fastapi import APIRouter

from app.api.v1 import admin, auth, dashboard, farms, reminders, review, sse, submissions, sync, voice

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(farms.router)
api_router.include_router(submissions.router)
api_router.include_router(review.router)
api_router.include_router(dashboard.router)
api_router.include_router(admin.router)
api_router.include_router(sync.router)
api_router.include_router(sse.router)
api_router.include_router(voice.router)
api_router.include_router(reminders.router)
