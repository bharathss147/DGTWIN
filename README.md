# FactoryMind AI

Industrial Digital Twin & Bottleneck Intelligence Platform for JARVIS SI-02.

## Start backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Backend docs: http://127.0.0.1:8000/docs

## Start frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend: http://localhost:5173
