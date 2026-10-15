export interface WritingObservation {
  id: string;
  traitId: string;
  traitName: string;
  kind: 'STRENGTH' | 'WEAKNESS' | 'STYLE';
  kindLabel: string;
  description: string;
  genre: 'NLVH' | 'NLXH';
  genreLabel: string;
  status: 'PROVISIONAL' | 'SUPPORTED' | 'RESOLVED' | 'INVALIDATED';
  statusLabel: string;
  evidenceQuote: string;
  evidenceStart: number;
  evidenceEnd: number;
  assessmentId: string;
  assignmentTitle: string;
  observedAt: string;
  teacherFeedback?: string;
  socraticBridgeTip?: string;
}

export interface StudentWritingProfile {
  studentId: string;
  studentName: string;
  studentCode: string;
  className: string;
  personaTitle: string;
  personaSummary: string;
  traitsMetrics: {
    traitId: string;
    traitName: string;
    scorePercent: number;
    level: string;
    observationsCount: number;
  }[];
  observations: WritingObservation[];
  stats: {
    totalObservations: number;
    supportedCount: number;
    resolvedCount: number;
    provisionalCount: number;
    styleCount: number;
  };
}

export const MOCK_BUI_HA_MY_PROFILE: StudentWritingProfile = {
  studentId: 'user-student-48',
  studentName: 'Bùi Hà My',
  studentCode: 'VN-12A1-048',
  className: 'Lớp 12A1 • THPT Đan Phượng',
  personaTitle: 'Cây bút suy tưởng & giàu cảm thức thẩm mỹ',
  personaSummary:
    'Học sinh có tư duy nghị luận chững chạc, vốn từ vựng phong phú và nhịp câu giàu cảm xúc chiêm nghiệm. Khả năng phát hiện và phân tích các hình tượng giàu tính triết luận rất tốt; cần tiếp tục rèn luyện kĩ năng so sánh đối chiếu đa chiều giữa các tác phẩm.',
  traitsMetrics: [
    {
      traitId: 'WORD_CHOICE',
      traitName: 'Lựa chọn từ ngữ & Vốn từ',
      scorePercent: 95,
      level: 'Xuất sắc',
      observationsCount: 3,
    },
    {
      traitId: 'SENTENCE_RHYTHM',
      traitName: 'Nhịp câu & Giọng điệu',
      scorePercent: 90,
      level: 'Tốt',
      observationsCount: 2,
    },
    {
      traitId: 'SENTENCE_STRUCTURE',
      traitName: 'Cấu trúc câu đa tầng',
      scorePercent: 92,
      level: 'Xuất sắc',
      observationsCount: 2,
    },
    {
      traitId: 'ARGUMENT_ORGANIZATION',
      traitName: 'Tổ chức luận điểm',
      scorePercent: 88,
      level: 'Tốt',
      observationsCount: 2,
    },
    {
      traitId: 'COHESION',
      traitName: 'Mạch lạc & Tính toàn vẹn',
      scorePercent: 86,
      level: 'Tốt',
      observationsCount: 1,
    },
    {
      traitId: 'EVIDENCE_LINKING',
      traitName: 'Nối & Phân tích dẫn chứng',
      scorePercent: 78,
      level: 'Khá (Đang rèn luyện)',
      observationsCount: 2,
    },
    {
      traitId: 'TRANSITIONS',
      traitName: 'Chuyển ý & Liên kết đoạn',
      scorePercent: 84,
      level: 'Tiến bộ rõ rệt',
      observationsCount: 1,
    },
    {
      traitId: 'PARAGRAPH_UNITY',
      traitName: 'Tính trọn vẹn của đoạn',
      scorePercent: 88,
      level: 'Tốt',
      observationsCount: 1,
    },
  ],
  stats: {
    totalObservations: 6,
    supportedCount: 3,
    resolvedCount: 2,
    provisionalCount: 1,
    styleCount: 2,
  },
  observations: [
    {
      id: 'obs-001-word-choice-style',
      traitId: 'WORD_CHOICE',
      traitName: 'Lựa chọn từ ngữ',
      kind: 'STYLE',
      kindLabel: 'Đặc trưng văn phong',
      description:
        'Sử dụng nhiều từ ngữ giàu tính tạo hình và gợi mở cảm giác cụ thể về đất đai, cội rễ làng quê, tạo nên giọng điệu suy tưởng độc lập.',
      genre: 'NLVH',
      genreLabel: 'Nghị luận văn học',
      status: 'SUPPORTED',
      statusLabel: 'Giáo viên đã xác nhận',
      evidenceQuote:
        'Những ngọn khói cay mùi rơm rạ dắt tôi về cánh đồng lồng lộng sao đêm, tôi hít thở mầu tự do của đất',
      evidenceStart: 182,
      evidenceEnd: 282,
      assessmentId: 'assign-nlvh-mau-tu-do-dat',
      assignmentTitle: 'Phân tích "Màu tự do của đất" — Trần Quang Quý',
      observedAt: '24/10/2026',
      teacherFeedback:
        'Cô Đặng Loan: "Cách em chọn câu chữ này rất tinh tế, làm nổi bật được sự chuyển đổi cảm giác từ khứu giác sang hơi thở tự do."',
      socraticBridgeTip:
        'Điểm mạnh này được AI ghi nhận để khuyến khích học sinh phát huy ở các bài phân tích thơ trữ tình hiện đại.',
    },
    {
      id: 'obs-002-sentence-structure-strength',
      traitId: 'SENTENCE_STRUCTURE',
      traitName: 'Cấu trúc câu',
      kind: 'STRENGTH',
      kindLabel: 'Điểm sáng năng lực',
      description:
        'Cấu trúc câu ghép nhiều tầng bậc, phối hợp nhịp nhàng giữa liệt kê hình ảnh cụ thể và đúc kết ý niệm tinh thần.',
      genre: 'NLVH',
      genreLabel: 'Nghị luận văn học',
      status: 'SUPPORTED',
      statusLabel: 'Giáo viên đã xác nhận',
      evidenceQuote:
        'Khói bếp, rơm rạ, mái đình cong hay những ngõ xóm ngủ yên... tất cả vẽ nên bức tranh thanh bình, nơi tâm hồn con người được chở che, gắn kết.',
      evidenceStart: 285,
      evidenceEnd: 420,
      assessmentId: 'assign-nlvh-mau-tu-do-dat',
      assignmentTitle: 'Phân tích "Màu tự do của đất" — Trần Quang Quý',
      observedAt: '24/10/2026',
      teacherFeedback:
        'Cô Đặng Loan: "Câu văn uyển chuyển, liên kết các thi ảnh đời thường thành bệ đỡ tâm hồn một cách tự nhiên."',
    },
    {
      id: 'obs-003-evidence-linking-weakness',
      traitId: 'EVIDENCE_LINKING',
      traitName: 'Nối & Phân tích dẫn chứng',
      kind: 'WEAKNESS',
      kindLabel: 'Điểm cần rèn luyện',
      description:
        'Dẫn chứng so sánh với tác phẩm ngoài mới dừng ở mức đặt cạnh nhau để tìm sự tương đồng; chưa chỉ ra sắc bén nét riêng của từng tác giả.',
      genre: 'NLVH',
      genreLabel: 'Nghị luận văn học',
      status: 'PROVISIONAL',
      statusLabel: 'Nhận xét sơ bộ (AI trích xuất)',
      evidenceQuote:
        'Nếu Nguyễn Bính mang đến một vùng quê trầu cay tóc mẹ, Tế Hanh gửi gắm nỗi nhớ mặn mòi gió biển, thì Trần Quang Quý trong bài thơ lại khai thác một khía cạnh độc đáo: Cảm nhận về tự do gắn liền với bùn đất.',
      evidenceStart: 512,
      evidenceEnd: 710,
      assessmentId: 'assign-nlvh-mau-tu-do-dat',
      assignmentTitle: 'Phân tích "Màu tự do của đất" — Trần Quang Quý',
      observedAt: '24/10/2026',
      teacherFeedback:
        'Lưu ý rà soát: Cần phân tích sâu hơn tại sao Trần Quang Quý lại có độ lùi suy ngẫm triết lý khác với tính tạo hình khỏe khoắn của Tế Hanh.',
      socraticBridgeTip:
        'Trợ lý Socratic đã tự động đưa lưu ý này vào gợi mở kịch bản: Khi học sinh liên hệ với Tế Hanh/Bằng Việt, AI sẽ chủ động hỏi thêm câu hỏi gợi mở để làm bật nét riêng.',
    },
    {
      id: 'obs-004-argument-org-strength',
      traitId: 'ARGUMENT_ORGANIZATION',
      traitName: 'Tổ chức luận điểm',
      kind: 'STRENGTH',
      kindLabel: 'Điểm sáng năng lực',
      description:
        'Tổ chức luận điểm mạch lạc theo chiều phát triển nhận thức: từ cội nguồn gia đình, dòng họ đến trách nhiệm công dân người trẻ.',
      genre: 'NLXH',
      genreLabel: 'Nghị luận xã hội',
      status: 'SUPPORTED',
      statusLabel: 'Giáo viên đã xác nhận',
      evidenceQuote:
        'Quê hương là chiếc nôi nuôi dưỡng tâm hồn, là mạch nguồn không bao giờ cạn trong tâm thức của mỗi con người.',
      evidenceStart: 0,
      evidenceEnd: 105,
      assessmentId: 'assign-mock-nlxh-coi-nguon',
      assignmentTitle: 'Nghị luận xã hội: Ý nghĩa của cội nguồn quê hương đối với người trẻ',
      observedAt: '15/09/2026',
      teacherFeedback:
        'Cô Đặng Loan: "Mở bài trực tiếp, xác lập được vị thế của cội nguồn làm tiền đề vững chắc cho toàn bài."',
    },
    {
      id: 'obs-005-transitions-resolved',
      traitId: 'TRANSITIONS',
      traitName: 'Chuyển ý & Liên kết đoạn',
      kind: 'WEAKNESS',
      kindLabel: 'Điểm cần rèn luyện (Đã tiến bộ)',
      description:
        'Ở bài viết số 1, chuyển ý từ thực trạng sang bài học hành động còn hơi gượng; đến bài viết số 2 em đã sử dụng các từ nối linh hoạt và tự nhiên hơn.',
      genre: 'NLXH',
      genreLabel: 'Nghị luận xã hội',
      status: 'RESOLVED',
      statusLabel: 'Đã có tiến bộ',
      evidenceQuote:
        'Trong thời đại toàn cầu hóa ngày nay, việc giữ gìn và hướng về cội nguồn quê hương càng mang ý nghĩa sống còn đối với người trẻ.',
      evidenceStart: 110,
      evidenceEnd: 240,
      assessmentId: 'assign-mock-nlxh-coi-nguon',
      assignmentTitle: 'Nghị luận xã hội: Ý nghĩa của cội nguồn quê hương đối với người trẻ',
      observedAt: '15/09/2026',
      teacherFeedback:
        'Cô Đặng Loan: "Ghi nhận sự nỗ lực rèn luyện của Hà My. Em đã chủ động khắc phục lỗi chuyển ý qua phần gợi mở của Trợ lý AI."',
      socraticBridgeTip:
        'Mục này đã chuyển sang trạng thái RESOLVED — không còn là điểm yếu cần can thiệp thường xuyên.',
    },
    {
      id: 'obs-006-sentence-rhythm-style',
      traitId: 'SENTENCE_RHYTHM',
      traitName: 'Nhịp câu & Giọng điệu',
      kind: 'STYLE',
      kindLabel: 'Đặc trưng văn phong',
      description:
        'Hành văn có nhịp điệu hồi tưởng thiết tha, sử dụng câu văn dài nhiều vế tạo cảm giác ấm áp và chiều sâu ân nghĩa.',
      genre: 'NLVH',
      genreLabel: 'Nghị luận văn học',
      status: 'SUPPORTED',
      statusLabel: 'Giáo viên đã xác nhận',
      evidenceQuote:
        'Hình ảnh bếp lửa trong thơ Bằng Việt không chỉ là một bếp lửa thông thường mà là biểu tượng của tình bà cháu thiêng liêng, của hơi ấm quê hương nâng bước người cháu trên vạn nẻo đường đời...',
      evidenceStart: 0,
      evidenceEnd: 180,
      assessmentId: 'assign-mock-nlvh-bep-lua',
      assignmentTitle: 'Phân tích hình tượng bếp lửa và tình bà cháu trong bài thơ "Bếp lửa"',
      observedAt: '02/10/2026',
      teacherFeedback:
        'Cô Đặng Loan: "Giọng văn truyền cảm, tạo được độ rung động cảm xúc ở người đọc."',
    },
  ],
};

