/**
 * Socratic Session Store
 * Manages state with proper isolation, conflict handling, safe retry, and outline preservation
 */

import { create } from 'zustand';
import type {
  UISocraticMessage,
  UIOutline,
  UIOutlineSection,
  SessionResponse,
  OutlineResponse,
  OutlineContent,
  MessageResponse,
} from './types';
import {
  mapMessageToUI,
  mapMessagesWithContext,
  mapOutlineToUI,
  mapUIToOutlineContent,
  DEFAULT_OUTLINE,
  itemsOfSection,
  withSectionItems,
  CLARIFICATION_REASON_LABEL,
} from './types';
import * as api from './api';
import { ApiErrorCode, SocraticApiError, socraticStudentMessage } from './api';

export { ApiErrorCode, SocraticApiError };

let onUnauthorizedHandler: (() => void) | null = null;

export function setOnUnauthorizedHandler(handler: () => void) {
  onUnauthorizedHandler = handler;
}

// Generation counter for request invalidation across session/account resets
let requestGeneration = 0;

function nextGeneration(): number {
  return ++requestGeneration;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function highlightIdsFromOps(ops: MessageResponse['appliedOps']): string[] {
  if (!ops) return [];
  return ops
    .map((op) => op.targetId)
    .filter((id): id is string => Boolean(id));
}

function mapSection(
  outline: UIOutline,
  sectionId: string,
  mapper: (section: UIOutlineSection) => UIOutlineSection
): UIOutline {
  return {
    ...outline,
    sections: outline.sections.map((section) =>
      section.id === sectionId ? mapper(section) : section
    ),
  };
}

function clarificationLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return CLARIFICATION_REASON_LABEL[reason] || `Thao tác dàn ý chưa được áp dụng (${reason}).`;
}

function applyAssistantOutlineResult(
  set: (partial: object) => void,
  get: () => SocraticState,
  response: MessageResponse
) {
  const serverOutline = response.currentOutline;
  const reasonLabel = clarificationLabel(response.clarificationReason);
  const highlight = highlightIdsFromOps(response.appliedOps);
  const hasDirtyDraft = get().pendingOutlineChanges !== null;

  if (reasonLabel) {
    set({
      error: reasonLabel,
      errorCode: response.clarificationReason || ApiErrorCode.OUTLINE_VERSION_CONFLICT,
      highlightedPointIds: highlight,
      ...(serverOutline
        ? {
            rawServerOutline: serverOutline.content,
            outlineRevisionId: serverOutline.id,
            outlineVersion: serverOutline.revision,
            outlineConflict: hasDirtyDraft,
          }
        : {}),
    });
    return;
  }

  if (serverOutline && hasDirtyDraft) {
    set({
      rawServerOutline: serverOutline.content,
      outlineRevisionId: serverOutline.id,
      outlineVersion: serverOutline.revision,
      outlineConflict: true,
      error: 'AI đã cập nhật dàn ý. Bản nháp đang sửa được giữ lại.',
      errorCode: ApiErrorCode.OUTLINE_VERSION_CONFLICT,
      highlightedPointIds: highlight,
    });
    return;
  }

  if (serverOutline) {
    const mappedUI = mapOutlineToUI(serverOutline.content);
    const shouldReplace =
      response.outlineChanged === true || serverOutline.revision !== get().outlineVersion;
    if (shouldReplace) {
      set({
        outline: mappedUI,
        rawServerOutline: serverOutline.content,
        lastSavedOutline: mappedUI,
        outlineRevisionId: serverOutline.id,
        outlineVersion: serverOutline.revision,
        pendingOutlineChanges: null,
        highlightedPointIds: highlight,
        error: null,
        errorCode: null,
      });
      return;
    }
  }

  set({
    highlightedPointIds: highlight,
    error: null,
    errorCode: null,
  });
}

// Queue state for sequential outline saves
let isSavingQueue = false;
let hasQueuedSave = false;
let saveResolvers: Array<(val: boolean) => void> = [];

export interface PendingChatOperation {
  content: string;
  idempotencyKey: string;
  tempId: string;
  selectedPointId?: string;
  selectedSectionId?: string;
  expectedOutlineVersion: number;
}

export interface SocraticState {
  // Session data
  session: SessionResponse | null;
  sessionId: string | null;
  assignmentCode: string;
  currentGeneration: number;

  // Messages & Pagination
  messages: UISocraticMessage[];
  isLoadingMessages: boolean;
  hasMoreMessages: boolean;
  nextBeforeTurn: number | null;

