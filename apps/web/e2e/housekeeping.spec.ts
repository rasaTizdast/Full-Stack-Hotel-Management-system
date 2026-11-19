import { randomUUID } from 'node:crypto';
import { expect, type Page, type TestInfo } from '@playwright/test';
import type {
  HousekeepingDiscrepancy,
  HousekeepingList,
  HousekeepingRoomOption,
  HousekeepingTask,
  HousekeepingTaskType,
} from '../src/lib/staff-housekeeping-api';
import { formatGregorianAsJalali } from '../src/lib/jalali-date';
import { test, withFailureSafeCleanup } from './staff-fixtures';
import {
  cleanupUnfinishedHousekeepingRecords,
  createHousekeepingStaffSession,
  housekeepingApiBaseUrl,
  housekeepingWebOrigin,
  type HousekeepingDiscrepancyRef,
  type HousekeepingStaffSession,
  type HousekeepingTaskRef,
} from './housekeeping-fixtures';

function apiResponseIs(response: { url(): string; request(): { method(): string } }, method: string, path: string) {
  return new URL(response.url()).pathname === path && response.request().method() === method;
}

function taskCard(page: Page, task: Pick<HousekeepingTask, 'id'>) {
  return page.locator(`article[data-housekeeping-task-id="${task.id}"]`);
}

function watchBoardTaskListAfterCreate(page: Page) {
  let createResponseSeen = false;
  let settled = false;
  const followUpRequests = new Set<import('@playwright/test').Request>();
  let resolveSnapshot!: (value: {
    httpStatus: number;
    items: Array<{ id: string; status: string }>;
  } | null) => void;
  const snapshot = new Promise<{
    httpStatus: number;
    items: Array<{ id: string; status: string }>;
  } | null>((resolve) => {
    resolveSnapshot = resolve;
  });
  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      resolveSnapshot(null);
    }
  }, 10_000);
  const onRequest = (request: import('@playwright/test').Request) => {
    if (
      createResponseSeen &&
      request.method() === 'GET' &&
      new URL(request.url()).pathname === '/api/v1/staff/housekeeping/tasks'
    ) {
      followUpRequests.add(request);
    }
  };
  const onResponse = (response: import('@playwright/test').Response) => {
    const request = response.request();
    const path = new URL(response.url()).pathname;
    if (request.method() === 'POST' && path === '/api/v1/staff/housekeeping/tasks') {
      createResponseSeen = true;
      return;
    }
    if (
      settled ||
      request.method() !== 'GET' ||
      path !== '/api/v1/staff/housekeeping/tasks' ||
      !followUpRequests.has(request)
    ) {
      return;
    }
    followUpRequests.delete(request);
    void response.json().then((payload: unknown) => {
      const items = isRecord(payload) && Array.isArray(payload.items)
        ? payload.items.flatMap((item) =>
            isRecord(item) && typeof item.id === 'string' && typeof item.status === 'string'
              ? [{ id: item.id, status: item.status }]
              : [],
          )
        : [];
      settled = true;
      resolveSnapshot({ httpStatus: response.status(), items });
    }, () => {
      settled = true;
      resolveSnapshot({ httpStatus: response.status(), items: [] });
    });
  };
  page.on('request', onRequest);
  page.on('response', onResponse);

  return {
    snapshot,
    dispose() {
      clearTimeout(timer);
      page.off('request', onRequest);
      page.off('response', onResponse);
    },
  };
}

function staffHeadersFromPage(page: Page, refererPath = '/staff/housekeeping') {
  return page.context().cookies(`${housekeepingApiBaseUrl}/staff`).then((cookies) => {
    const session = cookies.find((cookie) => cookie.name === 'hotel_staff_session')?.value;
    const csrf = cookies.find((cookie) => cookie.name === 'hotel_staff_csrf')?.value;
    if (!session || !csrf) {
      throw new Error('The authenticated housekeeping role session is unavailable.');
    }
    return {
      Cookie: `hotel_staff_session=${session}; hotel_staff_csrf=${csrf}`,
      Origin: housekeepingWebOrigin,
      Referer: `${housekeepingWebOrigin}${refererPath}`,
      'X-CSRF-Token': csrf,
    };
  });
}

async function getRooms(page: Page): Promise<HousekeepingRoomOption[]> {
  const response = await page.request.get(
    `${housekeepingApiBaseUrl}/staff/housekeeping/rooms`,
    { headers: await staffHeadersFromPage(page) },
  );
  expect(response.status()).toBe(200);
  const payload: unknown = await response.json();
  expectNoGuestOrFolioData(payload);
  if (
    !isRecord(payload) ||
    typeof payload.businessDate !== 'string' ||
    !Array.isArray(payload.items) ||
    !isRecord(payload.pagination)
  ) {
    throw new Error('Housekeeping room options returned an invalid paginated response.');
  }
  const pagination = payload.pagination;
  if (
    !isIntegerAtLeast(pagination.page, 1) ||
    !isIntegerAtLeast(pagination.pageSize, 1) ||
    pagination.pageSize > 100 ||
    !isIntegerAtLeast(pagination.totalItems, 0) ||
    !isIntegerAtLeast(pagination.totalPages, 0) ||
    pagination.totalPages !== Math.ceil(pagination.totalItems / pagination.pageSize)
  ) {
    throw new Error('Housekeeping room options returned invalid pagination fields.');
  }
  return payload.items.map((item): HousekeepingRoomOption => {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.roomNumber !== 'string' ||
      (item.floor !== null && typeof item.floor !== 'string')
    ) {
      throw new Error('Housekeeping room option returned an invalid room identity.');
    }
    const housekeepingStatus = item.housekeepingStatus;
    if (
      housekeepingStatus !== 'DIRTY' &&
      housekeepingStatus !== 'CLEAN' &&
      housekeepingStatus !== 'INSPECTED'
    ) {
      throw new Error(`Housekeeping room ${item.id} returned an invalid readiness state.`);
    }
    if (item.occupancy !== 'OCCUPIED' && item.occupancy !== 'VACANT') {
      throw new Error(`Housekeeping room ${item.id} returned an invalid occupancy state.`);
    }
    if (typeof item.dueArrival !== 'boolean' || typeof item.dueDeparture !== 'boolean') {
      throw new Error(`Housekeeping room ${item.id} returned invalid due-arrival/departure flags.`);
    }
    return {
      id: item.id,
      roomNumber: item.roomNumber,
      floor: item.floor,
      housekeepingStatus,
      occupancy: item.occupancy,
      dueArrival: item.dueArrival,
      dueDeparture: item.dueDeparture,
    };
  });
}

