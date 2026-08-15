from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, JSON, DateTime, ARRAY
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from app.database import Base
from datetime import datetime


class Brand(Base):
    __tablename__ = "Brand"
    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
class Product(Base):
    __tablename__ = "Product"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, default="")
    price = Column(Float, default=0.0)
    discount = Column(Float, default=0.0)
    craftType = Column(String, nullable=True)
    inventory = Column(Integer, default=0)
    popularity = Column(Float, default=0.0)

    # Etsy CSV / catalog fields
    tags = Column(ARRAY(String), default=[])
    materials = Column(ARRAY(String), default=[])
    brand = Column(String, nullable=True)
    currency = Column(String, default="USD")
    averageRating = Column(Float, default=0.0)
    reviewsCount = Column(Integer, default=0)
    etsyUrl = Column(String, nullable=True)

    # pgvector embedding — 384 dimensions for all-MiniLM-L6-v2
    embedding = Column(Vector(384))

    sellerId = Column(String, ForeignKey("Seller.id"), nullable=False)
    categoryId = Column(String, ForeignKey("Category.id"), nullable=False)
    subcategoryId = Column(String, ForeignKey("Subcategory.id"), nullable=True)

    seller = relationship("Seller", back_populates="products")
    category = relationship("Category", back_populates="products")
    subcategory = relationship("Subcategory", back_populates="products")
    images = relationship("ProductImage", back_populates="product")
    createdAt = Column(DateTime, default=datetime.utcnow)


class Subcategory(Base):
    __tablename__ = "Subcategory"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    categoryId = Column(String, ForeignKey("Category.id"), nullable=False)

    category = relationship("Category", back_populates="subcategories")
    products = relationship("Product", back_populates="subcategory")


class ProductImage(Base):
    __tablename__ = "ProductImage"
    id = Column(String, primary_key=True)
    url = Column(String)
    productId = Column(String, ForeignKey("Product.id"))
    product = relationship("Product", back_populates="images")

class Seller(Base):
    __tablename__ = "Seller"

    id = Column(String, primary_key=True)
    firstName = Column(String)
    lastName = Column(String)
    businessName = Column(String, nullable=True)
    rating = Column(Float, default=0)
    isNewSeller = Column(Boolean, default=True)

    cityId = Column(String, nullable=True)
    stateId = Column(String, nullable=True)

    # Cumulative cancellation penalty (negative score for recommendations)
    cancelPenalty = Column("cancelPenalty", Float, default=0)

    # Cumulative quality-return penalty (negative score for recommendations)
    returnPenalty = Column("returnPenalty", Float, default=0)

    products = relationship("Product", back_populates="seller")


class Category(Base):
    __tablename__ = "Category"
    id = Column(String, primary_key=True)
    name = Column(String)

    products = relationship("Product", back_populates="category")
    subcategories = relationship("Subcategory", back_populates="category")

class ProductView(Base):
    __tablename__ = "ProductView"
    id = Column(String, primary_key=True)
    userId = Column(String, ForeignKey("User.id"), nullable=True)
    productId = Column(String, ForeignKey("Product.id"))
    timeSpent = Column(Integer, nullable=True)
    scrollDepth = Column(Integer, nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow)

class ClickEvent(Base):
    __tablename__ = "ClickEvent"
    id = Column(String, primary_key=True)
    userId = Column(String, ForeignKey("User.id"), nullable=True)
    productId = Column(String, ForeignKey("Product.id"))
    source = Column(String, nullable=True)
    createdAt = Column(DateTime, default=datetime.utcnow)

class User(Base):
    __tablename__ = "User"
    id = Column(String, primary_key=True)
    firstName = Column(String)
    email = Column(String)
    role = Column(String)
    cityId = Column(String, nullable=True)
    stateId = Column(String, nullable=True)

class Order(Base):
    __tablename__ = "Order"
    id = Column(String, primary_key=True)
    userId = Column(String, ForeignKey("User.id"))

class OrderItem(Base):
    __tablename__ = "OrderItem"
    id = Column(String, primary_key=True)
    orderId = Column(String, ForeignKey("Order.id"))
    productId = Column(String, ForeignKey("Product.id"))


class FairnessConfig(Base):
    """
    Single-row table storing the dynamic seller fairness parameters.

    Admins can tune these via ``PUT /api/v1/recommendations/fairness-config``
    without redeploying the service.  The row is upserted on first access
    with the defaults defined in :mod:`app.ml.seller_boost`.
    """

    __tablename__ = "FairnessConfig"

    id = Column(Integer, primary_key=True, autoincrement=True)
    boost_amount = Column(Float, nullable=False, default=0.15)
    new_seller_ratio = Column(Float, nullable=False, default=0.15)
    max_per_seller_ratio = Column(Float, nullable=False, default=0.20)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class UserBehaviour(Base):
    """
    Unified event log for every user interaction.

    All user-facing actions (views, searches, clicks, wishlist, cart,
    purchases, reviews, ratings) funnel into this single table so the
    recommendation pipeline has a single source of truth for training
    signals.

    ``metadata`` is a free-form JSON payload whose shape depends on
    ``eventType`` — see :mod:`app.ml.event_tracker` for the full schema
    of each event type.
    """

    __tablename__ = "UserBehaviour"

    id = Column(String, primary_key=True, index=True)
    userId = Column(String, ForeignKey("User.id"), nullable=False)
    eventType = Column(String, nullable=False, index=True)
    productId = Column(String, ForeignKey("Product.id"), nullable=True)
    categoryId = Column(String, ForeignKey("Category.id"), nullable=True)
    sellerId = Column(String, ForeignKey("Seller.id"), nullable=True)
    # Column exists in the DB (and the Node event writer sets it for RETURN
    # rows); mapped here so Python code can read ``brandId`` without hitting
    # an AttributeError on the live ``UserBehaviour`` table.
    brandId = Column(String, ForeignKey("Brand.id"), nullable=True)
    source = Column(String, nullable=True)
    # ``"metadata"`` is reserved by SQLAlchemy's Declarative API
    # (``Base.metadata``), so we use ``eventMetadata`` as the Python
    # attribute name while mapping to the ``metadata`` DB column.
    eventMetadata = Column("metadata", JSON, default=dict)
    createdAt = Column(DateTime, default=datetime.utcnow, index=True)

    # --- Relationships (lazy-loaded on demand) ---
    user = relationship("User")
    product = relationship("Product")
    category = relationship("Category")
    seller = relationship("Seller")
