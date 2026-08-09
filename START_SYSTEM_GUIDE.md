# UdrCrafts System Startup Guide

UdrCrafts is now powered by a microservices architecture featuring:
1. **Frontend**: React/Vite App (`http://localhost:5173`)
2. **Core Backend**: Node.js / Express / Prisma (`http://localhost:3001`)
3. **ML Backend**: Python / FastAPI / Celery (`http://localhost:8000`)
4. **Database & Cache**: PostgreSQL with `pgvector` & Redis (Docker)

---

## 1. Start the Databases (Docker)
Always ensure your databases are running in the background before starting the servers.

```bash
cd d:\OneDrive\Desktop\udrcrafts
docker compose up -d
```
*(This starts PostgreSQL on port 5433 and Redis on port 6379).*

---

## 2. Start the Core Backend (Node.js)
This handles Users, Products, Sellers, and Authentication.

```bash
cd d:\OneDrive\Desktop\udrcrafts\server
npm run dev
```
*(Runs on port 3001. Make sure `.env` has `DATABASE_URL` pointing to `localhost:5433`).*

---

## 3. Start the Recommendation Engine (Python)
This handles vector similarity, LightFM, and personalized ranking.

First time setup:
```bash
cd d:\OneDrive\Desktop\udrcrafts\recommendation-system
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

To run the FastAPI server:
```bash
cd d:\OneDrive\Desktop\udrcrafts\recommendation-system
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```
*(Runs on port 8000. Accessible via `http://localhost:8000/docs` for Swagger UI).*

---

## 4. Start the ML Background Workers (Celery)
To process the heavy machine learning tasks (retraining LightFM, updating scores):

```bash
cd d:\OneDrive\Desktop\udrcrafts\recommendation-system
venv\Scripts\activate
celery -A app.workers.celery_app worker --loglevel=info -P solo
```

*(Note: On Windows, Celery requires the `solo` pool for seamless execution).*

---

## 5. Start the

1. **Backend (Node.js/Express)**
```bash
cd backend
npm run dev
```

2. **Frontend (React/Vite)**
```bash
cd frontend
npm run dev
```
*(Runs on port 5173).*
