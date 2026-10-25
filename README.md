# DevOrbit
A complete freelance and agency operating system built with FastAPI, SQLAlchemy, React, and Tailwind.

## Quick Start

### Backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend/requirements.txt
cd backend
uvicorn app.main:app --reload

### Frontend
cd frontend
npm install
npm run dev

### Docker
docker compose up --build

### Default admin login
Email: admin@devorbit.io
Password: admin123
