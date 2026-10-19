export interface ParsedRubric {
  title: string;
  shortTitle: string;
  description: string;
  version: string;
  gradeLevel: number;
  maxScore: number;
  scoreStep: number;
  criteria: Array<{
    id: string;
    name: string;
    weight: number;
    guideNote?: string;
    levels?: { score: number; descriptor: string }[];
    requiredElements?: string[];
    penaltyPerError?: number;
    antiPatterns?: string[];
  }>;
}

export function parseRubricJson(raw: string): { ok: true; rubric: ParsedRubric } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'File không phải JSON hợp lệ.' };
  }
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'Barem phải là một đối tượng JSON.' };
  }
  const row = data as Record<string, unknown>;
  const title = String(row.title || row.name || '').trim();
  if (!title) return { ok: false, error: 'Thiếu title/name của barem.' };
  const maxScore = Number(row.maxScore ?? row.max_score);
  const scoreStep = Number(row.scoreStep ?? row.score_step ?? 0.25);
  if (!Number.isFinite(maxScore) || maxScore <= 0) {
    return { ok: false, error: 'maxScore phải là số lớn hơn 0.' };
  }
  if (!Number.isFinite(scoreStep) || scoreStep <= 0) {
    return { ok: false, error: 'scoreStep phải là số lớn hơn 0.' };
  }
  const criteriaRaw = row.criteria;
  if (!Array.isArray(criteriaRaw) || criteriaRaw.length === 0) {
    return { ok: false, error: 'Barem cần mảng criteria không rỗng.' };
  }
  const criteria = [];
  let sum = 0;
  const seen = new Set<string>();
  for (const item of criteriaRaw) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'Mỗi tiêu chí phải là đối tượng.' };
    }
    const c = item as Record<string, unknown>;
    const id = String(c.id || c.criterionId || '').trim();
    const name = String(c.name || '').trim();
    const weight = Number(c.weight);
    if (!id || !name || !Number.isFinite(weight)) {
      return { ok: false, error: 'Mỗi tiêu chí cần id, name và weight.' };
    }
    if (weight <= 0) return { ok: false, error: `weight của ${id} phải lớn hơn 0.` };
    if (seen.has(id)) return { ok: false, error: `Trùng mã tiêu chí ${id}.` };
    seen.add(id);
    let levels: ParsedRubric['criteria'][0]['levels'] | undefined;
    if (Array.isArray(c.levels)) {
      levels = [];
      for (const level of c.levels) {
        if (!level || typeof level !== 'object') {
          return { ok: false, error: 'Mỗi mức điểm phải là đối tượng.' };
        }
        const lv = level as Record<string, unknown>;
        const score = Number(lv.score);
        const descriptor = String(lv.descriptor || '').trim();
        if (!Number.isFinite(score)) return { ok: false, error: 'levels.score phải là số hữu hạn.' };
        if (score < 0) return { ok: false, error: 'levels.score không được âm.' };
        if (score > weight) return { ok: false, error: 'levels.score không được vượt điểm tối đa của tiêu chí.' };
        if (!descriptor) return { ok: false, error: 'levels.descriptor không được để trống.' };
        levels.push({ score, descriptor });
      }
    }
    sum += weight;
    criteria.push({
      id,
      name,
      weight,
      guideNote: typeof c.guideNote === 'string' ? c.guideNote : typeof c.description === 'string' ? c.description : undefined,
      levels,
      requiredElements: Array.isArray(c.requiredElements) ? (c.requiredElements as string[]) : undefined,
      penaltyPerError: typeof c.penaltyPerError === 'number' ? c.penaltyPerError : undefined,
      antiPatterns: Array.isArray(c.antiPatterns) ? (c.antiPatterns as string[]) : undefined,
    });
  }
  if (Math.abs(sum - maxScore) > 0.001) {
    return {
      ok: false,
      error: `Tổng điểm các tiêu chí phải bằng ${maxScore} (hiện tại ${sum}). Weight là điểm tối đa, không phải hệ số nhân.`,
    };
  }
  return {
    ok: true,
    rubric: {
      title,
      shortTitle: String(row.shortTitle || row.short_title || title),
      description: String(row.description || ''),
      version: String(row.version || 'v1'),
      gradeLevel: Number(row.gradeLevel || row.grade_level || 11),
      maxScore,
      scoreStep: Number.isFinite(scoreStep) && scoreStep > 0 ? scoreStep : 0.25,
      criteria,
    },
  };
}

export const RUBRIC_JSON_HELP = `Định dạng JSON được hỗ trợ (bản đầu):
{
  "title": "Tên barem",
  "shortTitle": "Tên ngắn",
  "description": "Mô tả",
  "version": "v1",
  "gradeLevel": 11,
  "maxScore": 4.0,
  "scoreStep": 0.25,
  "criteria": [
    { "id": "C1", "name": "Nội dung", "weight": 2.5, "guideNote": "..." }
  ]
}
weight là điểm tối đa của tiêu chí. Tổng weight phải bằng maxScore (không bắt buộc 4.0).
Chưa hỗ trợ nhập PDF/DOCX.`;
