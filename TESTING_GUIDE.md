# UdrCrafts Step-by-Step Testing Guide

This guide will walk you through testing the end-to-end functionality of the UdrCrafts platform, ensuring that all microservices (Frontend, Node.js Backend, and Python ML Backend) are communicating correctly.

---

> [!NOTE]
> Ensure all your services are currently running. Based on your terminal, the Node.js backend (`:3001`), Python FastAPI (`:8000`), Celery worker, and Vite frontend (`:5173`) are all active.

## Phase 1: Authentication & User Roles
We will start by testing the registration and login flows for the different types of users in the system.

### 1. Customer Registration & Login
1. Navigate to **http://localhost:5173** (Frontend).
2. Go to the **Login / Signup** page.
3. Create a new account selecting the **Customer** role (if prompted) or use the general signup.
4. Log out, then log back in using the newly created credentials.
5. **Expected Result:** You should be redirected to the `CustomerDashboard` or `Home` page, and your session should be active.

### 2. Seller Registration
1. Log out of the customer account.
2. Go to the **Signup** page and register a new account as a **Seller / Artisan**.
3. Fill out any required KYC or store information.
4. **Expected Result:** You should be redirected to the `SellerDashboard`.

### 3. Delivery Partner Registration
1. Log out and register a new account as a **Delivery Partner**.
2. Complete the document/vehicle upload steps.
3. **Expected Result:** You should be redirected to the `DeliveryDashboard`, and your initial stats (earnings, deliveries) should be 0.

---

## Phase 2: Seller Functionality (Inventory Management)
Log in with your **Seller** account to test inventory and product management.

1. Navigate to the **Seller Dashboard** (`/dashboard`).
2. Go to **My Products** (`SellerProductsPage`).
3. Click **Add New Product**.
4. Fill in the product details (Name, Price, Category like 'Home & Living', Stock, and Image URL).
5. Submit the form.
6. **Expected Result:** The product should appear in your seller inventory, and it should be successfully saved to the PostgreSQL database.

---

## Phase 3: Customer Journey (Shopping & Checkout)
Log in with your **Customer** account to test the shopping experience.

### 1. Search and Browse
1. Go to the **Home** page.
2. Use the search bar to search for the product you just created as a seller.
3. Filter products by category using the category icons.
4. **Expected Result:** The newly created product should appear in the search results.

### 2. Product Details & Recommendations
1. Click on the product to view its `ProductDetails` page.
2. Scroll down to look for the **Recommended Products** carousel.
3. **Expected Result:** The Python ML service (`:8000`) should return recommendations based on collaborative filtering. Check the FastAPI terminal for API hits.

### 3. Cart & Checkout
1. Click **Add to Cart** on the product page.
2. Navigate to your **Cart** (`/cart`). Ensure the quantity and price calculations are correct.
3. Click **Proceed to Checkout**.
4. Enter dummy shipping information and place the order.
5. **Expected Result:** The order should be placed successfully and appear in your `CustomerDashboard` under "My Orders".

---

## Phase 4: Delivery Partner & Order Fulfillment
Log in with your **Delivery Partner** account.

1. Navigate to the **Delivery Dashboard**.
2. Look for "Available Deliveries" or "Pending Orders". (Depending on how the order assignment works, the order placed in Phase 3 should appear here).
3. Accept the delivery and update its status to "In Transit", then "Delivered".
4. **Expected Result:** Your partner stats (deliveries, earnings) should increment.

---

## Phase 5: Admin Panel & ML Fairness Config
Log in with an **Admin** account (if you have one pre-seeded).

1. Navigate to the **Admin Dashboard** (`/dashboard/admin`).
2. Review the platform statistics (total users, total orders, etc.).
3. Navigate to the **Fairness Config Panel** (`FairnessConfigPanel.tsx`).
4. Adjust the sliders for the recommendation algorithm (e.g., boosting visibility for newer artisans).
5. Save the configuration.
6. **Expected Result:** The configuration should be sent to the Python recommendation service, altering the behavior of the ML model.

---

## Phase 6: Background Tasks (Celery)
The Python backend uses Celery to update recommendation scores asynchronously.

1. Perform a few actions as a customer (e.g., viewing different products, adding items to the wishlist).
2. Check your Celery terminal (`celery -A app.workers.celery_a...`).
3. **Expected Result:** You should see background tasks being triggered (like `train_collaborative_model` or telemetry updates) processing these interactions.