  // Outline - full content preserved
  outline: UIOutline;
  rawServerOutline: OutlineContent | null;
  lastSavedOutline: UIOutline | null;
  outlineRevisionId: string | null;  // UUID of current revision
  outlineVersion: number;           // revision number for optimistic locking
  isSavingOutline: boolean;
  pendingOutlineChanges: UIOutline | null;
  outlineConflict: boolean;
  isInitializingOutline: boolean;
  outlineInitStatus: string | null;
  outlineInitFailed: boolean;
  selectedPoint: { sectionId: string; index: number; id: string } | null;
  highlightedPointIds: string[];

  // Chat state
  isSending: boolean;
  isAiResponding: boolean;
  pendingOperation: PendingChatOperation | null;

  // Error state
  error: string | null;
  errorCode: string | null;

  // Actions
  initializeSession: (assignmentCode: string, userId: string) => Promise<void>;
  ensureOutlineInit: (retry?: boolean) => Promise<void>;
  loadMessages: (loadMore?: boolean) => Promise<void>;
  syncMessagesAfterTurn: (tempId?: string, assistantMsg?: MessageResponse) => Promise<void>;
  loadOutline: (options?: { force?: boolean }) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  selectPoint: (sectionId: string, index: number) => void;
  clearPointSelection: () => void;
  retryPendingMessage: () => Promise<void>;
  addOutlinePoint: (sectionId: string, point: string) => boolean;
  updateOutlinePoint: (sectionId: string, index: number, point: string) => void;
  removeOutlinePoint: (sectionId: string, index: number) => void;
  reorderOutlinePoints: (sectionId: string, fromIndex: number, toIndex: number) => void;
  saveOutline: () => Promise<boolean>;
  resolveOutlineConflict: (strategy: 'keep_draft' | 'load_server') => Promise<void>;
  reviewOutline: () => Promise<OutlineResponse | null>;
  refreshSession: () => Promise<void>;
  reset: () => void;
  clearError: () => void;
}

