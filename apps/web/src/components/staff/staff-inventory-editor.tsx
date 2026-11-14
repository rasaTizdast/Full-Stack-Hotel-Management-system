'use client';

import type { FormEvent } from 'react';
import type {
  StaffInventoryNight,
  StaffInventoryRangeResponse,
  StaffInventoryRoomType,
} from '@/lib/staff-api';
import { formatGregorianAsJalali, formatPersianInteger } from '@/lib/jalali-date';
import {
  normalizeInventoryNumericInput,
  type InventoryRangeErrors,
  type InventoryRangeInput,
} from '@/lib/staff-inventory';

export type InventoryFormErrors = InventoryRangeErrors & {
  totalRooms?: string;
  nightlyPriceToman?: string;
};

interface StaffInventoryEditorProps {
  roomTypes: StaffInventoryRoomType[];
  selectedRoomTypeId: string;
  rangeInput: InventoryRangeInput;
  inventory: StaffInventoryRangeResponse | null;
  totalRooms: string;
  nightlyPriceToman: string;
  fieldErrors: InventoryFormErrors;
  formError: string | null;
  successMessage: string | null;
  isLoadingRoomTypes: boolean;
  isLoadingRange: boolean;
  isSaving: boolean;
  onRoomTypeChange: (roomTypeId: string) => void;
  onRangeInputChange: (field: keyof InventoryRangeInput, value: string) => void;
  onLoadRange: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onCapacityChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onSaveRange: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

function formatNightValue(value: number | null): string {
  return value === null ? 'تنظیم نشده' : formatPersianInteger(value);
}

function formatTomanValue(value: string | null): string {
  if (value === null) return 'تنظیم نشده';
  return /^\d+$/.test(value) ? formatPersianInteger(BigInt(value)) : 'نامعتبر';
}

function formatNightDate(value: string): string {
  return formatGregorianAsJalali(value) ?? value;
}

function NightRow({ night }: { night: StaffInventoryNight }) {
  return (
    <tr>
      <th scope="row">
        <time dateTime={night.stayDate}>{formatNightDate(night.stayDate)}</time>
      </th>
      <td>{formatNightValue(night.totalRooms)}</td>
      <td>{formatNightValue(night.bookedRooms)}</td>
      <td>{formatNightValue(night.heldRooms)}</td>
      <td>{formatNightValue(night.availableRooms)}</td>
      <td>
        <bdi>{formatTomanValue(night.nightlyPriceToman)}</bdi>
      </td>
    </tr>
  );
}

function DateField({
  id,
  label,
  value,
  help,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  help: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  return (
    <div className="staff-inventory__field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="۱۴۰۵/۰۸/۲۴"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : helpId}
      />
      <span id={helpId} className="staff-inventory__hint">
        {help}
      </span>
      {error ? (
        <span id={errorId} className="staff-inventory__field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function NumericField({
  id,
  label,
  value,
  help,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  help: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  return (
    <div className="staff-inventory__field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        inputMode="numeric"
        dir="ltr"
        value={value}
        onChange={(event) => onChange(normalizeInventoryNumericInput(event.target.value))}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : helpId}
      />
      <span id={helpId} className="staff-inventory__hint">
        {help}
      </span>
      {error ? (
        <span id={errorId} className="staff-inventory__field-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

export function StaffInventoryEditor({
  roomTypes,
  selectedRoomTypeId,
  rangeInput,
  inventory,
  totalRooms,
  nightlyPriceToman,
  fieldErrors,
  formError,
  successMessage,
  isLoadingRoomTypes,
  isLoadingRange,
  isSaving,
  onRoomTypeChange,
  onRangeInputChange,
  onLoadRange,
  onCapacityChange,
  onPriceChange,
  onSaveRange,
}: StaffInventoryEditorProps) {
  const selectedRoomType = roomTypes.find((roomType) => roomType.id === selectedRoomTypeId);

  return (
    <>
      <form
        className="staff-inventory__range-form"
        onSubmit={onLoadRange}
        aria-label="انتخاب بازه ظرفیت"
      >
        <div className="staff-inventory__range-heading">
          <span className="staff-inventory__eyebrow">نمای شبانه</span>
          <h2>یک بازه را برای بررسی انتخاب کنید</h2>
        </div>

        <div className="staff-inventory__range-fields">
          <div className="staff-inventory__field staff-inventory__field--room">
            <label htmlFor="staff-inventory-room-type">نوع اتاق</label>
            <select
              id="staff-inventory-room-type"
              value={selectedRoomTypeId}
              disabled={isLoadingRoomTypes || roomTypes.length === 0}
              onChange={(event) => onRoomTypeChange(event.target.value)}
            >
              {roomTypes.length === 0 ? <option value="">اتاقی برای نمایش نیست</option> : null}
              {roomTypes.map((roomType) => (
                <option key={roomType.id} value={roomType.id}>
                  {roomType.name}
                </option>
              ))}
            </select>
          </div>

          <DateField
            id="staff-inventory-start-date"
            label="شروع بازه"
            value={rangeInput.startDate}
            help="سال / ماه / روز شمسی"
            error={fieldErrors.startDate}
            onChange={(value) => onRangeInputChange('startDate', value)}
          />
          <DateField
            id="staff-inventory-end-date"
            label="پایان بازه"
            value={rangeInput.endDate}
            help="روز پایان در بازه حساب نمی‌شود"
            error={fieldErrors.endDate}
            onChange={(value) => onRangeInputChange('endDate', value)}
          />

          <button
            className="button button--jade staff-inventory__load"
            type="submit"
            disabled={isLoadingRoomTypes || isLoadingRange || !selectedRoomTypeId}
          >
            {isLoadingRange ? 'در حال بارگذاری…' : 'نمایش بازه'}
          </button>
        </div>
      </form>

      {formError ? (
        <p className="staff-inventory__message staff-inventory__message--error" role="alert">
          {formError}
        </p>
      ) : null}
      {successMessage ? (
        <p className="staff-inventory__message staff-inventory__message--success" role="status">
          {successMessage}
        </p>
      ) : null}

      {isLoadingRoomTypes && !formError ? (
        <p className="staff-inventory__loading" role="status" aria-live="polite">
          در حال دریافت نوع اتاق‌ها…
        </p>
      ) : null}

      {!isLoadingRoomTypes && roomTypes.length === 0 && !formError ? (
        <p className="staff-inventory__empty" role="status">
          هنوز نوع اتاق فعالی برای تنظیم ظرفیت ثبت نشده است.
        </p>
      ) : null}

      {inventory ? (
        <>
          <section
            className="staff-inventory__overview"
            aria-labelledby="staff-inventory-overview-title"
          >
            <div className="staff-inventory__overview-heading">
              <div>
                <p className="staff-inventory__eyebrow">وضعیت بازه</p>
                <h2 id="staff-inventory-overview-title">
                  {selectedRoomType?.name ?? inventory.roomType.name}
                </h2>
              </div>
              <span className="staff-inventory__night-count">
                {formatPersianInteger(inventory.nights.length)} شب
              </span>
            </div>

            <div
              className="staff-inventory__table-scroll"
              tabIndex={0}
              aria-label="جدول ظرفیت و نرخ شبانه؛ برای مشاهده در صفحه کوچک افقی حرکت کنید"
            >
              <table aria-label="وضعیت ظرفیت و نرخ هر شب">
                <thead>
                  <tr>
                    <th scope="col">شب اقامت</th>
                    <th scope="col">ظرفیت کل</th>
                    <th scope="col">رزرو قطعی</th>
                    <th scope="col">در انتظار</th>
                    <th scope="col">اتاق آزاد</th>
                    <th scope="col">نرخ شبانه (تومان)</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.nights.map((night) => (
                    <NightRow key={night.stayDate} night={night} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <form
            className="staff-inventory__edit-form"
            onSubmit={onSaveRange}
            aria-label="ویرایش ظرفیت و نرخ بازه"
          >
            <div className="staff-inventory__edit-heading">
              <div>
                <p className="staff-inventory__eyebrow">اعمال یکسان به همه شب‌ها</p>
                <h2>ویرایش بازه</h2>
              </div>
              <p>مقدارهای تازه برای همه شب‌های انتخاب‌شده ذخیره می‌شوند.</p>
            </div>

            <div className="staff-inventory__edit-fields">
              <NumericField
                id="staff-inventory-capacity"
                label="ظرفیت کل اتاق‌ها"
                value={totalRooms}
                help="عدد کل اتاق‌هایی که برای هر شب قابل عرضه است"
                error={fieldErrors.totalRooms}
                onChange={onCapacityChange}
              />
              <NumericField
                id="staff-inventory-nightly-price"
                label="نرخ یک شب (تومان)"
                value={nightlyPriceToman}
                help="مبلغ را با رقم وارد کنید؛ قیمت رزروهای فعلی تغییر نمی‌کند"
                error={fieldErrors.nightlyPriceToman}
                onChange={onPriceChange}
              />

              <button
                className="button button--jade staff-inventory__save"
                type="submit"
                disabled={isSaving || isLoadingRange}
              >
                {isSaving ? 'در حال ذخیره…' : 'ذخیره برای همه شب‌ها'}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </>
  );
}
