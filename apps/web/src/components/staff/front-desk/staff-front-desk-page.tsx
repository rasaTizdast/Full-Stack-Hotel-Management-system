'use client';

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useStaffSession } from '@/components/staff/staff-session-provider';
import { type StaffRole } from '@/lib/staff-api';
import { type StaffStayQueue } from '@/lib/staff-front-desk-api';
import type { PublicRoomType } from '@/lib/public-api';
import { canMoveTo, isManager } from './front-desk-domain';
import { ActionDialog, MoveDialog } from './front-desk-action-dialogs';
import { FrontDeskQueueResults } from './front-desk-queue-results';
import { StayDetail } from './stay-detail';
import { WalkInDialog } from './walk-in-dialog';
import { useFrontDeskActions } from './use-front-desk-actions';
import { useFrontDeskStayDetail } from './use-front-desk-stay-detail';
import { useFrontDeskWorklist } from './use-front-desk-worklist';
import styles from './staff-front-desk.module.css';

const ALLOWED_ROLES: StaffRole[] = ['ADMIN', 'MANAGER', 'RECEPTIONIST'];
const EMPTY_ROOM_TYPES: PublicRoomType[] = [];

const QUEUE_COPY: Record<
  StaffStayQueue,
  { title: string; lead: string; empty: string; loading: string }
> = {
  arrivals: {
    title: 'ورودهای مهمانان',
    lead: 'ورودهای برنامه‌ریزی‌شده و اقامت‌های معوق را پیگیری کنید.',
    empty: 'برای این تاریخ ورودی ثبت نشده است.',
    loading: 'در حال دریافت فهرست ورودها',
  },
  'in-house': {
    title: 'مهمانان حاضر',
    lead: 'اقامت‌های واردشده و موعدهای خروج را ببینید.',
    empty: 'برای این تاریخ مهمان حاضر ثبت نشده است.',
    loading: 'در حال دریافت فهرست مهمانان حاضر',
  },
  departures: {
    title: 'موعدهای خروج',
    lead: 'اقامت‌های واردشده‌ای که موعد خروجشان رسیده یا گذشته است.',
    empty: 'برای این تاریخ موعد خروجی ثبت نشده است.',
    loading: 'در حال دریافت فهرست موعدهای خروج',
  },
};

interface StaffFrontDeskPageProps {
  queue: StaffStayQueue;
  roomTypes?: PublicRoomType[];
  roomTypesStatus?: 'ready' | 'error';
}

