from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey, JSON, DateTime
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector
from app.database import Base
from datetime import datetime

class Product(Base):
    __tablename__ = "Product"

    id = Column(String, primary_key=True, index=True)
    name = Column(String)
    description = Column(String)
    price = Column(Float)
    discount = Column(Float, default=0)
    craftType = Column(String, nullable=True)
    inventory = Column(Integer, default=0)
    popularity = Column(Float, default=0)
    
    # Store pgvector embeddings (768 dimensions for standard sentence-transformers)
    embedding = Column(Vector(768))

    sellerId = Column(String, ForeignKey("Seller.id"))
    categoryId = Column(String, ForeignKey("Category.id"))
    
    seller = relationship("Seller")
    category = relationship("Category")
    images = relationship("ProductImage")

class ProductImage(Base):
    __tablename__ = "ProductImage"
    id = Column(String, primary_key=True)
    url = Column(String)
    productId = Column(String, ForeignKey("Product.id"))

class Seller(Base):
    __tablename__ = "Seller"

    id = Column(String, primary_key=True)
    firstName = Column(String)
    lastName = Column(String)
    businessName = Column(String, nullable=True)
    rating = Column(Float, default=0)
    isNewSeller = Column(Boolean, default=True)

class Category(Base):
    __tablename__ = "Category"
    id = Column(String, primary_key=True)
    name = Column(String)

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
