from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import recommendations

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

@app.get("/health")
def health_check():
    return {"status": "healthy", "service": "recommendation-system"}
