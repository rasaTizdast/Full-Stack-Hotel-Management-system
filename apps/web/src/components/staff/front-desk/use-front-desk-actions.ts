'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getStaffRoomBoard, type StaffRole, type StaffRoomBoardItem } from '@/lib/staff-api';
import { toGregorianIso } from '@/lib/jalali-date';
import {
  checkInStaffStay,
  createStaffWalkIn,
  markStaffStayNoShow,
  moveStaffStayRoom,
  type StaffStayWorklist,
  type StaffStayWorklistItem,
  type StaffWalkInInput,
} from '@/lib/staff-front-desk-api';
import type { PublicRoomType } from '@/lib/public-api';
import {
  assignmentsOnDate,
  dateLabel,
  isManager,
  isStayActiveOn,
  nextIsoDate,
} from './front-desk-domain';
import { hasRoomRecovery, safeErrorMessage } from './front-desk-errors';
import type { DialogState, WalkInDraft } from './front-desk-types';

interface WalkInAttempt {
  signature: string;
  key: string;
  input: StaffWalkInInput;
}

interface UseFrontDeskActionsOptions {
  role?: StaffRole;
  csrfToken: string | null;
  worklist: StaffStayWorklist | null;
  selectedDate: string;
  roomTypes: PublicRoomType[];
  onRefresh: () => void;
  onSuccess: (message: string) => void;
}

class DialogValidationError extends Error {}

