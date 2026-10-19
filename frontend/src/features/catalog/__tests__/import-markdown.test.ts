import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseSafeMarkdown, stripUnsafe } from '../safe-markdown';
import { IMPORT_DOCUMENT_LABEL, IMPORT_FORMAT_HELP } from '../types';

describe('Import tài liệu và Markdown an toàn', () => {
  test('Kho có nhãn Import tài liệu và nêu giới hạn PDF scan', () => {
    assert.equal(IMPORT_DOCUMENT_LABEL, 'Import tài liệu');
    assert.match(IMPORT_FORMAT_HELP, /DOCX/);
    assert.match(IMPORT_FORMAT_HELP, /PDF scan/);
    assert.match(IMPORT_FORMAT_HELP, /OCR/);
  });

  test('Renderer giữ bảng và không chạy HTML/script', () => {
    const blocks = parseSafeMarkdown(
      '# Tiêu đề\n\n<script>alert(1)</script>\n\n| Tiêu chí | Điểm |\n| --- | --- |\n| Nội dung | 2,5 |\n'
    );
    const table = blocks.find((block) => block.type === 'table');
    assert.equal(table?.type, 'table');
    if (table && table.type === 'table') {
      assert.equal(table.headers[0], 'Tiêu chí');
      assert.equal(table.rows[0][1], '2,5');
    }
    const scriptish = blocks.find((block) => block.type === 'paragraph' && block.text.includes('script'));
    assert.equal(Boolean(scriptish), true);
    if (scriptish && scriptish.type === 'paragraph') {
      assert.equal(scriptish.text.includes('<script>'), true);
    }
    assert.equal(stripUnsafe('<script>alert(1)</script>').includes('<script>'), false);
    assert.equal(stripUnsafe('<img src=x onerror=alert(1)>').includes('<img'), false);
  });
});
