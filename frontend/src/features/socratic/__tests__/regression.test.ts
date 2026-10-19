import test, { describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useSocraticStore } from '../store';
import {
  mapOutlineToUI,
  mapUIToOutlineContent,
  mapMessageToUI,
} from '../types';
import type {
  OutlineContent,
  MessageResponse,
} from '../types';
import { SocraticApiError, ApiErrorCode } from '../api';

// Helper to mock global.fetch
function mockFetch(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  // @ts-ignore
  global.fetch = handler as any;
}

function jsonResponse(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function errorResponse(code: string, message: string, status = 400, retryAfter?: number): Response {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (retryAfter !== undefined) {
    headers['Retry-After'] = String(retryAfter);
  }
  return new Response(
    JSON.stringify({
      error: { code, message, fields: { fieldA: 'invalid' } },
    }),
    { status, headers }
  );
}

describe('Luồng Socratic - 8 Hạng mục kiểm chứng hồi quy', () => {
  beforeEach(() => {
    useSocraticStore.getState().reset();
  });

  // 1. Chat hiển thị đủ hai phía & gửi thành công
  test('Mục 1 & 2: Gửi tin nhắn thành công có đủ STUDENT và ASSISTANT với ID thật, không thay thế tin sinh viên', async () => {
    const store = useSocraticStore.getState();
    useSocraticStore.setState({ sessionId: 'session-123', assignmentCode: 'VAN11-NLVH-01' });

    let sentIdempotencyKey: string | undefined;

    mockFetch(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/messages') && init?.method === 'POST') {
        const headers = init.headers as Record<string, string>;
        sentIdempotencyKey = headers['Idempotency-Key'];
        // Backend returns assistant message only
        return jsonResponse({
          id: 'ai-msg-uuid-1',
          turnId: 1,
          role: 'ASSISTANT',
          content: 'Em nghĩ sao về hình ảnh ngọn khói rơm rạ?',
          status: 'VALIDATED',
          sources: [{ chunk_id: 'chunk-poem', quote: 'Những ngọn khói cay mùi rơm rạ' }],
          createdAt: new Date().toISOString(),
        });
      }
      if (urlStr.endsWith('/messages?limit=50') && init?.method === 'GET') {
        // Backend history returns both student and assistant messages
        return jsonResponse({
          messages: [
            {
              id: 'student-msg-uuid-1',
              turnId: 1,
              role: 'STUDENT',
              content: 'Em muốn tìm hiểu về khổ 1.',
              status: 'VALIDATED',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'ai-msg-uuid-1',
              turnId: 1,
              role: 'ASSISTANT',
              content: 'Em nghĩ sao về hình ảnh ngọn khói rơm rạ?',
              status: 'VALIDATED',
              sources: [{ chunk_id: 'chunk-poem', quote: 'Những ngọn khói cay mùi rơm rạ' }],
              createdAt: new Date().toISOString(),
            },
          ],
          hasMore: false,
          nextBeforeTurn: null,
        });
      }
      return jsonResponse({});
    });

    await useSocraticStore.getState().sendMessage('Em muốn tìm hiểu về khổ 1.');

    const finalMessages = useSocraticStore.getState().messages;
    assert.strictEqual(finalMessages.length, 2, 'Phải có đủ 2 tin nhắn');
    assert.strictEqual(finalMessages[0].id, 'student-msg-uuid-1', 'Tin học sinh phải có UUID thật từ backend');
    assert.strictEqual(finalMessages[0].role, 'STUDENT');
    assert.strictEqual(finalMessages[0].sender, 'user');
    assert.strictEqual(finalMessages[1].id, 'ai-msg-uuid-1', 'Tin AI phải có UUID thật từ backend');
    assert.strictEqual(finalMessages[1].role, 'ASSISTANT');
    assert.strictEqual(finalMessages[1].sender, 'ai');
    assert.ok(sentIdempotencyKey, 'Phải có Idempotency-Key được gửi đi');
  });

  // 2. Review đúng revision (chờ lưu draft, lấy UUID sau save, dừng nếu lỗi, cập nhật readiness)
  test('Mục 1 (Review): Chờ lưu draft, lấy UUID revision mới nhất sau save, dừng nếu lưu thất bại', async () => {
    useSocraticStore.setState({
      sessionId: 'session-123',
      outlineRevisionId: 'rev-uuid-old',
      outlineVersion: 1,
      pendingOutlineChanges: {
        sections: [{ id: 'intro', title: 'Mở bài', points: ['Ý mới 1'] }],
      },
      outline: {
        sections: [{ id: 'intro', title: 'Mở bài', points: ['Ý mới 1'] }],
      },
    });

    let savedExpectedVersion: number | undefined;
    let reviewedRevisionId: string | undefined;

    mockFetch(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/outline') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        savedExpectedVersion = body.expectedVersion;
        return jsonResponse({
          id: 'rev-uuid-new-after-save',
          sessionId: 'session-123',
          revision: 2,
          content: body.content,
          author: 'STUDENT',
          reviewStatus: 'ACCEPTED',
          createdAt: new Date().toISOString(),
        });
      }
      if (urlStr.endsWith('/review') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body));
        reviewedRevisionId = body.revisionId;
        return jsonResponse({
          id: 'rev-uuid-new-after-save',
          sessionId: 'session-123',
          revision: 2,
          content: {},
          author: 'STUDENT',
          reviewStatus: 'ACCEPTED',
          createdAt: new Date().toISOString(),
          readiness: 'READY',
        });
      }
      if (urlStr.endsWith('/session-123') && init?.method === 'GET') {
        return jsonResponse({
          id: 'session-123',
          studentId: 'student-1',
          assignmentRevisionId: 'assign-rev-1',
          state: 'REVIEW',
          version: 2,
          outlineVersion: 2,
          readiness: 'READY',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      }
      return jsonResponse({});
    });

    const reviewResult = await useSocraticStore.getState().reviewOutline();

    assert.ok(reviewResult, 'Review phải thành công');
    assert.strictEqual(savedExpectedVersion, 1, 'Lưu draft phải dùng expectedVersion 1');
    assert.strictEqual(
      reviewedRevisionId,
      'rev-uuid-new-after-save',
      'Review phải dùng UUID mới nhất SAU KHI lưu draft'
    );
    assert.strictEqual(useSocraticStore.getState().session?.readiness, 'READY', 'Readiness phải được cập nhật');
    assert.strictEqual(useSocraticStore.getState().session?.state, 'REVIEW', 'Session state phải được cập nhật');

    // Test trường hợp save thất bại -> review phải dừng ngay
    useSocraticStore.setState({
      pendingOutlineChanges: {
        sections: [{ id: 'intro', title: 'Mở bài', points: ['Ý lỗi'] }],
      },
    });

    mockFetch(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/outline') && init?.method === 'PUT') {
        return errorResponse('OUTLINE_VERSION_CONFLICT', 'Conflict', 409);
      }
      if (urlStr.endsWith('/review')) {
        throw new Error('KHÔNG ĐƯỢC GỌI REVIEW KHI SAVE THẤT BẠI');
      }
      return jsonResponse({});
    });

    const failedReview = await useSocraticStore.getState().reviewOutline();
    assert.strictEqual(failedReview, null, 'Review phải dừng và trả về null khi save thất bại');
  });

  // 3. Hai thay đổi liên tiếp đều được lưu & expectedVersion mới nhất
  test('Mục 3: Hai thay đổi liên tiếp đều được xếp hàng lưu với expectedVersion mới nhất', async () => {
    useSocraticStore.setState({
      sessionId: 'session-123',
      outlineVersion: 0,
      outline: {
        sections: [{ id: 'intro', title: 'Mở bài', points: ['Ý 1'] }],
      },
    });

    const expectedVersionsUsed: number[] = [];
    const contentsSaved: any[] = [];

    mockFetch(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/outline') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        expectedVersionsUsed.push(body.expectedVersion);
        contentsSaved.push(body.content);

        // Delay slight amount to simulate network latency
        await new Promise((r) => setTimeout(r, 10));

        const revNumber = body.expectedVersion + 1;
        return jsonResponse({
          id: `rev-uuid-${revNumber}`,
          sessionId: 'session-123',
          revision: revNumber,
          content: body.content,
          author: 'STUDENT',
          reviewStatus: 'ACCEPTED',
          createdAt: new Date().toISOString(),
        });
      }
      return jsonResponse({});
    });

    // Bắt đầu lưu lần 1
    const save1Promise = useSocraticStore.getState().saveOutline();

    // Trong lúc save 1 đang chạy, sửa thêm ý 2 và gọi save 2
    useSocraticStore.getState().addOutlinePoint('intro', 'Ý 2');
    const save2Promise = useSocraticStore.getState().saveOutline();

    const [res1, res2] = await Promise.all([save1Promise, save2Promise]);

    assert.strictEqual(res1, true, 'Lần 1 lưu thành công');
    assert.strictEqual(res2, true, 'Lần 2 lưu thành công');
    assert.deepStrictEqual(expectedVersionsUsed, [0, 1], 'Mỗi lần gửi phải dùng expectedVersion mới nhất');
    assert.strictEqual(
      useSocraticStore.getState().outlineVersion,
      2,
      'Version cuối cùng trong store phải là 2'
    );
    assert.strictEqual(
      useSocraticStore.getState().pendingOutlineChanges,
      null,
      'Draft phải sạch sau khi lưu hết'
    );
  });

  // 4. Save lỗi không báo thành công & giữ draft
  test('Mục 3 & 4: Save lỗi không báo thành công, giữ nguyên draft và đặt outlineConflict', async () => {
    useSocraticStore.setState({
      sessionId: 'session-123',
      outlineVersion: 2,
      outline: {
        sections: [{ id: 'intro', title: 'Mở bài', points: ['Ý nháp quý giá'] }],
      },
    });

    mockFetch(async (url, init) => {
      return errorResponse('OUTLINE_VERSION_CONFLICT', 'Version mismatch', 409);
    });

    const result = await useSocraticStore.getState().saveOutline();

    assert.strictEqual(result, false, 'Khi save lỗi phải trả về false');
    assert.strictEqual(useSocraticStore.getState().outlineConflict, true, 'Phải đánh dấu outlineConflict = true');
    assert.deepStrictEqual(
      useSocraticStore.getState().outline.sections[0].points,
      ['Ý nháp quý giá'],
      'Draft của người dùng tuyệt đối không bị mất khi conflict'
    );
  });

  // 5. Retry chat an toàn (giữ nguyên idempotencyKey và content, đối soát trước khi gửi lại)
  test('Mục 5: Retry chat an toàn giữ đúng Idempotency-Key và đối soát trước khi gửi lại', async () => {
    useSocraticStore.setState({ sessionId: 'session-123' });

    let firstKey: string | undefined;
    let secondKey: string | undefined;
    let postCount = 0;

    // Lần 1: Timeout / Network drop
    mockFetch(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/messages') && init?.method === 'POST') {
        postCount++;
        const headers = init.headers as Record<string, string>;
        firstKey = headers['Idempotency-Key'];
        throw new SocraticApiError(0, ApiErrorCode.NETWORK, 'Mất kết nối mạng');
      }
      return jsonResponse({});
    });

    await useSocraticStore.getState().sendMessage('Nội dung cần giữ nguyên');

    assert.strictEqual(postCount, 1);
    assert.ok(useSocraticStore.getState().pendingOperation, 'Phải lưu pendingOperation');
    assert.strictEqual(
      useSocraticStore.getState().pendingOperation?.content,
      'Nội dung cần giữ nguyên'
    );
    assert.strictEqual(
      useSocraticStore.getState().messages[0].isFailed,
      true,
      'Tin nhắn phải được đánh dấu isFailed'
    );

    // Lần 2: Thử lại (Retry)
    mockFetch(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.endsWith('/messages?limit=50') && init?.method === 'GET') {
        // Chưa có trong lịch sử -> đối soát xác định chưa ghi nhận
        return jsonResponse({ messages: [], hasMore: false, nextBeforeTurn: null });
      }
      if (urlStr.endsWith('/messages') && init?.method === 'POST') {
        postCount++;
        const headers = init.headers as Record<string, string>;
        secondKey = headers['Idempotency-Key'];
        return jsonResponse({
          id: 'ai-msg-2',
          turnId: 1,
          role: 'ASSISTANT',
          content: 'Phản hồi sau retry',
          status: 'VALIDATED',
          createdAt: new Date().toISOString(),
        });
      }
      return jsonResponse({ messages: [] });
    });

    await useSocraticStore.getState().retryPendingMessage();

    assert.strictEqual(postCount, 2);
    assert.strictEqual(secondKey, firstKey, 'Lần retry PHẢI dùng lại đúng Idempotency-Key');
    assert.strictEqual(
      useSocraticStore.getState().pendingOperation,
      null,
      'Pending operation được xóa sau khi thành công'
    );
  });

  // 6. Xử lý lỗi đúng contract (parse envelope, giữ status, domain code, Retry-After, không đoán string)
  test('Mục 4: Parse đúng error envelope, giữ code, status, retry-after, phân biệt conflict domain codes', async () => {
    mockFetch(async (url, init) => {
      return errorResponse('OUTLINE_VERSION_CONFLICT', 'Lỗi phiên bản', 409, 30);
    });

    useSocraticStore.setState({ sessionId: 'session-123' });
    await useSocraticStore.getState().saveOutline();

    const state = useSocraticStore.getState();
    assert.strictEqual(state.errorCode, 'OUTLINE_VERSION_CONFLICT');

    // Kiểm tra trực tiếp hàm api
    mockFetch(async () => {
      return errorResponse('TURN_IN_PROGRESS', 'Lượt đang xử lý', 409);
    });

    try {
      await apiSendMessage('session-123', 'test');
      assert.fail('Phải ném ra lỗi');
    } catch (err: any) {
      assert.strictEqual(err.status, 409);
      assert.strictEqual(err.code, 'TURN_IN_PROGRESS');
    }

    mockFetch(async () => {
      return errorResponse('AI_UNAVAILABLE', 'AI đang bảo trì', 503, 15);
    });

    try {
      await apiSendMessage('session-123', 'test');
      assert.fail('Phải ném ra lỗi');
    } catch (err: any) {
      assert.strictEqual(err.status, 503);
      assert.strictEqual(err.code, 'AI_UNAVAILABLE');
      assert.strictEqual(err.retryAfter, 15, 'Retry-After phải được giữ');
    }
  });

  // 7. Giữ nguyên dữ liệu outline (section.content không bị loại bỏ, bảo toàn thesis, arguments)
  test('Mục 6: section.content, metadata, thesis, arguments không bị mất khi tải -> chỉnh sửa -> lưu', () => {
    const backendRawOutline: OutlineContent = {
      thesis: 'Tự do gắn liền với cội rễ đất đai và lao động',
      arguments: [{ id: 'arg-1', content: 'Luận điểm 1', position: 1 }],
      counterArguments: [{ id: 'carg-1', content: 'Phản biện 1', position: 1 }],
      customMetadata: 'meta-val-123',
      sections: [
        {
          id: 'intro',
          title: 'I. Mở bài',
          points: ['Gợi mở 1'],
          content: 'Nội dung chi tiết phần mở bài từ backend',
          extraSectionMeta: 'section-meta-xyz',
        },
        {
          id: 'body',
          title: 'II. Thân bài',
          points: ['Ý 1'],
          content: 'Nội dung phân tích thân bài',
        },
      ],
    };

    // 1. Map to UI
    const uiOutline = mapOutlineToUI(backendRawOutline);
    assert.strictEqual(uiOutline.thesis, backendRawOutline.thesis);
    assert.strictEqual(uiOutline.sections[0].content, 'Nội dung chi tiết phần mở bài từ backend');
    assert.strictEqual((uiOutline.sections[0] as any).extraSectionMeta, 'section-meta-xyz');

    // 2. Chỉnh sửa trên UI (thêm điểm)
    uiOutline.sections[0].points.push('Gợi mở mới được thêm');

    // 3. Map ngược lại backend payload để lưu
    const payloadToSave = mapUIToOutlineContent(uiOutline, backendRawOutline);

    assert.strictEqual(payloadToSave.thesis, backendRawOutline.thesis, 'Thesis được bảo toàn');
    assert.deepStrictEqual(payloadToSave.arguments, backendRawOutline.arguments, 'Arguments được bảo toàn');
    assert.deepStrictEqual(payloadToSave.counterArguments, backendRawOutline.counterArguments, 'CounterArguments được bảo toàn');
    assert.strictEqual((payloadToSave as any).customMetadata, 'meta-val-123', 'Root metadata được bảo toàn');
    assert.strictEqual(
      payloadToSave.sections[0].content,
      'Nội dung chi tiết phần mở bài từ backend',
      'section.content TUYỆT ĐỐI không bị loại bỏ'
    );
    assert.strictEqual(
      (payloadToSave.sections[0] as any).extraSectionMeta,
      'section-meta-xyz',
      'section metadata TUYỆT ĐỐI không bị loại bỏ'
    );
    assert.deepStrictEqual(
      payloadToSave.sections[0].points,
      ['Gợi mở 1', 'Gợi mở mới được thêm'],
      'Points mới được cập nhật chính xác'
    );
  });

  // 8. Hoàn thiện lịch sử và nguồn (nextBeforeTurn, hasMore, sources chunk_id/quote)
  test('Mục 8: Nối hasMore/nextBeforeTurn vào tải tin cũ, không trùng tin và hiển thị sources chuẩn contract', async () => {
    useSocraticStore.setState({
      sessionId: 'session-123',
      messages: [
        {
          id: 'msg-recent-1',
          sender: 'user',
          text: 'Tin gần nhất',
          timestamp: '10:00',
          turnId: 5,
        },
      ],
      nextBeforeTurn: 5,
      hasMoreMessages: true,
    });

    mockFetch(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('beforeTurn=5')) {
        return jsonResponse({
          messages: [
            {
              id: 'msg-old-1',
              turnId: 3,
              role: 'STUDENT',
              content: 'Tin cũ hơn',
              status: 'VALIDATED',
              createdAt: '2026-10-19T02:00:00Z',
            },
            {
              id: 'msg-old-2',
              turnId: 3,
              role: 'ASSISTANT',
              content: 'AI trả lời tin cũ',
              sources: [{ chunk_id: 'chunk-1', quote: 'củ khoai lùi bong ra cơn đói' }],
              status: 'VALIDATED',
              createdAt: '2026-10-19T02:01:00Z',
            },
          ],
          hasMore: false,
          nextBeforeTurn: null,
        });
      }
      return jsonResponse({});
    });

    await useSocraticStore.getState().loadMessages(true);

    const msgs = useSocraticStore.getState().messages;
    assert.strictEqual(msgs.length, 3, 'Tổng cộng có 3 tin sau khi nối trang');
    assert.strictEqual(msgs[0].id, 'msg-old-1', 'Tin cũ hơn phải nằm ở đầu');
    assert.strictEqual(msgs[1].id, 'msg-old-2');
    assert.strictEqual(msgs[2].id, 'msg-recent-1', 'Tin mới hơn giữ ở cuối');
    assert.strictEqual(useSocraticStore.getState().hasMoreMessages, false);
    assert.strictEqual(useSocraticStore.getState().nextBeforeTurn, null);

    // Kiểm tra contract sources
    assert.deepStrictEqual(msgs[1].sources, [
      { chunk_id: 'chunk-1', quote: 'củ khoai lùi bong ra cơn đói' },
    ]);
  });

  // 9. Kiểm tra phản hồi đến muộn sau reset
  test('Kiểm tra phản hồi đến muộn sau reset bị hủy và không ghi đè state mới', async () => {
    useSocraticStore.setState({ sessionId: 'session-old' });

    let resolveSlowFetch: any;
    mockFetch(async (url) => {
      return new Promise((resolve) => {
        resolveSlowFetch = () =>
          resolve(
            jsonResponse({
              messages: [{ id: 'stale-msg', role: 'STUDENT', content: 'Tin cũ', status: 'VALIDATED', createdAt: '' }],
              hasMore: false,
              nextBeforeTurn: null,
            })
          );
      });
    });

    // Bắt đầu tải messages cho session cũ
    const loadPromise = useSocraticStore.getState().loadMessages(false);

    // Người dùng reset hoặc chuyển session
    useSocraticStore.getState().reset();
    useSocraticStore.setState({ sessionId: 'session-new' });

    // Phản hồi cũ đến muộn
    resolveSlowFetch();
    await loadPromise;

    assert.strictEqual(
      useSocraticStore.getState().messages.length,
      0,
      'Phản hồi muộn tuyệt đối không được ghi đè vào session mới'
    );
  });
});

// Helper for test 6
async function apiSendMessage(sessionId: string, content: string) {
  const { sendMessage } = await import('../api');
  return sendMessage(sessionId, content);
}
