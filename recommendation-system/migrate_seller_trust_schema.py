"""
Non-destructive schema migration for Seller Trust & Dispatch SLA fields.
"""
from sqlalchemy import text
from app.database import engine

def migrate_schema():
    print("Applying non-destructive schema migration for Seller Trust fields...")
    with engine.connect() as conn:
        # 1. Seller table columns
        conn.execute(text("""
            ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "sellerTrustScore" DOUBLE PRECISION DEFAULT 0.70;
            ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "ratingScore" DOUBLE PRECISION DEFAULT 0.0;
            ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "fulfilmentRate" DOUBLE PRECISION DEFAULT 1.0;
            ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "dispatchSlaScore" DOUBLE PRECISION DEFAULT 1.0;
            ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "cancellationRate" DOUBLE PRECISION DEFAULT 0.0;
            ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "returnRate" DOUBLE PRECISION DEFAULT 0.0;
            ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "totalCompletedOrders" INTEGER DEFAULT 0;
            ALTER TABLE "Seller" ADD COLUMN IF NOT EXISTS "trustBadge" TEXT DEFAULT 'STANDARD';
        """))

        # 2. OrderItem table columns
        conn.execute(text("""
            ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "expectedDispatchAt" TIMESTAMP(3);
            ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "dispatchedAt" TIMESTAMP(3);
            ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "isDispatchedOnTime" BOOLEAN DEFAULT true;
        """))
        
        conn.commit()
    print("✅ Schema migration applied successfully without data loss!")

if __name__ == "__main__":
    migrate_schema()
