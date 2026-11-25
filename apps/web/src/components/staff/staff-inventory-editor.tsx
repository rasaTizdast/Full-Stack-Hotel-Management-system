'use client';
import { staffClass } from '@/components/staff/staff-classes';

import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  StaffInventoryNight,
  StaffInventoryRangeResponse,
  StaffInventoryRoomTypeOption,
} from '@/lib/staff-api';
import { formatGregorianAsJalali, formatPersianInteger } from '@/lib/jalali-date';
import {
  normalizeInventoryNumericInput,
  parseInventoryPriceInput,
  type InventoryRangeErrors,
  type InventoryRangeInput,
} from '@/lib/staff-inventory';

export type InventoryFormErrors = InventoryRangeErrors & {
  nightlyPriceToman?: string;
};

interface StaffInventoryEditorProps {
  roomTypes: StaffInventoryRoomTypeOption[];
  selectedRoomTypeId: string;
  rangeInput: InventoryRangeInput;
  inventory: StaffInventoryRangeResponse | null;
  nightlyPriceToman: string;
  fieldErrors: InventoryFormErrors;
  formError: string | null;
  isLoadingRoomTypes: boolean;
  isLoadingRange: boolean;
  isSaving: boolean;
  onRoomTypeChange: (roomTypeId: string) => void;
  onRangeInputChange: (field: keyof InventoryRangeInput, value: string) => void;
  onLoadRange: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  onPriceChange: (value: string) => void;
  onSaveRange: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}

function formatNightValue(night: StaffInventoryNight, value: number | null): string {
  if (night.capacitySource === 'UNAVAILABLE' || value === null) return 'نامشخص';
  return formatPersianInteger(value);
}

function formatActiveRoomCount(night: StaffInventoryNight): string {
  if (
    night.capacitySource === 'UNAVAILABLE' ||
    night.totalRooms === null ||
    night.blockedRooms === null
  ) {
    return 'نامشخص';
  }
  return formatPersianInteger(night.totalRooms + night.blockedRooms);
}

function capacitySourceLabel(night: StaffInventoryNight): string {
  if (night.capacitySource === 'UNAVAILABLE') return 'تاریخچه ظرفیت در دسترس نیست';
  if (night.capacitySource === 'HISTORICAL') return 'ظرفیت ثبت‌شده';
  return 'ظرفیت محاسبه‌شده';
}

function formatTomanValue(
  value: string | null,
  capacitySource: StaffInventoryNight['capacitySource'],
): string {
  if (value === null) return capacitySource === 'UNAVAILABLE' ? 'نامشخص' : 'نرخ ثبت نشده';
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
        <span className={staffClass('staff-inventory__capacity-source')}>
          {capacitySourceLabel(night)}
        </span>
      </th>
      <td>{formatActiveRoomCount(night)}</td>
      <td>{formatNightValue(night, night.blockedRooms)}</td>
      <td>{formatNightValue(night, night.heldRooms)}</td>
      <td>{formatNightValue(night, night.bookedRooms)}</td>
      <td>{formatNightValue(night, night.availableRooms)}</td>
      <td
        className={
          night.nightlyPriceToman === null ? staffClass('staff-inventory__missing-rate') : undefined
        }
      >
        <bdi>{formatTomanValue(night.nightlyPriceToman, night.capacitySource)}</bdi>
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
    <Field className={staffClass('staff-inventory__field')} data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        className={staffClass('staff-inventory__input')}
        id={id}
        inputMode="numeric"
        autoComplete="off"
        placeholder="۱۴۰۵/۰۸/۲۴"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : helpId}
      />
      <FieldDescription id={helpId} className={staffClass('staff-inventory__hint')}>
        {help}
      </FieldDescription>
      <FieldError id={errorId} className={staffClass('staff-inventory__field-error')}>
        {error}
      </FieldError>
    </Field>
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
    <Field className={staffClass('staff-inventory__field')} data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        className={staffClass('staff-inventory__input')}
        id={id}
        inputMode="numeric"
        dir="ltr"
        value={value}
        onChange={(event) => onChange(normalizeInventoryNumericInput(event.target.value))}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : helpId}
      />
      <FieldDescription id={helpId} className={staffClass('staff-inventory__hint')}>
        {help}
      </FieldDescription>
      <FieldError id={errorId} className={staffClass('staff-inventory__field-error')}>
        {error}
      </FieldError>
    </Field>
  );
}

type RangePickerProps = Pick<
  StaffInventoryEditorProps,
  | 'roomTypes'
  | 'selectedRoomTypeId'
  | 'rangeInput'
  | 'fieldErrors'
  | 'isLoadingRoomTypes'
  | 'isLoadingRange'
  | 'onRoomTypeChange'
  | 'onRangeInputChange'
  | 'onLoadRange'
>;

