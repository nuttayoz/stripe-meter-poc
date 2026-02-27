-- CreateEnum
CREATE TYPE "BillingStrategy" AS ENUM ('BASE_PLUS_OVERAGE', 'MAX_MEMBER_USAGE', 'UNKNOWN');

-- CreateTable
CREATE TABLE "billing_products" (
    "id" TEXT NOT NULL,
    "stripe_product_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_prices" (
    "id" TEXT NOT NULL,
    "stripe_price_id" TEXT NOT NULL,
    "stripe_product_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "unit_amount" INTEGER,
    "recurring_interval" TEXT,
    "recurring_interval_count" INTEGER,
    "usage_type" TEXT,
    "meter_id" TEXT,
    "tax_behavior" TEXT,
    "billing_strategy" "BillingStrategy" NOT NULL DEFAULT 'UNKNOWN',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_products_stripe_product_id_key" ON "billing_products"("stripe_product_id");

-- CreateIndex
CREATE UNIQUE INDEX "billing_prices_stripe_price_id_key" ON "billing_prices"("stripe_price_id");

-- CreateIndex
CREATE INDEX "billing_prices_stripe_product_id_idx" ON "billing_prices"("stripe_product_id");

-- AddForeignKey
ALTER TABLE "billing_prices" ADD CONSTRAINT "billing_prices_stripe_product_id_fkey" FOREIGN KEY ("stripe_product_id") REFERENCES "billing_products"("stripe_product_id") ON DELETE RESTRICT ON UPDATE CASCADE;
