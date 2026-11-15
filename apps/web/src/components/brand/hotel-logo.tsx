import Image from 'next/image';

interface HotelLogoProps {
  size?: number;
  className?: string;
}

export function HotelLogo({ size = 48, className }: HotelLogoProps) {
  return (
    <Image
      src="/images/hotel/hotel-mark.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className={className}
      priority={size >= 48}
    />
  );
}
