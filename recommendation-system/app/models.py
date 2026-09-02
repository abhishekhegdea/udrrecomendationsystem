from datetime import datetime

from sqlalchemy import (
    ARRAY,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
)

from sqlalchemy.orm import relationship

from pgvector.sqlalchemy import Vector

from app.database import Base


class Brand(Base):
    __tablename__ = "Brand"

    id = Column(
        String,
        primary_key=True,
        index=True,
    )

    name = Column(
        String,
        nullable=False,
    )

    categoryId = Column(
        String,
        nullable=True,
    )


class Product(Base):
    __tablename__ = "Product"

    id = Column(
        String,
        primary_key=True,
        index=True,
    )

    name = Column(
        String,
        nullable=False,
    )

    description = Column(
        String,
        default="",
    )

    price = Column(
        Float,
        default=0.0,
    )

    discount = Column(
        Float,
        default=0.0,
    )

    craftType = Column(
        String,
        nullable=True,
    )

    inventory = Column(
        Integer,
        default=0,
    )

    popularity = Column(
        Float,
        default=0.0,
    )

    tags = Column(
        ARRAY(String),
        default=[],
    )

    materials = Column(
        ARRAY(String),
        default=[],
    )

    brand = Column(
        String,
        nullable=True,
    )

    currency = Column(
        String,
        default="USD",
    )

    averageRating = Column(
        Float,
        default=0.0,
    )

    reviewsCount = Column(
        Integer,
        default=0,
    )

    etsyUrl = Column(
        String,
        nullable=True,
    )

    embedding = Column(
        Vector(384),
    )

    sellerId = Column(
        String,
        ForeignKey("Seller.id"),
        nullable=False,
    )

    categoryId = Column(
        String,
        ForeignKey("Category.id"),
        nullable=False,
    )

    subcategoryId = Column(
        String,
        ForeignKey("Subcategory.id"),
        nullable=True,
    )

    seller = relationship(
        "Seller",
        back_populates="products",
    )

    category = relationship(
        "Category",
        back_populates="products",
    )

    subcategory = relationship(
        "Subcategory",
        back_populates="products",
    )

    images = relationship(
        "ProductImage",
        back_populates="product",
    )

    createdAt = Column(
        DateTime,
        default=datetime.utcnow,
    )


class Subcategory(Base):
    __tablename__ = "Subcategory"

    id = Column(
        String,
        primary_key=True,
        index=True,
    )

    name = Column(
        String,
        nullable=False,
    )

    categoryId = Column(
        String,
        ForeignKey("Category.id"),
        nullable=False,
    )

    category = relationship(
        "Category",
        back_populates="subcategories",
    )

    products = relationship(
        "Product",
        back_populates="subcategory",
    )


class ProductImage(Base):
    __tablename__ = "ProductImage"

    id = Column(
        String,
        primary_key=True,
    )

    url = Column(
        String,
    )

    productId = Column(
        String,
        ForeignKey("Product.id"),
    )

    product = relationship(
        "Product",
        back_populates="images",
    )


class Seller(Base):
    __tablename__ = "Seller"

    id = Column(
        String,
        primary_key=True,
    )

    firstName = Column(String)

    lastName = Column(String)

    businessName = Column(
        String,
        nullable=True,
    )

    rating = Column(
        Float,
        default=0,
    )

    isNewSeller = Column(
        Boolean,
        default=True,
    )

    cityId = Column(String, nullable=True)
    stateId = Column(String, nullable=True)

    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    locationAccuracy = Column(Float, nullable=True)
    locationAddress = Column(String, nullable=True)
    locationUpdatedAt = Column(DateTime, nullable=True)

    cancelPenalty = Column(
        "cancelPenalty",
        Float,
        default=0,
    )

    returnPenalty = Column(
        "returnPenalty",
        Float,
        default=0,
    )

    products = relationship(
        "Product",
        back_populates="seller",
    )


