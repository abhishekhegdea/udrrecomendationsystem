import random

class CollaborativeFilter:
    def __init__(self):
        self.is_trained = False

    def build_dataset(self, user_ids, item_ids):
        pass

    def train(self, interactions, epochs=30):
        self.is_trained = True
        print("Mock CollaborativeFilter trained.")

    def recommend(self, user_id, item_ids, num_recommendations=10):
        if not self.is_trained or not item_ids:
            return []
        # Return random mock recommendations for scaffolding
        random.shuffle(item_ids)
        return item_ids[:num_recommendations]

collaborative_model = CollaborativeFilter()
