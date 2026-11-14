export interface BookingResponseDto {
  reference: string;
  status: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  roomQuantity: number;
  roomType: {
    slug: string;
    name: string;
  };
  priceSummary: {
    numberOfNights: number;
    totalPriceToman: string;
    nights: Array<{
      stayDate: string;
      nightlyPriceToman: string;
      roomQuantity: number;
      amountToman: string;
    }>;
  };
}