class Category(Base):
    __tablename__ = "Category"

    id = Column(
        String,
        primary_key=True,
    )

    name = Column(String)

    brandId = Column(
        String,
        ForeignKey("Brand.id"),
        nullable=True,
    )

    products = relationship(
        "Product",
        back_populates="category",
    )

    subcategories = relationship(
        "Subcategory",
        back_populates="category",
    )


class ProductView(Base):
    __tablename__ = "ProductView"

    id = Column(
        String,
        primary_key=True,
    )

    userId = Column(
        String,
        ForeignKey("User.id"),
        nullable=True,
    )

    productId = Column(
        String,
        ForeignKey("Product.id"),
    )

    timeSpent = Column(
        Integer,
        nullable=True,
    )

    scrollDepth = Column(
        Integer,
        nullable=True,
    )

    createdAt = Column(
        DateTime,
        default=datetime.utcnow,
    )

    categoryId = Column(
        String,
        ForeignKey("Category.id"),
        nullable=True,
    )


class ClickEvent(Base):
    __tablename__ = "ClickEvent"

    id = Column(
        String,
        primary_key=True,
    )

    userId = Column(
        String,
        ForeignKey("User.id"),
        nullable=True,
    )

    productId = Column(
        String,
        ForeignKey("Product.id"),
    )

    source = Column(
        String,
        nullable=True,
    )

    createdAt = Column(
        DateTime,
        default=datetime.utcnow,
    )

    brandId = Column(
        String,
        ForeignKey("Brand.id"),
        nullable=True,
    )

    categoryId = Column(
        String,
        ForeignKey("Category.id"),
        nullable=True,
    )


# ---------------------------------------------------------------------------
# NEW CLICK-RATE TABLE
# ---------------------------------------------------------------------------

class ProductClickHistory(Base):
    """
    Short-lived product click history.

    The recommendation engine reads only records from the latest seven days.

    Celery Beat periodically removes records older than seven days.
    """

    __tablename__ = "ProductClickHistory"

    id = Column(
        String,
        primary_key=True,
    )

    userId = Column(
        String,
        ForeignKey("User.id"),
        nullable=True,
        index=True,
    )

    productId = Column(
        String,
        ForeignKey("Product.id"),
        nullable=False,
        index=True,
    )

    source = Column(
        String,
        nullable=True,
    )

    elementClicked = Column(
        String,
        nullable=True,
    )

    createdAt = Column(
        DateTime,
        default=datetime.utcnow,
        index=True,
    )

    categoryId = Column(
        String,
        ForeignKey("Category.id"),
        nullable=True,
    )


class User(Base):
    __tablename__ = "User"

    id = Column(
        String,
        primary_key=True,
    )

    firstName = Column(String)

    email = Column(String)

    role = Column(String)
    cityId = Column(String, nullable=True)
    stateId = Column(String, nullable=True)

    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    locationAccuracy = Column(Float, nullable=True)
    locationAddress = Column(String, nullable=True)
    locationUpdatedAt = Column(DateTime, nullable=True)


class Order(Base):
    __tablename__ = "Order"

    id = Column(
        String,
        primary_key=True,
    )

    userId = Column(
        String,
        ForeignKey("User.id"),
    )

    brandId = Column(
        String,
        ForeignKey("Brand.id"),
        nullable=True,
    )


class OrderItem(Base):
    __tablename__ = "OrderItem"

    id = Column(
        String,
        primary_key=True,
    )

    orderId = Column(
        String,
        ForeignKey("Order.id"),
    )

    productId = Column(
        String,
        ForeignKey("Product.id"),
    )

    brandId = Column(
        String,
        ForeignKey("Brand.id"),
        nullable=True,
    )

    categoryId = Column(
        String,
        ForeignKey("Category.id"),
        nullable=True,
    )


class CartItem(Base):
    __tablename__ = "CartItem"

    id = Column(
        String,
        primary_key=True,
    )

    userId = Column(
        String,
        ForeignKey("User.id"),
    )

    productId = Column(
        String,
        ForeignKey("Product.id"),
    )

    quantity = Column(
        Integer,
        default=1,
    )

    brandId = Column(
        String,
        ForeignKey("Brand.id"),
        nullable=True,
    )

    categoryId = Column(
        String,
        ForeignKey("Category.id"),
        nullable=True,
    )

    createdAt = Column(
        DateTime,
        default=datetime.utcnow,
    )


