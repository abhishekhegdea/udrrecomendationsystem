from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from app.api import events, recommendations
from app.database import SessionLocal
from app.ml.collaborative import collaborative_model

app = FastAPI(
    title="UdrCrafts ML Recommendation Engine",
    description="Python microservice for personalized hybrid recommendations",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(recommendations.router, prefix="/api/v1/recommendations", tags=["Recommendations"])
app.include_router(events.router, prefix="/api/v1/events", tags=["Events"])

# Telemetry is best-effort: if an event references a record that no longer
# exists (e.g. a product or user deleted since the page loaded), the FK
# violation would otherwise surface as an HTTP 500 — and an unhandled 500
# bypasses the CORS middleware, so browsers report it as a CORS error.
# Acknowledge the event instead so the ML API never crashes clients.
@app.exception_handler(IntegrityError)
async def integrity_error_handler(request: Request, exc: IntegrityError):
    if "foreign key" in str(getattr(exc, "orig", "")).lower():
        return JSONResponse(status_code=200, content={"skipped": True, "reason": "referenced_record_missing"})
    return JSONResponse(status_code=500, content={"error": "database integrity error"})

@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    try:
        print("Training Collaborative Filter on startup...")
        collaborative_model.train(db)
    except Exception as exc:
        print(f"Collaborative filter training skipped (non-fatal): {exc}")
    finally:
        db.close()

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "recommendation-system"}