function createWalkInAttempt(
  draft: WalkInDraft,
  selectedDate: string,
  worklist: StaffStayWorklist | null,
  retry: boolean,
  existingAttempt: WalkInAttempt | null,
): { attempt?: WalkInAttempt; error?: string } {
  if (retry && existingAttempt) return { attempt: existingAttempt };
  if (!worklist) return {};
  if (selectedDate !== worklist.businessDate) {
    return { error: 'ثبت ورود حضوری فقط برای تاریخ کاری جاری در دسترس است.' };
  }
  const checkOut = toGregorianIso(draft.checkOut);
  if (!checkOut || checkOut <= worklist.businessDate) {
    return { error: 'تاریخ خروج باید پس از تاریخ کاری امروز باشد.' };
  }
  const input: StaffWalkInInput = {
    roomTypeSlug: draft.roomTypeSlug,
    checkIn: worklist.businessDate,
    checkOut,
    guestCount: Number(draft.guestCount),
    roomQuantity: Number(draft.roomQuantity),
    guestName: draft.guestName.trim(),
    guestPhone: draft.guestPhone.trim(),
    ...(draft.guestEmail.trim() ? { guestEmail: draft.guestEmail.trim() } : {}),
  };
  const signature = JSON.stringify(input);
  if (existingAttempt?.signature === signature) return { attempt: existingAttempt };
  const key =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-walkin`;
  return { attempt: { signature, key, input } };
}

function checkIn(
  stay: StaffStayWorklistItem,
  role: StaffRole | undefined,
  reason: string,
  businessDate: string,
  csrfToken: string,
) {
  if (!isStayActiveOn(stay, businessDate)) {
    throw new DialogValidationError(
      'ورود فقط در بازه فعال این اقامت در تاریخ کاری جاری در دسترس است.',
    );
  }
  return checkInStaffStay(stay.reference, csrfToken, {
    ...(isManager(role) && reason.trim() ? { earlyCheckInReason: reason.trim() } : {}),
  }).then(() => `ورود مهمان ${stay.guestName} ثبت شد.`);
}

function markNoShow(
  stay: StaffStayWorklistItem,
  reason: string,
  businessDate: string,
  csrfToken: string,
) {
  if (!isStayActiveOn(stay, businessDate)) {
    throw new DialogValidationError(
      'ثبت عدم مراجعه فقط در بازه فعال این اقامت در تاریخ کاری جاری در دسترس است.',
    );
  }
  if (!reason.trim()) throw new DialogValidationError('ثبت دلیل برای عدم مراجعه الزامی است.');
  return markStaffStayNoShow(stay.reference, csrfToken, { reason: reason.trim() }).then(
    () => `عدم مراجعه رزرو ${stay.reference} ثبت شد.`,
  );
}

function moveRoom(
  stay: StaffStayWorklistItem,
  businessDate: string,
  reason: string,
  event: FormEvent<HTMLFormElement>,
  csrfToken: string,
) {
  const form = new FormData(event.currentTarget);
  const targetRoomId = String(form.get('targetRoomId') ?? '');
  const sourceAssignmentId = String(form.get('sourceAssignmentId') ?? '');
  if (stay.status !== 'CHECKED_IN' || !isStayActiveOn(stay, businessDate)) {
    throw new DialogValidationError(
      'انتقال اتاق فقط در بازه فعال اقامت در تاریخ کاری جاری در دسترس است.',
    );
  }
  const assignment = assignmentsOnDate(stay, businessDate).find(
    (room) => room.assignmentId === sourceAssignmentId,
  );
  if (!assignment || !targetRoomId || !reason.trim()) {
    throw new DialogValidationError(
      assignment
        ? 'اتاق مقصد و دلیل انتقال را کامل کنید.'
        : 'برای تاریخ کاری جاری تخصیص اتاق فعالی وجود ندارد؛ ابتدا برنامه اتاق را بررسی کنید.',
    );
  }
  return moveStaffStayRoom(stay.reference, csrfToken, {
    sourceAssignmentId: assignment.assignmentId,
    targetRoomId,
    reason: reason.trim(),
  }).then(() => `درخواست انتقال اتاق رزرو ${stay.reference} ثبت شد.`);
}

export function useFrontDeskActions({
  role,
  csrfToken,
  worklist,
  selectedDate,
  roomTypes,
  onRefresh,
  onSuccess,
}: UseFrontDeskActionsOptions) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [roomRecovery, setRoomRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [moveRooms, setMoveRooms] = useState<StaffRoomBoardItem[]>([]);
  const [moveRoomsLoading, setMoveRoomsLoading] = useState(false);
  const [walkInDraft, setWalkInDraft] = useState<WalkInDraft>({
    roomTypeSlug: roomTypes[0]?.slug ?? '',
    checkOut: '',
    guestCount: '1',
    roomQuantity: '1',
    guestName: '',
    guestPhone: '',
    guestEmail: '',
  });
  const [walkInError, setWalkInError] = useState<string | null>(null);
  const [walkInFieldError, setWalkInFieldError] = useState<string | null>(null);
  const [walkInRetry, setWalkInRetry] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const dialogWasOpenRef = useRef(false);
  const moveRoomsRequestIdRef = useRef(0);
  const walkInAttemptRef = useRef<WalkInAttempt | null>(null);

  useEffect(() => {
    if (dialog) {
      dialogWasOpenRef.current = true;
      headingRef.current?.focus();
      return;
    }
    if (dialogWasOpenRef.current) {
      dialogWasOpenRef.current = false;
      triggerRef.current?.focus();
    }
  }, [dialog]);

  function openDialog(nextDialog: DialogState, trigger?: HTMLElement) {
    if (trigger) triggerRef.current = trigger;
    else if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      triggerRef.current = document.activeElement;
    }
    setDialog(nextDialog);
    setReason('');
    setError(null);
    setRoomRecovery(false);
    const preserveWalkInAttempt =
      nextDialog?.kind === 'walk-in' && walkInRetry && walkInAttemptRef.current !== null;
    if (!preserveWalkInAttempt) {
      setWalkInError(null);
      setWalkInFieldError(null);
    }
    if (nextDialog?.kind === 'walk-in' && !preserveWalkInAttempt) {
      const businessDate = worklist?.businessDate ?? selectedDate;
      setWalkInDraft((current) => ({
        ...current,
        roomTypeSlug: current.roomTypeSlug || roomTypes[0]?.slug || '',
        checkOut: dateLabel(nextIsoDate(businessDate)),
      }));
      setWalkInRetry(false);
    }
    if (nextDialog?.kind === 'move') loadMoveRooms(nextDialog.stay);
  }

  function loadMoveRooms(stay: StaffStayWorklistItem) {
    const requestId = ++moveRoomsRequestIdRef.current;
    setMoveRooms([]);
    setMoveRoomsLoading(true);
    getStaffRoomBoard({
      date: worklist?.businessDate ?? selectedDate,
      roomTypeId: stay.roomType.id,
    })
      .then((board) => {
        if (requestId === moveRoomsRequestIdRef.current) setMoveRooms(board.items);
      })
      .catch((cause: unknown) => {
        if (requestId === moveRoomsRequestIdRef.current) setError(safeErrorMessage(cause));
      })
      .finally(() => {
        if (requestId === moveRoomsRequestIdRef.current) setMoveRoomsLoading(false);
      });
  }

  function closeDialog() {
    if (busy) return;
    moveRoomsRequestIdRef.current += 1;
    setDialog(null);
    setError(null);
    setRoomRecovery(false);
    setMoveRoomsLoading(false);
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dialog || !csrfToken || dialog.kind === 'walk-in') return;
    setError(null);
    setRoomRecovery(false);
    setBusy(true);
    try {
      const businessDate = worklist?.businessDate ?? selectedDate;
      const success =
        dialog.kind === 'check-in'
          ? await checkIn(dialog.stay, role, reason, businessDate, csrfToken)
          : dialog.kind === 'no-show'
            ? await markNoShow(dialog.stay, reason, businessDate, csrfToken)
            : await moveRoom(dialog.stay, businessDate, reason, event, csrfToken);
      onSuccess(success);
      setDialog(null);
      onRefresh();
    } catch (cause) {
      setError(
        cause instanceof DialogValidationError
          ? cause.message
          : safeErrorMessage(cause, dialog.kind === 'move' ? 'move' : undefined),
      );
      setRoomRecovery(hasRoomRecovery(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitWalkIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) return;
    setWalkInError(null);
    setWalkInFieldError(null);
    const { attempt, error: validationError } = createWalkInAttempt(
      walkInDraft,
      selectedDate,
      worklist,
      walkInRetry,
      walkInAttemptRef.current,
    );
    if (validationError) {
      setWalkInFieldError(validationError);
      return;
    }
    if (!attempt) return;
    walkInAttemptRef.current = attempt;
    setBusy(true);
    try {
      const result = await createStaffWalkIn(attempt.input, csrfToken, attempt.key);
      setDialog(null);
      setWalkInRetry(false);
      walkInAttemptRef.current = null;
      onSuccess(`ورود حضوری ثبت شد؛ کد پیگیری ${result.reference}.`);
      onRefresh();
    } catch (cause) {
      setWalkInRetry(true);
      setWalkInError(safeErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function startNewWalkInRequest() {
    if (busy) return;
    walkInAttemptRef.current = null;
    setWalkInRetry(false);
    setWalkInError(null);
    setWalkInFieldError(null);
  }

  function updateWalkInDraft(key: keyof WalkInDraft, value: string) {
    setWalkInDraft((current) => ({ ...current, [key]: value }));
  }

  return {
    dialog,
    reason,
    setReason,
    error,
    roomRecovery,
    busy,
    moveRooms,
    moveRoomsLoading,
    walkInDraft,
    walkInError,
    walkInFieldError,
    walkInRetry,
    headingRef,
    triggerRef,
    openDialog,
    closeDialog,
    submitAction,
    submitWalkIn,
    startNewWalkInRequest,
    updateWalkInDraft,
  };
}
