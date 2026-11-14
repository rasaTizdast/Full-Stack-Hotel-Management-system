import Link from 'next/link';
import type { PublicHotel } from '@/lib/public-api';

type HotelHeroProps = {
  hotel: PublicHotel;
};

function CourtyardIllustration() {
  return (
    <svg
      className="courtyard-art"
      viewBox="0 0 520 620"
      role="img"
      aria-labelledby="courtyard-title courtyard-description"
    >
      <title id="courtyard-title">تصویرسازی حیاط خانه‌باغ</title>
      <desc id="courtyard-description">
        طاقی در میان کاشی‌های آبی، با شاخه‌ای از بهارنارنج و پنجره‌ای رو به حیاط.
      </desc>
      <rect width="520" height="620" fill="#17433d" />
      <path d="M0 454h520v166H0z" fill="#123631" />
      <path d="M46 0h428v475H46z" fill="#20564f" />
      <path d="M81 475V224a179 179 0 0 1 358 0v251z" fill="#d4ad63" />
      <path d="M111 475V224a149 149 0 0 1 298 0v251z" fill="#173c37" />
      <path d="M155 475V236a105 105 0 0 1 210 0v239z" fill="#80b6aa" />
      <path d="M184 475V236a76 76 0 0 1 152 0v239z" fill="#e9d9b5" />
      <path d="M208 475V237a52 52 0 0 1 104 0v238z" fill="#b85e49" />
      <path d="M229 475V238a31 31 0 0 1 62 0v237z" fill="#f4e9cc" />
      <path d="M60 496h400v12H60z" fill="#d4ad63" />
      <path d="M82 518h356v14H82z" fill="#80b6aa" />
      <path d="M52 548h416v12H52z" fill="#d4ad63" />
      <path d="M44 580h432v40H44z" fill="#20564f" />
      <path d="M384 75c-44 28-72 70-82 126" fill="none" stroke="#e7c46f" strokeWidth="7" />
      <path d="M352 119c-31-3-50-18-55-45 29 1 49 16 55 45Z" fill="#8fbb78" />
      <path d="M325 159c-30-13-42-35-37-61 27 10 40 31 37 61Z" fill="#b0cf8c" />
      <path d="M307 201c-28-19-35-43-24-67 24 16 33 39 24 67Z" fill="#8fbb78" />
      <circle cx="367" cy="90" r="12" fill="#d86e4f" />
      <circle cx="338" cy="142" r="10" fill="#d86e4f" />
      <circle cx="321" cy="184" r="8" fill="#d86e4f" />
      <circle cx="108" cy="91" r="29" fill="#d4ad63" />
      <path
        d="M109 57v68M75 91h68M85 67l48 48M133 67l-48 48"
        stroke="#f3e3bb"
        strokeWidth="2"
        opacity=".8"
      />
      <path d="M0 170h46M474 170h46M0 190h46M474 190h46" stroke="#80b6aa" strokeWidth="9" />
      <path d="M0 211h46M474 211h46M0 231h46M474 231h46" stroke="#d4ad63" strokeWidth="5" />
      <circle cx="252" cy="408" r="7" fill="#17433d" />
    </svg>
  );
}

export function HotelHero({ hotel }: HotelHeroProps) {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__copy">
        <p className="eyebrow hero__eyebrow">اقامت در شیراز</p>
        <h1 id="hero-title">{hotel.name}</h1>
        <p className="hero__description">{hotel.description}</p>
        <div className="hero__actions">
          <Link className="button button--light" href="/rooms">
            دیدن اتاق‌ها <span aria-hidden="true">←</span>
          </Link>
          <a className="text-link text-link--light" href="#location">
            نشانی اقامتگاه
          </a>
        </div>
        <p className="hero__address">
          <span className="hero__address-mark" aria-hidden="true">
            ◉
          </span>
          {hotel.address}
        </p>
      </div>
      <div className="hero__art-wrap">
        <div className="hero__art-frame">
          <CourtyardIllustration />
        </div>
        <p className="hero__art-caption">تصویرسازی حیاط اقامتگاه</p>
      </div>
    </section>
  );
}