export const useSocraticStore = create<SocraticState>((set, get) => ({
  // Initial state
  session: null,
  sessionId: null,
  assignmentCode: '',
  currentGeneration: 0,
  messages: [],
  isLoadingMessages: false,
  hasMoreMessages: false,
  nextBeforeTurn: null,
  outline: DEFAULT_OUTLINE,
  rawServerOutline: null,
  lastSavedOutline: null,
  outlineRevisionId: null,
  outlineVersion: 0,
  isSavingOutline: false,
  pendingOutlineChanges: null,
  outlineConflict: false,
  isInitializingOutline: false,
  outlineInitStatus: null,
  outlineInitFailed: false,
  selectedPoint: null,
  highlightedPointIds: [],
  isSending: false,
  isAiResponding: false,
  pendingOperation: null,
  error: null,
  errorCode: null,

  initializeSession: async (assignmentCode: string, _userId: string) => {
    const gen = nextGeneration();
    set({
      isLoadingMessages: true,
      error: null,
      errorCode: null,
      assignmentCode,
      currentGeneration: gen,
      pendingOperation: null,
      outlineConflict: false,
    });

    try {
      // Step 1: Find existing session by assignment code
      const findResult = await api.findSessionByAssignment(assignmentCode);

      if (gen !== get().currentGeneration) return;

      let session: SessionResponse;

      if (findResult.exists && findResult.session) {
        session = findResult.session;
      } else {
        // Step 2: Create new session
        const created = await api.createSession(assignmentCode, true);
        if (gen !== get().currentGeneration) return;
        session = await api.getSession(created.id);
      }

      if (gen !== get().currentGeneration) return;

      set({
        session,
        sessionId: session.id,
        isLoadingMessages: false,
        outlineInitStatus: session.outlineInitStatus || null,
      });

      if (session.currentOutline) {
        const mappedUI = mapOutlineToUI(session.currentOutline.content);
        set({
          outline: mappedUI,
          rawServerOutline: session.currentOutline.content,
          lastSavedOutline: mappedUI,
          outlineRevisionId: session.currentOutline.id,
          outlineVersion: session.currentOutline.revision,
          pendingOutlineChanges: null,
          outlineConflict: false,
        });
      }

      await get().loadMessages(false);
      if (!session.currentOutline && (session.outlineVersion || 0) === 0) {
        await get().ensureOutlineInit(false);
      } else if (!session.currentOutline) {
        await get().loadOutline();
      }
    } catch (error) {
      if (gen !== get().currentGeneration) return;

      const apiError = error instanceof SocraticApiError ? error : new SocraticApiError(0, 'UNKNOWN', String(error));

      set({
        isLoadingMessages: false,
        error: apiError.message,
        errorCode: apiError.code,
      });

      if (apiError.status === 401 || apiError.code === ApiErrorCode.AUTH_INVALID || apiError.code === ApiErrorCode.SESSION_EXPIRED) {
        onUnauthorizedHandler?.();
        throw error;
      }
    }
  },

  ensureOutlineInit: async (retry = false) => {
    const { sessionId, currentGeneration } = get();
    if (!sessionId) return;
    const gen = currentGeneration;
    const startedSessionId = sessionId;
    const isCurrent = () =>
      gen === get().currentGeneration && get().sessionId === startedSessionId;

    set({
      isInitializingOutline: true,
      outlineInitFailed: false,
      error: null,
      errorCode: null,
    });

    const adoptInitOutline = (outline: OutlineResponse, status: string, extras?: {
      outlineVersion?: number;
      sessionState?: string;
      readiness?: SessionResponse['readiness'] | null;
      session?: SessionResponse;
    }) => {
      if (!isCurrent()) return;
      const mappedUI = mapOutlineToUI(outline.content);
      const hasDirtyDraft = get().pendingOutlineChanges !== null;
      set((state) => ({
        isInitializingOutline: false,
        outlineInitFailed: false,
        outlineInitStatus: status,
        rawServerOutline: outline.content,
        outlineRevisionId: outline.id,
        outlineVersion: extras?.outlineVersion ?? outline.revision,
        ...(hasDirtyDraft
          ? {
              outlineConflict: true,
              error: 'Dàn ý gợi ý đã sẵn sàng. Bản nháp đang sửa được giữ lại.',
              errorCode: ApiErrorCode.OUTLINE_VERSION_CONFLICT,
            }
          : {
              outline: mappedUI,
              lastSavedOutline: mappedUI,
              pendingOutlineChanges: null,
              outlineConflict: false,
            }),
        session: extras?.session
          ? extras.session
          : state.session
            ? {
                ...state.session,
                outlineVersion: extras?.outlineVersion ?? outline.revision,
                state: (extras?.sessionState as SessionResponse['state']) || state.session.state,
                readiness: extras?.readiness || state.session.readiness,
                outlineInitStatus: status,
                currentOutline: outline,
              }
            : state.session,
      }));
    };

    try {
      const statusOf = (status?: string | null) => (status || '').toUpperCase();
      const isPreparing = (status?: string | null) => {
        const value = statusOf(status);
        return value === 'PROCESSING' || value === 'QUEUED';
      };

      let result = await api.initOutline(startedSessionId, retry);
      if (!isCurrent()) return;
      let delay = 1000;
      let fromGet = false;
      while (!result.outline && isCurrent()) {
        const status = statusOf(result.status);
        const shouldApply =
          status === 'READY' || (status === 'NEEDS_CLARIFICATION' && fromGet);
        if (shouldApply) {
          fromGet = false;
          try {
            result = await api.initOutline(startedSessionId, false);
          } catch (err) {
            if (!isCurrent()) return;
            const apiError = err instanceof SocraticApiError ? err : null;
            if (
              apiError?.code === ApiErrorCode.OUTLINE_INIT_IN_PROGRESS ||
              apiError?.code === ApiErrorCode.NETWORK
            ) {
              await sleep(delay);
              delay = Math.min(delay + 500, 4000);
              continue;
            }
            throw err;
          }
          if (!isCurrent()) return;
          if (result.outline) break;
          if (statusOf(result.status) === 'NEEDS_CLARIFICATION') break;
          await sleep(delay);
          delay = Math.min(delay + 250, 4000);
          continue;
        }
        if (!isPreparing(status)) break;
        await sleep(delay);
        if (!isCurrent()) return;
        try {
          result = await api.getOutlineInit(startedSessionId);
        } catch (err) {
          if (!isCurrent()) return;
          const apiError = err instanceof SocraticApiError ? err : null;
          if (
            apiError?.code === ApiErrorCode.OUTLINE_INIT_IN_PROGRESS ||
            apiError?.code === ApiErrorCode.NETWORK
          ) {
            delay = Math.min(delay + 500, 4000);
            continue;
          }
          throw err;
        }
        if (!isCurrent()) return;
        fromGet = true;
        delay = Math.min(delay + 250, 4000);
      }

      if (!isCurrent()) return;

      if (result.outline) {
        adoptInitOutline(result.outline, result.status, {
          outlineVersion: result.outlineVersion,
          sessionState: result.sessionState,
          readiness: result.readiness,
        });
        if (!isCurrent()) return;
        await get().loadMessages(false);
        return;
      }

      if (!isCurrent()) return;
      const failed = result.status === 'FAILED';
      const needsClarification = result.status === 'NEEDS_CLARIFICATION';
      set((state) => ({
        isInitializingOutline: false,
        outlineInitFailed: failed,
        outlineInitStatus: result.status,
        error: failed
          ? socraticStudentMessage(ApiErrorCode.AI_INVALID_OUTPUT, result.message || undefined)
          : needsClarification
            ? result.message ||
              'Đề, ngữ liệu hoặc yêu cầu viết chưa đủ để soạn dàn ý trung thực.'
            : state.error,
        errorCode: failed ? ApiErrorCode.AI_INVALID_OUTPUT : state.errorCode,
        session: state.session
          ? {
              ...state.session,
              outlineInitStatus: result.status,
              outlineVersion: result.outlineVersion,
              state: result.sessionState as SessionResponse['state'],
            }
          : state.session,
      }));
      if (result.message) {
        if (!isCurrent()) return;
        await get().loadMessages(false);
      }
    } catch (error) {
      if (!isCurrent()) return;
      const apiError = error instanceof SocraticApiError ? error : new SocraticApiError(0, 'UNKNOWN', String(error));
      if (apiError.code === ApiErrorCode.OUTLINE_INIT_IN_PROGRESS) {
        set({
          isInitializingOutline: true,
          outlineInitFailed: false,
          outlineInitStatus: 'PROCESSING',
          error: null,
          errorCode: null,
        });
        if (!isCurrent()) return;
        await sleep(1500);
        if (!isCurrent()) return;
        await get().ensureOutlineInit(false);
        return;
      }
      if (!isCurrent()) return;
      set({
        isInitializingOutline: false,
        outlineInitFailed: true,
        outlineInitStatus: 'FAILED',
        error: socraticStudentMessage(apiError.code, apiError.message),
        errorCode: apiError.code,
      });
      if (apiError.status === 401 || apiError.code === ApiErrorCode.AUTH_INVALID || apiError.code === ApiErrorCode.SESSION_EXPIRED) {
        onUnauthorizedHandler?.();
      }
    }
  },

  selectPoint: (sectionId: string, index: number) => {
    const section = get().outline.sections.find((s) => s.id === sectionId);
    if (!section) return;
    const item = itemsOfSection(section)[index];
    if (!item?.id) return;
    set({
      selectedPoint: {
        sectionId,
        index,
        id: item.id,
      },
    });
  },

  clearPointSelection: () => {
    set({ selectedPoint: null });
  },

  loadMessages: async (loadMore = false) => {
    const { sessionId, currentGeneration, nextBeforeTurn, messages } = get();
    if (!sessionId) return;

    const gen = currentGeneration;
    set({ isLoadingMessages: true });

    try {
      const response = await api.getMessages(
        sessionId,
        50,
        loadMore ? nextBeforeTurn : null
      );

      if (gen !== get().currentGeneration) return;

      const fetchedMessages = mapMessagesWithContext(response.messages);

      if (loadMore) {
        // Prepend older messages; deduplicate by ID
        const existingIds = new Set(messages.map((m) => m.id));
        const deduplicatedOlder = fetchedMessages.filter((m) => !existingIds.has(m.id));

        set({
          messages: [...deduplicatedOlder, ...messages],
          isLoadingMessages: false,
          hasMoreMessages: response.hasMore,
          nextBeforeTurn: response.nextBeforeTurn,
        });
      } else {
        // Fresh load or initial fetch
        set({
          messages: fetchedMessages,
          isLoadingMessages: false,
          hasMoreMessages: response.hasMore,
          nextBeforeTurn: response.nextBeforeTurn,
        });
      }
    } catch (error) {
      if (gen !== get().currentGeneration) return;

      const apiError = error instanceof SocraticApiError ? error : new SocraticApiError(0, 'UNKNOWN', String(error));
      set({
        isLoadingMessages: false,
        error: apiError.message,
        errorCode: apiError.code,
      });

      if (apiError.status === 401 || apiError.code === ApiErrorCode.AUTH_INVALID || apiError.code === ApiErrorCode.SESSION_EXPIRED) {
        onUnauthorizedHandler?.();
      }
    }
  },

  syncMessagesAfterTurn: async (tempId?: string, assistantMsg?: MessageResponse) => {
    const { sessionId, currentGeneration } = get();
    if (!sessionId) return;
    const gen = currentGeneration;

    try {
      const response = await api.getMessages(sessionId, 50, null);
      if (gen !== get().currentGeneration) return;

      let syncedMessages = mapMessagesWithContext(response.messages);

      // If backend messages don't include the assistant response yet (edge case), append it
      if (assistantMsg && !syncedMessages.some((m) => m.id === assistantMsg.id)) {
        const lastStudent = [...syncedMessages].reverse().find((m) => m.sender === 'user');
        syncedMessages = [...syncedMessages, mapMessageToUI(assistantMsg, lastStudent?.text)];
      }

      set((state) => {
        // Remove optimistic temporary message
        const cleanedExisting = tempId
          ? state.messages.filter((m) => m.id !== tempId)
          : state.messages;

        const syncedIds = new Set(syncedMessages.map((m) => m.id));
        // Keep any older paginated messages that are not in the current 50-item page
        const olderUnsynced = cleanedExisting.filter((m) => !syncedIds.has(m.id) && !m.id.startsWith('temp_'));

        return {
          messages: [...olderUnsynced, ...syncedMessages],
          hasMoreMessages: response.hasMore,
          nextBeforeTurn: response.nextBeforeTurn,
          isAiResponding: false,
        };
      });
    } catch (error) {
      if (gen !== get().currentGeneration) return;
      const apiError = error instanceof SocraticApiError ? error : new SocraticApiError(0, 'UNKNOWN', String(error));
      set({
        error: apiError.message,
        errorCode: apiError.code,
      });
    }
  },

  loadOutline: async (options) => {
    const { sessionId, currentGeneration } = get();
    if (!sessionId) return;
    const gen = currentGeneration;
    const startedSessionId = sessionId;
    const force = options?.force === true;

    try {
      const outlineResponse = await api.getOutline(startedSessionId);
      if (gen !== get().currentGeneration || get().sessionId !== startedSessionId) return;

      const mappedUI = mapOutlineToUI(outlineResponse.content);
      const hasDirtyDraft = get().pendingOutlineChanges !== null;
      if (hasDirtyDraft && !force) {
        set({
          rawServerOutline: outlineResponse.content,
          outlineRevisionId: outlineResponse.id,
          outlineVersion: outlineResponse.revision,
          outlineConflict: true,
          error: 'Dàn ý trên máy chủ đã thay đổi. Bản nháp đang sửa được giữ lại.',
          errorCode: ApiErrorCode.OUTLINE_VERSION_CONFLICT,
        });
        return;
      }
      set({
        outline: mappedUI,
        rawServerOutline: outlineResponse.content,
        lastSavedOutline: mappedUI,
        outlineRevisionId: outlineResponse.id,
        outlineVersion: outlineResponse.revision,
        pendingOutlineChanges: null,
        outlineConflict: false,
        error: null,
        errorCode: null,
      });
    } catch (error) {
      if (gen !== get().currentGeneration) return;

      const apiError = error instanceof SocraticApiError ? error : new SocraticApiError(0, 'UNKNOWN', String(error));
      // 404 indicates session has outline_version == 0 (no outline created yet) - that's valid
      if (apiError.status === 404 || apiError.code === ApiErrorCode.NOT_FOUND) {
        return;
      }

      // Do NOT swallow other errors (network, 500, 401, 403)
      set({
        error: apiError.message,
        errorCode: apiError.code,
      });

      if (apiError.status === 401 || apiError.code === ApiErrorCode.AUTH_INVALID || apiError.code === ApiErrorCode.SESSION_EXPIRED) {
        onUnauthorizedHandler?.();
      }
    }
  },

  sendMessage: async (content: string) => {
    const { sessionId, currentGeneration, isSending, isAiResponding } = get();
    if (!sessionId || isSending || isAiResponding) return;

    const trimmed = content.trim();
    if (!trimmed) return;

    const gen = currentGeneration;
    const idempotencyKey = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const tempId = `temp_${Date.now()}`;
    const selected = get().selectedPoint;
    const operation: PendingChatOperation = {
      content: trimmed,
      idempotencyKey,
      tempId,
      selectedPointId: selected?.id,
      selectedSectionId: selected?.sectionId,
      expectedOutlineVersion: get().outlineVersion,
    };

    // Optimistic user message bubble
    const userMessage: UISocraticMessage = {
      id: tempId,
      sender: 'user',
      role: 'STUDENT',
      text: trimmed,
      timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      status: 'PENDING',
      idempotencyKey,
    };

    set((state) => ({
      messages: [...state.messages, userMessage],
      isSending: true,
      isAiResponding: true,
      pendingOperation: operation,
      error: null,
      errorCode: null,
    }));

    try {
      const response = await api.sendMessage(sessionId, trimmed, idempotencyKey, {
        selectedPointId: operation.selectedPointId,
        selectedSectionId: operation.selectedSectionId,
        expectedOutlineVersion: operation.expectedOutlineVersion,
      });
      if (gen !== get().currentGeneration) return;

      // Sync history: backend returns ASSISTANT message, history gives both with real IDs
      await get().syncMessagesAfterTurn(tempId, response);
      if (gen !== get().currentGeneration) return;

      applyAssistantOutlineResult(set, get, response);

      set({
        isSending: false,
        isAiResponding: false,
        pendingOperation: null,
      });
    } catch (error) {
      if (gen !== get().currentGeneration) return;

      const apiError = error instanceof SocraticApiError ? error : new SocraticApiError(0, 'UNKNOWN', String(error));

      // Mark the optimistic message as failed, preserving user content
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === tempId ? { ...m, isFailed: true, status: 'REJECTED' } : m
        ),
        isSending: false,
        isAiResponding: false,
        error: apiError.message,
        errorCode: apiError.code,
      }));

      if (apiError.status === 401 || apiError.code === ApiErrorCode.AUTH_INVALID || apiError.code === ApiErrorCode.SESSION_EXPIRED) {
        onUnauthorizedHandler?.();
      }
    }
  },

  retryPendingMessage: async () => {
    const { sessionId, currentGeneration, pendingOperation, isSending, isAiResponding } = get();
    if (!sessionId || !pendingOperation || isSending || isAiResponding) return;

    const gen = currentGeneration;
    const snapshot = { ...pendingOperation };
    set({ isSending: true, isAiResponding: true, error: null, errorCode: null });

    try {
      // 1. Reconcile: Check if message was already processed during previous timeout/disconnect
      const history = await api.getMessages(sessionId, 50, null);
      if (gen !== get().currentGeneration) return;

      const alreadyProcessed = history.messages.some(
        (m) => m.role === 'STUDENT' && m.content === snapshot.content
      );

      // 2. Replay with the original snapshot (same key, selection, version)
      const response = await api.sendMessage(
        sessionId,
        snapshot.content,
        snapshot.idempotencyKey,
        {
          selectedPointId: snapshot.selectedPointId,
          selectedSectionId: snapshot.selectedSectionId,
          expectedOutlineVersion: snapshot.expectedOutlineVersion,
        }
      );
      if (gen !== get().currentGeneration) return;

      await get().syncMessagesAfterTurn(snapshot.tempId, response);
      if (gen !== get().currentGeneration) return;

      applyAssistantOutlineResult(set, get, response);
      if (alreadyProcessed && !response.currentOutline && !get().pendingOutlineChanges) {
        await get().loadOutline();
      }

      set({
        isSending: false,
        isAiResponding: false,
        pendingOperation: null,
      });
    } catch (error) {
      if (gen !== get().currentGeneration) return;

      const apiError = error instanceof SocraticApiError ? error : new SocraticApiError(0, 'UNKNOWN', String(error));
      set({
        isSending: false,
        isAiResponding: false,
        error: apiError.message,
        errorCode: apiError.code,
      });

      if (apiError.status === 401 || apiError.code === ApiErrorCode.AUTH_INVALID || apiError.code === ApiErrorCode.SESSION_EXPIRED) {
        onUnauthorizedHandler?.();
      }
    }
  },

  addOutlinePoint: (sectionId: string, point: string) => {
    const trimmed = point.trim();
    if (!trimmed) return false;
    const section = get().outline.sections.find((s) => s.id === sectionId);
    if (!section) return false;
    const existing = itemsOfSection(section);
    if (existing.some((item) => item.text === trimmed)) return false;

    set((state) => {
      const newOutline = mapSection(state.outline, sectionId, (sec) =>
        withSectionItems(sec, [
          ...itemsOfSection(sec),
          {
            id: `${sectionId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            text: trimmed,
            kind: 'claim',
          },
        ])
      );
      return {
        outline: newOutline,
        pendingOutlineChanges: newOutline,
      };
    });

    return true;
  },

  updateOutlinePoint: (sectionId: string, index: number, point: string) => {
    const trimmed = point.trim();
    if (!trimmed) return;

    set((state) => {
      const newOutline = mapSection(state.outline, sectionId, (sec) => {
        const items = itemsOfSection(sec);
        if (!items[index]) return sec;
        const next = items.map((item, i) => (i === index ? { ...item, text: trimmed } : item));
        return withSectionItems(sec, next);
      });
      return {
        outline: newOutline,
        pendingOutlineChanges: newOutline,
      };
    });
  },

  removeOutlinePoint: (sectionId: string, index: number) => {
    set((state) => {
      const section = state.outline.sections.find((s) => s.id === sectionId);
      const items = section ? itemsOfSection(section) : [];
      const removed = items[index];
      const nextItems = items.filter((_, i) => i !== index);
      const newOutline = mapSection(state.outline, sectionId, (sec) =>
        withSectionItems(sec, nextItems)
      );
      let selectedPoint = state.selectedPoint;
      if (selectedPoint && removed && selectedPoint.id === removed.id) {
        selectedPoint = null;
      } else if (selectedPoint && selectedPoint.sectionId === sectionId) {
        const newIndex = nextItems.findIndex((item) => item.id === selectedPoint?.id);
        selectedPoint = newIndex >= 0
          ? { ...selectedPoint, index: newIndex }
          : selectedPoint;
      }
      return {
        outline: newOutline,
        pendingOutlineChanges: newOutline,
        selectedPoint,
      };
    });
  },

  reorderOutlinePoints: (sectionId: string, fromIndex: number, toIndex: number) => {
    set((state) => {
      const newOutline = mapSection(state.outline, sectionId, (sec) => {
        const items = [...itemsOfSection(sec)];
        if (fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
          return sec;
        }
        const [moved] = items.splice(fromIndex, 1);
        items.splice(toIndex, 0, moved);
        return withSectionItems(sec, items);
      });
      let selectedPoint = state.selectedPoint;
      if (selectedPoint && selectedPoint.sectionId === sectionId) {
        const items = itemsOfSection(
          newOutline.sections.find((s) => s.id === sectionId) || { id: sectionId, title: '', points: [] }
        );
        const newIndex = items.findIndex((item) => item.id === selectedPoint?.id);
        if (newIndex >= 0) {
          selectedPoint = { ...selectedPoint, index: newIndex };
        }
      }
      return {
        outline: newOutline,
        pendingOutlineChanges: newOutline,
        selectedPoint,
      };
    });
  },

  saveOutline: async (): Promise<boolean> => {
    const currentGen = get().currentGeneration;
    const { sessionId } = get();
    if (!sessionId) return false;

    // If already saving, queue the next save and wait for it
    if (isSavingQueue) {
      hasQueuedSave = true;
      return new Promise<boolean>((resolve) => {
        saveResolvers.push(resolve);
      });
    }

    isSavingQueue = true;
    set({ isSavingOutline: true });

    let overallSuccess = true;

    try {
      while (true) {
        if (currentGen !== get().currentGeneration) {
          overallSuccess = false;
          break;
        }

        const currentState = get();
        if (!currentState.sessionId) {
          overallSuccess = false;
          break;
        }

        // Snapshot current draft and version
        const snapshot = currentState.outline;
        const expectedVersion = currentState.outlineVersion;
        const content = mapUIToOutlineContent(snapshot, currentState.rawServerOutline);

        hasQueuedSave = false;
        const currentResolvers = [...saveResolvers];
        saveResolvers = [];

        try {
          const response = await api.updateOutline(currentState.sessionId, content, expectedVersion);
          if (currentGen !== get().currentGeneration) {
            overallSuccess = false;
            break;
          }

          // Mark snapshot as saved, preserving newer changes if made during save
          set((state) => {
            const isUnchanged = JSON.stringify(state.outline) === JSON.stringify(snapshot);
            return {
              outlineRevisionId: response.id,
              outlineVersion: response.revision,
              rawServerOutline: response.content || content,
              lastSavedOutline: snapshot,
              pendingOutlineChanges: isUnchanged ? null : state.outline,
              outlineConflict: false,
              error: null,
              errorCode: null,
              ...(response.readiness
                ? {
                    session: state.session
                      ? { ...state.session, readiness: response.readiness }
                      : null,
                  }
                : {}),
            };
          });

          currentResolvers.forEach((r) => r(true));

          // If draft was modified while in-flight or another save was queued, save again with updated version
          const isDirtyNow = JSON.stringify(get().outline) !== JSON.stringify(snapshot);
          if (hasQueuedSave || isDirtyNow) {
            continue;
          } else {
            break;
          }
        } catch (error) {
          if (currentGen !== get().currentGeneration) {
            overallSuccess = false;
            break;
          }

          const apiError = error instanceof SocraticApiError ? error : new SocraticApiError(0, 'UNKNOWN', String(error));
          const isConflict = apiError.code === ApiErrorCode.OUTLINE_VERSION_CONFLICT;

          set({
            error: isConflict
              ? 'Phiên bản dàn ý đã bị thay đổi trên máy chủ (xung đột phiên bản).'
              : apiError.message,
            errorCode: apiError.code,
            outlineConflict: isConflict,
          });

          currentResolvers.forEach((r) => r(false));
          overallSuccess = false;
          break;
        }
      }
    } finally {
      isSavingQueue = false;
      set({ isSavingOutline: false });
      const remaining = [...saveResolvers];
      saveResolvers = [];
      remaining.forEach((r) => r(overallSuccess));
    }

    return overallSuccess;
  },

  resolveOutlineConflict: async (strategy: 'keep_draft' | 'load_server') => {
    const { sessionId, currentGeneration } = get();
    if (!sessionId) return;
    const gen = currentGeneration;

    if (strategy === 'keep_draft') {
      try {
        const latest = await api.getOutline(sessionId);
        if (gen !== get().currentGeneration) return;
        set({
          outlineVersion: latest.revision,
          outlineRevisionId: latest.id,
          rawServerOutline: latest.content,
          outlineConflict: false,
          error: null,
          errorCode: null,
        });
        await get().saveOutline();
      } catch {
        set({ outlineConflict: false });
        await get().saveOutline();
      }
    } else {
      await get().loadOutline();
      set({ outlineConflict: false });
    }
  },

  reviewOutline: async () => {
    const { sessionId, currentGeneration } = get();
    if (!sessionId) return null;
    const gen = currentGeneration;

    // Step 1: Wait to save all draft changes or create initial revision if none exists
    const needsSave =
      get().pendingOutlineChanges !== null ||
      !get().outlineRevisionId ||
      get().outlineVersion === 0;

    if (needsSave) {
      const saveSucceeded = await get().saveOutline();
      if (!saveSucceeded) {
        // If save failed or conflict occurred, stop review immediately
        return null;
      }
    }

    if (gen !== get().currentGeneration) return null;

    // Step 2: Retrieve latest revision UUID AFTER saving
    const currentRevisionId = get().outlineRevisionId;
    if (!currentRevisionId) {
      set({
        error: 'Chưa có phiên bản dàn ý hợp lệ để rà soát.',
        errorCode: 'NOT_FOUND',
      });
      return null;
    }

    // Step 3: Call review API
    try {
      const response = await api.reviewOutline(sessionId, currentRevisionId);
      if (gen !== get().currentGeneration) return null;

      // Step 4: Refresh session & readiness from backend
      const updatedSession = await api.getSession(sessionId);
      if (gen !== get().currentGeneration) return null;

      set({
        session: updatedSession,
        outlineRevisionId: response.id,
        outlineVersion: response.revision,
        error: null,
        errorCode: null,
      });

      return response;
    } catch (error) {
      if (gen !== get().currentGeneration) return null;

      const apiError = error instanceof SocraticApiError ? error : new SocraticApiError(0, 'UNKNOWN', String(error));
      set({
        error: apiError.message,
        errorCode: apiError.code,
      });

      return null;
    }
  },

  refreshSession: async () => {
    const { sessionId, currentGeneration } = get();
    if (!sessionId) return;
    const gen = currentGeneration;

    try {
      const session = await api.getSession(sessionId);
      if (gen !== get().currentGeneration) return;

      set({ session });
      await Promise.all([
        get().loadMessages(false),
        get().loadOutline(),
      ]);
    } catch (error) {
      if (gen !== get().currentGeneration) return;

      const apiError = error instanceof SocraticApiError ? error : new SocraticApiError(0, 'UNKNOWN', String(error));
      set({
        error: apiError.message,
        errorCode: apiError.code,
      });
    }
  },

  reset: () => {
    requestGeneration++;
    isSavingQueue = false;
    hasQueuedSave = false;
    saveResolvers = [];

    set({
      session: null,
      sessionId: null,
      assignmentCode: '',
      currentGeneration: requestGeneration,
      messages: [],
      isLoadingMessages: false,
      hasMoreMessages: false,
      nextBeforeTurn: null,
      outline: DEFAULT_OUTLINE,
      rawServerOutline: null,
      lastSavedOutline: null,
      outlineRevisionId: null,
      outlineVersion: 0,
      isSavingOutline: false,
      pendingOutlineChanges: null,
      outlineConflict: false,
      isInitializingOutline: false,
      outlineInitStatus: null,
      outlineInitFailed: false,
      selectedPoint: null,
      highlightedPointIds: [],
      isSending: false,
      isAiResponding: false,
      pendingOperation: null,
      error: null,
      errorCode: null,
    });
  },

  clearError: () => {
    set({ error: null, errorCode: null });
  },
}));
