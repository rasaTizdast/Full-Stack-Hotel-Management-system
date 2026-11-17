'use client';

import type { ReactNode } from 'react';
import { formatPersianInteger } from '@/lib/jalali-date';
import { type StaffStayQueue, type StaffStayWorklist, type StaffStayWorklistItem } from '@/lib/staff-front-desk-api';
import { dateLabel } from './front-desk-domain';
import type { ListState } from './front-desk-types';
import { WorklistGroup } from './worklist-group';
import styles from './staff-front-desk.module.css';

export interface StaffFrontDeskQueueCopy {
  title: string;
  lead: string;
  empty: string;
  loading: string;
}

interface GroupedItems {
  primary: StaffStayWorklistItem[];
  secondary: StaffStayWorklistItem[];
}

interface QueueResultModel {
  queryDate: string;
  page: number;
  worklist: StaffStayWorklist | null;
  listState: ListState;
  listError: string | null;
  items: StaffStayWorklistItem[];
  selectedDate: string;
  groupedItems: GroupedItems;
}

interface QueueResultActions {
  refresh: () => void;
  changePage: (direction: -1 | 1) => void;
  onCheckIn: (stay: StaffStayWorklistItem, trigger: HTMLElement) => void;
  onNoShow: (stay: StaffStayWorklistItem, trigger: HTMLElement) => void;
  onMove: (stay: StaffStayWorklistItem, trigger: HTMLElement) => void;
  onDetail: (stay: StaffStayWorklistItem, trigger: HTMLElement) => void;
}

interface SelectedStayDetail {
  reference: string;
  panelId: string;
  panel: ReactNode;
}

interface FrontDeskQueueResultsProps {
  queue: StaffStayQueue;
  copy: StaffFrontDeskQueueCopy;
  model: QueueResultModel;
  actions: QueueResultActions;
  selectedDetail: SelectedStayDetail | null;
}

export function FrontDeskQueueResults({ queue, copy, model, actions, selectedDetail }: FrontDeskQueueResultsProps) {
  const { queryDate, page, worklist, listState, listError, items, selectedDate, groupedItems } = model;

  if (listState === 'loading') return <p className={styles.status} role="status">{copy.loading}</p>;
  if (listState === 'error') {
    return (
      <div className={styles.errorPanel}>
        <p role="alert">{listError}</p>
        <button className={styles.secondaryButton} type="button" onClick={actions.refresh}>تلاش دوباره</button>
      </div>
    );
  }
  if (!worklist) return null;

  return (
    <>
      <div className={styles.freshness}>
        <span>تاریخ انتخاب‌شده: <strong>{dateLabel(worklist.date)}</strong></span>
        <button className={styles.secondaryButton} type="button" onClick={actions.refresh}>دریافت دوباره</button>
      </div>
      {items.length === 0 ? <p className={styles.empty}>{copy.empty}</p> : (
        <div className={styles.groups}>
          <WorklistGroup
            queue={queue}
            title={getPrimaryGroupTitle(queue, queryDate, worklist)}
            items={groupedItems.primary}
            selectedDate={selectedDate}
            businessDate={worklist.businessDate}
            selectedDetail={selectedDetail}
            onCheckIn={actions.onCheckIn}
            onNoShow={actions.onNoShow}
            onMove={actions.onMove}
            onDetail={actions.onDetail}
          />
          {groupedItems.secondary.length > 0 && (
            <WorklistGroup
              queue={queue}
              title={getSecondaryGroupTitle(queue, queryDate, worklist)}
              items={groupedItems.secondary}
              selectedDate={selectedDate}
              businessDate={worklist.businessDate}
              selectedDetail={selectedDetail}
              onCheckIn={actions.onCheckIn}
              onNoShow={actions.onNoShow}
              onMove={actions.onMove}
              onDetail={actions.onDetail}
            />
          )}
        </div>
      )}
      {worklist.pagination.totalPages > 1 && (
        <nav className={styles.pagination} aria-label="صفحه‌های فهرست">
          <button className={styles.secondaryButton} type="button" disabled={page <= 1} onClick={() => actions.changePage(-1)}>صفحه پیشین</button>
          <span>صفحه {formatPersianInteger(worklist.pagination.page)} از {formatPersianInteger(worklist.pagination.totalPages)}</span>
          <button className={styles.secondaryButton} type="button" disabled={page >= worklist.pagination.totalPages} onClick={() => actions.changePage(1)}>صفحه بعد</button>
        </nav>
      )}
    </>
  );
}

function getPrimaryGroupTitle(queue: StaffStayQueue, queryDate: string, worklist: StaffStayWorklist) {
  if (queue === 'arrivals') return queryDate === worklist.businessDate ? 'ورودهای امروز' : 'ورودهای تاریخ انتخاب‌شده';
  if (queue === 'in-house') return 'اقامت‌های در جریان';
  return 'موعدهای رسیده';
}

function getSecondaryGroupTitle(queue: StaffStayQueue, queryDate: string, worklist: StaffStayWorklist) {
  if (queue === 'arrivals') return queryDate === worklist.businessDate ? 'ورودهای معوق' : 'ورودهای پیش از تاریخ انتخاب‌شده';
  return 'موعد خروج گذشته';
}
