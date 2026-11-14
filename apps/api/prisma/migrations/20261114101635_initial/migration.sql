-- CreateEnum
CREATE TYPE "booking_status" AS ENUM ('PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "staff_role" AS ENUM ('ADMIN', 'RECEPTIONIST');

-- CreateTable
CREATE TABLE "hotels" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "address" VARCHAR(500) NOT NULL,
    "description" TEXT NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Tehran',
    "contact_phone" VARCHAR(32),
    "contact_email" VARCHAR(254),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_types" (
    "id" UUID NOT NULL,
    "hotel_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "max_guests_per_room" INTEGER NOT NULL,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_night_inventory" (
    "id" UUID NOT NULL,
    "room_type_id" UUID NOT NULL,
    "stay_date" DATE NOT NULL,
    "total_rooms" INTEGER NOT NULL,
    "held_rooms" INTEGER NOT NULL DEFAULT 0,
    "booked_rooms" INTEGER NOT NULL DEFAULT 0,
    "nightly_price_toman" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "room_night_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "public_reference" VARCHAR(16) NOT NULL,
    "idempotency_key" VARCHAR(128),
    "status" "booking_status" NOT NULL DEFAULT 'PENDING_CONFIRMATION',
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "guest_count" INTEGER NOT NULL,
    "room_type_id" UUID NOT NULL,
    "room_quantity" INTEGER NOT NULL,
    "guest_name" VARCHAR(160) NOT NULL,
    "guest_phone" VARCHAR(32) NOT NULL,
    "guest_email" VARCHAR(254),
    "total_price_toman" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "confirmed_at" TIMESTAMPTZ(3),
    "rejected_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "expired_at" TIMESTAMPTZ(3),

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_nights" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "stay_date" DATE NOT NULL,
    "nightly_price_toman" BIGINT NOT NULL,
    "room_quantity" INTEGER NOT NULL,
    "amount_toman" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_nights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_users" (
    "id" UUID NOT NULL,
    "username" VARCHAR(120) NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" "staff_role" NOT NULL DEFAULT 'RECEPTIONIST',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hotels_slug_key" ON "hotels"("slug");

-- CreateIndex
CREATE INDEX "room_types_hotel_id_is_active_display_order_idx" ON "room_types"("hotel_id", "is_active", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "room_types_hotel_id_slug_key" ON "room_types"("hotel_id", "slug");

-- CreateIndex
CREATE INDEX "room_night_inventory_stay_date_idx" ON "room_night_inventory"("stay_date");

-- CreateIndex
CREATE UNIQUE INDEX "room_night_inventory_room_type_id_stay_date_key" ON "room_night_inventory"("room_type_id", "stay_date");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_public_reference_key" ON "bookings"("public_reference");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_idempotency_key_key" ON "bookings"("idempotency_key");

-- CreateIndex
CREATE INDEX "bookings_status_created_at_idx" ON "bookings"("status", "created_at");

-- CreateIndex
CREATE INDEX "bookings_status_check_in_idx" ON "bookings"("status", "check_in");

-- CreateIndex
CREATE INDEX "bookings_room_type_id_check_in_idx" ON "bookings"("room_type_id", "check_in");

-- CreateIndex
CREATE INDEX "booking_nights_stay_date_idx" ON "booking_nights"("stay_date");

-- CreateIndex
CREATE UNIQUE INDEX "booking_nights_booking_id_stay_date_key" ON "booking_nights"("booking_id", "stay_date");

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_username_key" ON "staff_users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "staff_users_email_key" ON "staff_users"("email");

-- CreateIndex
CREATE INDEX "staff_users_is_active_role_idx" ON "staff_users"("is_active", "role");

-- AddForeignKey
ALTER TABLE "room_types" ADD CONSTRAINT "room_types_hotel_id_fkey" FOREIGN KEY ("hotel_id") REFERENCES "hotels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_night_inventory" ADD CONSTRAINT "room_night_inventory_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_nights" ADD CONSTRAINT "booking_nights_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep cross-column invariants in PostgreSQL so every writer is protected.
ALTER TABLE "room_types"
    ADD CONSTRAINT "room_types_capacity_and_order_check"
    CHECK ("max_guests_per_room" > 0 AND "display_order" >= 0);

ALTER TABLE "room_night_inventory"
    ADD CONSTRAINT "room_night_inventory_counts_check"
    CHECK (
        "total_rooms" >= 0
        AND "held_rooms" >= 0
        AND "booked_rooms" >= 0
        AND "held_rooms" + "booked_rooms" <= "total_rooms"
    ),
    ADD CONSTRAINT "room_night_inventory_price_check"
    CHECK ("nightly_price_toman" >= 0);

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_stay_and_quantity_check"
    CHECK ("check_out" > "check_in" AND "guest_count" > 0 AND "room_quantity" > 0),
    ADD CONSTRAINT "bookings_total_price_check"
    CHECK ("total_price_toman" >= 0);

ALTER TABLE "booking_nights"
    ADD CONSTRAINT "booking_nights_snapshot_check"
    CHECK ("nightly_price_toman" >= 0 AND "room_quantity" > 0 AND "amount_toman" >= 0);
