'use client';
import { staffClass } from '@/components/staff/staff-classes';


import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  StaffApiError,
  getStaffInventoryRange,
  getStaffInventoryRoomTypes,
  updateStaffInventoryRange,
  type StaffInventoryRangeResponse,
  type StaffInventoryRoomTypeOption,
} from '@/lib/staff-api';
import { formatPersianInteger } from '@/lib/jalali-date';
import {
  getDefaultInventoryRangeInput,
  parseInventoryPriceInput,
  validateInventoryRangeInput,
  type InventoryRangeInput,
} from '@/lib/staff-inventory';
import { StaffInventoryEditor, type InventoryFormErrors } from './staff-inventory-editor';
import { useStaffSession } from './staff-session-provider';

function rangeFieldsFromResponse(inventory: StaffInventoryRangeResponse) {
  const prices = inventory.nights.map((night) => night.nightlyPriceToman);
  const allPricesMatch = prices.length > 0 && prices.every((value) => value === prices[0]);

  return {
    nightlyPriceToman: allPricesMatch && prices[0] !== null ? prices[0] : '',
  };
}

function validationMessageForApiField(field: string): string | undefined {
  const messages: Record<string, string> = {
    startDate: 'تاریخ شروع را به شکل شمسی معتبر وارد کنید.',
    endDate: 'تاریخ پایان را به شکل شمسی معتبر وارد کنید.',
    nightlyPriceToman: 'نرخ شب باید یک مبلغ صحیح نامنفی به تومان باشد.',
  };
  return messages[field];
}

const historicalRateReadOnlyMessage =
  'نرخ شب‌های گذشته قابل ویرایش نیست. بازه‌ای از امروز یا بعد از آن انتخاب کنید.';