function normalizeTask(value: unknown): HousekeepingTask {
  if (!isRecord(value)) throw new Error('Housekeeping task returned an invalid object.');
  const room = value.room;
  const actions = value.allowedActions;
  if (
    typeof value.id !== 'string' ||
    typeof value.taskType !== 'string' ||
    typeof value.status !== 'string' ||
    typeof value.priority !== 'string' ||
    typeof value.dueDate !== 'string' ||
    !isRecord(room) ||
    typeof room.id !== 'string' ||
    typeof room.roomNumber !== 'string' ||
    typeof room.housekeepingStatus !== 'string' ||
    (room.occupancy !== 'VACANT' && room.occupancy !== 'OCCUPIED') ||
    !isRecord(actions)
  ) {
    throw new Error('Housekeeping task returned invalid room, status, or due-date fields.');
  }
  return value as unknown as HousekeepingTask;
}

async function expectRoomReadiness(
  page: Page,
  room: HousekeepingRoomOption,
): Promise<void> {
  const card = page.getByRole('article', { name: `وضعیت اتاق ${room.roomNumber}` });
  await expect(card).toBeVisible();
  const conditionLabel = {
    DIRTY: 'نیازمند نظافت',
    CLEAN: 'نظافت‌شده',
    INSPECTED: 'بازرسی‌شده',
  }[room.housekeepingStatus];
  await expect(card).toContainText(`حضور: ${room.occupancy === 'OCCUPIED' ? 'اشغال' : 'خالی'}`);
  await expect(card).toContainText(`وضعیت نظافت: ${conditionLabel}`);
}

async function expectDueArrivalReadinessPresentation(
  page: Page,
  room: HousekeepingRoomOption,
): Promise<void> {
  // UI-only coverage: the HPM-005 API/PostgreSQL E2E owns the check-in gate.
  // Do not create a checked-in stay in this browser fixture.
  const roomOptionsRoute = '**/staff/housekeeping/rooms**';
  let injectedArrival = false;
  await page.route(roomOptionsRoute, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    if (!response.ok()) {
      await route.fulfill({ response });
      return;
    }
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.items)) {
      throw new Error('Readiness presentation fixture returned an invalid room list.');
    }
    let matchedRoom = false;
    const items = payload.items.map((item) => {
      if (!isRecord(item) || item.id !== room.id) return item;
      matchedRoom = true;
      return {
        ...item,
        housekeepingStatus: 'DIRTY',
        occupancy: 'VACANT',
        dueArrival: true,
        dueDeparture: false,
      };
    });
    if (!matchedRoom) {
      throw new Error('Readiness presentation fixture room was not in the room list.');
    }
    injectedArrival = true;
    await route.fulfill({ response, body: JSON.stringify({ ...payload, items }) });
  });

  try {
    await page.goto('/staff/housekeeping');
    const readiness = page.getByRole('region', { name: 'آمادگی اتاق‌ها' });
    const card = page.getByRole('article', { name: `وضعیت اتاق ${room.roomNumber}` });
    await expect(readiness).toContainText('کنترل نهایی ورود با سامانهٔ پذیرش است.');
    await expect(card).toContainText('حضور: خالی');
    await expect(card).toContainText('وضعیت نظافت: نیازمند نظافت');
    await expect(card).toContainText('ورود امروز');
    expect(injectedArrival).toBe(true);
  } finally {
    await page.unroute(roomOptionsRoute);
  }

  await page.reload();
  await expectRoomReadiness(page, room);
}

async function getTasks(
  page: Page,
  query: {
    businessDate?: string;
    roomId?: string;
    taskType?: HousekeepingTaskType;
    status?: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  } = {},
): Promise<HousekeepingList<HousekeepingTask>> {
  const params = new URLSearchParams({
    page: '1',
    pageSize: '100',
    ...(query.businessDate ? { businessDate: query.businessDate } : {}),
    ...(query.roomId ? { roomId: query.roomId } : {}),
    ...(query.taskType ? { taskType: query.taskType } : {}),
    ...(query.status ? { status: query.status } : {}),
  });
  const response = await page.request.get(
    `${housekeepingApiBaseUrl}/staff/housekeeping/tasks?${params.toString()}`,
    { headers: await staffHeadersFromPage(page) },
  );
  expect(response.status()).toBe(200);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.items) || typeof payload.businessDate !== 'string') {
    throw new Error('Housekeeping task list returned an invalid response.');
  }
  expectNoGuestOrFolioData(payload);
  return {
    ...(payload as unknown as Omit<HousekeepingList<HousekeepingTask>, 'items'>),
    items: payload.items.map((item) => normalizeTask(item)),
  };
}

async function getRenderedTaskBoardEvidence(
  page: Page,
  task: HousekeepingTask,
): Promise<{ cardCount: number; statusLines: string[] }> {
  const cards = taskCard(page, task);
  const cardCount = await cards.count();
  const statusLines: string[] = [];
  for (let index = 0; index < cardCount; index += 1) {
    const lines = await cards.nth(index).locator('span').allTextContents();
    const statusLine = lines.map((line) => line.trim()).find((line) => line.startsWith('کار:'));
    if (statusLine) statusLines.push(statusLine);
  }
  return { cardCount, statusLines };
}

async function getDiscrepancies(
  page: Page,
  businessDate: string,
  roomId?: string,
  status?: HousekeepingDiscrepancy['status'],
): Promise<HousekeepingList<HousekeepingDiscrepancy>> {
  const params = new URLSearchParams({
    businessDate,
    page: '1',
    pageSize: '100',
    ...(roomId ? { roomId } : {}),
    ...(status ? { status } : {}),
  });
  const response = await page.request.get(
    `${housekeepingApiBaseUrl}/staff/housekeeping/discrepancies?${params.toString()}`,
    { headers: await staffHeadersFromPage(page) },
  );
  expect(response.status()).toBe(200);
  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.items) || typeof payload.businessDate !== 'string') {
    throw new Error('Housekeeping discrepancy list returned an invalid response.');
  }
  return payload as unknown as HousekeepingList<HousekeepingDiscrepancy>;
}

