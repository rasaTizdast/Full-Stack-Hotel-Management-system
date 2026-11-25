'use client';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

import { useEffect, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { StaffDialogSurface } from '../front-desk/staff-dialog-surface';
import type {
  CompleteHousekeepingTaskInput,
  HousekeepingAssignee,
  HousekeepingRoomOption,
  HousekeepingTask,
  HousekeepingTaskType,
  HousekeepingPriority,
  HousekeepingDiscrepancy,
  ReportHousekeepingDiscrepancyInput,
} from '@/lib/staff-housekeeping-api';
import { PRIORITY_LABELS, TASK_TYPE_LABELS } from './housekeeping-copy';
import { housekeepingClasses as styles } from '../tailwind-classes';

export type HousekeepingDialogState =
  | { kind: 'create' }
  | { kind: 'complete'; task: HousekeepingTask }
  | { kind: 'assign'; task: HousekeepingTask }
  | { kind: 'cancel'; task: HousekeepingTask }
  | { kind: 'report' }
  | { kind: 'dismiss'; discrepancy: HousekeepingDiscrepancy };

interface DialogBaseProps {
  headingRef: RefObject<HTMLHeadingElement | null>;
  busy: boolean;
  error: string | null;
  onClose: () => void;
}

function useFocusHeading(headingRef: RefObject<HTMLHeadingElement | null>) {
  useEffect(() => {
    headingRef.current?.focus();
  }, [headingRef]);
}

function DialogFrame({
  titleId,
  onClose,
  children,
}: Readonly<{
  titleId: string;
  onClose: () => void;
  children: ReactNode;
}>) {
  return (
    <StaffDialogSurface labelledBy={titleId} onClose={onClose}>
      {children}
    </StaffDialogSurface>
  );
}

function DialogFeedback({ error, busy }: { error: string | null; busy: boolean }) {
  return (
    <>
      {error && (
        <p className={styles.alert} role="alert">
          {error}
        </p>
      )}
      {busy && <p role="status">در حال ثبت تغییر…</p>}
    </>
  );
}

function DialogActions({
  cancelLabel = 'بازگشت',
  submitLabel,
  disabled,
  busy,
  onClose,
}: {
  cancelLabel?: string;
  submitLabel: string;
  disabled?: boolean;
  busy: boolean;
  onClose: () => void;
}) {
  return (
    <div className={styles.dialogActions}>
      <button className={styles.primaryButton} type="submit" disabled={disabled || busy}>
        {busy ? 'در حال ثبت…' : submitLabel}
      </button>
      <button className={styles.secondaryButton} type="button" onClick={onClose} disabled={busy}>
        {cancelLabel}
      </button>
    </div>
  );
}

export function CompleteHousekeepingDialog({
  task,
  headingRef,
  busy,
  error,
  onClose,
  onSubmit,
}: DialogBaseProps & {
  task: HousekeepingTask;
  onSubmit: (input: CompleteHousekeepingTaskInput) => void;
}) {
  const [outcome, setOutcome] = useState<CompleteHousekeepingTaskInput['outcome']>('DONE');
  const [reason, setReason] = useState('');
  useFocusHeading(headingRef);
  const isInspection = task.taskType === 'INSPECTION';
  const title = isInspection
    ? `ثبت نتیجهٔ بازرسی اتاق ${task.room.roomNumber}`
    : `ثبت پایان کار اتاق ${task.room.roomNumber}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(outcome === 'NEEDS_REWORK' ? { outcome, reason: reason.trim() } : { outcome: 'DONE' });
  }
  return (
    <DialogFrame titleId="housekeeping-complete-title" onClose={onClose}>
      <h2 id="housekeeping-complete-title" tabIndex={-1} ref={headingRef}>
        {title}
      </h2>
      <p className={styles.dialogLead}>نتیجه پس از ثبت در وضعیت اتاق و کارهای بعدی اعمال می‌شود.</p>
      <form className={styles.dialogForm} onSubmit={submit}>
        {isInspection ? (
          <RadioGroup
            className={styles.radioGroup}
            aria-label="نتیجهٔ بازرسی"
            name="inspection-outcome"
            value={outcome}
            onValueChange={(value) => setOutcome(value as 'DONE' | 'NEEDS_REWORK')}
          >
            <div className={styles.radioOption}>
              <RadioGroupItem value="DONE" />
              <span>بازرسی تأیید شد؛ اتاق آماده است</span>
            </div>
            <div className={styles.radioOption}>
              <RadioGroupItem value="NEEDS_REWORK" />
              <span>نیازمند نظافت دوباره</span>
            </div>
          </RadioGroup>
        ) : (
          <p className={styles.dialogLead}>این کار پس از تأیید به‌عنوان انجام‌شده ثبت می‌شود.</p>
        )}
        {outcome === 'NEEDS_REWORK' && (
          <label className={styles.dialogField}>
            دلیل نیاز به نظافت دوباره
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={300}
              required
            />
          </label>
        )}
        <DialogFeedback error={error} busy={busy} />
        <DialogActions
          submitLabel={isInspection ? 'ثبت نتیجهٔ بازرسی' : 'ثبت پایان کار'}
          disabled={outcome === 'NEEDS_REWORK' && reason.trim().length < 3}
          busy={busy}
          onClose={onClose}
        />
      </form>
    </DialogFrame>
  );
}

export function CreateHousekeepingTaskDialog({
  businessDate,
  rooms,
  roomsError,
  headingRef,
  busy,
  error,
  onClose,
  onRetryRooms,
  onSubmit,
}: DialogBaseProps & {
  businessDate: string;
  rooms: HousekeepingRoomOption[];
  roomsError: string | null;
  onRetryRooms: () => void;
  onSubmit: (input: {
    roomId: string;
    taskType: HousekeepingTaskType;
    businessDate: string;
    priority: HousekeepingPriority;
    note?: string;
  }) => void;
}) {
  const [roomId, setRoomId] = useState('');
  const [taskType, setTaskType] = useState<HousekeepingTaskType>('DEPARTURE_CLEAN');
  const [priority, setPriority] = useState<HousekeepingPriority>('NORMAL');
  const [note, setNote] = useState('');
  useFocusHeading(headingRef);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      roomId,
      taskType,
      businessDate,
      priority,
      ...(note.trim() ? { note: note.trim() } : {}),
    });
  }

  return (
    <DialogFrame titleId="housekeeping-create-title" onClose={onClose}>
      <h2 id="housekeeping-create-title" tabIndex={-1} ref={headingRef}>
        ایجاد کار خانه‌داری
      </h2>
      <p className={styles.dialogLead}>کار برای تاریخ کاری {businessDate} ثبت می‌شود.</p>
      <form className={styles.dialogForm} onSubmit={submit}>
        {roomsError ? (
          <div>
            <p className={styles.alert} role="alert">
              فهرست اتاق‌ها دریافت نشد؛ برای جلوگیری از ثبت روی اتاق اشتباه دوباره تلاش کنید.
            </p>
            <button className={styles.secondaryButton} type="button" onClick={onRetryRooms}>
              دریافت دوبارهٔ اتاق‌ها
            </button>
          </div>
        ) : (
          <>
            <label className={styles.dialogField}>
              اتاق
              <NativeSelect
                aria-label="اتاق"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                required
              >
                <option value="">انتخاب اتاق</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    اتاق {room.roomNumber} ·{' '}
                    {room.housekeepingStatus === 'INSPECTED'
                      ? 'بازرسی‌شده'
                      : room.housekeepingStatus === 'CLEAN'
                        ? 'نظافت‌شده'
                        : 'نیازمند نظافت'}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className={styles.dialogField}>
              نوع کار
              <NativeSelect
                aria-label="نوع کار"
                value={taskType}
                onChange={(event) => setTaskType(event.target.value as HousekeepingTaskType)}
              >
                {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className={styles.dialogField}>
              اولویت
              <NativeSelect
                aria-label="اولویت"
                value={priority}
                onChange={(event) => setPriority(event.target.value as HousekeepingPriority)}
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className={styles.dialogField}>
              یادداشت عملیاتی (اختیاری)
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={300}
              />
            </label>
          </>
        )}
        <DialogFeedback error={error} busy={busy} />
        <DialogActions
          submitLabel="ایجاد کار"
          disabled={!roomId || Boolean(roomsError)}
          busy={busy}
          onClose={onClose}
        />
      </form>
    </DialogFrame>
  );
}

export function AssignHousekeepingTaskDialog({
  task,
  assignees,
  assigneesLoading,
  assigneesError,
  headingRef,
  busy,
  error,
  onClose,
  onRetryAssignees,
  onSubmit,
}: DialogBaseProps & {
  task: HousekeepingTask;
  assignees: HousekeepingAssignee[];
  assigneesLoading: boolean;
  assigneesError: string | null;
  onRetryAssignees: () => void;
  onSubmit: (input: { assigneeStaffUserId: string; priority?: HousekeepingPriority }) => void;
}) {
  const [assigneeStaffUserId, setAssigneeStaffUserId] = useState(task.assignee?.id ?? '');
  const [priority, setPriority] = useState<HousekeepingPriority | ''>('');
  useFocusHeading(headingRef);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ assigneeStaffUserId, ...(priority ? { priority } : {}) });
  }

  return (
    <DialogFrame titleId="housekeeping-assign-title" onClose={onClose}>
      <h2 id="housekeeping-assign-title" tabIndex={-1} ref={headingRef}>
        تخصیص کار اتاق {task.room.roomNumber}
      </h2>
      <p className={styles.dialogLead}>فقط خانه‌دارهای فعال در فهرست مسئولان نمایش داده می‌شوند.</p>
      <form className={styles.dialogForm} onSubmit={submit}>
        {assigneesLoading && <p role="status">در حال دریافت مسئولان فعال…</p>}
        {assigneesError && (
          <div>
            <p className={styles.alert} role="alert">
              {assigneesError}
            </p>
            <button className={styles.secondaryButton} type="button" onClick={onRetryAssignees}>
              دریافت دوبارهٔ فهرست
            </button>
          </div>
        )}
        {!assigneesLoading && !assigneesError && (
          <>
            <label className={styles.dialogField}>
              خانه‌دار مسئول
              <NativeSelect
                aria-label="خانه‌دار مسئول"
                value={assigneeStaffUserId}
                onChange={(event) => setAssigneeStaffUserId(event.target.value)}
                required
              >
                <option value="">انتخاب خانه‌دار</option>
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.username}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className={styles.dialogField}>
              تغییر اولویت (اختیاری)
              <NativeSelect
                aria-label="تغییر اولویت"
                value={priority}
                onChange={(event) => setPriority(event.target.value as HousekeepingPriority | '')}
              >
                <option value="">بدون تغییر</option>
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </>
        )}
        <DialogFeedback error={error} busy={busy} />
        <DialogActions
          submitLabel="ثبت تخصیص"
          disabled={!assigneeStaffUserId || assigneesLoading || Boolean(assigneesError)}
          busy={busy}
          onClose={onClose}
        />
      </form>
    </DialogFrame>
  );
}

export function CancelHousekeepingTaskDialog({
  task,
  headingRef,
  busy,
  error,
  onClose,
  onSubmit,
}: DialogBaseProps & { task: HousekeepingTask; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  useFocusHeading(headingRef);
  return (
    <DialogFrame titleId="housekeeping-cancel-title" onClose={onClose}>
      <h2 id="housekeeping-cancel-title" tabIndex={-1} ref={headingRef}>
        لغو کار اتاق {task.room.roomNumber}
      </h2>
      <p className={styles.dialogLead}>برای ثبت سابقه، دلیل لغو را وارد کنید.</p>
      <form
        className={styles.dialogForm}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(reason.trim());
        }}
      >
        <label className={styles.dialogField}>
          دلیل لغو
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            required
          />
        </label>
        <DialogFeedback error={error} busy={busy} />
        <DialogActions
          submitLabel="لغو کار"
          disabled={reason.trim().length < 3}
          busy={busy}
          onClose={onClose}
        />
      </form>
    </DialogFrame>
  );
}

export function ReportHousekeepingDiscrepancyDialog({
  businessDate,
  rooms,
  roomsError,
  headingRef,
  busy,
  error,
  onClose,
  onRetryRooms,
  onSubmit,
}: DialogBaseProps & {
  businessDate: string;
  rooms: HousekeepingRoomOption[];
  roomsError: string | null;
  onRetryRooms: () => void;
  onSubmit: (roomId: string, input: ReportHousekeepingDiscrepancyInput) => void;
}) {
  const [roomId, setRoomId] = useState('');
  const [observedOccupied, setObservedOccupied] = useState('');
  const [note, setNote] = useState('');
  useFocusHeading(headingRef);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!roomId || observedOccupied === '') return;
    onSubmit(roomId, {
      businessDate,
      observedOccupied: observedOccupied === 'true',
      note: note.trim(),
    });
  }
  const selectedRoom = rooms.find((room) => room.id === roomId);

  return (
    <DialogFrame titleId="housekeeping-report-title" onClose={onClose}>
      <h2 id="housekeeping-report-title" tabIndex={-1} ref={headingRef}>
        گزارش مغایرت حضور
      </h2>
      <p className={styles.dialogLead}>
        اگر اتاق خالی ثبت شده اما شما حضور می‌بینید، یا اتاق اشغال ثبت شده اما آن را خالی می‌بینید،
        وضعیت مشاهده‌شده را ثبت کنید تا پذیرش آن را بررسی کند.
      </p>
      <form className={styles.dialogForm} onSubmit={submit}>
        {roomsError ? (
          <div>
            <p className={styles.alert} role="alert">
              فهرست اتاق‌ها دریافت نشد؛ دوباره تلاش کنید.
            </p>
            <button className={styles.secondaryButton} type="button" onClick={onRetryRooms}>
              دریافت دوبارهٔ اتاق‌ها
            </button>
          </div>
        ) : (
          <>
            <label className={styles.dialogField}>
              اتاق
              <NativeSelect
                aria-label="اتاق"
                value={roomId}
                onChange={(event) => setRoomId(event.target.value)}
                required
              >
                <option value="">انتخاب اتاق</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    اتاق {room.roomNumber} · حضور ثبت‌شده:{' '}
                    {room.occupancy === 'OCCUPIED' ? 'اشغال' : 'خالی'}
                  </option>
                ))}
              </NativeSelect>
            </label>
            {selectedRoom && (
              <p className={styles.dialogLead}>
                برای این اتاق، حضور ثبت‌شده «
                {selectedRoom.occupancy === 'OCCUPIED' ? 'اشغال' : 'خالی'}» است. وضعیت مشاهده‌شدهٔ
                خود را انتخاب کنید.
              </p>
            )}
            <label className={styles.dialogField}>
              حضور مشاهده‌شده
              <NativeSelect
                aria-label="حضور مشاهده‌شده"
                value={observedOccupied}
                onChange={(event) => setObservedOccupied(event.target.value)}
                required
              >
                <option value="">انتخاب وضعیت</option>
                <option value="true">اشغال</option>
                <option value="false">خالی</option>
              </NativeSelect>
            </label>
            <label className={styles.dialogField}>
              یادداشت عملیاتی
              <Textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={300}
                required
              />
            </label>
          </>
        )}
        <DialogFeedback error={error} busy={busy} />
        <DialogActions
          submitLabel="ثبت مغایرت"
          disabled={
            !roomId || observedOccupied === '' || note.trim().length < 3 || Boolean(roomsError)
          }
          busy={busy}
          onClose={onClose}
        />
      </form>
    </DialogFrame>
  );
}

export function DismissHousekeepingDiscrepancyDialog({
  discrepancy,
  headingRef,
  busy,
  error,
  onClose,
  onSubmit,
}: DialogBaseProps & { discrepancy: HousekeepingDiscrepancy; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  useFocusHeading(headingRef);
  return (
    <DialogFrame titleId="housekeeping-dismiss-title" onClose={onClose}>
      <h2 id="housekeeping-dismiss-title" tabIndex={-1} ref={headingRef}>
        رد مغایرت اتاق {discrepancy.roomNumber}
      </h2>
      <p className={styles.dialogLead}>توضیح این تصمیم در سابقهٔ گزارش ثبت می‌شود.</p>
      <form
        className={styles.dialogForm}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(reason.trim());
        }}
      >
        <label className={styles.dialogField}>
          دلیل رد
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={300}
            required
          />
        </label>
        <DialogFeedback error={error} busy={busy} />
        <DialogActions
          submitLabel="ثبت دلیل و رد"
          disabled={reason.trim().length < 3}
          busy={busy}
          onClose={onClose}
        />
      </form>
    </DialogFrame>
  );
}
