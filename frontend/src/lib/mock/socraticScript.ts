import { OutlineSection } from '../types';

export interface SocraticBranch {
  id: string;
  category: string;
  title: string;
  sampleQuestion: string;
  equivalentQueries: string[];
  keywords: string[];
  aiResponse: string;
  outlinePoint?: string;
  defaultSectionId?: 'intro' | 'body' | 'conclusion';
  requirementTag?: string;
  isRefusal?: boolean;
}

export const SOCRATIC_BRANCHES: SocraticBranch[] = [
  // G. Yêu cầu viết hộ (Ưu tiên kiểm tra trước nhất để từ chối sư phạm)
  {
    id: 'G_REFUSAL_WRITE',
    category: 'Sư phạm & Bản quyền',
    title: 'G. Yêu cầu viết hộ (Từ chối sư phạm)',
    sampleQuestion: 'Viết giúp em cả bài 600 chữ.',
    equivalentQueries: [
      'viết giúp em cả bài 600 chữ',
      'viết hộ em cả bài',
      'viết giúp em một bài văn hoàn chỉnh',
      'cho em một bài văn mẫu 600 chữ',
      'viết hộ em đoạn văn mẫu',
      'làm giúp em bài này',
      'viết cả bài đi',
    ],
    keywords: ['viết hộ', 'viết giúp', 'cả bài', 'bài mẫu', 'văn mẫu', 'viết thay', 'làm giúp'],
    aiResponse:
      'Trợ lý EduLit-AI không viết thay bài văn để bảo đảm tính tự chủ sáng tạo và năng lực tư duy của em theo chuẩn GDPT 2018. Em hãy chọn một luận điểm mà em tâm đắc nhất — ví dụ cảm giác về khói rơm rạ hay nghịch lí tự do không thoát ly bùn đất — rồi phác thảo ý chính, cô sẽ cùng em hoàn thiện nhé!',
    isRefusal: true,
  },

  // E2. Liên hệ Quê hương (Tế Hanh) - cụ thể hơn liên hệ chung
  {
    id: 'E2_RELATE_QUE_HUONG',
    category: 'Liên hệ & Mở rộng',
    title: 'E. Liên hệ: Quê hương (Tế Hanh)',
    sampleQuestion: 'Em muốn liên hệ với bài thơ Quê hương của Tế Hanh.',
    equivalentQueries: [
      'em muốn liên hệ với quê hương của tế hanh',
      'liên hệ bài thơ quê hương tế hanh',
      'so sánh với quê hương của tế hanh',
      'tế hanh quê hương cánh buồm',
      'liên hệ tế hanh',
    ],
    keywords: ['tế hanh', 'quê hương', 'cánh buồm', 'dân chài', 'mảnh hồn làng'],
    aiResponse:
      'Cả hai bài thơ đều thể hiện tình cảm tha thiết với quê hương và hình ảnh con người lao động. Với ‘Quê hương’ của Tế Hanh, đó là vẻ đẹp trẻ trung, khỏe khoắn của người dân chài giữa biển khơi; còn với Trần Quang Quý là chiều sâu suy tưởng triết lý về đất và tự do trong nhọc nhằn đồng ruộng. Em dự định nhấn mạnh nét riêng ấy qua dẫn chứng thơ nào?',
    outlinePoint:
      'Liên hệ ‘Quê hương’ (Tế Hanh) qua hình ảnh người lao động gắn bó với quê hương; làm nổi bật nét riêng của Trần Quang Quý ở độ lùi suy tưởng triết lý về tự do.',
    defaultSectionId: 'body',
    requirementTag: 'RELATION',
  },

  // E1. Liên hệ Bếp lửa (Bằng Việt)
  {
    id: 'E1_RELATE_BEP_LUA',
    category: 'Liên hệ & Mở rộng',
    title: 'E. Liên hệ: Bếp lửa (Bằng Việt)',
    sampleQuestion: 'Em muốn liên hệ với Bếp lửa của Bằng Việt.',
    equivalentQueries: [
      'em muốn liên hệ với bếp lửa của bằng việt',
      'liên hệ bếp lửa bằng việt',
      'so sánh với bài bếp lửa',
      'bếp lửa bằng việt',
      'liên hệ bài thơ khác về khói',
    ],
    keywords: ['bếp lửa', 'bằng việt', 'bà cháu', 'chờn vờn', 'ấp iu'],
    aiResponse:
      'Em có thể đặt hai tác phẩm cạnh nhau qua hình ảnh khói và sự gắn bó với cội nguồn. Với ‘Bếp lửa’, em cần chọn chi tiết phù hợp về kí ức và tình bà cháu; với ‘Màu tự do của đất’, cần trở lại suy tưởng về đất, lao động và tự do. Em sẽ nêu điểm khác biệt ấy bằng dẫn chứng nào?',
    outlinePoint:
      'Liên hệ ‘Bếp lửa’ qua kí ức và hình ảnh khói; làm rõ nét riêng của Trần Quang Quý ở suy tưởng về tự do trong sự gắn bó với đất và lao động.',
    defaultSectionId: 'body',
    requirementTag: 'RELATION',
  },

  // D. Chuỗi buộc – neo – cởi
  {
    id: 'D_VERB_CHAIN',
    category: 'Đặc sắc nghệ thuật',
    title: 'D. Chuỗi buộc – neo – cởi',
    sampleQuestion: 'Em muốn phân tích các từ buộc, neo và cởi.',
    equivalentQueries: [
      'em muốn phân tích các từ buộc neo và cởi',
      'chuỗi động từ buộc neo cởi',
      'ý nghĩa của từ buộc neo cởi',
      'phân tích chữ buộc chữ neo chữ cởi',
      'kết cấu vòng tròn và các động từ',
    ],
    keywords: ['buộc', 'neo', 'cởi', 'chuỗi', 'động từ', 'vòng tròn'],
    aiResponse:
      '‘Buộc’ gắn với tâm thức làng, ‘neo’ gắn với cánh đồng, còn ‘cởi’ xuất hiện trong câu hỏi cuối bài. Em thử đọc ba từ này như một đường dây: sự gắn bó ban đầu được cảm nhận ra sao, và đến cuối bài vì sao mùi khói quê vẫn khó tách khỏi con người?',
    outlinePoint:
      'Chuỗi ‘buộc – neo – cởi’ nối cảm thức gắn bó với làng quê; ngọn khói đầu bài và mùi khói cuối bài tạo kết cấu vòng tròn.',
    defaultSectionId: 'body',
    requirementTag: 'ART',
  },

  // C. Nghịch lí của tự do
  {
    id: 'C_PARADOX_FREEDOM',
    category: 'Luận điểm trọng tâm',
    title: 'C. Nghịch lí của tự do',
    sampleQuestion: 'Vì sao tự do lại là không thoát ly bùn đất?',
    equivalentQueries: [
      'vì sao tự do lại là không thoát ly bùn đất',
      'nghịch lí của tự do là gì',
      'tại sao tự do không thoát ly bùn đất',
      'giải thích nghịch lý tự do',
      'thèm giải phóng khỏi nhọc nhằn cơ bắp',
      'tự do của mồ hôi',
    ],
    keywords: ['nghịch lí', 'nghịch lý', 'không thoát ly', 'bùn đất', 'nhọc nhằn', 'cơ bắp', 'mồ hôi', 'thoát ly'],
    aiResponse:
      'Em hãy đặt câu này cạnh mong muốn ‘được giải phóng mình khỏi nhọc nhằn cơ bắp’. Nhà thơ thừa nhận khát vọng bớt vất vả, đồng thời nhìn thấy giá trị của sự gắn bó với đất và lao động. Em có thể phân biệt mong muốn thoát nhọc nhằn với việc từ bỏ cội rễ ra sao?',
    outlinePoint:
      'Tự do vừa gắn với khát vọng thoát nhọc nhằn, vừa là có chỗ đứng trên mảnh đất thân thuộc và sống bằng sức lao động của mình; tránh đồng nhất tình yêu quê với việc ca ngợi sự khổ cực.',
    defaultSectionId: 'body',
    requirementTag: 'PARADOX',
  },

  // B. Khói, mùi và cảm giác
  {
    id: 'B_SENSE_SMOKE',
    category: 'Hình ảnh & Cảm giác',
    title: 'B. Khói, mùi và cảm giác',
    sampleQuestion: 'Em thấy hình ảnh khói rơm rạ và câu ‘tôi hít thở mầu tự do của đất’ rất đặc biệt.',
    equivalentQueries: [
      'em thấy hình ảnh khói rơm rạ và câu tôi hít thở mầu tự do của đất rất đặc biệt',
      'hình ảnh khói rơm rạ và hít thở mầu tự do',
      'chuyển đổi cảm giác hít thở mầu tự do',
      'phân tích ngọn khói cay mùi rơm rạ',
      'mùi khói và cảm giác làng quê',
    ],
    keywords: ['khói', 'rơm rạ', 'hít thở', 'mầu tự do', 'mùi', 'cay', 'cảm giác', 'giác quan', 'chuyển đổi'],
    aiResponse:
      'Em đã chọn được một chi tiết quan trọng. Khói rơm rạ gợi cảm giác cay và mùi hương, còn ‘hít thở mầu tự do’ khiến một khái niệm trừu tượng trở nên gần với cơ thể. Theo em, cách diễn đạt ấy cho thấy quê hương hiện diện trong con người như thế nào?',
    outlinePoint:
      'Khói rơm rạ và sự chuyển đổi cảm giác trong ‘hít thở mầu tự do’ khiến tự do được cảm nhận như hơi thở của quê hương.',
    defaultSectionId: 'body',
    requirementTag: 'IMAGERY',
  },

  // F. Kết bài
  {
    id: 'F_CONCLUSION',
    category: 'Kết bài & Thông điệp',
    title: 'F. Kết bài & Thông điệp',
    sampleQuestion: 'Em nên chốt lại thông điệp nào ở kết bài?',
    equivalentQueries: [
      'em nên chốt lại thông điệp nào ở kết bài',
      'kết bài nên viết những gì',
      'thông điệp kết bài',
      'đóng góp của bài thơ ở kết bài',
      'khẳng định lại điều gì ở kết bài',
    ],
    keywords: ['kết bài', 'thông điệp', 'chốt lại', 'khái quát', 'kết luận'],
    aiResponse:
      'Em có thể trở lại mối quan hệ giữa tự do và cội rễ, đồng thời khái quát đóng góp của những hình ảnh làng quê trong việc thể hiện suy tưởng ấy. Em thử diễn đạt bằng một nhận định ngắn của mình, tránh kể lại toàn bộ các luận điểm.',
    outlinePoint:
      'Khẳng định cách nhìn riêng: tự do có ý nghĩa trong sự gắn bó với cội rễ, lao động và nhân nghĩa của làng quê.',
    defaultSectionId: 'conclusion',
    requirementTag: 'CONCLUSION',
  },

  // A. Xác định yêu cầu đề bài
  {
    id: 'A_REQ_FOCUS',
    category: 'Định hướng đề',
    title: 'A. Xác định yêu cầu đề bài',
    sampleQuestion: 'Đề này yêu cầu em tập trung phân tích điều gì?',
    equivalentQueries: [
      'đề này yêu cầu em tập trung phân tích điều gì',
      'đề bài yêu cầu gì',
      'trọng tâm đề này là gì',
      'em cần làm những ý nào trong đề này',
      'hướng dẫn phân tích đề màu tự do của đất',
    ],
    keywords: ['yêu cầu', 'tập trung', 'phân tích điều gì', 'trọng tâm', 'đề bài', 'cần làm gì'],
    aiResponse:
      'Trọng tâm là cách Trần Quang Quý cảm nhận ‘tự do’ qua những hình ảnh làng quê. Em cần đi từ hình ảnh và ngôn ngữ cụ thể để giải thích cách hiểu ấy, sau đó liên hệ một bài thơ khác nhằm làm rõ nét riêng của tác giả. Em muốn bắt đầu từ ngọn khói quê hay nghịch lí ‘không thoát ly bùn đất’?',
    outlinePoint:
      'Phân tích quan niệm về tự do qua hình ảnh làng quê; liên hệ một bài thơ khác để làm rõ nét riêng của Trần Quang Quý.',
    defaultSectionId: 'intro',
    requirementTag: 'REQ_FOCUS',
  },
];