function RangePicker({
  roomTypes,
  selectedRoomTypeId,
  rangeInput,
  fieldErrors,
  isLoadingRoomTypes,
  isLoadingRange,
  onRoomTypeChange,
  onRangeInputChange,
  onLoadRange,
}: RangePickerProps) {
  return (
    <form
      className={staffClass('staff-inventory__range-form')}
      onSubmit={onLoadRange}
      aria-label="انتخاب بازه ظرفیت"
    >
      <div className={staffClass('staff-inventory__range-heading')}>
        <h2>یک بازه را برای بررسی انتخاب کنید</h2>
      </div>

      <div className={staffClass('staff-inventory__range-fields')}>
        <Field className={staffClass('staff-inventory__field staff-inventory__field--room')}>
          <FieldLabel htmlFor="staff-inventory-room-type">نوع اتاق</FieldLabel>
          <Select
            items={roomTypes.map((roomType) => ({
              value: roomType.id,
              label: `${roomType.name}${roomType.isActive ? '' : ' (غیرفعال)'}`,
            }))}
            name="roomTypeId"
            value={selectedRoomTypeId}
            disabled={isLoadingRoomTypes || roomTypes.length === 0}
            onValueChange={(value) => onRoomTypeChange(String(value ?? ''))}
          >
            <SelectTrigger id="staff-inventory-room-type">
              <SelectValue placeholder="اتاقی برای نمایش نیست" />
            </SelectTrigger>
            <SelectContent>
              {roomTypes.map((roomType) => (
                <SelectItem key={roomType.id} value={roomType.id}>
                  {roomType.name}
                  {roomType.isActive ? '' : ' (غیرفعال)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

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

        <Button
          className={staffClass('staff-inventory__load')}
          size="lg"
          type="submit"
          disabled={isLoadingRoomTypes || isLoadingRange || !selectedRoomTypeId}
        >
          {isLoadingRange ? 'در حال بارگذاری…' : 'نمایش بازه'}
        </Button>
      </div>
    </form>
  );
}

function EditorMessages({
  formError,
  isLoadingRoomTypes,
  roomTypes,
}: Pick<StaffInventoryEditorProps, 'formError' | 'isLoadingRoomTypes' | 'roomTypes'>) {
  return (
    <>
      {formError ? (
        <p
          className={staffClass('staff-inventory__message staff-inventory__message--error')}
          role="alert"
        >
          {formError}
        </p>
      ) : null}
      {isLoadingRoomTypes && !formError ? (
        <p className={staffClass('staff-inventory__loading')} role="status" aria-live="polite">
          در حال دریافت نوع اتاق‌ها…
        </p>
      ) : null}
      {!isLoadingRoomTypes && roomTypes.length === 0 && !formError ? (
        <p className={staffClass('staff-inventory__empty')} role="status">
          هنوز نوع اتاقی برای تنظیم ظرفیت ثبت نشده است.
        </p>
      ) : null}
    </>
  );
}

function InventoryOverview({
  inventory,
  roomTypeName,
}: {
  inventory: StaffInventoryRangeResponse;
  roomTypeName: string;
}) {
  return (
    <section
      className={staffClass('staff-inventory__overview')}
      aria-labelledby="staff-inventory-overview-title"
    >
      <div className={staffClass('staff-inventory__overview-heading')}>
        <div>
          <h2 id="staff-inventory-overview-title">{roomTypeName}</h2>
        </div>
        <span className={staffClass('staff-inventory__night-count')}>
          {formatPersianInteger(inventory.nights.length)} شب
        </span>
      </div>

      <div className={staffClass('staff-inventory__table-scroll')}>
        <table aria-label="وضعیت ظرفیت و نرخ هر شب">
          <thead>
            <tr>
              <th scope="col">شب اقامت</th>
              <th scope="col">اتاق فعال</th>
              <th scope="col">مسدود</th>
              <th scope="col">در انتظار</th>
              <th scope="col">رزرو قطعی</th>
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

      <div className={staffClass('staff-inventory__night-cards')} aria-label="وضعیت هر شب">
        {inventory.nights.map((night) => (
          <article className={staffClass('staff-inventory__night-card')} key={night.stayDate}>
            <h3>
              <time dateTime={night.stayDate}>{formatNightDate(night.stayDate)}</time>
              <span className={staffClass('staff-inventory__capacity-source')}>
                {capacitySourceLabel(night)}
              </span>
            </h3>
            <dl>
              <div>
                <dt>اتاق فعال</dt>
                <dd>{formatActiveRoomCount(night)}</dd>
              </div>
              <div>
                <dt>مسدود</dt>
                <dd>{formatNightValue(night, night.blockedRooms)}</dd>
              </div>
              <div>
                <dt>در انتظار</dt>
                <dd>{formatNightValue(night, night.heldRooms)}</dd>
              </div>
              <div>
                <dt>رزرو قطعی</dt>
                <dd>{formatNightValue(night, night.bookedRooms)}</dd>
              </div>
              <div>
                <dt>اتاق آزاد</dt>
                <dd>{formatNightValue(night, night.availableRooms)}</dd>
              </div>
              <div
                className={
                  night.nightlyPriceToman === null ? 'staff-inventory__missing-rate' : undefined
                }
              >
                <dt>نرخ شبانه</dt>
                <dd>
                  <bdi>{formatTomanValue(night.nightlyPriceToman, night.capacitySource)}</bdi>
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

type InventoryEditFormProps = Pick<
  StaffInventoryEditorProps,
  | 'fieldErrors'
  | 'inventory'
  | 'nightlyPriceToman'
  | 'isLoadingRange'
  | 'isSaving'
  | 'onPriceChange'
  | 'onSaveRange'
>;

function InventoryEditForm({
  fieldErrors,
  inventory,
  nightlyPriceToman,
  isLoadingRange,
  isSaving,
  onPriceChange,
  onSaveRange,
}: InventoryEditFormProps) {
  const parsedNightlyPrice = parseInventoryPriceInput(nightlyPriceToman);
  const rangeNightCount = inventory?.nights.length ?? 0;
  const rangeTotal =
    parsedNightlyPrice !== null && rangeNightCount > 0
      ? BigInt(parsedNightlyPrice) * BigInt(rangeNightCount)
      : null;
  const historicalRange =
    inventory?.nights.some((night) => night.capacitySource !== 'PROJECTED') ?? false;

  return (
    <form
      id="staff-inventory-rate-form"
      className={staffClass('staff-inventory__edit-form')}
      onSubmit={onSaveRange}
      aria-label="ویرایش نرخ بازه"
    >
      <div className={staffClass('staff-inventory__edit-heading')}>
        <div>
          <h2>تنظیم نرخ شبانه</h2>
        </div>
        <p>
          نرخ تازه برای همه شب‌های انتخاب‌شده ذخیره می‌شود؛ ظرفیت از اتاق‌های فیزیکی محاسبه می‌شود.
        </p>
      </div>

      {historicalRange ? (
        <p className={staffClass('staff-inventory__historical-rate-note')} role="status">
          نرخ شب‌های گذشته قابل ویرایش نیست. بازه‌ای از امروز یا بعد از آن انتخاب کنید.
        </p>
      ) : null}

      <div className={staffClass('staff-inventory__edit-fields')}>
        <NumericField
          id="staff-inventory-nightly-price"
          label="نرخ یک شب (تومان)"
          value={nightlyPriceToman}
          help="مبلغ را با رقم وارد کنید؛ قیمت رزروهای فعلی تغییر نمی‌کند"
          error={fieldErrors.nightlyPriceToman}
          onChange={onPriceChange}
        />

        <Button
          className={staffClass('staff-inventory__save')}
          size="lg"
          type="submit"
          disabled={isSaving || isLoadingRange || historicalRange}
        >
          {isSaving ? 'در حال ذخیره…' : 'ذخیره برای همه شب‌ها'}
        </Button>
      </div>
      {rangeTotal !== null ? (
        <p className={staffClass('staff-inventory__rate-impact')} aria-live="polite" dir="rtl">
          <span className={staffClass('staff-inventory__rate-impact-label')}>جمع نرخ بازه</span>
          <span className={staffClass('staff-inventory__rate-equation')} dir="rtl">
            <span className={staffClass('staff-inventory__money')} dir="rtl">
              <bdi className={staffClass('staff-inventory__money-amount')} dir="ltr">
                {formatPersianInteger(BigInt(parsedNightlyPrice!))}
              </bdi>{' '}
              <span className={staffClass('staff-inventory__money-unit')}>تومان</span>
            </span>{' '}
            <span className={staffClass('staff-inventory__equation-token')}>×</span>{' '}
            <span className={staffClass('staff-inventory__equation-token')}>
              {formatPersianInteger(rangeNightCount)} شب
            </span>{' '}
            <span className={staffClass('staff-inventory__equation-token')}>=</span>{' '}
            <span className={staffClass('staff-inventory__money')} dir="rtl">
              <bdi className={staffClass('staff-inventory__money-amount')} dir="ltr">
                {formatPersianInteger(rangeTotal)}
              </bdi>{' '}
              <span className={staffClass('staff-inventory__money-unit')}>تومان</span>
            </span>
          </span>
        </p>
      ) : null}
    </form>
  );
}

export function StaffInventoryEditor(props: StaffInventoryEditorProps) {
  const selectedRoomType = props.roomTypes.find(
    (roomType) => roomType.id === props.selectedRoomTypeId,
  );

  return (
    <>
      <RangePicker {...props} />
      <EditorMessages {...props} />
      {props.inventory ? (
        <>
          <details className={staffClass('staff-inventory__rate-disclosure')}>
            <summary aria-controls="staff-inventory-rate-form">
              <span>تنظیم نرخ شبانه</span>
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="m5 7.5 5 5 5-5" />
              </svg>
            </summary>
            <InventoryEditForm {...props} />
          </details>
          <InventoryOverview
            inventory={props.inventory}
            roomTypeName={selectedRoomType?.name ?? props.inventory.roomType.name}
          />
        </>
      ) : null}
    </>
  );
}