function expectNoGuestOrFolioData(payload: unknown) {
  const serialized = JSON.stringify(payload).toLowerCase();
  for (const forbidden of [
    'guestname',
    'guestphone',
    'guestemail',
    'foliobalancetoman',
    'foliobalance',
    'balancetoman',
  ]) {
    expect(serialized).not.toContain(forbidden);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIntegerAtLeast(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum;
}

async function createTaskFromStaff(
  creator: HousekeepingStaffSession,
  room: HousekeepingRoomOption,
  businessDate: string,
  taskType: HousekeepingTaskType,
  note: string,
  taskRefs: HousekeepingTaskRef[],
): Promise<HousekeepingTask> {
  await creator.page.getByRole('button', { name: 'ایجاد کار', exact: true }).click();
  const dialog = creator.page.getByRole('dialog', { name: 'ایجاد کار خانه‌داری' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('اتاق').selectOption(room.id);
  await dialog.getByLabel('نوع کار').selectOption(taskType);
  await dialog.getByLabel('اولویت').selectOption('HIGH');
  await dialog.getByLabel(/یادداشت عملیاتی/).fill(note);

  const boardRefreshWatch = watchBoardTaskListAfterCreate(creator.page);
  try {
    const responsePromise = creator.page.waitForResponse((response) =>
      apiResponseIs(response, 'POST', '/api/v1/staff/housekeeping/tasks'),
    );
    await dialog.getByRole('button', { name: 'ایجاد کار', exact: true }).click();
    const response = await responsePromise;
    const rawTask: unknown = await response.json();
    expectNoGuestOrFolioData(rawTask);
    const task = normalizeTask(rawTask);
    // Register the exact ID before any later assertion can fail. Cleanup only
    // cancels this generated unfinished row and keeps its audit trail.
    taskRefs.push({ id: task.id, roomId: room.id, businessDate });
    expect(response.status()).toBe(201);
    if (task.room.id !== room.id || task.taskType !== taskType || task.dueDate !== businessDate) {
      throw new Error('Housekeeping task creation returned an invalid task.');
    }
    await expect(
      creator.page.getByRole('status').filter({ hasText: 'کار خانه‌داری ثبت شد' }),
    ).toContainText('کار خانه‌داری ثبت شد');

    const createdCard = taskCard(creator.page, task);
    try {
      await expect(createdCard).toBeVisible();
      await expect(createdCard).toContainText('در انتظار شروع');
    } catch {
      const [filteredList, boardSnapshot] = await Promise.all([
        getTasks(creator.page, { businessDate, roomId: room.id, taskType }),
        boardRefreshWatch.snapshot,
      ]);
      const filteredTask = filteredList.items.find((item) => item.id === task.id);
      const boardTask = boardSnapshot?.items.find((item) => item.id === task.id);
      const routePath = new URL(creator.page.url()).pathname;
      const cardCount = await createdCard.count();
      const loading = (await creator.page.getByText('در حال دریافت کارهای خانه‌داری…', { exact: true }).count()) > 0;
      const error = (await creator.page.getByRole('alert').count()) > 0;
      const empty =
        (await creator.page.getByText('برای این تاریخ کاری، کاری ثبت نشده است.', { exact: true }).count()) > 0 ||
        (await creator.page.getByText('کاری با این فیلترها پیدا نشد.', { exact: true }).count()) > 0;
      throw new Error(
        `Created task card was not rendered with OPEN status ` +
          `(task=${task.id}; createHttp=${response.status()}; createStatus=${task.status}; ` +
          `filteredGetHttp=200; filteredGetHasTask=${Boolean(filteredTask)}; ` +
          `filteredGetStatus=${filteredTask?.status ?? 'missing'}; ` +
          `boardGetHttp=${boardSnapshot?.httpStatus ?? 'no-response'}; ` +
          `boardGetHasTask=${Boolean(boardTask)}; boardGetStatus=${boardTask?.status ?? 'missing'}; ` +
          `path=${routePath}; exactCardCount=${cardCount}; loading=${loading}; error=${error}; empty=${empty}).`,
      );
    }
    return task as unknown as HousekeepingTask;
  } finally {
    boardRefreshWatch.dispose();
  }
}

async function assignTaskToHousekeeper(
  manager: HousekeepingStaffSession,
  task: HousekeepingTask,
  housekeeper: HousekeepingStaffSession,
) {
  const listAfterCreate = await getTasks(manager.page, {
    businessDate: task.dueDate,
    roomId: task.room.id,
    taskType: task.taskType,
  });
  const exactTaskAfterCreate = listAfterCreate.items.find((item) => item.id === task.id);
  const boardBeforeAssignment = await getRenderedTaskBoardEvidence(manager.page, task);
  const card = taskCard(manager.page, task);
  try {
    await expect(card).toBeVisible();
    await expect(card).toContainText('در انتظار شروع');
  } catch {
    throw new Error(
      `Assignment card missing for task ${task.id} ` +
        `(createHttp=201; createStatus=${task.status}; managerGetHttp=200; ` +
        `managerGetStatus=${exactTaskAfterCreate?.status ?? 'missing'}; ` +
        `boardCards=${boardBeforeAssignment.cardCount}; ` +
        `boardStatusLines=${boardBeforeAssignment.statusLines.join('|') || 'none'}).`,
    );
  }
  await card.getByRole('button', { name: /تخصیص کار|تغییر مسئول/ }).click();
  const dialog = manager.page.getByRole('dialog', {
    name: `تخصیص کار اتاق ${task.room.roomNumber}`,
  });
  await dialog.getByLabel('خانه‌دار مسئول').selectOption(housekeeper.accountId);

  const responsePromise = manager.page.waitForResponse((response) =>
    apiResponseIs(
      response,
      'PATCH',
      `/api/v1/staff/housekeeping/tasks/${task.id}/assignment`,
    ),
  );
  await dialog.getByRole('button', { name: 'ثبت تخصیص' }).click();
  const response = await responsePromise;
  const assignmentResponse: unknown = await response.json();
  const assignmentKeys = isRecord(assignmentResponse)
    ? Object.keys(assignmentResponse).sort().join(',')
    : 'invalid';
  const assignmentStatus = isRecord(assignmentResponse) && typeof assignmentResponse.status === 'string'
    ? assignmentResponse.status
    : 'missing';
  const assignmentMatches = isRecord(assignmentResponse) && isRecord(assignmentResponse.assignee)
    ? assignmentResponse.assignee.id === housekeeper.accountId
    : false;
  const listAfterAssignment = await getTasks(manager.page, {
    businessDate: task.dueDate,
    roomId: task.room.id,
    taskType: task.taskType,
  });
  const exactTaskAfterAssignment = listAfterAssignment.items.find((item) => item.id === task.id);
  const boardAfterAssignment = await getRenderedTaskBoardEvidence(manager.page, task);
  const listAssigneeMatches = exactTaskAfterAssignment?.assignee?.id === housekeeper.accountId;
  const diagnostic =
    `task=${task.id}; createStatus=${task.status}; managerGetAfterCreateStatus=${exactTaskAfterCreate?.status ?? 'missing'}; ` +
    `patchHttp=${response.status()}; patchStatus=${assignmentStatus}; patchKeys=${assignmentKeys}; ` +
    `patchAssigneeMatches=${assignmentMatches}; managerGetAfterPatchStatus=${exactTaskAfterAssignment?.status ?? 'missing'}; ` +
    `managerGetAssigneeMatches=${listAssigneeMatches}; boardCards=${boardAfterAssignment.cardCount}; ` +
    `boardStatusLines=${boardAfterAssignment.statusLines.join('|') || 'none'}`;
  if (
    response.status() !== 200 ||
    assignmentStatus !== 'OPEN' ||
    !assignmentMatches ||
    exactTaskAfterAssignment?.status !== 'OPEN' ||
    !listAssigneeMatches
  ) {
    throw new Error(`Housekeeping assignment API/readback mismatch (${diagnostic}).`);
  }
  try {
    await expect(card).toContainText('در انتظار شروع');
    await expect(card).toContainText(housekeeper.username);
  } catch {
    const assignedCard = taskCard(manager.page, task).filter({ hasText: housekeeper.username });
    throw new Error(
      `Housekeeping assignment board did not show the exact assignee ` +
        `(assignedCardCount=${await assignedCard.count()}; ${diagnostic}).`,
    );
  }
}

async function cancelTaskAsManager(
  manager: HousekeepingStaffSession,
  task: HousekeepingTask,
  runMarker: string,
): Promise<void> {
  const card = taskCard(manager.page, task);
  await expect(card).toBeVisible();
  await expect(card).toContainText('در انتظار شروع');
  await card.getByRole('button', { name: 'لغو کار' }).click();
  const dialog = manager.page.getByRole('dialog', { name: `لغو کار اتاق ${task.room.roomNumber}` });
  await dialog.getByLabel('دلیل لغو').fill(`${runMarker}: لغو کار آزمایشی پذیرش.`);
  const responsePromise = manager.page.waitForResponse((response) =>
    apiResponseIs(
      response,
      'POST',
      `/api/v1/staff/housekeeping/tasks/${task.id}/cancel`,
    ),
  );
  await dialog.getByRole('button', { name: 'لغو کار', exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const cancelled: unknown = await response.json();
  if (!isRecord(cancelled) || cancelled.status !== 'CANCELLED') {
    throw new Error('Manager cancellation did not return a cancelled housekeeping task.');
  }
  const successMessage = `کار اتاق ${task.room.roomNumber} لغو شد.`;
  await expect(
    manager.page.getByRole('status').filter({ hasText: successMessage }),
  ).toContainText(successMessage);
}

async function startHousekeeperTask(
  housekeeper: HousekeepingStaffSession,
  task: HousekeepingTask,
) {
  await housekeeper.page.goto('/staff/housekeeping');
  const card = taskCard(housekeeper.page, task);
  await expect(card).toBeVisible();
  await expect(card).toContainText(housekeeper.username);
  await expect(card).toContainText('در انتظار شروع');

  let startResponseSeen = false;
  const followUpTaskListRequests = new Set<import('@playwright/test').Request>();
  let resolveStartEvidence!: (value: { httpStatus: number; taskStatus: string }) => void;
  let resolveReadbackEvidence!: (value: { httpStatus: number; taskStatus: string }) => void;
  const startEvidencePromise = new Promise<{ httpStatus: number; taskStatus: string }>((resolve) => {
    resolveStartEvidence = resolve;
  });
  const readbackEvidencePromise = new Promise<{ httpStatus: number; taskStatus: string }>((resolve) => {
    resolveReadbackEvidence = resolve;
  });
  const startPath = `/api/v1/staff/housekeeping/tasks/${task.id}/start`;
  const tasksPath = '/api/v1/staff/housekeeping/tasks';
  const captureRequest = (request: import('@playwright/test').Request) => {
    if (
      startResponseSeen &&
      request.method() === 'GET' &&
      new URL(request.url()).pathname === tasksPath
    ) {
      followUpTaskListRequests.add(request);
    }
  };
  const captureResponse = (response: import('@playwright/test').Response) => {
    const request = response.request();
    const path = new URL(response.url()).pathname;
    if (request.method() === 'POST' && path === startPath) {
      startResponseSeen = true;
      void response.json().then((payload: unknown) => {
        const taskStatus = isRecord(payload) && typeof payload.status === 'string'
          ? payload.status
          : 'missing';
        resolveStartEvidence({ httpStatus: response.status(), taskStatus });
      }, () => resolveStartEvidence({ httpStatus: response.status(), taskStatus: 'unreadable' }));
      return;
    }
    if (request.method() !== 'GET' || !followUpTaskListRequests.has(request)) return;
    followUpTaskListRequests.delete(request);
    void response.json().then((payload: unknown) => {
      const items = isRecord(payload) && Array.isArray(payload.items) ? payload.items : [];
      const refreshedTask = items.find((item) => isRecord(item) && item.id === task.id);
      const taskStatus = isRecord(refreshedTask) && typeof refreshedTask.status === 'string'
        ? refreshedTask.status
        : 'missing';
      resolveReadbackEvidence({ httpStatus: response.status(), taskStatus });
    }, () => resolveReadbackEvidence({ httpStatus: response.status(), taskStatus: 'unreadable' }));
  };
  housekeeper.page.on('request', captureRequest);
  housekeeper.page.on('response', captureResponse);

  let startEvidence: { httpStatus: number; taskStatus: string };
  let readbackEvidence: { httpStatus: number; taskStatus: string };
  try {
    await card.getByRole('button', { name: 'شروع کار' }).click();
    [startEvidence, readbackEvidence] = await Promise.all([
      startEvidencePromise,
      readbackEvidencePromise,
    ]);
  } finally {
    housekeeper.page.off('request', captureRequest);
    housekeeper.page.off('response', captureResponse);
  }

  const diagnostic =
    `task=${task.id}; startHttp=${startEvidence.httpStatus}; startStatus=${startEvidence.taskStatus}; ` +
    `followUpGetHttp=${readbackEvidence.httpStatus}; followUpTaskStatus=${readbackEvidence.taskStatus}`;
  if (
    startEvidence.httpStatus !== 200 ||
    startEvidence.taskStatus !== 'IN_PROGRESS' ||
    readbackEvidence.httpStatus !== 200 ||
    readbackEvidence.taskStatus !== 'IN_PROGRESS'
  ) {
    throw new Error(`Housekeeping start API/readback mismatch (${diagnostic}).`);
  }

  const updatedCard = taskCard(housekeeper.page, task);
  try {
    await expect(updatedCard).toContainText(housekeeper.username);
    await expect(updatedCard).toContainText('در حال انجام');
  } catch {
    const statusLines = await updatedCard.locator('span').allTextContents();
    const renderedStatus = statusLines.map((line) => line.trim()).find((line) => line.startsWith('کار:')) ?? 'missing';
    throw new Error(`Housekeeping start UI did not reflect the API readback (${diagnostic}; rendered=${renderedStatus}).`);
  }
}

async function failInspection(
  manager: HousekeepingStaffSession,
  housekeeper: HousekeepingStaffSession,
  task: HousekeepingTask,
  runMarker: string,
  businessDate: string,
  priorRecleanIds: ReadonlySet<string>,
  taskRefs: HousekeepingTaskRef[],
) {
  const card = taskCard(housekeeper.page, task);
  await expect(card).toBeVisible();
  await expect(card).toContainText(housekeeper.username);
  await expect(card).toContainText('در حال انجام');
  await card.getByRole('button', { name: 'تکمیل بازرسی' }).click();
  const dialog = housekeeper.page.getByRole('dialog', {
    name: `ثبت نتیجهٔ بازرسی اتاق ${task.room.roomNumber}`,
  });
  await dialog.getByRole('radio', { name: 'نیازمند نظافت دوباره' }).check();
  await dialog.getByLabel('دلیل نیاز به نظافت دوباره').fill(
    `${runMarker}: رسوب آزمایشی برای نظافت دوباره.`,
  );

  const responsePromise = housekeeper.page.waitForResponse((response) =>
    apiResponseIs(
      response,
      'POST',
      `/api/v1/staff/housekeeping/tasks/${task.id}/complete`,
    ),
  );
  await dialog.getByRole('button', { name: 'ثبت نتیجهٔ بازرسی' }).click();
  const response = await responsePromise;
  // The re-clean is an automatic child row. Discover and register its exact ID
  // immediately after the completion request, before assertions can fail.
  const generatedRecleans = await getTasks(manager.page, {
    businessDate,
    roomId: task.room.id,
    taskType: 'RE_CLEAN',
    status: 'OPEN',
  });
  const reclean = generatedRecleans.items.find((item) => !priorRecleanIds.has(item.id));
  if (reclean) taskRefs.push({ id: reclean.id, roomId: task.room.id, businessDate });
  expect(response.status()).toBe(200);
  const completed: unknown = await response.json();
  if (
    !isRecord(completed) ||
    completed.status !== 'COMPLETED' ||
    (completed.outcome ?? completed.completionOutcome) !== 'NEEDS_REWORK'
  ) {
    throw new Error('Failed inspection did not return the expected rework outcome.');
  }
  await expect(housekeeper.page.getByRole('status')).toContainText('نظافت دوباره');
}

async function completeCleaningTask(
  housekeeper: HousekeepingStaffSession,
  task: HousekeepingTask,
) {
  const card = taskCard(housekeeper.page, task);
  await expect(card).toBeVisible();
  await expect(card).toContainText(housekeeper.username);
  await expect(card).toContainText('در حال انجام');
  await card.getByRole('button', { name: 'ثبت پایان کار' }).click();
  const dialog = housekeeper.page.getByRole('dialog', {
    name: `ثبت پایان کار اتاق ${task.room.roomNumber}`,
  });
  const responsePromise = housekeeper.page.waitForResponse((response) =>
    apiResponseIs(
      response,
      'POST',
      `/api/v1/staff/housekeeping/tasks/${task.id}/complete`,
    ),
  );
  await dialog.getByRole('button', { name: 'ثبت پایان کار' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const successMessage = `انجام کار اتاق ${task.room.roomNumber} ثبت شد.`;
  await expect(
    housekeeper.page.getByRole('status').filter({ hasText: successMessage }),
  ).toContainText(successMessage);
}

async function passInspection(
  housekeeper: HousekeepingStaffSession,
  task: HousekeepingTask,
) {
  const card = taskCard(housekeeper.page, task);
  await expect(card).toBeVisible();
  await expect(card).toContainText(housekeeper.username);
  await expect(card).toContainText('در حال انجام');
  await card.getByRole('button', { name: 'تکمیل بازرسی' }).click();
  const dialog = housekeeper.page.getByRole('dialog', {
    name: `ثبت نتیجهٔ بازرسی اتاق ${task.room.roomNumber}`,
  });
  const responsePromise = housekeeper.page.waitForResponse((response) =>
    apiResponseIs(
      response,
      'POST',
      `/api/v1/staff/housekeeping/tasks/${task.id}/complete`,
    ),
  );
  await dialog.getByRole('button', { name: 'ثبت نتیجهٔ بازرسی' }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const result: unknown = await response.json();
  if (!isRecord(result) || (result.outcome ?? result.completionOutcome) !== 'DONE') {
    throw new Error('Passing inspection did not return the expected completion outcome.');
  }
  const successMessage = `انجام کار اتاق ${task.room.roomNumber} ثبت شد.`;
  await expect(
    housekeeper.page.getByRole('status').filter({ hasText: successMessage }),
  ).toContainText(successMessage);
}

async function reportSleepWhileAssignedWorkIsActive(
  manager: HousekeepingStaffSession,
  housekeeper: HousekeepingStaffSession,
  room: HousekeepingRoomOption,
  businessDate: string,
  runMarker: string,
  discrepancyRefs: HousekeepingDiscrepancyRef[],
): Promise<HousekeepingDiscrepancy> {
  await housekeeper.page.goto('/staff/housekeeping');
  if ((housekeeper.page.viewportSize()?.width ?? 1280) <= 600) {
    await assertNoMobileOverflow(housekeeper.page);
  }
  await expect(housekeeper.page.getByRole('button', { name: 'ایجاد کار', exact: true })).toHaveCount(0);
  await expect(housekeeper.page.getByRole('button', { name: /تخصیص کار|تغییر مسئول/ })).toHaveCount(0);
  await housekeeper.page.getByRole('button', { name: 'گزارش مغایرت حضور' }).click();
  const reportDialog = housekeeper.page.getByRole('dialog', { name: 'گزارش مغایرت حضور' });
  await reportDialog.getByLabel('اتاق').selectOption(room.id);
  await reportDialog.getByLabel('حضور مشاهده‌شده').selectOption('true');
  await reportDialog
    .getByLabel('یادداشت عملیاتی')
    .fill(`${runMarker}: کارکنان حضور را در اتاق خالی مشاهده کردند.`);

  const reportResponsePromise = housekeeper.page.waitForResponse((response) =>
    apiResponseIs(
      response,
      'POST',
      `/api/v1/staff/housekeeping/rooms/${room.id}/discrepancies`,
    ),
  );
  await reportDialog.getByRole('button', { name: 'ثبت مغایرت' }).click();
  const reportResponse = await reportResponsePromise;
  const reported: unknown = await reportResponse.json();
  if (isRecord(reported) && typeof reported.id === 'string') {
    discrepancyRefs.push({ id: reported.id, roomId: room.id, businessDate });
  }
  if (
    !isRecord(reported) ||
    typeof reported.id !== 'string' ||
    reported.kind !== 'SLEEP' ||
    reported.expectedOccupied !== false ||
    reported.observedOccupied !== true
  ) {
    throw new Error('The real SLEEP report did not preserve the expected occupancy snapshot.');
  }
  expect(reportResponse.status()).toBe(201);
  await expect(housekeeper.page.getByRole('status')).toContainText('ثبت شد');
  expectNoGuestOrFolioData(reported);

  const roomAfterSleepReport = (await getRooms(manager.page)).find(
    (candidate) => candidate.id === room.id,
  );
  expect(roomAfterSleepReport?.occupancy).toBe(room.occupancy);
  return reported as unknown as HousekeepingDiscrepancy;
}

async function assertNoMobileOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
}

async function attachFixtureIds(
  testInfo: TestInfo,
  runMarker: string,
  tasks: readonly HousekeepingTaskRef[],
  discrepancies: readonly HousekeepingDiscrepancyRef[],
  mockedSkipId: string,
) {
  await testInfo.attach('hpm005-fixture-ids', {
    body: JSON.stringify(
      {
        runMarker,
        persistedTaskIds: tasks.map((task) => task.id),
        persistedDiscrepancyIds: discrepancies.map((item) => item.id),
        mockedHistoricalSkipId: mockedSkipId,
      },
      null,
      2,
    ),
    contentType: 'application/json',
  });
}

test('real staff roles run housekeeping task, SLEEP, and access-boundary flows', async (
  { page, browser, staffCookies },
  testInfo,
) => {
  test.setTimeout(120_000);
  await page.context().addCookies(staffCookies);

  const runMarker = `E2E-HPM005-${randomUUID().slice(0, 8).toUpperCase()}`;
  const taskRefs: HousekeepingTaskRef[] = [];
  const reworkParentTaskIds: string[] = [];
  const discrepancyRefs: HousekeepingDiscrepancyRef[] = [];
  const mockedSkipId = `mocked-skip-${randomUUID()}`;

  await withFailureSafeCleanup(async (registerCleanup) => {
    const manager = await createHousekeepingStaffSession(page, browser, 'MANAGER', registerCleanup);
    const housekeeper = await createHousekeepingStaffSession(
      page,
      browser,
      'HOUSEKEEPER',
      registerCleanup,
    );
    const receptionist = await createHousekeepingStaffSession(
      page,
      browser,
      'RECEPTIONIST',
      registerCleanup,
    );
    const cashier = await createHousekeepingStaffSession(page, browser, 'CASHIER', registerCleanup);

    registerCleanup(async () =>
      cleanupUnfinishedHousekeepingRecords(
        page,
        taskRefs,
        discrepancyRefs,
        runMarker,
        reworkParentTaskIds,
      ),
    );
    registerCleanup(async () =>
      attachFixtureIds(testInfo, runMarker, taskRefs, discrepancyRefs, mockedSkipId),
    );

    const viewport = page.viewportSize();
    const mobile = Boolean(viewport && viewport.width <= 600);
    const anonymousContext = await browser.newContext({
      baseURL: housekeepingWebOrigin,
      ...(viewport ? { viewport } : {}),
      isMobile: mobile,
      hasTouch: mobile,
      ...(mobile ? { deviceScaleFactor: 2 } : {}),
    });
    registerCleanup(async () => anonymousContext.close());
    const anonymousPage = await anonymousContext.newPage();
    await anonymousPage.goto('/staff/housekeeping');
    await expect(anonymousPage).toHaveURL(/\/staff\/login/);

    await manager.page.goto('/staff/housekeeping');
    await expect(manager.page.getByRole('heading', { name: 'خانه‌داری' })).toBeVisible();
    const initialTaskPage = await getTasks(manager.page);
    const businessDate = initialTaskPage.businessDate;
    const roomOptions = await getRooms(manager.page);
    const openTasks = await getTasks(manager.page, { businessDate, status: 'OPEN' });
    const inProgressTasks = await getTasks(manager.page, { businessDate, status: 'IN_PROGRESS' });
    const busyRoomIds = new Set(
      [...openTasks.items, ...inProgressTasks.items].map((task) => task.room.id),
    );
    const room = roomOptions.find(
      (candidate) =>
        candidate.occupancy === 'VACANT' &&
        candidate.housekeepingStatus !== 'DIRTY' &&
        !busyRoomIds.has(candidate.id),
    );
    if (!room) {
      throw new Error('HPM-005 E2E requires an unoccupied clean/inspected room with no active task.');
    }
    await expectRoomReadiness(manager.page, room);
    await expectDueArrivalReadinessPresentation(manager.page, room);

    await receptionist.page.goto('/staff/housekeeping');
    const receptionistTask = await createTaskFromStaff(
      receptionist,
      room,
      businessDate,
      'GUEST_REQUEST',
      `${runMarker}: fictional guest request task; contains no guest identity or folio data.`,
      taskRefs,
    );
    const receptionistTaskCard = taskCard(receptionist.page, receptionistTask);
    await expect(receptionistTaskCard).toBeVisible();
    await expect(receptionistTaskCard).toContainText('در انتظار شروع');
    await expect(receptionistTaskCard.getByRole('button', { name: /تخصیص کار|تغییر مسئول/ })).toHaveCount(0);
    await expect(receptionistTaskCard.getByRole('button', { name: 'لغو کار' })).toHaveCount(0);
    await manager.page.reload();
    await cancelTaskAsManager(manager, receptionistTask, runMarker);

    const initialInspection = await createTaskFromStaff(
      manager,
      room,
      businessDate,
      'INSPECTION',
      `${runMarker}: inspection before arrival.`,
      taskRefs,
    );
    reworkParentTaskIds.push(initialInspection.id);
    await assignTaskToHousekeeper(manager, initialInspection, housekeeper);
    await startHousekeeperTask(housekeeper, initialInspection);

    const priorOpenRecleans = await getTasks(manager.page, {
      businessDate,
      roomId: room.id,
      taskType: 'RE_CLEAN',
      status: 'OPEN',
    });
    const priorRecleanIds = new Set(priorOpenRecleans.items.map((task) => task.id));
    await failInspection(
      manager,
      housekeeper,
      initialInspection,
      runMarker,
      businessDate,
      priorRecleanIds,
      taskRefs,
    );

    const reworkList = await getTasks(manager.page, {
      businessDate,
      roomId: room.id,
      taskType: 'RE_CLEAN',
      status: 'OPEN',
    });
    const reclean = reworkList.items.find((task) => !priorRecleanIds.has(task.id));
    if (!reclean) {
      throw new Error('Failed inspection did not create a distinct re-clean follow-up task.');
    }
    if (!taskRefs.some((ref) => ref.id === reclean.id)) {
      taskRefs.push({ id: reclean.id, roomId: room.id, businessDate });
    }
    await manager.page.goto('/staff/housekeeping');
    const recleanCard = taskCard(manager.page, reclean);
    await expect(recleanCard).toBeVisible();
    await expect(recleanCard).toContainText('در انتظار شروع');
    await recleanCard.getByRole('button', { name: /تخصیص کار|تغییر مسئول/ }).click();
    const assignmentDialog = manager.page.getByRole('dialog', {
      name: `تخصیص کار اتاق ${room.roomNumber}`,
    });
    await assignmentDialog.getByLabel('خانه‌دار مسئول').selectOption(housekeeper.accountId);
    const recleanAssignment = manager.page.waitForResponse((response) =>
      apiResponseIs(
        response,
        'PATCH',
        `/api/v1/staff/housekeeping/tasks/${reclean.id}/assignment`,
      ),
    );
    await assignmentDialog.getByRole('button', { name: 'ثبت تخصیص' }).click();
    expect((await recleanAssignment).status()).toBe(200);

    await startHousekeeperTask(housekeeper, reclean);
    await completeCleaningTask(housekeeper, reclean);
    const cleanRoom = (await getRooms(manager.page)).find((candidate) => candidate.id === room.id);
    expect(cleanRoom?.housekeepingStatus).toBe('CLEAN');
    expect(cleanRoom?.occupancy).toBe('VACANT');
    await manager.page.reload();
    await expectRoomReadiness(manager.page, cleanRoom!);

    const finalInspection = await createTaskFromStaff(
      manager,
      cleanRoom!,
      businessDate,
      'INSPECTION',
      `${runMarker}: final room inspection.`,
      taskRefs,
    );
    await assignTaskToHousekeeper(manager, finalInspection, housekeeper);
    await startHousekeeperTask(housekeeper, finalInspection);
    const reported = await reportSleepWhileAssignedWorkIsActive(
      manager,
      housekeeper,
      room,
      businessDate,
      runMarker,
      discrepancyRefs,
    );
    await passInspection(housekeeper, finalInspection);
    const inspectedRoom = (await getRooms(manager.page)).find((candidate) => candidate.id === room.id);
    expect(inspectedRoom?.housekeepingStatus).toBe('INSPECTED');
    expect(inspectedRoom?.occupancy).toBe('VACANT');
    await manager.page.reload();
    await expectRoomReadiness(manager.page, inspectedRoom!);

    const taskListAfterWork = await getTasks(manager.page, {
      businessDate,
      roomId: room.id,
    });
    expectNoGuestOrFolioData(taskListAfterWork);
    if (testInfo.project.name === 'mobile-chrome') {
      await assertNoMobileOverflow(manager.page);
    }
    await manager.page.screenshot({
      path: testInfo.outputPath('housekeeping-task-board.png'),
      fullPage: true,
    });

    const realDiscrepancies = await getDiscrepancies(
      receptionist.page,
      businessDate,
      room.id,
      'OPEN',
    );
    expectNoGuestOrFolioData(realDiscrepancies);
    const sleepRecord = realDiscrepancies.items.find((item) => item.id === reported.id);
    expect(sleepRecord).toMatchObject({
      businessDate,
      kind: 'SLEEP',
      expectedOccupied: false,
      observedOccupied: true,
      status: 'OPEN',
    });

    await receptionist.page.goto('/staff/housekeeping');
    if ((receptionist.page.viewportSize()?.width ?? 1280) <= 600) {
      await assertNoMobileOverflow(receptionist.page);
    }
    const sleepCard = receptionist.page
      .getByRole('article', {
        name: `اتاق خالی ثبت شده؛ کارکنان حضور را مشاهده کرده‌اند اتاق ${room.roomNumber}`,
      })
      .filter({ hasText: housekeeper.username });
    await expect(sleepCard).toBeVisible();
    await expect(sleepCard).toContainText('حضور ثبت‌شده: خالی');
    await expect(sleepCard).toContainText('مشاهدهٔ کارکنان: اشغال');
    await expect(sleepCard).toContainText(formatGregorianAsJalali(businessDate) ?? businessDate);
    await expect(sleepCard).toContainText('نیازمند بررسی');
    await expect(
      receptionist.page.getByRole('button', { name: 'گزارش مغایرت حضور' }),
    ).toHaveCount(0);
    await expect(receptionist.page.getByRole('button', { name: 'ایجاد کار', exact: true })).toHaveCount(0);
    await expect(receptionist.page.getByRole('button', { name: /تخصیص کار|تغییر مسئول/ })).toHaveCount(0);
    await sleepCard.getByRole('button', { name: 'رد با ذکر دلیل' }).click();
    const dismissDialog = receptionist.page.getByRole('dialog', {
      name: `رد مغایرت اتاق ${room.roomNumber}`,
    });
    await dismissDialog.getByLabel('دلیل رد').fill(
      `${runMarker}: بازبینی پذیرش نشان داد اتاق خالی است.`,
    );
    const dismissResponsePromise = receptionist.page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(
        `/staff/housekeeping/discrepancies/${reported.id}/dismiss`,
      ) && response.request().method() === 'POST',
    );
    await dismissDialog.getByRole('button', { name: /ثبت دلیل و رد/ }).click();
    const dismissResponse = await dismissResponsePromise;
    expect(dismissResponse.status()).toBe(200);
    const dismissed: unknown = await dismissResponse.json();
    if (!isRecord(dismissed) || dismissed.status !== 'DISMISSED') {
      throw new Error('Reception did not reason-dismiss the real SLEEP report.');
    }
    const dismissalReason = `${runMarker}: بازبینی پذیرش نشان داد اتاق خالی است.`;
    expectNoGuestOrFolioData(dismissed);
    expect(dismissed).toMatchObject({
      id: reported.id,
      roomId: room.id,
      businessDate,
      kind: 'SLEEP',
      expectedOccupied: false,
      observedOccupied: true,
      status: 'DISMISSED',
      resolutionReason: dismissalReason,
      reportedBy: {
        id: housekeeper.accountId,
        username: housekeeper.username,
      },
      resolvedBy: {
        id: receptionist.accountId,
        username: receptionist.username,
      },
    });

    const dismissedHistory = await getDiscrepancies(
      receptionist.page,
      businessDate,
      room.id,
      'DISMISSED',
    );
    expectNoGuestOrFolioData(dismissedHistory);
    const dismissedRecord = dismissedHistory.items.find((item) => item.id === reported.id);
    expect(dismissedRecord).toMatchObject({
      businessDate,
      kind: 'SLEEP',
      expectedOccupied: false,
      observedOccupied: true,
      status: 'DISMISSED',
      resolutionReason: dismissalReason,
      reportedBy: {
        id: housekeeper.accountId,
        username: housekeeper.username,
      },
      resolvedBy: {
        id: receptionist.accountId,
        username: receptionist.username,
      },
    });
    expect(dismissedRecord?.reportedAt).toBeTruthy();
    expect(dismissedRecord?.resolvedAt).toBeTruthy();
    await expect(sleepCard).toHaveCount(0);
    const historyResponsePromise = receptionist.page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/v1/staff/housekeeping/discrepancies' &&
        url.searchParams.get('status') === 'DISMISSED' &&
        response.request().method() === 'GET'
      );
    });
    await receptionist.page.getByLabel('وضعیت گزارش‌ها').selectOption('DISMISSED');
    const historyResponse = await historyResponsePromise;
    expect(historyResponse.status()).toBe(200);
    await expect(sleepCard).toBeVisible();
    await expect(sleepCard).toContainText('ردشده با توضیح');
    await expect(sleepCard).toContainText('حضور ثبت‌شده: خالی');
    await expect(sleepCard).toContainText('مشاهدهٔ کارکنان: اشغال');
    await expect(sleepCard).toContainText(formatGregorianAsJalali(businessDate) ?? businessDate);
    await expect(sleepCard).toContainText(dismissalReason);
    if ((receptionist.page.viewportSize()?.width ?? 1280) <= 600) {
      await assertNoMobileOverflow(receptionist.page);
    }
    await receptionist.page.screenshot({
      path: testInfo.outputPath('housekeeping-sleep-dismissed-history.png'),
      fullPage: true,
    });

    // UI-only coverage: this historical SKIP row is narrowly mocked. Its real
    // occupancy derivation and authorization are exercised by API/PostgreSQL E2E.
    const previousDate = new Date(`${businessDate}T00:00:00.000Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    const historicalSkip: HousekeepingDiscrepancy = {
      id: mockedSkipId,
      roomId: room.id,
      roomNumber: room.roomNumber,
      floor: room.floor,
      businessDate: previousDate.toISOString().slice(0, 10),
      kind: 'SKIP',
      expectedOccupied: true,
      observedOccupied: false,
      status: 'OPEN',
      note: null,
      reportedBy: { id: housekeeper.accountId, username: housekeeper.username },
      reportedAt: new Date().toISOString(),
      resolvedBy: null,
      resolvedAt: null,
      resolutionReason: null,
    };
    await manager.page.route('**/staff/housekeeping/discrepancies**', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'GET' && url.pathname.endsWith('/staff/housekeeping/discrepancies')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            businessDate,
            items: [historicalSkip],
            pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
          }),
        });
        return;
      }
      if (
        request.method() === 'POST' &&
        url.pathname.endsWith(
          `/staff/housekeeping/discrepancies/${mockedSkipId}/dismiss`,
        )
      ) {
        const postBody = request.postDataJSON() as { reason?: string };
        expect(postBody.reason).toContain(runMarker);
        historicalSkip.status = 'DISMISSED';
        historicalSkip.resolutionReason = postBody.reason ?? '';
        historicalSkip.resolvedBy = {
          id: manager.accountId,
          username: manager.username,
        };
        historicalSkip.resolvedAt = new Date().toISOString();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(historicalSkip),
        });
        return;
      }
      await route.continue();
    });
    await manager.page.goto('/staff/housekeeping');
    if ((manager.page.viewportSize()?.width ?? 1280) <= 600) {
      await assertNoMobileOverflow(manager.page);
    }
    const skipCard = manager.page.getByRole('article', {
      name: `اتاق اشغال ثبت شده؛ کارکنان اتاق را خالی مشاهده کرده‌اند اتاق ${room.roomNumber}`,
    });
    await expect(skipCard).toBeVisible();
    await expect(skipCard).toContainText('حضور ثبت‌شده: اشغال');
    await expect(skipCard).toContainText('مشاهدهٔ کارکنان: خالی');
    await skipCard.getByRole('button', { name: 'رد با ذکر دلیل' }).click();
    const skipDialog = manager.page.getByRole('dialog', {
      name: `رد مغایرت اتاق ${room.roomNumber}`,
    });
    await skipDialog.getByLabel('دلیل رد').fill(
      `${runMarker}: تاریخچهٔ نمونه پس از بررسی رد شد.`,
    );
    await skipDialog.getByRole('button', { name: /ثبت دلیل و رد/ }).click();
    await expect(skipCard).toContainText('ردشده با توضیح');

    const cashierTasks = await cashier.page.request.get(
      `${housekeepingApiBaseUrl}/staff/housekeeping/tasks`,
      { headers: await staffHeadersFromPage(cashier.page) },
    );
    expect(cashierTasks.status()).toBe(403);
    await cashier.page.goto('/staff/housekeeping');
    if ((cashier.page.viewportSize()?.width ?? 1280) <= 600) {
      await assertNoMobileOverflow(cashier.page);
    }
    await expect(cashier.page.getByRole('heading', { name: 'دسترسی به خانه‌داری' })).toBeVisible();
    await expect(cashier.page.getByRole('button', { name: 'ایجاد کار', exact: true })).toHaveCount(0);
    const cashierDiscrepancies = await cashier.page.request.get(
      `${housekeepingApiBaseUrl}/staff/housekeeping/discrepancies`,
      { headers: await staffHeadersFromPage(cashier.page) },
    );
    expect(cashierDiscrepancies.status()).toBe(403);
  });
});