export function StaffInventoryPage() {
  const { status, staff, csrfToken } = useStaffSession();
  const [defaultRange] = useState(() => getDefaultInventoryRangeInput());
  const [roomTypes, setRoomTypes] = useState<StaffInventoryRoomTypeOption[]>([]);
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState('');
  const [rangeInput, setRangeInput] = useState<InventoryRangeInput>(defaultRange);
  const [inventory, setInventory] = useState<StaffInventoryRangeResponse | null>(null);
  const [nightlyPriceToman, setNightlyPriceToman] = useState('');
  const [fieldErrors, setFieldErrors] = useState<InventoryFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isLoadingRoomTypes, setIsLoadingRoomTypes] = useState(true);
  const [isLoadingRange, setIsLoadingRange] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const rangeRequestId = useRef(0);
  const canManageInventory = Boolean(staff && ['ADMIN', 'MANAGER'].includes(staff.role));

  useEffect(() => {
    if (status !== 'authenticated' || !canManageInventory) return;
    let active = true;

    async function loadRoomTypes() {
      let rangeRequestIdForLoad: number | null = null;
      setIsLoadingRoomTypes(true);
      setFormError(null);
      try {
        const options = await getStaffInventoryRoomTypes();
        if (!active) return;
        setRoomTypes(options);
        const firstRoomType = options[0];
        if (!firstRoomType) return;

        setSelectedRoomTypeId(firstRoomType.id);
        const initialRange = validateInventoryRangeInput(defaultRange).range;
        if (!initialRange) return;

        rangeRequestIdForLoad = ++rangeRequestId.current;
        setIsLoadingRange(true);
        const result = await getStaffInventoryRange({
          roomTypeId: firstRoomType.id,
          startDate: initialRange.startDate,
          endDate: initialRange.endDate,
        });
        if (!active || rangeRequestId.current !== rangeRequestIdForLoad) return;
        setInventory(result);
        const values = rangeFieldsFromResponse(result);
        setNightlyPriceToman(values.nightlyPriceToman);
      } catch (cause) {
        if (!active) return;
        if (rangeRequestIdForLoad !== null && rangeRequestId.current !== rangeRequestIdForLoad) {
          return;
        }
        setFormError(
          cause instanceof Error ? cause.message : 'اطلاعات ظرفیت بارگذاری نشد. دوباره تلاش کنید.',
        );
      } finally {
        if (active) {
          setIsLoadingRoomTypes(false);
          if (rangeRequestIdForLoad === null || rangeRequestId.current === rangeRequestIdForLoad) {
            setIsLoadingRange(false);
          }
        }
      }
    }

    void loadRoomTypes();
    return () => {
      active = false;
    };
  }, [canManageInventory, defaultRange, status]);

  if (status !== 'authenticated' || !staff) return null;

  if (!canManageInventory) {
    return (
      <section className={staffClass('staff-inventory-denied')} aria-labelledby="staff-inventory-denied-title">
        <h1 id="staff-inventory-denied-title">دسترسی به مدیریت موجودی</h1>
        <p role="alert">این بخش برای مدیر اقامتگاه و مدیر شیفت در دسترس است.</p>
      </section>
    );
  }

  function updateRangeField(field: keyof InventoryRangeInput, value: string) {
    rangeRequestId.current += 1;
    setRangeInput((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setInventory(null);
    setNightlyPriceToman('');
    setIsLoadingRange(false);
  }

  function updateRoomType(roomTypeId: string) {
    rangeRequestId.current += 1;
    setSelectedRoomTypeId(roomTypeId);
    setInventory(null);
    setNightlyPriceToman('');
    setFieldErrors({});
    setFormError(null);
    setIsLoadingRange(false);
  }

  function updateNightlyPrice(value: string) {
    setNightlyPriceToman(value);
    setFieldErrors((current) => ({ ...current, nightlyPriceToman: undefined }));
  }

  async function loadRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setInventory(null);
    const validation = validateInventoryRangeInput(rangeInput);
    setFieldErrors(validation.errors);
    if (!validation.range || !selectedRoomTypeId) return;

    const requestId = ++rangeRequestId.current;
    const roomTypeId = selectedRoomTypeId;
    setIsLoadingRange(true);
    try {
      const result = await getStaffInventoryRange({
        roomTypeId,
        startDate: validation.range.startDate,
        endDate: validation.range.endDate,
      });
      if (rangeRequestId.current !== requestId) return;
      setInventory(result);
      const values = rangeFieldsFromResponse(result);
      setNightlyPriceToman(values.nightlyPriceToman);
    } catch (cause) {
      if (rangeRequestId.current !== requestId) return;
      const message =
        cause instanceof Error ? cause.message : 'اطلاعات ظرفیت بارگذاری نشد. دوباره تلاش کنید.';
      setFormError(message);
    } finally {
      if (rangeRequestId.current === requestId) setIsLoadingRange(false);
    }
  }

  async function saveRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const validation = validateInventoryRangeInput(rangeInput);
    const errors: InventoryFormErrors = validation.errors;
    const price = parseInventoryPriceInput(nightlyPriceToman);

    if (price === null) errors.nightlyPriceToman = 'نرخ شب را به‌صورت مبلغ صحیح نامنفی وارد کنید.';
    setFieldErrors(errors);
    if (
      price === null ||
      Object.keys(errors).length > 0 ||
      !validation.range ||
      !selectedRoomTypeId
    ) {
      return;
    }
    if (!csrfToken) {
      setFormError('نشست کارکنان معتبر نیست. دوباره وارد شوید.');
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateStaffInventoryRange(
        {
          roomTypeId: selectedRoomTypeId,
          startDate: validation.range.startDate,
          endDate: validation.range.endDate,
          nightlyPriceToman: price,
        },
        csrfToken,
      );
      setInventory(result);
      const values = rangeFieldsFromResponse(result);
      setNightlyPriceToman(values.nightlyPriceToman);
      toast.success('نرخ شبانه به‌روز شد', {
        description: `${formatPersianInteger(validation.range.numberOfNights)} شب ذخیره شد.`,
      });
    } catch (cause) {
      if (cause instanceof StaffApiError && cause.code === 'CAPACITY_BELOW_RESERVED') {
        setFormError(
          'ظرفیت فیزیکی با اتاق‌های رزروشده هم‌خوان نیست؛ تغییر ظرفیت فقط از مدیریت اتاق‌های فیزیکی انجام می‌شود.',
        );
        return;
      }
      if (cause instanceof StaffApiError && cause.code === 'HISTORICAL_INVENTORY_READ_ONLY') {
        setFormError(historicalRateReadOnlyMessage);
        return;
      }
      if (cause instanceof StaffApiError && cause.fields?.length) {
        const apiErrors = cause.fields.reduce<InventoryFormErrors>((result, field) => {
          const message = validationMessageForApiField(field.field);
          if (message) result[field.field as keyof InventoryFormErrors] = message;
          return result;
        }, {});
        setFieldErrors(apiErrors);
        if (Object.keys(apiErrors).length > 0) return;
      }
      const message =
        cause instanceof Error ? cause.message : 'تغییرات ذخیره نشد. دوباره تلاش کنید.';
      setFormError(message);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className={staffClass('staff-inventory')} aria-labelledby="staff-inventory-title">
      <header className={staffClass('staff-inventory__header')}>
        <h1 id="staff-inventory-title">ظرفیت و نرخ‌ها</h1>
        <p>ظرفیت فیزیکی را در بازهٔ اقامت ببینید و نرخ شبانه را برای چند شب یک‌جا تنظیم کنید.</p>
      </header>

      <aside className={staffClass('staff-inventory__snapshot-note')}>
        <span className={staffClass('staff-inventory__note-mark')} aria-hidden="true">
          ◇
        </span>
        <div>
          <p>قیمت ثبت‌شده برای رزروهای موجود تغییر نمی‌کند.</p>
          <p>ظرفیت از اتاق‌های فعال و مسدودی‌های هر شب به‌صورت خودکار محاسبه می‌شود.</p>
        </div>
        <Link className={staffClass('staff-inventory__rooms-link')} href="/staff/rooms/manage">
          مدیریت اتاق‌های فیزیکی
        </Link>
      </aside>

      <StaffInventoryEditor
        roomTypes={roomTypes}
        selectedRoomTypeId={selectedRoomTypeId}
        rangeInput={rangeInput}
        inventory={inventory}
        nightlyPriceToman={nightlyPriceToman}
        fieldErrors={fieldErrors}
        formError={formError}
        isLoadingRoomTypes={isLoadingRoomTypes}
        isLoadingRange={isLoadingRange}
        isSaving={isSaving}
        onRoomTypeChange={updateRoomType}
        onRangeInputChange={updateRangeField}
        onLoadRange={loadRange}
        onPriceChange={updateNightlyPrice}
        onSaveRange={saveRange}
      />
    </section>
  );
}
