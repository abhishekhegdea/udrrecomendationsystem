import sys
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.api.events import ProductViewRequest, api_track_product_view

def test():
    db = SessionLocal()
    try:
        req = ProductViewRequest(user_id="test", product_id="test")
        res = api_track_product_view(body=req, db=db)
        print("Success:", res)
    except Exception as e:
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    test()
