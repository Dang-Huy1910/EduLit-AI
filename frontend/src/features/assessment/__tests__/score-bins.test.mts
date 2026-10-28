import './feature-extensions.test.mts';
import './revision.test.mts';
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { meanPosition, parseBins } from '../score-bins';

const BINS = [
  { range: '[0, 2)', label: 'Thang 10', count: 0, rate: 0 },
  { range: '[2, 4)', label: 'Thang 10', count: 0, rate: 0 },
  { range: '[4, 6)', label: 'Thang 10', count: 2, rate: 0.05 },
  { range: '[6, 8)', label: 'Thang 10', count: 17, rate: 0.41 },
  { range: '[8, 10]', label: 'Thang 10', count: 22, rate: 0.54 },
];

describe('Phổ điểm: khoảng điểm và vạch điểm trung bình', () => {
  test('Nhãn khoảng điểm dễ đọc thay cho ký hiệu toán học', () => {
    assert.deepEqual(
      parseBins(BINS).map((bin) => bin?.label),
      ['0–2', '2–4', '4–6', '6–8', '8–10']
    );
    assert.equal(parseBins([{ range: '[7,5, 8,5)', label: '', count: 1 }])[0]?.label, '7.5–8.5');
    assert.equal(parseBins([{ range: 'không rõ', label: '', count: 1 }])[0], null);
  });

  test('Vạch điểm trung bình đặt theo thang liên tục 0–10', () => {
    const parsed = parseBins(BINS);
    assert.ok(Math.abs((meanPosition(parsed, 7.82) as number) - 0.782) < 1e-9);
    assert.equal(meanPosition(parsed, 12), 1);
    assert.equal(meanPosition(parsed, null), null);
  });

  test('Không vẽ vạch khi các khoảng không đều hoặc không đọc được', () => {
    const uneven = parseBins([
      { range: '[0, 5)', label: '', count: 1 },
      { range: '[5, 10]', label: '', count: 1 },
      { range: '[10, 20]', label: '', count: 1 },
    ]);
    assert.equal(meanPosition(uneven, 6), null);
    assert.equal(meanPosition(parseBins([{ range: '?', label: '', count: 1 }]), 6), null);
  });
});
