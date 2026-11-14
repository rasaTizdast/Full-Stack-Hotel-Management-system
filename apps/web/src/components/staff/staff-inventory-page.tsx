'use client';

import { useEffect, useState, type FormEvent } from 'react';
import {
  StaffApiError,
  getStaffInventoryRange,
  getStaffInventoryRoomTypes,
  updateStaffInventoryRange,
  type StaffInventoryRangeResponse,
  type StaffInventoryRoomType,
} from '@/lib/staff-api';
import { formatPersianInteger } from '@/lib/jalali-date';
import {
  getDefaultInventoryRangeInput,
  parseInventoryCapacityInput,
  parseInventoryPriceInput,
  validateInventoryRangeInput,
  type InventoryRangeInput,
} from '@/lib/staff-inventory';
import { StaffInventoryEditor, type InventoryFormErrors } from './staff-inventory-editor';
import { useStaffSession } from './staff-session-provider';

function rangeFieldsFromResponse(inventory: StaffInventoryRangeResponse) {
  const capacities = inventory.nights.map((night) => night.totalRooms);
  const prices = inventory.nights.map((night) => night.nightlyPriceToman);
  const allCapacitiesMatch =
    capacities.length > 0 && capacities.every((value) => value === capacities[0]);
  const allPricesMatch = prices.length > 0 && prices.every((value) => value === prices[0]);

  return {
    totalRooms: allCapacitiesMatch && capacities[0] !== null ? String(capacities[0]) : '',
    nightlyPriceToman: allPricesMatch && prices[0] !== null ? prices[0] : '',
  };
}

function validationMessageForApiField(field: string): string | undefined {
  const messages: Record<string, string> = {
    startDate: 'تاریخ شروع را به شکل شمسی معتبر وارد کنید.',
    endDate: 'تاریخ پایان را به شکل شمسی معتبر وارد کنید.',
    totalRooms: 'ظرفیت کل باید یک عدد صحیح نامنفی باشد.',
    nightlyPriceToman: 'نرخ شب باید یک مبلغ صحیح نامنفی به تومان باشد.',
  };
  return messages[field];
}

