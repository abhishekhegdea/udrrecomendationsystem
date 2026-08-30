from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.api import events, recommendations
from app.database import SessionLocal
from app.ml.collaborative import collaborative_model


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application startup/shutdown lifecycle.

    On startup:
    - print all registered API routes
    - attempt collaborative-filter training

    Recommendation-system startup should not fail simply because
    collaborative training cannot currently run.
    """

    print("")
    print("=" * 70)
    print("UDRCRAFTS RECOMMENDATION SYSTEM STARTING")
    print("=" * 70)

    print("Registered FastAPI routes:")

    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)

        if path:
            method_text = (
                ",".join(sorted(methods))
                if methods
                else ""
            )

            print(
                f"  {method_text:<20} {path}"
            )

    print("=" * 70)

    db = SessionLocal()

    try:
        print(
            "Training Collaborative Filter on startup..."
        )

        collaborative_model.train(db)

        print(
            "Collaborative Filter training completed."
        )

    except Exception as exc:
        # Collaborative training must not prevent
        # FastAPI from starting.
        print(
            "Collaborative filter training skipped "
            f"(non-fatal): {exc}"
        )

    finally:
        db.close()

    print("")
    print(
        "Recommendation API ready."
    )
    print(
        "Health: http://localhost:8000/health"
    )
    print(
        "Docs:   http://localhost:8000/docs"
    )
    print("=" * 70)
    print("")

    yield

    print(
        "Recommendation system shutting down."
    )


app = FastAPI(
    title="UdrCrafts ML Recommendation Engine",
    description=(
        "Python microservice for personalized "
        "hybrid recommendations"
    ),
    version="1.0.0",
    lifespan=lifespan,
)


# ---------------------------------------------------------
# CORS
# ---------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# ROUTERS
# ---------------------------------------------------------

RECOMMENDATION_PREFIX = (
    "/api/v1/recommendations"
)

EVENT_PREFIX = (
    "/api/v1/events"
)


app.include_router(
    recommendations.router,
    prefix=RECOMMENDATION_PREFIX,
    tags=["Recommendations"],
)


app.include_router(
    events.router,
    prefix=EVENT_PREFIX,
    tags=["Events"],
)


# ---------------------------------------------------------
# ROOT
# ---------------------------------------------------------

@app.get("/")
def root():
    """
    Useful for confirming that port 8000 is actually running
    THIS UdrCrafts recommendation application.
    """

    return {
        "service":
            "udrcrafts-recommendation-system",
        "status":
            "running",
        "version":
            "1.0.0",
        "health":
            "/health",
        "docs":
            "/docs",
        "recommendations":
            RECOMMENDATION_PREFIX,
    }


# ---------------------------------------------------------
# HEALTH CHECK
# ---------------------------------------------------------

@app.get("/health")
def health_check():
    return {
        "status":
            "healthy",
        "service":
            "recommendation-system",
        "recommendation_prefix":
            RECOMMENDATION_PREFIX,
    }


# ---------------------------------------------------------
# DEBUG ROUTE
# ---------------------------------------------------------

@app.get("/debug/routes")
def debug_routes():
    """
    Returns every route registered in this FastAPI process.

    This is very useful when diagnosing a 404 caused by
    accidentally starting another FastAPI project on port 8000.
    """

    registered_routes = []

    for route in app.routes:
        path = getattr(
            route,
            "path",
            None,
        )

        methods = getattr(
            route,
            "methods",
            None,
        )

        if not path:
            continue

        registered_routes.append(
            {
                "path":
                    path,
                "methods":
                    sorted(
                        methods
                    )
                    if methods
                    else [],
            }
        )

    return {
        "service":
            "udrcrafts-recommendation-system",
        "count":
            len(
                registered_routes
            ),
        "routes":
            registered_routes,
    }


# ---------------------------------------------------------
# DATABASE INTEGRITY HANDLING
# ---------------------------------------------------------

@app.exception_handler(
    IntegrityError
)
async def integrity_error_handler(
    request: Request,
    exc: IntegrityError,
):
    """
    Recommendation telemetry should not crash the storefront
    because a referenced product/user was removed.
    """

    original_error = str(
        getattr(
            exc,
            "orig",
            "",
        )
    ).lower()

    if (
        "foreign key"
        in original_error
    ):
        return JSONResponse(
            status_code=200,
            content={
                "skipped":
                    True,
                "reason":
                    "referenced_record_missing",
            },
        )

    print(
        "Database integrity error:",
        exc,
    )

    return JSONResponse(
        status_code=500,
        content={
            "error":
                "database integrity error",
        },
    )


# ---------------------------------------------------------
# GENERAL ERROR HANDLER
# ---------------------------------------------------------

@app.exception_handler(
    Exception
)
async def unexpected_error_handler(
    request: Request,
    exc: Exception,
):
    """
    Log unexpected recommendation service failures with the
    requested endpoint.

    Do not expose Python stack traces to clients.
    """

    print("")
    print(
        "Unexpected recommendation API error"
    )
    print(
        f"Path: {request.url.path}"
    )
    print(
        f"Error: {type(exc).__name__}: {exc}"
    )
    print("")

    return JSONResponse(
        status_code=500,
        content={
            "error":
                "recommendation_service_error",
            "message":
                str(exc),
            "path":
                request.url.path,
        },
    )