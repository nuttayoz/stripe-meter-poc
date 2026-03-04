-- CreateTable
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "stripe_price_id" TEXT NOT NULL,
    "stripe_subscription_id" TEXT NOT NULL,
    "billing_strategy" "BillingStrategy" NOT NULL,
    "units" INTEGER NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL,
    "stripe_meter_event_id" TEXT,
    "stripe_meter_event_identifier" TEXT,
    "error_message" TEXT,
    "raw_payload" JSONB,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_period_usage" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "stripe_price_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "total_units" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_period_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_peak_usage_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "stripe_price_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "peak_units" INTEGER NOT NULL,
    "source_user_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "stripe_meter_event_id" TEXT,
    "stripe_meter_event_identifier" TEXT,
    "error_message" TEXT,
    "raw_payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_peak_usage_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usage_events_idempotency_key_key" ON "usage_events"("idempotency_key");

-- CreateIndex
CREATE INDEX "usage_events_organization_id_idx" ON "usage_events"("organization_id");

-- CreateIndex
CREATE INDEX "usage_events_organization_id_stripe_price_id_idx" ON "usage_events"("organization_id", "stripe_price_id");

-- CreateIndex
CREATE INDEX "usage_events_user_id_idx" ON "usage_events"("user_id");

-- CreateIndex
CREATE INDEX "usage_events_stripe_subscription_id_idx" ON "usage_events"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "usage_events_status_idx" ON "usage_events"("status");

-- CreateIndex
CREATE INDEX "member_period_usage_organization_id_stripe_price_id_period__idx" ON "member_period_usage"("organization_id", "stripe_price_id", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "member_period_usage_organization_id_stripe_price_id_user_id_key" ON "member_period_usage"("organization_id", "stripe_price_id", "user_id", "period_start", "period_end");

-- CreateIndex
CREATE UNIQUE INDEX "org_peak_usage_snapshots_idempotency_key_key" ON "org_peak_usage_snapshots"("idempotency_key");

-- CreateIndex
CREATE INDEX "org_peak_usage_snapshots_organization_id_stripe_price_id_pe_idx" ON "org_peak_usage_snapshots"("organization_id", "stripe_price_id", "period_start", "period_end");

-- CreateIndex
CREATE INDEX "org_peak_usage_snapshots_status_idx" ON "org_peak_usage_snapshots"("status");

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_period_usage" ADD CONSTRAINT "member_period_usage_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_period_usage" ADD CONSTRAINT "member_period_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_peak_usage_snapshots" ADD CONSTRAINT "org_peak_usage_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_peak_usage_snapshots" ADD CONSTRAINT "org_peak_usage_snapshots_source_user_id_fkey" FOREIGN KEY ("source_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