export function StaffInventoryPage() {
  const { status, staff, csrfToken } = useStaffSession();
  const [defaultRange] = useState(() => getDefaultInventoryRangeInput());
  const [roomTypes, setRoomTypes] = useState<StaffInventoryRoomType[]>([]);
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState('');
  const [rangeInput, setRangeInput] = useState<InventoryRangeInput>(defaultRange);
  const [inventory, setInventory] = useState<StaffInventoryRangeResponse | null>(null);
  const [totalRooms, setTotalRooms] = useState('');
  const [nightlyPriceToman, setNightlyPriceToman] = useState('');
  const [fieldErrors, setFieldErrors] = useState<InventoryFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoadingRoomTypes, setIsLoadingRoomTypes] = useState(true);
  const [isLoadingRange, setIsLoadingRange] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (status !== 'authenticated' || staff?.role !== 'ADMIN') return;
    let active = true;

    async function loadRoomTypes() {
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

        setIsLoadingRange(true);
        const result = await getStaffInventoryRange({
          roomTypeId: firstRoomType.id,
          startDate: initialRange.startDate,
          endDate: initialRange.endDate,
        });
        if (!active) return;
        setInventory(result);
        const values = rangeFieldsFromResponse(result);
        setTotalRooms(values.totalRooms);
        setNightlyPriceToman(values.nightlyPriceToman);
      } catch (cause) {
        if (!active) return;
        setFormError(
          cause instanceof Error ? cause.message : 'اطلاعات ظرفیت بارگذاری نشد. دوباره تلاش کنید.',
        );
      } finally {
        if (active) {
          setIsLoadingRoomTypes(false);
          setIsLoadingRange(false);
        }
      }
    }

    void loadRoomTypes();
    return () => {
      active = false;
    };
  }, [defaultRange, staff?.role, status]);

  if (status !== 'authenticated' || !staff) return null;

  if (staff.role !== 'ADMIN') {
    return (
      <section className="staff-inventory-denied" aria-labelledby="staff-inventory-denied-title">
        <p className="staff-inventory__eyebrow">مدیریت اقامتگاه</p>
        <h1 id="staff-inventory-denied-title">دسترسی به مدیریت موجودی</h1>
        <p role="alert">این بخش فقط برای مدیر اقامتگاه در دسترس است.</p>
      </section>
    );
  }

  function updateRangeField(field: keyof InventoryRangeInput, value: string) {
    setRangeInput((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setInventory(null);
    setTotalRooms('');
    setNightlyPriceToman('');
    setSuccessMessage(null);
  }

  function updateRoomType(roomTypeId: string) {
    setSelectedRoomTypeId(roomTypeId);
    setInventory(null);
    setTotalRooms('');
    setNightlyPriceToman('');
    setFieldErrors({});
    setFormError(null);
    setSuccessMessage(null);
  }

  function updateCapacity(value: string) {
    setTotalRooms(value);
    setFieldErrors((current) => ({ ...current, totalRooms: undefined }));
    setSuccessMessage(null);
  }

  function updateNightlyPrice(value: string) {
    setNightlyPriceToman(value);
    setFieldErrors((current) => ({ ...current, nightlyPriceToman: undefined }));
    setSuccessMessage(null);
  }

  async function loadRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    setInventory(null);
    const validation = validateInventoryRangeInput(rangeInput);
    setFieldErrors(validation.errors);
    if (!validation.range || !selectedRoomTypeId) return;

    setIsLoadingRange(true);
    try {
      const result = await getStaffInventoryRange({
        roomTypeId: selectedRoomTypeId,
        startDate: validation.range.startDate,
        endDate: validation.range.endDate,
      });
      setInventory(result);
      const values = rangeFieldsFromResponse(result);
      setTotalRooms(values.totalRooms);
      setNightlyPriceToman(values.nightlyPriceToman);
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : 'اطلاعات ظرفیت بارگذاری نشد. دوباره تلاش کنید.',
      );
    } finally {
      setIsLoadingRange(false);
    }
  }

  async function saveRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccessMessage(null);
    const validation = validateInventoryRangeInput(rangeInput);
    const errors: InventoryFormErrors = validation.errors;
    const capacity = parseInventoryCapacityInput(totalRooms);
    const price = parseInventoryPriceInput(nightlyPriceToman);

    if (capacity === null) errors.totalRooms = 'ظرفیت کل باید یک عدد صحیح از صفر به بالا باشد.';
    if (price === null) errors.nightlyPriceToman = 'نرخ شب را به‌صورت مبلغ صحیح نامنفی وارد کنید.';
    setFieldErrors(errors);
    if (
      capacity === null ||
      price === null ||
      Object.keys(errors).length > 0 ||
      !validation.range ||
      !selectedRoomTypeId ||
      !csrfToken
    ) {
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateStaffInventoryRange(
        {
          roomTypeId: selectedRoomTypeId,
          startDate: validation.range.startDate,
          endDate: validation.range.endDate,
          totalRooms: capacity,
          nightlyPriceToman: price,
        },
        csrfToken,
      );
      setInventory(result);
      const values = rangeFieldsFromResponse(result);
      setTotalRooms(values.totalRooms);
      setNightlyPriceToman(values.nightlyPriceToman);
      setSuccessMessage(
        `ظرفیت و نرخ ${formatPersianInteger(validation.range.numberOfNights)} شب ذخیره شد.`,
      );
    } catch (cause) {
      if (cause instanceof StaffApiError && cause.code === 'CAPACITY_BELOW_RESERVED') {
        setFieldErrors({
          totalRooms: 'ظرفیت نمی‌تواند از مجموع اتاق‌های در انتظار تأیید و رزروشده کمتر باشد.',
        });
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
      setFormError(cause instanceof Error ? cause.message : 'تغییرات ذخیره نشد. دوباره تلاش کنید.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="staff-inventory" aria-labelledby="staff-inventory-title">
      <header className="staff-inventory__header">
        <p className="staff-inventory__eyebrow">نظم هر شب، از همین‌جا</p>
        <h1 id="staff-inventory-title">ظرفیت و نرخ‌ها</h1>
        <p>برای هر اتاق، ظرفیت و نرخ شبانه را در یک بازه بررسی و یک‌جا ویرایش کنید.</p>
      </header>

      <aside className="staff-inventory__snapshot-note">
        <span className="staff-inventory__note-mark" aria-hidden="true">
          ◇
        </span>
        <p>رزروهای ثبت‌شده با قیمت فعلی خود باقی می‌مانند.</p>
      </aside>

      <StaffInventoryEditor
        roomTypes={roomTypes}
        selectedRoomTypeId={selectedRoomTypeId}
        rangeInput={rangeInput}
        inventory={inventory}
        totalRooms={totalRooms}
        nightlyPriceToman={nightlyPriceToman}
        fieldErrors={fieldErrors}
        formError={formError}
        successMessage={successMessage}
        isLoadingRoomTypes={isLoadingRoomTypes}
        isLoadingRange={isLoadingRange}
        isSaving={isSaving}
        onRoomTypeChange={updateRoomType}
        onRangeInputChange={updateRangeField}
        onLoadRange={loadRange}
        onCapacityChange={updateCapacity}
        onPriceChange={updateNightlyPrice}
        onSaveRange={saveRange}
      />
    </section>
  );
}
