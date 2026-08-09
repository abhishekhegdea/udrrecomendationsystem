-- Add an audit reference from OrderItem to the persisted CartItem row the
-- order item was created from. Kept as a plain nullable column (no FK) so
-- the reference survives when the cart row is consumed at checkout.

ALTER TABLE "OrderItem"
  ADD COLUMN IF NOT EXISTS "cartItemId" TEXT;
