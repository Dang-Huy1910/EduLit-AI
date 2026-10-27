import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { addSeenKey, countOutlinePoints, revealKey, revealSteps, tipsForSection } from '../reveal';
import { levelTrend } from '../../writing-profile/model';
import type { StyleTip, UIOutline } from '../types';

const tip = (id: string, sectionId: string, pointId: string | null): StyleTip => ({
  id,
  sectionId,
  pointId,
  traitId: 'EVIDENCE_LINKING',
  traitName: 'Nối & Phân tích dẫn chứng',
  text: 'Phân tích thêm sau dẫn chứng.',
  label: 'Theo văn phong của em',
});

describe('Hiệu ứng AI lập dàn ý', () => {
  test('bước "xem văn phong" chỉ có khi dàn ý được cá nhân hoá', () => {
    assert.ok(revealSteps(true).includes('Đang xem lại văn phong của em'));
    assert.ok(!revealSteps(false).includes('Đang xem lại văn phong của em'));
    assert.equal(revealSteps(true).length, revealSteps(false).length);
  });

  test('khoá đã xem cần cả học sinh và bài tập', () => {
    assert.equal(revealKey('u1', 'VAN11'), 'u1:VAN11');
    assert.equal(revealKey(null, 'VAN11'), null);
    assert.equal(revealKey('u1', undefined), null);
  });

  test('ghi nhớ khoá mới nhất, không trùng, có giới hạn', () => {
    assert.deepEqual(addSeenKey(['a', 'b'], 'a'), ['b', 'a']);
    const many = Array.from({ length: 250 }, (_, i) => `k${i}`);
    const kept = addSeenKey(many, 'new');
    assert.equal(kept.length, 200);
    assert.equal(kept[kept.length - 1], 'new');
  });

  test('đếm ý trên toàn dàn ý', () => {
    const outline: UIOutline = {
      sections: [
        { id: 'intro', title: 'I', points: ['a'] },
        { id: 'body', title: 'II', points: ['b', 'c', 'd'] },
        { id: 'conclusion', title: 'III', points: [] },
      ],
    };
    assert.equal(countOutlinePoints(outline), 4);
  });
});

describe('Ghi chú theo văn phong', () => {
  test('gắn vào ý còn tồn tại, ý đã xoá thì về cấp phần', () => {
    const tips = [tip('t1', 'body', 'body-1e'), tip('t2', 'body', 'body-9'), tip('t3', 'conclusion', null)];
    const body = tipsForSection(tips, 'body', ['body-1', 'body-1e']);
    assert.deepEqual(Object.keys(body.byPoint), ['body-1e']);
    assert.deepEqual(body.sectionLevel.map((item) => item.id), ['t2']);
    const conclusion = tipsForSection(tips, 'conclusion', ['conc-1']);
    assert.deepEqual(conclusion.sectionLevel.map((item) => item.id), ['t3']);
  });

  test('không có ghi chú thì rỗng', () => {
    assert.deepEqual(tipsForSection(undefined, 'body', ['body-1']), { byPoint: {}, sectionLevel: [] });
  });
});

describe('Xu hướng mức độ trong hồ sơ', () => {
  test('so mức có minh chứng đầu và cuối', () => {
    assert.equal(levelTrend(['EMERGING', 'CONSISTENT']), 'up');
    assert.equal(levelTrend(['STRONG', 'INSUFFICIENT', 'EMERGING']), 'down');
    assert.equal(levelTrend(['INSUFFICIENT', 'EMERGING']), 'same');
    assert.equal(levelTrend(['INSUFFICIENT', 'INSUFFICIENT']), 'none');
    assert.equal(levelTrend(['CONSISTENT', 'CONSISTENT']), 'same');
  });
});
