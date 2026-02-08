# Tetris + Ranking (Render + GitHub)

## 1) ローカル起動
### Backend
```bash
cd backend
cp .env.example .env
python -m venv .venv
source .venv/bin/activate  # Windowsは .venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
