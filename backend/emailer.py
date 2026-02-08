import os
import smtplib
from email.message import EmailMessage
from typing import Optional

def send_email(to_addr: str, subject: str, body: str) -> None:
    """
    SMTP設定がない場合は、開発用としてコンソール出力にフォールバック。
    """
    host = os.getenv("SMTP_HOST", "").strip()
    user = os.getenv("SMTP_USER", "").strip()
    pw = os.getenv("SMTP_PASS", "").strip()
    from_addr = os.getenv("SMTP_FROM", "no-reply@example.com").strip()
    port = int(os.getenv("SMTP_PORT", "587"))

    if not host:
        print("=== [DEV EMAIL FALLBACK] ===")
        print("TO:", to_addr)
        print("SUBJECT:", subject)
        print(body)
        print("============================")
        return

    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.set_content(body)

    with smtplib.SMTP(host, port) as server:
        server.starttls()
        if user and pw:
            server.login(user, pw)
        server.send_message(msg)