class Wishlist(Base):
    __tablename__ = "Wishlist"

    id = Column(
        String,
        primary_key=True,
    )

    userId = Column(
        String,
        ForeignKey("User.id"),
    )

    productId = Column(
        String,
        ForeignKey("Product.id"),
    )

    categoryId = Column(
        String,
        ForeignKey("Category.id"),
        nullable=True,
    )

    createdAt = Column(
        DateTime,
        default=datetime.utcnow,
    )


class Rating(Base):
    __tablename__ = "Rating"

    id = Column(
        String,
        primary_key=True,
    )

    value = Column(
        Integer,
        nullable=False,
    )

    userId = Column(
        String,
        ForeignKey("User.id"),
    )

    productId = Column(
        String,
        ForeignKey("Product.id"),
    )

    brandId = Column(
        String,
        ForeignKey("Brand.id"),
        nullable=True,
    )

    categoryId = Column(
        String,
        ForeignKey("Category.id"),
        nullable=True,
    )

    createdAt = Column(
        DateTime,
        default=datetime.utcnow,
    )


class Review(Base):
    __tablename__ = "Review"

    id = Column(
        String,
        primary_key=True,
    )

    text = Column(
        String,
        nullable=False,
    )

    userId = Column(
        String,
        ForeignKey("User.id"),
    )

    productId = Column(
        String,
        ForeignKey("Product.id"),
    )

    categoryId = Column(
        String,
        ForeignKey("Category.id"),
        nullable=True,
    )

    createdAt = Column(
        DateTime,
        default=datetime.utcnow,
    )


class FairnessConfig(Base):
    __tablename__ = "FairnessConfig"

    id = Column(
        Integer,
        primary_key=True,
        autoincrement=True,
    )

    boost_amount = Column(
        Float,
        nullable=False,
        default=0.15,
    )

    new_seller_ratio = Column(
        Float,
        nullable=False,
        default=0.15,
    )

    max_per_seller_ratio = Column(
        Float,
        nullable=False,
        default=0.20,
    )

    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )


class UserBehaviour(Base):
    __tablename__ = "UserBehaviour"

    id = Column(
        String,
        primary_key=True,
        index=True,
    )

    userId = Column(
        String,
        ForeignKey("User.id"),
        nullable=False,
    )

    eventType = Column(
        String,
        nullable=False,
        index=True,
    )

    productId = Column(
        String,
        ForeignKey("Product.id"),
        nullable=True,
    )

    categoryId = Column(
        String,
        ForeignKey("Category.id"),
        nullable=True,
    )

    sellerId = Column(
        String,
        ForeignKey("Seller.id"),
        nullable=True,
    )

    brandId = Column(
        String,
        ForeignKey("Brand.id"),
        nullable=True,
    )

    source = Column(
        String,
        nullable=True,
    )

    eventMetadata = Column(
        "metadata",
        JSON,
        default=dict,
    )

    createdAt = Column(
        DateTime,
        default=datetime.utcnow,
        index=True,
    )

    user = relationship("User")

    product = relationship("Product")

    category = relationship("Category")

    seller = relationship("Seller")

# ---------------------------------------------------------------------------
# RECOMMENDATION SCORE AUDIT TABLES
# ---------------------------------------------------------------------------

