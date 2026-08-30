import pandas as pd
from sklearn.decomposition import TruncatedSVD
from sklearn.metrics.pairwise import cosine_similarity
from sqlalchemy.orm import Session
import numpy as np

class CollaborativeFilter:
    def __init__(self):
        self.is_trained = False
        self.item_similarity_df = None
        self.user_history = {} # user_id -> dict of item_id -> interaction_score

    def _get_interactions_from_db(self, db: Session):
        """Pulls ProductView and OrderItem records from DB and formats them into an interaction dataframe."""
        from app.models import ProductView, OrderItem, Order, UserBehaviour
        
        # 1. Views
        views = db.query(ProductView.userId, ProductView.productId).filter(ProductView.userId.isnot(None)).all()
        interactions = []
        for v in views:
            interactions.append({"user_id": v.userId, "product_id": v.productId, "score": 1.0})
            
        # 2. Orders (stronger signal)
        orders = db.query(Order.userId, OrderItem.productId).join(OrderItem).filter(Order.userId.isnot(None)).all()
        for o in orders:
            interactions.append({"user_id": o.userId, "product_id": o.productId, "score": 5.0})
            
        # 3. Engagement events — positive intent signals from UserBehaviour
        #    (clicks, cart adds, wishlist adds, ratings, reviews).  Cart /
        #    wishlist REMOVALS are negative signals.
        eng_events = db.query(UserBehaviour.userId, UserBehaviour.productId, UserBehaviour.eventType, UserBehaviour.eventMetadata).filter(
            UserBehaviour.userId.isnot(None),
            UserBehaviour.eventType.in_(["CLICK", "CART", "WISHLIST", "RATING", "REVIEW"])
        ).all()
        
        for e in eng_events:
            if not e.productId:
                continue
            action = (e.eventMetadata or {}).get("action", "add")
            if e.eventType == "CART":
                score = 0.8 if action != "remove" else -1.0
            elif e.eventType == "WISHLIST":
                score = 0.6 if action != "remove" else -1.0
            elif e.eventType == "CLICK":
                score = 0.3
            elif e.eventType == "RATING":
                score = 0.5
            elif e.eventType == "REVIEW":
                score = 0.4
            else:
                continue
            interactions.append({"user_id": e.userId, "product_id": e.productId, "score": score})
            
        # 4. Negative signals — returned products
        #    Quality-issue returns (metadata.qualityIssue) are a much
        #    stronger negative than a mistaken order: -1.5 vs -0.5.
        neg_events = db.query(UserBehaviour.userId, UserBehaviour.productId, UserBehaviour.eventMetadata).filter(
            UserBehaviour.userId.isnot(None),
            UserBehaviour.eventType == "RETURN",
            UserBehaviour.productId.isnot(None),
        ).all()
        
        for e in neg_events:
            meta = e.eventMetadata or {}
            score = -1.5 if meta.get("qualityIssue") else -0.5
            interactions.append({"user_id": e.userId, "product_id": e.productId, "score": score})
            
        df = pd.DataFrame(interactions)
        if df.empty:
            return df
            
        # Aggregate scores (e.g. if someone viewed 3 times and ordered once)
        df = df.groupby(['user_id', 'product_id'])['score'].sum().reset_index()
        # Cap score to between -10.0 and 10.0
        df['score'] = df['score'].clip(lower=-10.0, upper=10.0)
        return df

    def train(self, db: Session):
        """Trains the TruncatedSVD matrix factorization model on current DB data."""
        df = self._get_interactions_from_db(db)
        
        if df.empty or len(df['product_id'].unique()) < 2:
            # Not enough data to compute similarities
            print("Not enough interaction data to train CollaborativeFilter.")
            self.is_trained = False
            return False

        # Build user-item interaction matrix
        interaction_matrix = df.pivot(index='user_id', columns='product_id', values='score').fillna(0)
        
        # Save user history for scoring
        self.user_history = df.groupby('user_id').apply(
            lambda x: dict(zip(x['product_id'], x['score']))
        ).to_dict()

        # Matrix Factorization (SVD)
        # Use SVD for dimensionality reduction only if we have enough users/items
        min_dim = min(interaction_matrix.shape)
        if min_dim > 20:
            n_components = 20
            svd = TruncatedSVD(n_components=n_components, random_state=42)
            product_features = svd.fit_transform(interaction_matrix.T)
        else:
            # Dataset too small for meaningful SVD (would collapse to 1D and yield 1.0 similarity everywhere)
            product_features = interaction_matrix.T.values

        
        # Compute Cosine Similarity between all products based on their latent features
        similarity_matrix = cosine_similarity(product_features)
        
        # Store as DataFrame for easy lookup
        product_ids = interaction_matrix.columns
        self.item_similarity_df = pd.DataFrame(
            similarity_matrix, 
            index=product_ids, 
            columns=product_ids
        )
        
        self.is_trained = True
        print(f"CollaborativeFilter trained on {len(df)} interactions. Matrix shape: {interaction_matrix.shape}")
        return True

    def get_collaborative_score(self, user_id: str, target_product_id: str) -> float:
        """
        Predicts how much a user will like a product based on item-item similarity.
        Returns a score typically between 0.0 and 1.0.
        """
        if not self.is_trained or self.item_similarity_df is None:
            return 0.0
            
        if target_product_id not in self.item_similarity_df.index:
            return 0.0
            
        if user_id not in self.user_history:
            return 0.0
            
        user_interacted_items = self.user_history[user_id]
        
        total_similarity = 0.0
        total_weight = 0.0
        
        for interacted_item, interaction_score in user_interacted_items.items():
            if interacted_item in self.item_similarity_df.index:
                # How similar is the target product to this item the user interacted with?
                sim = self.item_similarity_df.loc[target_product_id, interacted_item]
                
                # Weight the similarity by how much the user liked the item (interaction_score)
                total_similarity += sim * interaction_score
                total_weight += abs(interaction_score)
                
        if total_weight == 0:
            return 0.0
            
        # Normalize score
        normalized_score = total_similarity / total_weight
        
        # Bound between 0 and 1
        return max(0.0, min(1.0, normalized_score))

collaborative_model = CollaborativeFilter()
