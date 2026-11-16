'use client';

import Link from 'next/link';
import { formatPersianInteger } from '@/lib/jalali-date';
import { type StaffStayQueue, type StaffStayWorklistItem } from '@/lib/staff-front-desk-api';
import { assignmentSummary, assignmentsOnDate, dateLabel, isStayActiveOn, ROOM_STATUS } from './front-desk-domain';
import styles from './staff-front-desk.module.css';

interface WorklistGroupProps {
  queue: StaffStayQueue;
  title: string;
  items: StaffStayWorklistItem[];
  selectedDate: string;
  businessDate: string;
  onCheckIn: (stay: StaffStayWorklistItem, trigger: HTMLElement) => void;
  onNoShow: (stay: StaffStayWorklistItem, trigger: HTMLElement) => void;
  onMove: (stay: StaffStayWorklistItem, trigger: HTMLElement) => void;
  onDetail: (stay: StaffStayWorklistItem) => void;
}

export function WorklistGroup({ queue, title, items, selectedDate, businessDate, onCheckIn, onNoShow, onMove, onDetail }: WorklistGroupProps) {
  if (items.length === 0) return null;
  return (
    <section className={styles.group} aria-label={title}>
      <header><h2>{title}</h2><span>{formatPersianInteger(items.length)} اقامت</span></header>
      <div className={styles.stayList}>
        {items.map((stay) => {
          const activeAssignments = assignmentsOnDate(stay, businessDate);
          const missingRooms = Math.max(0, stay.roomQuantity - activeAssignments.length);
          const dueOut = stay.checkOut <= selectedDate;
          const actionableToday = isStayActiveOn(stay, businessDate);
          const canMoveToday = stay.status === 'CHECKED_IN' && actionableToday;
          return (
            <article className={styles.stayCard} key={stay.reference} aria-label={`${stay.guestName} · ${stay.reference}`}>
              <div className={styles.cardTop}>
                <div><h3>{stay.guestName}</h3><p dir="ltr">{stay.reference}</p></div>
                <span className={dueOut && queue === 'in-house' ? styles.statusDue : styles.statusNeutral}>
                  {getStayStatusLabel(queue, stay, selectedDate, businessDate, dueOut)}
                </span>
              </div>
              <dl className={styles.stayFacts}>
                <div><dt>ورود</dt><dd>{dateLabel(stay.checkIn)}</dd></div>
                <div><dt>خروج</dt><dd>{dateLabel(stay.checkOut)}</dd></div>
                <div><dt>نوع اتاق</dt><dd>{stay.roomType.name}</dd></div>
                <div><dt>تعداد اتاق</dt><dd>{formatPersianInteger(stay.roomQuantity)}</dd></div>
              </dl>
              {queue !== 'departures' && (
                <div className={styles.readiness}>
                  <strong>{assignmentSummary(stay, businessDate)}</strong>
                  {missingRooms > 0 && <Link href="/staff/rooms">تکمیل تخصیص اتاق‌ها ({formatPersianInteger(missingRooms)} اتاق)</Link>}
                  {stay.assignedRooms.length > 0 && (
                    <ul aria-label="اتاق‌های تخصیص‌یافته">
                      {stay.assignedRooms.map((room) => (
                        <li key={room.assignmentId}>
                          <span>اتاق {room.roomNumber}</span>
                          <span>{ROOM_STATUS[room.housekeepingStatus]}</span>
                          <span>{dateLabel(room.startDate)} تا {dateLabel(room.endDate)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {activeAssignments.some((room) => room.housekeepingStatus !== 'INSPECTED') && (
                    <Link href="/staff/rooms">بازبینی وضعیت و بازرسی اتاق‌ها</Link>
                  )}
                  <small>تعداد تخصیص برای تاریخ کاری جاری است؛ آمادگی کل بازه و محدودیت‌ها را سامانه هنگام ثبت ورود بررسی می‌کند.</small>
                </div>
              )}
              {queue === 'departures' && <p className={styles.readOnlyNote}>فهرست اطلاع‌رسانی؛ ثبت خروج در این بخش انجام نمی‌شود.</p>}
              <div className={styles.cardActions}>
                {queue === 'arrivals' && stay.status === 'CONFIRMED' && <>
                  <button className={styles.primaryButton} type="button" disabled={!actionableToday} onClick={(event) => onCheckIn(stay, event.currentTarget)}>ثبت ورود</button>
                  <button className={styles.secondaryButton} type="button" disabled={!actionableToday} onClick={(event) => onNoShow(stay, event.currentTarget)}>ثبت عدم مراجعه</button>
                </>}
                {queue === 'arrivals' && stay.status === 'CONFIRMED' && !actionableToday && <span role="status">این اقامت خارج از بازه فعال تاریخ کاری جاری است؛ عملیات ورود و عدم مراجعه در دسترس نیست.</span>}
                {queue === 'in-house' && <button className={styles.secondaryButton} type="button" disabled={!canMoveToday} onClick={(event) => onMove(stay, event.currentTarget)}>انتقال اتاق</button>}
                {queue === 'in-house' && !canMoveToday && <span role="status">انتقال اتاق فقط برای اقامت واردشده در بازه فعال تاریخ کاری جاری در دسترس است.</span>}
                {queue !== 'departures' && <button className={styles.textButton} type="button" onClick={() => onDetail(stay)}>نمایش جزئیات</button>}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function getStayStatusLabel(
  queue: StaffStayQueue,
  stay: StaffStayWorklistItem,
  selectedDate: string,
  businessDate: string,
  dueOut: boolean,
) {
  if (queue === 'arrivals') {
    if (stay.checkIn < selectedDate) return selectedDate === businessDate ? 'ورود معوق' : 'ورود پیش از تاریخ انتخاب‌شده';
    return selectedDate === businessDate ? 'ورود امروز' : 'ورود در تاریخ انتخاب‌شده';
  }
  if (queue === 'in-house') {
    if (!dueOut) return 'اقامت در جریان';
    return selectedDate === businessDate ? 'موعد خروج امروز' : 'موعد خروج در تاریخ انتخاب‌شده';
  }
  return 'موعد خروج رسیده';
}
