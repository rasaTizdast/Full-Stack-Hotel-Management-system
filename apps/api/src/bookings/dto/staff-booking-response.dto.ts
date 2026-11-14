export interface StaffBookingListItemDto {
  reference: string;
  status: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  roomQuantity: number;
  guestName: string;
  guestPhone: string;
  roomType: { slug: string; name: string };
  createdAt: string;
  expiresAt: string;
}

export interface StaffBookingNightDto {
  stayDate: string;
  nightlyPriceToman: string;
  roomQuantity: number;
  amountToman: string;
}

export interface StaffBookingDetailDto extends StaffBookingListItemDto {
  guestEmail: string | null;
  totalPriceToman: string;
  internalNote: string | null;
  cancellationReason: string | null;
  statusTimestamps: {
    confirmedAt: string | null;
    rejectedAt: string | null;
    cancelledAt: string | null;
    expiredAt: string | null;
  };
  nights: StaffBookingNightDto[];
}

export interface StaffBookingListDto {
  items: StaffBookingListItemDto[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}
