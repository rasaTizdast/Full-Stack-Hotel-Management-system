'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { StaffApiError } from '@/lib/staff-api';
import { getHotelTodayIso, toGregorianIso } from '@/lib/jalali-date';
import {
  getStaffStayWorklist,
  type StaffStayQueue,
  type StaffStayWorklist,
  type StaffStayWorklistItem,
} from '@/lib/staff-front-desk-api';
import { dateLabel } from './front-desk-domain';
import { safeErrorMessage } from './front-desk-errors';
import type { ListState } from './front-desk-types';

const PAGE_SIZE = 20;

interface WorklistQuery {
  date: string;
  search: string;
  page: number;
  pageSize: number;
}

interface GroupedItems {
  primary: StaffStayWorklistItem[];
  secondary: StaffStayWorklistItem[];
}

export function useFrontDeskWorklist(queue: StaffStayQueue, allowed: boolean) {
  const [dateDraft, setDateDraft] = useState(() => dateLabel(getHotelTodayIso()));
  const [searchDraft, setSearchDraft] = useState('');
  const [query, setQuery] = useState<WorklistQuery>(() => ({
    date: getHotelTodayIso(),
    search: '',
    page: 1,
    pageSize: PAGE_SIZE,
  }));
  const [worklist, setWorklist] = useState<StaffStayWorklist | null>(null);
  const [listState, setListState] = useState<ListState>('loading');
  const [listError, setListError] = useState<string | null>(null);
  const [refreshNumber, setRefreshNumber] = useState(0);
  const [filterError, setFilterError] = useState<string | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let current = true;
    getStaffStayWorklist(queue, query)
      .then((result) => {
        if (!current) return;
        setWorklist(result);
        setListState('ready');
      })
      .catch((error: unknown) => {
        if (!current) return;
        setListError(error instanceof StaffApiError && error.status === 403
          ? 'دسترسی شما برای مشاهده این فهرست تأیید نشد. با سرپرست شیفت تماس بگیرید.'
          : safeErrorMessage(error));
        setListState('error');
      });
    return () => { current = false; };
  }, [allowed, queue, query, refreshNumber]);

  const refreshList = useCallback(() => {
    setListState('loading');
    setListError(null);
    setRefreshNumber((value) => value + 1);
  }, []);

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const date = toGregorianIso(dateDraft);
    if (!date) {
      setFilterError('تاریخ را به شکل سال/ماه/روز معتبر وارد کنید.');
      return;
    }
    setFilterError(null);
    setListState('loading');
    setListError(null);
    setQuery({ date, search: searchDraft.trim(), page: 1, pageSize: PAGE_SIZE });
  }

  function changePage(direction: -1 | 1) {
    setListState('loading');
    setQuery((current) => ({ ...current, page: current.page + direction }));
  }

  const items = useMemo(() => worklist?.items ?? [], [worklist]);
  const selectedDate = worklist?.date ?? query.date;
  const groupedItems = useMemo<GroupedItems>(() => {
    if (queue === 'arrivals') {
      return {
        primary: items.filter((item) => item.checkIn === selectedDate),
        secondary: items.filter((item) => item.checkIn < selectedDate),
      };
    }
    if (queue === 'in-house') {
      return {
        primary: items.filter((item) => item.checkOut > selectedDate),
        secondary: items.filter((item) => item.checkOut <= selectedDate),
      };
    }
    return { primary: items, secondary: [] };
  }, [items, queue, selectedDate]);

  return {
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
    refreshList,
    changePage,
  };
}