export const FALLBACK_RESPONSE = {
  aiResponse:
    'Câu hỏi của em rất có ý nghĩa. Để bám sát đúng yêu cầu đề bài nghị luận về bài thơ "Màu tự do của đất", em nên tập trung vào các nhánh chủ đề trọng tâm sau:\n' +
    '1. Xác định yêu cầu: Cách Trần Quang Quý cảm nhận tự do qua làng quê.\n' +
    '2. Cảm giác & hình ảnh: Khói rơm rạ và sự chuyển đổi cảm giác "hít thở mầu tự do".\n' +
    '3. Nghịch lí trọng tâm: Tự do đầu tiên là không thoát ly bùn đất, tự do của mồ hôi.\n' +
    '4. Nghệ thuật: Chuỗi động từ "buộc – neo – cởi" và kết cấu vòng tròn.\n' +
    '5. Liên hệ tác phẩm khác: So sánh với "Bếp lửa" (Bằng Việt) hoặc "Quê hương" (Tế Hanh).\n' +
    '6. Kết bài: Khẳng định cách nhìn riêng về tự do và cội rễ.\n\n' +
    'Em có thể chọn một trong các gợi ý trên để chúng mình cùng đào sâu tiếp nhé!',
};

// Normalize Vietnamese string for robust matching
export function normalizeVietnamese(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'“”]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Find matching branch from user query
export function matchSocraticBranch(userText: string): SocraticBranch | null {
  const rawLower = userText.toLowerCase().trim();
  const normalized = normalizeVietnamese(userText);

  // Exact sample question or equivalent queries first
  for (const branch of SOCRATIC_BRANCHES) {
    if (rawLower === branch.sampleQuestion.toLowerCase().trim()) return branch;
    for (const eq of branch.equivalentQueries) {
      if (rawLower.includes(eq.toLowerCase()) || normalized.includes(normalizeVietnamese(eq))) {
        return branch;
      }
    }
  }

  // Check branch-specific keywords in priority order
  for (const branch of SOCRATIC_BRANCHES) {
    const matchCount = branch.keywords.filter((kw) => {
      const kwNorm = normalizeVietnamese(kw);
      return normalized.includes(kwNorm) || rawLower.includes(kw.toLowerCase());
    }).length;

    // Special priority thresholds
    if (branch.id === 'G_REFUSAL_WRITE' && matchCount >= 1) {
      return branch;
    }
    if ((branch.id === 'E1_RELATE_BEP_LUA' || branch.id === 'E2_RELATE_QUE_HUONG') && matchCount >= 1) {
      return branch;
    }
    if (branch.id === 'D_VERB_CHAIN' && matchCount >= 2) {
      return branch;
    }
    if (branch.id === 'C_PARADOX_FREEDOM' && matchCount >= 1) {
      return branch;
    }
    if (branch.id === 'B_SENSE_SMOKE' && matchCount >= 1) {
      return branch;
    }
    if (branch.id === 'F_CONCLUSION' && matchCount >= 1) {
      return branch;
    }
    if (branch.id === 'A_REQ_FOCUS' && matchCount >= 1) {
      return branch;
    }
  }

  return null;
}

export interface StructuralCheckItem {
  id: string;
  label: string;
  description: string;
  isMet: boolean;
  matchedKeywords: string[];
}

export function evaluateOutlineCoverage(outline: OutlineSection[]): {
  items: StructuralCheckItem[];
  metCount: number;
  totalCount: number;
  readinessLabel: string;
  isReadyForSubmission: boolean;
} {
  const allPointsText = outline
    .flatMap((s) => s.points)
    .join(' ')
    .toLowerCase();
  const normalizedAll = normalizeVietnamese(allPointsText);

  const criteriaConfigs = [
    {
      id: 'REQ_FOCUS',
      label: 'Xác định đúng vấn đề nghị luận',
      description: 'Nêu được tác giả Trần Quang Quý và cảm nhận tự do qua làng quê',
      keywords: ['tran quang quy', 'tu do', 'lang que', 'quan niem', 'mau tu do cua dat', 'van de'],
    },
    {
      id: 'IMAGERY',
      label: 'Hình ảnh làng quê và dẫn chứng',
      description: 'Phân tích khói rơm rạ, cánh đồng, củ khoai lùi, giần sàng...',
      keywords: ['khoi', 'rom ra', 'canh dong', 'hit tho', 'khoai lui', 'gian sang', 'nhan sinh'],
    },
    {
      id: 'PARADOX',
      label: 'Cách cảm nhận tự do & nghịch lí trọng tâm',
      description: 'Làm rõ nghịch lí: không thoát ly bùn đất, tự do của mồ hôi, neo vào cánh đồng',
      keywords: ['nghich li', 'nghich ly', 'khong thoat ly', 'bun dat', 'mo hoi', 'nhoc nhan', 'neo doi'],
    },
    {
      id: 'ART',
      label: 'Đặc sắc nghệ thuật gắn với nội dung',
      description: 'Khai thác chuỗi buộc – neo – cởi, kết cấu vòng tròn hoặc chuyển đổi cảm giác',
      keywords: ['buoc', 'neo', 'coi', 'chuyen doi cam giac', 'vong tron', 'nghe thuat', 'the tho'],
    },
    {
      id: 'RELATION',
      label: 'Liên hệ và làm rõ nét riêng',
      description: 'Liên hệ một bài thơ khác (Bếp lửa, Quê hương...) làm bật nét riêng của tác giả',
      keywords: ['lien he', 'bep lua', 'bang viet', 'que huong', 'te hanh', 'so sanh', 'net rieng'],
    },
    {
      id: 'CONCLUSION',
      label: 'Kết luận và đánh giá chung',
      description: 'Khẳng định giá trị bài thơ và chiều sâu quan niệm về tự do gắn với cội rễ',
      keywords: ['khang dinh', 'ket bai', 'thong diep', 'dong gop', 'coi re', 'y nghia'],
    },
  ];

  const items: StructuralCheckItem[] = criteriaConfigs.map((cfg) => {
    const matched = cfg.keywords.filter((kw) => normalizedAll.includes(kw));
    return {
      id: cfg.id,
      label: cfg.label,
      description: cfg.description,
      isMet: matched.length > 0,
      matchedKeywords: matched,
    };
  });

  const metCount = items.filter((i) => i.isMet).length;
  const totalCount = items.length;
  const isReadyForSubmission = metCount >= 4;

  let readinessLabel = '';
  if (metCount >= 5) {
    readinessLabel = `${metCount}/${totalCount} yêu cầu đạt chuẩn • Dàn ý đầy đủ và có chiều sâu`;
  } else if (metCount >= 3) {
    readinessLabel = `${metCount}/${totalCount} yêu cầu đạt chuẩn • Đủ điều kiện chuyển sang viết tay`;
  } else {
    readinessLabel = `${metCount}/${totalCount} yêu cầu đạt chuẩn • Cần hoàn thiện thêm các ý trọng tâm`;
  }

  return {
    items,
    metCount,
    totalCount,
    readinessLabel,
    isReadyForSubmission,
  };
}

