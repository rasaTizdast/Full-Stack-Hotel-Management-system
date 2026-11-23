'use client';

import { Toaster as Sonner, type ToasterProps } from 'sonner';

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      position="top-center"
      dir="rtl"
      containerAriaLabel="اعلان‌ها"
      theme="light"
      richColors
      closeButton
      duration={5000}
      toastOptions={{
        classNames: {
          toast: 'font-sans',
          title: 'font-sans font-semibold',
          description: 'font-sans',
        },
        closeButtonAriaLabel: 'بستن اعلان',
      }}
      {...props}
    />
  );
}

export { Toaster };
