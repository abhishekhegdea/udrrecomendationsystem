import sys
sys.path.append(r'd:\OneDrive\Desktop\udrcrafts\recommendation-system')
from app.db.session import SessionLocal
from app.models import Product, UserBehaviour

db = SessionLocal()
p = db.query(Product).filter(Product.name.like('%Baby Teethers%')).first()
if not p:
    print('Product not found')
else:
    print(f'ID: {p.id}')
    print(f'Name: {p.name}')
    print(f'Price: {p.price}')
    print(f'Category ID: {p.categoryId}')
    print(f'Brand ID: {p.brandId}')
    print(f'Average Rating: {getattr(p, "averageRating", 0)}')
    print(f'Reviews Count: {getattr(p, "reviewsCount", 0)}')
    print(f'Popularity: {getattr(p, "popularity", 0)}')
    
    if p.seller:
        print(f'Seller New: {p.seller.isNewSeller}')
        print(f'Seller Rating: {getattr(p.seller, "rating", 0)}')
