import test, { describe, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_CONVERSATIONS,
  appendMessage,
  createConversation,
  groupByDay,
  lastQuestion,
  loadConversations,
  parseStored,
  saveConversations,
  storageKey,
  titleFrom,
  uniqueSources,
  upsertConversation,
  type ChatMessage,
  type Conversation,
} from '../conversations';
import { parseInline, parseRichText } from '../rich-text';
import { STUDENT_SUGGESTIONS, TEACHER_SUGGESTIONS } from '../suggestions';

function message(role: ChatMessage['role'], text: string, createdAt = '2026-10-20T08:00:00.000Z'): ChatMessage {
  return { id: `${role}-${text}`, role, text, createdAt };
}

function conversationWith(text: string, updatedAt: string): Conversation {
  const base = createConversation(new Date(updatedAt));
  return appendMessage(base, message('user', text, updatedAt));
}

describe('Màn chat: hội thoại mới và lịch sử thật', () => {
  before(() => {
    const memory = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => memory.get(key) ?? null,
        setItem: (key: string, value: string) => memory.set(key, value),
        removeItem: (key: string) => memory.delete(key),
      },
    };
  });

  test('Cuộc trò chuyện mới trống, không có lời chào hay phiên mẫu', () => {
    const fresh = createConversation();
    assert.equal(fresh.messages.length, 0);
    assert.equal(fresh.title, 'Cuộc trò chuyện mới');
    // An empty conversation is never stored in the history.
    assert.deepEqual(upsertConversation([], fresh), []);
  });

  test('Câu hỏi đầu tiên đặt tên cuộc trò chuyện, câu trả lời không đổi tên', () => {
    let conv = createConversation();
    conv = appendMessage(conv, message('user', '  Làm thế nào để   nộp ảnh bài viết tay?  '));
    conv = appendMessage(conv, message('assistant', 'Em vào bài tập rồi chọn Nộp ảnh.'));
    assert.equal(conv.title, 'Làm thế nào để nộp ảnh bài viết tay?');
    assert.equal(lastQuestion(conv), '  Làm thế nào để   nộp ảnh bài viết tay?  ');
    assert.ok(titleFrom('a'.repeat(200)).endsWith('…'));
    assert.ok(titleFrom('a'.repeat(200)).length <= 60);
  });

  test('Lịch sử mới nhất lên đầu, có giới hạn số cuộc trò chuyện', () => {
    let list: Conversation[] = [];
    for (let i = 0; i < MAX_CONVERSATIONS + 5; i += 1) {
      list = upsertConversation(list, conversationWith(`Câu ${i}`, new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString()));
    }
    assert.equal(list.length, MAX_CONVERSATIONS);
    assert.equal(list[0].title, `Câu ${MAX_CONVERSATIONS + 4}`);
  });

  test('Lưu theo từng tài khoản và bỏ dữ liệu hỏng', () => {
    const conv = conversationWith('Câu của học sinh A', '2026-10-20T08:00:00.000Z');
    saveConversations('user-a', [conv]);
    assert.equal(loadConversations('user-a').length, 1);
    assert.deepEqual(loadConversations('user-b'), []);
    assert.notEqual(storageKey('user-a'), storageKey('user-b'));
    saveConversations('user-a', []);
    assert.deepEqual(loadConversations('user-a'), []);

    assert.deepEqual(parseStored('{not json'), []);
    assert.deepEqual(parseStored('{"a":1}'), []);
    const broken = JSON.stringify([{ id: 'x', title: 't', updatedAt: 'z', messages: [{ role: 'hacker' }] }]);
    assert.deepEqual(parseStored(broken), []);
  });

  test('Nhóm lịch sử theo ngày', () => {
    const now = new Date(2026, 9, 20, 15, 0);
    const groups = groupByDay(
      [
        conversationWith('hôm nay', new Date(2026, 9, 20, 9, 0).toISOString()),
        conversationWith('hôm qua', new Date(2026, 9, 19, 9, 0).toISOString()),
        conversationWith('tuần này', new Date(2026, 9, 16, 9, 0).toISOString()),
        conversationWith('cũ', new Date(2026, 8, 1, 9, 0).toISOString()),
      ],
      now
    );
    assert.deepEqual(
      groups.map((group) => group.label),
      ['Hôm nay', 'Hôm qua', '7 ngày qua', 'Trước đó']
    );
  });

  test('Nguồn trùng chỉ hiện một lần', () => {
    const sources = [
      { chunk_id: '1', title: 'Đoạn 1', material_title: 'Màu tự do của đất', source_name: 'Ngữ liệu' },
      { chunk_id: '2', title: 'Đoạn 1', material_title: 'Màu tự do của đất', source_name: 'Ngữ liệu' },
      { chunk_id: '3', title: '2.3', material_title: 'Hướng dẫn sử dụng', source_name: 'Hướng dẫn sử dụng' },
    ];
    assert.equal(uniqueSources(sources).length, 2);
    assert.deepEqual(uniqueSources(undefined), []);
  });

  test('Gợi ý mở đầu không còn tên, lớp hay bài thơ mẫu', () => {
    const text = JSON.stringify([...STUDENT_SUGGESTIONS, ...TEACHER_SUGGESTIONS]);
    for (const banned of ['Đỗ Đăng An', 'Đặng Hoàng Loan', '11A14', 'rơm rạ', 'Bếp lửa']) {
      assert.equal(text.includes(banned), false, banned);
    }
  });
});

describe('Định dạng câu trả lời an toàn', () => {
  test('Đoạn văn, tiêu đề, danh sách và chữ đậm', () => {
    const blocks = parseRichText('### Các bước\nEm làm như sau:\n1. Mở bài tập\n2. Chọn **Nộp ảnh**\n\n- Ảnh rõ\n- Đủ trang');
    assert.deepEqual(
      blocks.map((block) => block.kind),
      ['heading', 'paragraph', 'numbers', 'bullets']
    );
    const numbers = blocks[2];
    assert.ok(numbers.kind === 'numbers');
    assert.equal(numbers.items.length, 2);
    assert.deepEqual(numbers.items[1], [
      { kind: 'text', text: 'Chọn ' },
      { kind: 'bold', text: 'Nộp ảnh' },
    ]);
  });

  test('Đoạn văn chen giữa không làm lẫn thứ tự danh sách', () => {
    const blocks = parseRichText('- một\nxen giữa\n- hai');
    assert.deepEqual(
      blocks.map((block) => block.kind),
      ['bullets', 'paragraph', 'bullets']
    );
  });

  test('HTML trong câu trả lời chỉ là chữ thường', () => {
    assert.deepEqual(parseInline('<img src=x onerror=alert(1)>'), [
      { kind: 'text', text: '<img src=x onerror=alert(1)>' },
    ]);
  });
});
