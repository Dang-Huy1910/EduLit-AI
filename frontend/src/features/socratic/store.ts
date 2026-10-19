/**
 * Socratic Session Store
 * Manages state with proper isolation, conflict handling, safe retry, and outline preservation
 */

import { create } from 'zustand';
import type {
  UISocraticMessage,
  UIOutline,
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
} from './types';
import * as api from './api';
import { ApiErrorCode, SocraticApiError } from './api';

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

// Queue state for sequential outline saves
let isSavingQueue = false;
let hasQueuedSave = false;
let saveResolvers: Array<(val: boolean) => void> = [];

export interface PendingChatOperation {
  content: string;
  idempotencyKey: string;
  tempId: string;
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
  selectedPoint: { sectionId: string; index: number; id?: string } | null;
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
    set({
      isInitializingOutline: true,
      outlineInitFailed: false,
      error: null,
      errorCode: null,
    });

    try {
      let result = await api.initOutline(sessionId, retry);
      let attempts = 0;
      while (
        (result.status === 'PROCESSING' || !result.status) &&
        attempts < 20 &&
        gen === get().currentGeneration
      ) {
        await sleep(750);
        try {
          result = await api.initOutline(sessionId, false);
        } catch (err) {
          const apiError = err instanceof SocraticApiError ? err : null;
          if (apiError?.code === ApiErrorCode.OUTLINE_INIT_IN_PROGRESS) {
            attempts += 1;
            continue;
          }
          throw err;
        }
        attempts += 1;
      }

      if (gen !== get().currentGeneration) return;

      if (result.outline) {
        const mappedUI = mapOutlineToUI(result.outline.content);
        set((state) => ({
          isInitializingOutline: false,
          outlineInitFailed: false,
          outlineInitStatus: result.status,
          outline: mappedUI,
          rawServerOutline: result.outline!.content,
          lastSavedOutline: mappedUI,
          outlineRevisionId: result.outline!.id,
          outlineVersion: result.outline!.revision,
          pendingOutlineChanges: null,
          outlineConflict: false,
          session: state.session
            ? {
                ...state.session,
                outlineVersion: result.outlineVersion,
                state: result.sessionState as SessionResponse['state'],
                readiness: result.readiness || state.session.readiness,
                outlineInitStatus: result.status,
                currentOutline: result.outline!,
              }
            : state.session,
        }));
        await get().loadMessages(false);
        return;
      }

      set((state) => ({
        isInitializingOutline: false,
        outlineInitFailed: result.status === 'FAILED',
        outlineInitStatus: result.status,
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
        await get().loadMessages(false);
      }
    } catch (error) {
      if (gen !== get().currentGeneration) return;
      const apiError = error instanceof SocraticApiError ? error : new SocraticApiError(0, 'UNKNOWN', String(error));
      if (apiError.code === ApiErrorCode.OUTLINE_INIT_IN_PROGRESS) {
        for (let i = 0; i < 15 && gen === get().currentGeneration; i += 1) {
          await sleep(750);
          try {
            const session = await api.getSession(sessionId);
            if (session.currentOutline) {
              const mappedUI = mapOutlineToUI(session.currentOutline.content);
              set({
                session,
                isInitializingOutline: false,
                outlineInitFailed: false,
                outlineInitStatus: session.outlineInitStatus || 'COMPLETED',
                outline: mappedUI,
                rawServerOutline: session.currentOutline.content,
                lastSavedOutline: mappedUI,
                outlineRevisionId: session.currentOutline.id,
                outlineVersion: session.currentOutline.revision,
              });
              await get().loadMessages(false);
              return;
            }
          } catch {
            // keep polling
          }
        }
      }
      set({
        isInitializingOutline: false,
        outlineInitFailed: true,
        outlineInitStatus: 'FAILED',
        error: apiError.message,
        errorCode: apiError.code,
      });
      if (apiError.status === 401 || apiError.code === ApiErrorCode.AUTH_INVALID || apiError.code === ApiErrorCode.SESSION_EXPIRED) {
        onUnauthorizedHandler?.();
      }
    }
  },

  selectPoint: (sectionId: string, index: number) => {
    const section = get().outline.sections.find((s) => s.id === sectionId);
    const item = section?.pointItems?.[index];
    set({
      selectedPoint: {
        sectionId,
        index,
        id: item?.id,
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
    const { sessionId, currentGeneration, pendingOutlineChanges } = get();
    if (!sessionId) return;
    const gen = currentGeneration;
    const force = options?.force === true;

    try {
      const outlineResponse = await api.getOutline(sessionId);
      if (gen !== get().currentGeneration) return;

      const mappedUI = mapOutlineToUI(outlineResponse.content);
      if (pendingOutlineChanges && !force) {
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

    const operation: PendingChatOperation = {
      content: trimmed,
      idempotencyKey,
      tempId,
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
      const selected = get().selectedPoint;
      const response = await api.sendMessage(sessionId, trimmed, idempotencyKey, {
        selectedPointId: selected?.id,
        selectedSectionId: selected?.sectionId,
        expectedOutlineVersion: get().outlineVersion,
      });
      if (gen !== get().currentGeneration) return;

      // Sync history: backend returns ASSISTANT message, history gives both with real IDs
      await get().syncMessagesAfterTurn(tempId, response);
      if (gen !== get().currentGeneration) return;

      const serverOutline = response.currentOutline;
      const hasDirtyDraft = get().pendingOutlineChanges !== null;
      if (response.outlineChanged && serverOutline && hasDirtyDraft) {
        set({
          isSending: false,
          isAiResponding: false,
          pendingOperation: null,
          rawServerOutline: serverOutline.content,
          outlineConflict: true,
          error: 'AI đã cập nhật dàn ý. Bản nháp đang sửa được giữ lại.',
          errorCode: ApiErrorCode.OUTLINE_VERSION_CONFLICT,
          highlightedPointIds: highlightIdsFromOps(response.appliedOps),
        });
        return;
      }
      if (response.outlineChanged && serverOutline && !hasDirtyDraft) {
        const mappedUI = mapOutlineToUI(serverOutline.content);
        set({
          outline: mappedUI,
          rawServerOutline: serverOutline.content,
          lastSavedOutline: mappedUI,
          outlineRevisionId: serverOutline.id,
          outlineVersion: serverOutline.revision,
          pendingOutlineChanges: null,
          highlightedPointIds: highlightIdsFromOps(response.appliedOps),
        });
      }

      set({
        isSending: false,
        isAiResponding: false,
        pendingOperation: null,
        error: null,
        errorCode: null,
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
    set({ isSending: true, isAiResponding: true, error: null, errorCode: null });

    try {
      // 1. Reconcile: Check if message was already processed during previous timeout/disconnect
      const history = await api.getMessages(sessionId, 50, null);
      if (gen !== get().currentGeneration) return;

      const alreadyProcessed = history.messages.some(
        (m) => m.role === 'STUDENT' && m.content === pendingOperation.content
      );

      if (alreadyProcessed) {
        await get().syncMessagesAfterTurn(pendingOperation.tempId);
        set({
          isSending: false,
          isAiResponding: false,
          pendingOperation: null,
        });
        return;
      }

      // 2. Replay with identical payload and Idempotency-Key
      const selected = get().selectedPoint;
      const response = await api.sendMessage(
        sessionId,
        pendingOperation.content,
        pendingOperation.idempotencyKey,
        {
          selectedPointId: selected?.id,
          selectedSectionId: selected?.sectionId,
          expectedOutlineVersion: get().outlineVersion,
        }
      );
      if (gen !== get().currentGeneration) return;

      await get().syncMessagesAfterTurn(pendingOperation.tempId, response);

      set({
        isSending: false,
        isAiResponding: false,
        pendingOperation: null,
        error: null,
        errorCode: null,
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

    set((state) => {
      const newOutline: UIOutline = {
        ...state.outline,
        sections: state.outline.sections.map((section) => {
          if (section.id === sectionId) {
            if (section.points.includes(trimmed)) {
              return section;
            }
            const nextItems = [
              ...(section.pointItems || []),
              { id: `${sectionId}-${Date.now()}`, text: trimmed, kind: 'claim' as const },
            ];
            return {
              ...section,
              points: [...section.points, trimmed],
              pointItems: section.pointItems ? nextItems : section.pointItems,
            };
          }
          return section;
        }),
      };
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
      const newOutline: UIOutline = {
        ...state.outline,
        sections: state.outline.sections.map((section) => {
          if (section.id === sectionId && section.points[index] !== undefined) {
            const newPoints = [...section.points];
            newPoints[index] = trimmed;
            return { ...section, points: newPoints };
          }
          return section;
        }),
      };
      return {
        outline: newOutline,
        pendingOutlineChanges: newOutline,
      };
    });
  },

  removeOutlinePoint: (sectionId: string, index: number) => {
    set((state) => {
      const newOutline: UIOutline = {
        ...state.outline,
        sections: state.outline.sections.map((section) => {
          if (section.id === sectionId && section.points[index] !== undefined) {
            return {
              ...section,
              points: section.points.filter((_, i) => i !== index),
            };
          }
          return section;
        }),
      };
      return {
        outline: newOutline,
        pendingOutlineChanges: newOutline,
      };
    });
  },

  reorderOutlinePoints: (sectionId: string, fromIndex: number, toIndex: number) => {
    set((state) => {
      const newOutline: UIOutline = {
        ...state.outline,
        sections: state.outline.sections.map((section) => {
          if (section.id === sectionId) {
            const newPoints = [...section.points];
            const [moved] = newPoints.splice(fromIndex, 1);
            newPoints.splice(toIndex, 0, moved);
            return { ...section, points: newPoints };
          }
          return section;
        }),
      };
      return {
        outline: newOutline,
        pendingOutlineChanges: newOutline,
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
