import os
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from db import (
    connect, init_db,
    get_user_by_username, get_user_by_email, create_user,
    set_user_email, insert_score, get_leaderboard,
    create_reset_token, get_reset_token, mark_token_used,
    update_password
)
from security import hash_password, verify_password, new_token, now_unix
from emailer import send_email

APP_TITLE = "Tetris Scoreboard API"

DB_PATH = os.getenv("DB_PATH", "./data/app.db")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

conn = connect(DB_PATH)
init_db(conn)

app = FastAPI(title=APP_TITLE)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if CORS_ORIGINS == "*" else [o.strip() for o in CORS_ORIGINS.split(",")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------- Schemas ---------
class SubmitScoreIn(BaseModel):
    game: str = Field(default="tetris", min_length=1, max_length=32)
    score: int = Field(ge=0, le=10_000_000)
    username: str = Field(min_length=2, max_length=20)
    password: str = Field(min_length=6, max_length=128)
    email: Optional[str] = Field(default=None, max_length=254)

class LinkEmailIn(BaseModel):
    username: str = Field(min_length=2, max_length=20)
    password: str = Field(min_length=6, max_length=128)
    email: str = Field(min_length=3, max_length=254)

class RequestResetIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)

class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=10, max_length=256)
    new_password: str = Field(min_length=6, max_length=128)

class RecoverIdIn(BaseModel):
    email: str = Field(min_length=3, max_length=254)

# --------- Helpers ---------
def require_user(username: str, password: str):
    user = get_user_by_username(conn, username)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return user

# --------- Routes ---------
@app.get("/health")
def health():
    return {"ok": True}

@app.get("/api/leaderboard")
def api_leaderboard(game: str = "tetris", limit: int = 50):
    limit = max(1, min(limit, 200))
    return {"game": game, "items": get_leaderboard(conn, game, limit)}

@app.post("/api/score/submit")
def api_submit_score(payload: SubmitScoreIn):
    # 1) 既存なら認証、無ければ作成（メールは任意）
    user = get_user_by_username(conn, payload.username)
    if user:
        if not verify_password(payload.password, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")
    else:
        # email があれば重複チェック
        if payload.email:
            if get_user_by_email(conn, payload.email):
                raise HTTPException(status_code=400, detail="Email already in use")
        user = create_user(conn, payload.username, hash_password(payload.password), payload.email)

    # 2) スコア登録
    insert_score(conn, int(user["id"]), payload.game, payload.score)
    return {"ok": True}

@app.post("/api/auth/link_email")
def api_link_email(payload: LinkEmailIn):
    user = require_user(payload.username, payload.password)

    existing = get_user_by_email(conn, payload.email)
    if existing and int(existing["id"]) != int(user["id"]):
        raise HTTPException(status_code=400, detail="Email already in use")

    set_user_email(conn, int(user["id"]), payload.email)
    return {"ok": True}

@app.post("/api/auth/recover_id")
def api_recover_id(payload: RecoverIdIn):
    user = get_user_by_email(conn, payload.email)
    # メール有無で情報漏洩しないため常に ok
    if user:
        send_email(
            payload.email,
            "Your ID (username) on Tetris site",
            f"Your username is: {user['username']}\n\nIf you didn't request this, ignore this email."
        )
    return {"ok": True}

@app.post("/api/auth/request_reset")
def api_request_reset(payload: RequestResetIn):
    user = get_user_by_email(conn, payload.email)
    # 情報漏洩対策で常に ok
    if user:
        token = new_token()
        expires = now_unix() + 60 * 30  # 30分
        create_reset_token(conn, int(user["id"]), token, expires)

        reset_url = f"{PUBLIC_BASE_URL}/reset.html?token={token}"
        send_email(
            payload.email,
            "Password reset for Tetris site",
            f"Open this link to reset your password (valid 30 minutes):\n{reset_url}\n\nIf you didn't request this, ignore this email."
        )
    return {"ok": True}

@app.post("/api/auth/reset_password")
def api_reset_password(payload: ResetPasswordIn):
    t = get_reset_token(conn, payload.token)
    if not t:
        raise HTTPException(status_code=400, detail="Invalid token")
    if int(t["used"]) == 1:
        raise HTTPException(status_code=400, detail="Token already used")
    if now_unix() > int(t["expires_at_unix"]):
        raise HTTPException(status_code=400, detail="Token expired")

    update_password(conn, int(t["user_id"]), hash_password(payload.new_password))
    mark_token_used(conn, payload.token)
    return {"ok": True}