class RecommendationRun(Base):
    """
    One complete execution of the personalized recommendation pipeline.

    A RecommendationRun is the parent/audit record for one API call.
    Every product returned by that call is stored in
    RecommendationScoreSnapshot and linked through runId.

    Keeping the run separate gives us a stable way to compare:

        before click
        after click
        different model versions
        different recommendation weights
        different business-rule settings
    """

    __tablename__ = "RecommendationRun"

    id = Column(
        String,
        primary_key=True,
        index=True,
    )

    userId = Column(
        String,
        nullable=False,
        index=True,
    )

    context = Column(
        String,
        nullable=False,
        default="home",
    )

    algorithmVersion = Column(
        String,
        nullable=False,
        default="personalized-click-v2",
    )

    totalReturned = Column(
        Integer,
        nullable=False,
        default=0,
    )

    executionTimeMs = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    weights = Column(
        JSON,
        nullable=False,
        default=dict,
    )

    createdAt = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        index=True,
    )

    snapshots = relationship(
        "RecommendationScoreSnapshot",
        back_populates="run",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class RecommendationScoreSnapshot(Base):
    """
    Complete score audit for one product in one recommendation run.

    All score values are stored as decimal values in the same scale used by
    the recommendation engine.

    Examples:

        0.80      = 80% raw feature score
        0.112     = 11.2 percentage-point weighted contribution
        0.584756  = 58.4756% final recommendation score

    This table intentionally stores userId and productId as audit identifiers
    instead of adding foreign keys to User/Product. This keeps historical
    recommendation records queryable even if application data is later
    removed.
    """

    __tablename__ = "RecommendationScoreSnapshot"

    # -----------------------------------------------------------------------
    # Identity / run
    # -----------------------------------------------------------------------

    id = Column(
        String,
        primary_key=True,
        index=True,
    )

    runId = Column(
        String,
        ForeignKey(
            "RecommendationRun.id",
            ondelete="CASCADE",
        ),
        nullable=False,
        index=True,
    )

    userId = Column(
        String,
        nullable=False,
        index=True,
    )

    productId = Column(
        String,
        nullable=False,
        index=True,
    )

    categoryId = Column(
        String,
        nullable=True,
    )

    productName = Column(
        String,
        nullable=True,
    )

    rank = Column(
        Integer,
        nullable=False,
    )

    source = Column(
        String,
        nullable=True,
    )

    # -----------------------------------------------------------------------
    # Raw feature scores
    # -----------------------------------------------------------------------

    contentScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    collaborativeScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    trendingScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    seasonalScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    locationScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    # Exact normalized weight used by the recommendation engine for this run.
    # Storing it makes the distance contribution independently auditable:
    # locationContribution = locationScore * locationWeight.
    locationWeight = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    sellerDistanceKm = Column(
        Float,
        nullable=True,
    )

    nearbySeller = Column(
        Boolean,
        nullable=False,
        default=False,
    )

    locationPriorityApplied = Column(
        Boolean,
        nullable=False,
        default=False,
    )

    categoryAffinityScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    brandAffinityScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    ratingScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    sellerFreshnessScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    productClickPopularityScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    userClickAffinityScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    engagementScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    # -----------------------------------------------------------------------
    # Product-click diagnostics
    # -----------------------------------------------------------------------

    productClicks7d = Column(
        Integer,
        nullable=False,
        default=0,
    )

    productClicksPerDay = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    # -----------------------------------------------------------------------
    # User-click-affinity internal components
    # -----------------------------------------------------------------------

    semanticSimilarityScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    clickCategoryScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    clickBrandScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    clickFrequencyRecencyScore = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    matchedClickedProductId = Column(
        String,
        nullable=True,
    )

    matchedClickedProductName = Column(
        String,
        nullable=True,
    )

    # -----------------------------------------------------------------------
    # Weighted contributions
    # -----------------------------------------------------------------------

    contentContribution = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    collaborativeContribution = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    trendingContribution = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    seasonalContribution = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    locationContribution = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    categoryAffinityContribution = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    brandAffinityContribution = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    ratingContribution = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    sellerFreshnessContribution = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    productClickPopularityContribution = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    userClickAffinityContribution = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    engagementContribution = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    # -----------------------------------------------------------------------
    # Final score trace
    # -----------------------------------------------------------------------

    weightedScoreBeforeRules = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    businessRuleAdjustment = Column(
        Float,
        nullable=False,
        default=0.0,
    )

    finalScore = Column(
        Float,
        nullable=False,
        default=0.0,
        index=True,
    )

    explanation = Column(
        String,
        nullable=True,
    )

    createdAt = Column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        index=True,
    )

    run = relationship(
        "RecommendationRun",
        back_populates="snapshots",
    )