export function StaffFrontDeskPage({
  queue,
  roomTypes = EMPTY_ROOM_TYPES,
  roomTypesStatus = 'ready',
}: StaffFrontDeskPageProps) {
  const router = useRouter();
  const { status, staff, csrfToken } = useStaffSession();
  const allowed =
    status === 'authenticated' && Boolean(staff && ALLOWED_ROLES.includes(staff.role));
  const copy = QUEUE_COPY[queue];
  const worklistState = useFrontDeskWorklist(queue, allowed);
  const {
    dateDraft,
    setDateDraft,
    searchDraft,
    setSearchDraft,
    query,
    worklist,
    listState,
    listError,
    filterError,
    refreshNumber,
    items,
    selectedDate,
    groupedItems,
    applyFilters,
    refreshList: refreshWorklist,
    changePage,
  } = worklistState;
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const stayDetail = useFrontDeskStayDetail({
    allowed,
    businessDate: worklist?.businessDate ?? query.date,
    refreshNumber,
  });
  const {
    selectedReference,
    detail,
    loading: detailLoading,
    error: detailError,
    editing: editingDetail,
    isSaving: detailSaving,
    draft: amendDraft,
    canAmend: detailCanAmend,
  } = stayDetail;
  function refreshList() {
    refreshWorklist();
    stayDetail.startRefresh();
  }

  const actions = useFrontDeskActions({
    role: staff?.role,
    csrfToken,
    worklist,
    selectedDate: query.date,
    roomTypes,
    onRefresh: refreshList,
    onSuccess: setSuccessMessage,
  });
  const {
    dialog,
    reason: dialogReason,
    setReason: setDialogReason,
    error: dialogError,
    roomRecovery: dialogRoomRecovery,
    busy: dialogBusy,
    moveRooms,
    moveRoomsLoading,
    walkInDraft,
    walkInError,
    walkInFieldError,
    walkInRetry,
    headingRef: actionHeadingRef,
    openDialog,
    closeDialog,
    submitAction,
    submitWalkIn,
    startNewWalkInRequest,
    updateWalkInDraft,
  } = actions;

  useEffect(() => {
    if (successMessage) successRef.current?.focus();
  }, [successMessage]);

  const selectedDetail = selectedReference
    ? {
        reference: selectedReference,
        panelId: `stay-detail-${encodeURIComponent(selectedReference)}`,
        panel: (
          <StayDetail
            id={`stay-detail-${encodeURIComponent(selectedReference)}`}
            reference={selectedReference}
            detail={detail}
            loading={detailLoading}
            error={detailError}
            canAmend={Boolean(detailCanAmend)}
            editing={editingDetail}
            draft={amendDraft}
            busy={detailSaving}
            onClose={stayDetail.close}
            onEdit={stayDetail.startEditing}
            onCancelEdit={stayDetail.cancelEdit}
            onDraftChange={stayDetail.updateDraft}
            onSubmit={(event) =>
              void stayDetail.submitAmendment(event, csrfToken, (reference) => {
                setSuccessMessage(`تغییرات اقامت ${reference} ثبت شد؛ جزئیات تازه دریافت می‌شود.`);
                refreshList();
              })
            }
          />
        ),
      }
    : null;

  if (status === 'loading')
    return (
      <p className={styles.status} role="status">
        در حال بررسی دسترسی…
      </p>
    );
  if (status !== 'authenticated' || !staff)
    return (
      <p className={styles.status} role="status">
        برای مشاهده این صفحه وارد پنل کارکنان شوید.
      </p>
    );
  if (!ALLOWED_ROLES.includes(staff.role)) {
    return (
      <section className={styles.accessDenied} role="alert">
        <h1>دسترسی به میز پذیرش ندارید</h1>
        <p>این فهرست برای کارکنان پذیرش و مدیریت اقامتگاه در دسترس است.</p>
      </section>
    );
  }

  return (
    <section className={styles.page} aria-labelledby="front-desk-title">
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>پذیرش · عملیات اقامت</p>
          <h1 id="front-desk-title">{copy.title}</h1>
          <p className={styles.lead}>{copy.lead}</p>
        </div>
        <nav className={styles.queueNav} aria-label="فهرست‌های پذیرش">
          <Link
            aria-current={queue === 'arrivals' ? 'page' : undefined}
            href="/staff/front-desk/arrivals"
          >
            ورودها
          </Link>
          <Link
            aria-current={queue === 'in-house' ? 'page' : undefined}
            href="/staff/front-desk/in-house"
          >
            مهمانان حاضر
          </Link>
          <Link
            aria-current={queue === 'departures' ? 'page' : undefined}
            href="/staff/front-desk/departures"
          >
            موعدهای خروج
          </Link>
        </nav>
      </header>

      {successMessage && (
        <p className={styles.success} tabIndex={-1} ref={successRef} role="status">
          {successMessage}
        </p>
      )}

      <form className={styles.filters} onSubmit={applyFilters}>
        <div className={styles.filterFields}>
          <label>
            تاریخ کاری
            <input
              aria-label="تاریخ کاری"
              inputMode="numeric"
              value={dateDraft}
              onChange={(event) => setDateDraft(event.target.value)}
              placeholder="۱۴۰۵/۰۸/۲۷"
            />
          </label>
          <label>
            جست‌وجو در نام، کد یا اتاق
            <input
              aria-label="جست‌وجو در نام، کد یا اتاق"
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
            />
          </label>
        </div>
        <button className={styles.primaryButton} type="submit">
          اعمال فیلترها
        </button>
        {filterError && (
          <p className={styles.error} role="alert">
            {filterError}
          </p>
        )}
      </form>

      {queue === 'arrivals' && (
        <div className={styles.actionBar}>
          <button
            className={styles.primaryButton}
            type="button"
            disabled={listState !== 'ready' || !worklist || query.date !== worklist.businessDate}
            onClick={(event) => openDialog({ kind: 'walk-in' }, event.currentTarget)}
          >
            ثبت ورود بدون رزرو قبلی
          </button>
          {listState === 'ready' && worklist && query.date !== worklist.businessDate ? (
            <span role="status">ثبت ورود حضوری فقط برای تاریخ کاری جاری در دسترس است.</span>
          ) : (
            <span>تاریخ ورود حضوری بر اساس تاریخ کاری سامانه ثبت می‌شود.</span>
          )}
        </div>
      )}

      <FrontDeskQueueResults
        queue={queue}
        copy={copy}
        selectedDetail={selectedDetail}
        model={{
          queryDate: query.date,
          page: query.page,
          worklist,
          listState,
          listError,
          items,
          selectedDate,
          groupedItems,
        }}
        actions={{
          refresh: refreshList,
          changePage,
          onCheckIn: (stay, trigger) => openDialog({ kind: 'check-in', stay }, trigger),
          onNoShow: (stay, trigger) => openDialog({ kind: 'no-show', stay }, trigger),
          onMove: (stay, trigger) => openDialog({ kind: 'move', stay }, trigger),
          onDetail: (stay, trigger) => {
            if (stay.reference === selectedReference) {
              stayDetail.close();
              return;
            }
            stayDetail.open(stay.reference, trigger);
          },
        }}
      />

      {dialog?.kind === 'walk-in' && (
        <WalkInDialog
          roomTypes={roomTypes}
          roomTypesStatus={roomTypesStatus}
          draft={walkInDraft}
          error={walkInError}
          fieldError={walkInFieldError}
          retry={walkInRetry}
          busy={dialogBusy}
          headingRef={actionHeadingRef}
          onClose={closeDialog}
          onStartNewRequest={startNewWalkInRequest}
          onRetryRoomTypes={() => router.refresh()}
          onDraftChange={updateWalkInDraft}
          onSubmit={submitWalkIn}
        />
      )}
      {(dialog?.kind === 'check-in' || dialog?.kind === 'no-show') && (
        <ActionDialog
          kind={dialog.kind}
          stay={dialog.stay}
          manager={isManager(staff.role)}
          reason={dialogReason}
          error={dialogError}
          roomRecovery={dialogRoomRecovery}
          busy={dialogBusy}
          headingRef={actionHeadingRef}
          onReasonChange={setDialogReason}
          onClose={closeDialog}
          onSubmit={submitAction}
        />
      )}
      {dialog?.kind === 'move' && (
        <MoveDialog
          stay={dialog.stay}
          businessDate={worklist?.businessDate ?? query.date}
          rooms={moveRooms.filter((room) =>
            canMoveTo(
              room,
              dialog.stay.assignedRooms.map((assigned) => assigned.roomNumber),
            ),
          )}
          loading={moveRoomsLoading}
          reason={dialogReason}
          error={dialogError}
          roomRecovery={dialogRoomRecovery}
          busy={dialogBusy}
          headingRef={actionHeadingRef}
          onReasonChange={setDialogReason}
          onClose={closeDialog}
          onSubmit={submitAction}
        />
      )}
    </section>
  );
}
