import os
import sqlite3
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timezone

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def connect(db_path: str) -> sqlite3.Connection:
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        email TEXT UNIQUE,
        created_at TEXT NOT NULL
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        game TEXT NOT NULL,
        score INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    """)

    cur.execute("""
    CREATE TABLE IF NOT EXISTS reset_tokens (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        expires_at_unix INTEGER NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id)
    );
    """)

    cur.execute("""
    CREATE INDEX IF NOT EXISTS idx_scores_game_score
    ON scores(game, score DESC, created_at DESC);
    """)

    conn.commit()

def get_user_by_username(conn: sqlite3.Connection, username: str) -> Optional[sqlite3.Row]:
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username = ?", (username,))
    return cur.fetchone()

def get_user_by_email(conn: sqlite3.Connection, email: str) -> Optional[sqlite3.Row]:
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE email = ?", (email,))
    return cur.fetchone()

def create_user(conn: sqlite3.Connection, username: str, password_hash: str, email: Optional[str]) -> sqlite3.Row:
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO users(username, password_hash, email, created_at) VALUES(?,?,?,?)",
        (username, password_hash, email, utc_now_iso()),
    )
    conn.commit()
    return get_user_by_username(conn, username)

def set_user_email(conn: sqlite3.Connection, user_id: int, email: str) -> None:
    cur = conn.cursor()
    cur.execute("UPDATE users SET email = ? WHERE id = ?", (email, user_id))
    conn.commit()

def insert_score(conn: sqlite3.Connection, user_id: int, game: str, score: int) -> None:
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO scores(user_id, game, score, created_at) VALUES(?,?,?,?)",
        (user_id, game, score, utc_now_iso()),
    )
    conn.commit()

def get_leaderboard(conn: sqlite3.Connection, game: str, limit: int = 50) -> List[Dict[str, Any]]:
    cur = conn.cursor()
    cur.execute("""
    SELECT u.username as username, s.score as score, s.created_at as created_at
    FROM scores s
    JOIN users u ON u.id = s.user_id
    WHERE s.game = ?
    ORDER BY s.score DESC, s.created_at ASC
    LIMIT ?
    """, (game, limit))
    rows = cur.fetchall()
    return [dict(r) for r in rows]

def create_reset_token(conn: sqlite3.Connection, user_id: int, token: str, expires_at_unix: int) -> None:
    cur = conn.cursor()
    cur.execute(
        "INSERT INTO reset_tokens(token, user_id, expires_at_unix, used, created_at) VALUES(?,?,?,?,?)",
        (token, user_id, expires_at_unix, 0, utc_now_iso()),
    )
    conn.commit()

def get_reset_token(conn: sqlite3.Connection, token: str) -> Optional[sqlite3.Row]:
    cur = conn.cursor()
    cur.execute("SELECT * FROM reset_tokens WHERE token = ?", (token,))
    return cur.fetchone()

def mark_token_used(conn: sqlite3.Connection, token: str) -> None:
    cur = conn.cursor()
    cur.execute("UPDATE reset_tokens SET used = 1 WHERE token = ?", (token,))
    conn.commit()

def update_password(conn: sqlite3.Connection, user_id: int, password_hash: str) -> None:
    cur = conn.cursor()
    cur.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))
    conn.commit()
