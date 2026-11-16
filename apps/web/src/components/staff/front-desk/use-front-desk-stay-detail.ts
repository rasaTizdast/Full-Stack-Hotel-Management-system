'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { getStaffBooking, type StaffBookingDetail } from '@/lib/staff-bookings-api';
import { toGregorianIso } from '@/lib/jalali-date';
import { amendStaffStay } from '@/lib/staff-front-desk-api';
import { dateLabel } from './front-desk-domain';
import { safeErrorMessage } from './front-desk-errors';
import type { AmendmentDraft } from './front-desk-types';

interface UseFrontDeskStayDetailOptions {
  allowed: boolean;
  businessDate: string;
  refreshNumber: number;
}

export function useFrontDeskStayDetail({ allowed, businessDate, refreshNumber }: UseFrontDeskStayDetailOptions) {
  const [selectedReference, setSelectedReference] = useState<string | null>(null);
  const [detail, setDetail] = useState<StaffBookingDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState<AmendmentDraft>({
    guestName: '',
    guestPhone: '',
    guestEmail: '',
    guestCount: '',
    roomQuantity: '',
    checkIn: '',
    checkOut: '',
  });

  useEffect(() => {
    if (!selectedReference || !allowed) return;
    let current = true;
    getStaffBooking(selectedReference)
      .then((result) => {
        if (!current) return;
        setDetail(result);
        setDraft({
          guestName: result.guestName,
          guestPhone: result.guestPhone,
          guestEmail: result.guestEmail ?? '',
          guestCount: String(result.guestCount),
          roomQuantity: String(result.roomQuantity),
          checkIn: dateLabel(result.checkIn),
          checkOut: dateLabel(result.checkOut),
        });
      })
      .catch((cause: unknown) => {
        if (current) setError(safeErrorMessage(cause));
      })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [selectedReference, allowed, refreshNumber]);

  function open(reference: string) {
    setDetail(null);
    setError(null);
    setLoading(true);
    setEditing(false);
    setSelectedReference(reference);
  }

  function startRefresh() {
    if (!selectedReference) return;
    setLoading(true);
    setError(null);
  }

  function close() {
    setSelectedReference(null);
    setDetail(null);
    setError(null);
    setEditing(false);
  }

  function cancelEdit() {
    setEditing(false);
    setError(null);
  }

  function updateDraft(key: keyof AmendmentDraft, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submitAmendment(
    event: FormEvent<HTMLFormElement>,
    csrfToken: string | null,
    onSuccess: (reference: string) => void,
  ) {
    event.preventDefault();
    if (!detail || !csrfToken) return;
    const checkIn = toGregorianIso(draft.checkIn);
    const checkOut = toGregorianIso(draft.checkOut);
    if (!checkIn || !checkOut || checkOut <= checkIn) {
      setError('تاریخ‌های اقامت را معتبر وارد کنید؛ خروج باید پس از ورود باشد.');
      return;
    }
    const payload = {
      ...(draft.guestName.trim() !== detail.guestName ? { guestName: draft.guestName.trim() } : {}),
      ...(draft.guestPhone.trim() !== detail.guestPhone ? { guestPhone: draft.guestPhone.trim() } : {}),
      ...(draft.guestEmail.trim() !== (detail.guestEmail ?? '') ? { guestEmail: draft.guestEmail.trim() || null } : {}),
      ...(Number(draft.guestCount) !== detail.guestCount ? { guestCount: Number(draft.guestCount) } : {}),
      ...(Number(draft.roomQuantity) !== detail.roomQuantity ? { roomQuantity: Number(draft.roomQuantity) } : {}),
      ...(checkIn !== detail.checkIn ? { checkIn } : {}),
      ...(checkOut !== detail.checkOut ? { checkOut } : {}),
    };
    if (Object.keys(payload).length === 0) {
      setError('تغییری برای ثبت انتخاب نشده است.');
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      await amendStaffStay(detail.reference, csrfToken, payload);
      setEditing(false);
      onSuccess(detail.reference);
    } catch (cause) {
      setError(safeErrorMessage(cause));
    } finally {
      setIsSaving(false);
    }
  }

  const canAmend = Boolean(
    detail && detail.status === 'CONFIRMED' && detail.checkIn >= businessDate,
  );

  return {
    selectedReference,
    detail,
    loading,
    error,
    editing,
    isSaving,
    draft,
    canAmend,
    open,
    close,
    startRefresh,
    cancelEdit,
    startEditing: () => setEditing(true),
    updateDraft,
    submitAmendment,
  };
}
