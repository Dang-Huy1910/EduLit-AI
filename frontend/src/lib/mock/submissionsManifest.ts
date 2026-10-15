import { StudentSubmission } from '../types';
import { CENTRAL_ASSIGNMENT_ID } from './assignmentData';

export interface SubmissionManifestEntry {
  assignmentId: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  submissionId: string;
  pages: {
    pageIndex: number;
    filename: string;
    localPath: string;
    size: string;
    caption: string;
  }[];
  transcriptionByPage: {
    pageIndex: number;
    lines: string[];
  }[];
}

export const SUBMISSION_MANIFEST: Record<string, SubmissionManifestEntry> = {
  'user-student-48': {
    assignmentId: CENTRAL_ASSIGNMENT_ID,
    studentId: 'user-student-48',
    studentName: 'Bùi Hà My',
    studentCode: 'VN-12A1-048',
    submissionId: 'sub-bui-ha-my',
    pages: [
      {
        pageIndex: 1,
        filename: 'page-1.jpg',
        localPath: '/submissions/assign-nlvh-mau-tu-do-dat/user-student-48/page-1.jpg',
        size: '1.2 MB',
        caption: 'Bùi Hà My - Trang 1/2',
      },
      {
        pageIndex: 2,
        filename: 'page-2.jpg',
        localPath: '/submissions/assign-nlvh-mau-tu-do-dat/user-student-48/page-2.jpg',
        size: '760 KB',
        caption: 'Bùi Hà My - Trang 2/2',
      },
    ],
    transcriptionByPage: [
      {
        pageIndex: 1,
        lines: [
          'Làng quê luôn là nguồn cảm hứng bất tận trong thi ca Việt Nam, nơi lưu',
          'giữ những giá trị nguyên sơ và thiêng liêng nhất của dân tộc. Nếu Nguyễn Bính',
          'mang đến một vùng quê trầu cay tóc mẹ, Tế Hanh gửi gắm nỗi nhớ mặn mòi',
          'gió biển, thì Trần Quang Quý trong bài thơ "Màu tự do của đất" lại khai thác',
          'một khía cạnh vô cùng độc đáo: Cảm nhận về "tự do" gắn liền với hình ảnh làng',
          'quê và thân phận người nông dân.',
          'Ngay từ những câu thơ đầu, không gian làng quê đã hiện lên thật gần gũi,',
          'đánh thức mọi giác quan của người đọc qua "Những ngọn khói cay mùi rơm rạ"',
          ', "cánh đồng lồng lộng sao đêm". Khói bếp, rơm rạ, mái đình cong hay những',
          'ngõ xóm ngủ yên... tất cả vẽ nên bức tranh thanh bình, nơi tâm hồn con',
          'người được chở che, gắn kết. Thế nhưng, nhà thơ không dừng lại ở bức tranh',
          'phong cảnh thiên nhiên mà đi sâu vào chiều sâu của thân phận. Tự do trong',
          'cảm nhận của Trần Quang Quý không phải là điều gì lớn lao, xa vời. Đó là một',
          'định nghĩa rất riêng, rất đỗi bất ngờ:',
          '"người nông dân thèm tự do được giải phóng mình khỏi nhọc nhằn cơ bắp',
          'và tự do đầu tiên lại là tự do không thoát ly bùn đất',
          'tự do của mồ hôi',
          'tự do neo đời mình vào cánh đồng sương gió"',
          'Đọc những câu thơ ấy, ta thấy một góc nhìn đầy triết lý. Sự giải phóng của',
          'người nông dân không nằm ở việc rời bỏ lũy tre làng hay chối bỏ bùn đất lam',
          'lũ để tìm về chốn phồn hoa. Trái lại, tự do đích thực đối với họ chính là sự',
          'gắn bó máu thịt, là việc tự nguyện "neo đời mình vào cánh đồng sương gió".',
          'Đó là thứ tự do được đánh đổi bằng giọt mồ hôi mặn mòi, bằng sự kiên cường',
          'bám đất bám làng qua bao thế hệ. Qua chiếc áo vá víu "đã bở bùn", nhà thơ',
          'tôn vinh vẻ đẹp nhân nghĩa, sự thuỷ chung son sắt của con người đối với cội',
          'nguồn.',
          'Để thấy rõ hơn cách nhìn riêng của Trần Quang Quý, ta có thể liên hệ với',
          'bài thơ "Bếp lửa" của nhà thơ Bằng Việt. Cả hai tác giả đều viết về làng',
          'quê với tất cả sự nâng niu, trân trọng từ những hình ảnh bình dị nhất (Như',
          'mùi rơm rạ, khói bếp). Nếu Bằng Việt khắc hoạ làng quê qua ký ức tuổi thơ',
          'ấm áp bên ngọn lửa của bà - ngọn lửa của niềm tin, sự sống và tình mẫu tử',
          'thiêng liêng thì Trần Quang Quý lại đào sâu vào mối quan hệ giữa người nông',
        ],
      },
      {
        pageIndex: 2,
        lines: [
          'dân với đất đai để định nghĩa về hai tiếng "tự do". Nếu Bằng Việt hoài niệm để',
          'hướng về tương lai, thì Trần Quang Quý lại chiêm nghiệm để khẳng định',
          'một chân lý sống: gốc rễ của con người luôn nằm ở mảnh đất quê hương, và',
          'chỉ khi gắn chặt đời mình với đất, con người mới thực sự tìm thấy sự tự do',
          'và bình yên trong tâm hồn.',
          'Bằng thể thơ tự do linh hoạt, giọng điệu trầm lắng, giàu chất suy tưởng',
          'cùng hệ thống hình ảnh mang tính biểu tượng cao (khói rơm rạ, giần sàng,',
          'bùn đất), Trần Quang Quý đã thành công phác hoạ nên một góc nhìn mới',
          'mẻ về tình yêu quê hương. Bài thơ "Màu tự do của đất" không chỉ là khúc ca',
          'ngợi ca vẻ đẹp của làng quê và người dân lao động, mà còn nhắc nhở mỗi chúng',
          'ta về đạo lý uống nước nhớ nguồn. Dù đi đến đâu, trong tim mỗi người',
          'vẫn luôn tồn tại một khoảng trời bình yên mang màu sắc của đất mẹ quê hương.',
        ],
      },
    ],
  },

  'user-student-02': {
    assignmentId: CENTRAL_ASSIGNMENT_ID,
    studentId: 'user-student-02',
    studentName: 'Trần Minh Khôi',
    studentCode: 'VN-12A1-002',
    submissionId: 'sub-tran-minh-khoi',
    pages: [
      {
        pageIndex: 1,
        filename: 'page-1.jpg',
        localPath: '/submissions/assign-nlvh-mau-tu-do-dat/user-student-02/page-1.jpg',
        size: '332 KB',
        caption: 'Trần Minh Khôi - Trang 1/2',
      },
      {
        pageIndex: 2,
        filename: 'page-2.jpg',
        localPath: '/submissions/assign-nlvh-mau-tu-do-dat/user-student-02/page-2.jpg',
        size: '159 KB',
        caption: 'Trần Minh Khôi - Trang 2/2',
      },
    ],
    transcriptionByPage: [
      {
        pageIndex: 1,
        lines: [
          'Trong nền thơ ca Việt Nam hiện đại, tình yêu quê hương, đất nước',
          'luôn là nguồn cảm hứng sâu sắc đối với các nhà thơ. Với bài thơ',
          'Màu tự do của đất, Trần Quang Quý đã khắc hoạ vẻ đẹp bình dị',
          'của làng quê Việt Nam, đồng thời thể hiện niềm trân trọng đối',
          'với giá trị của tự do và những hi sinh của các thế hệ đi trước.',
          'Trước hết, bài thơ mở ra một bức tranh làng quê mộc mạc,',
          'gần gũi và tràn đầy sức sống. Những hình ảnh như "mùi rơm rạ",',
          '"màu mạ non", "màu đồng" gợi lên vẻ đẹp thân thuộc của đồng',
          'ruộng Việt Nam. Quê hương hiện lên với hương vị, màu sắc và',
          'nhịp sống bình yên, gắn liền với công việc lao động của người',
          'nông dân. Những hình ảnh giản dị ấy không chỉ tái hiện cảnh',
          'sắc làng quê mà còn thể hiện tình yêu tha thiết của nhà thơ đối',
          'với mảnh đất đã nuôi dưỡng con người. Qua đó, người đọc cảm',
          'nhận được vẻ đẹp của quê hương không nằm ở những điều xa hoa',
          'mà bắt nguồn từ chính những gì bình thường, gần gũi nhất.',
          'Bên cạnh vẻ đẹp bình dị, bài thơ còn gợi nhắc về những gian',
          'khổ và sự hi sinh của các thế hệ đi trước. Hình ảnh con đường',
          'in dấu vết thuở ông bà mở đất khiến người đọc liên tưởng đến',
          'quá trình lao động bền bỉ, nhọc nhằn để xây dựng quê hương.',
          'Mỗi tấc đất, mỗi con đường đều chứa đựng mồ hôi, công sức và',
          'biết bao kỉ niệm của những người đi trước. Bởi vậy, quê hương',
          'không chỉ là nơi con người sinh ra, lớn lên mà còn là nơi lưu',
          'giữ những giá trị lịch sử và truyền thống quý báu. Qua những',
          'hình ảnh ấy, tác giả thể hiện lòng biết ơn sâu sắc đối với những',
          'thế hệ đã góp sức dựng xây, bảo vệ mảnh đất quê nhà.',
          'Đặc biệt, hình tượng "tự do" là tư tưởng trung tâm của bài thơ.',
          'Tự do được thể hiện qua cuộc sống lao động, qua niềm vui khi con',
          'người được làm chủ cuộc đời và thành quả của mình. Hình ảnh',
          'người nông dân gắn bó với ruộng đồng cho thấy tự do không',
          'phải điều gì xa vời mà hiện diện ngay trong cuộc sống thường ngày.',
          'Đó là quyền được lao động, được sống bình yên và được hưởng hạnh',
          'phúc trên chính quê hương mình. Qua đó, nhà thơ nhấn mạnh rằng',
          'cuộc sống tự do hôm nay là thành quả đáng quý, được tạo nên',
          'từ bao nỗ lực và hi sinh. Vì vậy, mỗi người cần biết trân',
          'trọng hoà bình, biết ơn những người đã góp phần đem lại cuộc',
          'sống tốt đẹp cho các thế hệ sau.',
          'Không chỉ sâu sắc về nội dung, bài thơ còn thành công ở',
          'phương diện nghệ thuật. Thể thơ tự do giúp cảm xúc được bộc lộ',
          'tự nhiên, linh hoạt. Ngôn ngữ thơ gần gũi, mộc mạc nhưng giàu',
          'sức gợi. Những hình ảnh quen thuộc của làng quê vừa mang',
          'ý nghĩa tả thực, vừa gợi lên tình yêu thiên nhiên, lao động và',
          'khát vọng tự do. Bên cạnh đó, giọng thơ tha thiết và trầm lắng',
          'góp phần truyền tải những suy ngẫm sâu sắc của tác giả.',
        ],
      },
      {
        pageIndex: 2,
        lines: [
          'Tóm lại, bằng những hình ảnh giản dị và cảm xúc chân',
          'thành, Trần Quang Quý đã thể hiện tình yêu quê hương sâu',
          'nặng, đồng thời khẳng định giá trị quý báu của tự do trong',
          'bài thơ "Màu tự do của đất". Tác phẩm nhắc nhở mỗi chúng',
          'ta phải biết trân trọng cuộc sống hoà bình, ghi nhớ công lao',
          'của các thế hệ đi trước và có trách nhiệm xây dựng quê',
          'hương ngày càng giàu đẹp.',
        ],
      },
    ],
  },

  'user-student-03': {
    assignmentId: CENTRAL_ASSIGNMENT_ID,
    studentId: 'user-student-03',
    studentName: 'Nguyễn Lan Anh',
    studentCode: 'VN-12A1-015',
    submissionId: 'sub-nguyen-lan-anh',
    pages: [
      {
        pageIndex: 1,
        filename: 'page-1.jpg',
        localPath: '/submissions/assign-nlvh-mau-tu-do-dat/user-student-03/page-1.jpg',
        size: '283 KB',
        caption: 'Nguyễn Lan Anh - Trang 1/2',
      },
      {
        pageIndex: 2,
        filename: 'page-2.jpg',
        localPath: '/submissions/assign-nlvh-mau-tu-do-dat/user-student-03/page-2.jpg',
        size: '83 KB',
        caption: 'Nguyễn Lan Anh - Trang 2/2',
      },
    ],
    transcriptionByPage: [
      {
        pageIndex: 1,
        lines: [
          'Bài làm,',
          'Quê hương và làng quê luôn là nguồn cảm hứng dạt dào trong thơ ca',
          'Việt Nam. Trong bài thơ "màu tự do của đất" của tác giả Trần Quang',
          'Quý tác giả đã mang đến cảm nhận những suy tư, suy nghĩ về "sự tự',
          'do". Qua những hình ảnh làng quê, nhà thơ đã miêu tả sâu sắc về hai',
          'chữ "tự do".',
          'Trước hết, sự tự do và hồi ức về làng quê của tác giả. Tự do đối',
          'với Trần Quang Quý không phải điều gì trừu tượng hay ở đâu xa mà nó',
          'hiện hữu ngay trong những điều bình dị nhất của làng quê. Đó là "mùi rơm rạ"',
          'và "cánh đồng lòng lộng", "mái đình cong", "ngõ xóm ngủ yên". Khi đó nhà',
          'thơ cảm giác hoài niệm và cảm nhận được sự tự do nên đã "hít mầu',
          'tự do của đất". Bên cạnh đó, sự tự do còn được thể hiện qua bao',
          'thế hệ và ký ức về làng quê của tác giả. "Củ khoai lùi bong ra',
          'cơn đói", "dấu vết thuở ông bà mở đất", "nức thơm mùi lúa gặt". Sự',
          'tự do ấy gắn liền với mồ hôi với bao thế hệ đã đi qua gian lao khổ',
          'cực. Đặc biệt, nhà thơ đã miêu tả sâu sắc và độc đáo "người nông',
          'dân thèm tự do được giải phóng mình khỏi nhọc nhằn cơ bắp", "và',
          'tự do đầu tiên lại là không thoát ly bùn đất". Ở đây sự tự do',
          'của người nông dân không phải là vươn ra xa xôi mà là sự thoát',
          'ly khỏi bùn đất. "Tự do của mồ hôi", "Tự do neo đời mình vào',
          'cánh đồng sương gió" hai câu thơ thể hiện sự gắn bó kiên định và',
          'sự tự hào của người nông dân. Tự do không phải là chối bỏ hay chạy',
          'trốn mà là sự chấp nhận hy sinh. Đó chính là vẻ đẹp tâm hồn kiên',
          'cường và bao dung của người nông dân. Qua bài thơ này ta liên',
          'hệ được với bài thơ "Quê hương" của Tế Hanh ta thấy cả hai nhà',
          'thơ đều dành một tình yêu tha thiết, sâu nặng cho quê hương.',
          'Tuy nhiên nếu Tế Hanh vẽ lên một bức tranh làng chài tươi sáng',
          'cùng nỗi nhớ da diết thì Trần Quang Quý lại có một góc nhìn hoàn',
          'toàn riêng biệt. Ông nhìn làng quê với sự trầm tĩnh và phân tích',
          'kỹ lưỡng về sự tự do qua mồ hôi vất vả của những người nông',
          'dân. Chính cách nhìn mới mẻ đã tạo nên chiều sâu độc đáo cho',
          'bài thơ.',
        ],
      },
      {
        pageIndex: 2,
        lines: [
          'Tóm lại, bằng thể thơ tự do và những hình ảnh được miêu tả',
          'độc đáo giàu sức gợi. Tác giả đã cho ta thấy góc nhìn mới mẻ',
          'hiện đại và giàu chất suy tưởng về sự tự do. Điều này nhằm',
          'nhắc nhở chúng ta rằng phải biết trân trọng và yêu quê hương nguồn',
          'cội của mình vì tự do luôn bắt nguồn từ quê hương, sự gắn bó với',
          'làng quê.',
        ],
      },
    ],
  },
};

export const INITIAL_SUBMISSIONS: Record<string, StudentSubmission> = {
  'sub-bui-ha-my': {
    id: 'sub-bui-ha-my',
    assignmentId: CENTRAL_ASSIGNMENT_ID,
    studentId: 'user-student-48',
    studentName: 'Bùi Hà My',
    studentCode: 'VN-12A1-048',
    submissionDate: '24/10/2026 14:35',
    status: 'graded',
    pages: SUBMISSION_MANIFEST['user-student-48'].pages.map((p) => ({
      pageIndex: p.pageIndex,
      imageUrl: p.localPath,
      size: p.size,
      caption: p.caption,
    })),
    transcriptionByPage: SUBMISSION_MANIFEST['user-student-48'].transcriptionByPage,
    totalScore: 3.6,
    maxScore: 4.0,
    scoreScale10: 9.0,
    gradeLevel: 'Giỏi (Mức Tốt - Năng lực Ngữ văn xuất sắc)',
    ocrConfidenceLabel: 'Mô phỏng rà soát OCR (Đã đối chiếu)',
    flaggedSegmentsCount: 0,
    isPublishedToStudent: true,
    teacherNotes:
      'Bài viết xuất sắc, phân tích sâu sắc nghịch lí tự do không thoát ly bùn đất và liên hệ bài thơ "Bếp lửa" (Bằng Việt) rất nhuần nhuyễn làm bật nét riêng của Trần Quang Quý.',
    evaluations: [
      {
        criterionId: 'C1_CONTENT_ART_RELATION',
        criterionName: 'Nội dung, nghệ thuật và liên hệ',
        awardedScore: 2.25,
        maxScore: 2.5,
        strengths: [
          'Phân tích sâu sắc sự chuyển đổi cảm giác trong "tôi hít thở mầu tự do của đất" (Trang 1, Dòng 6-10).',
          'Làm bật nghịch lí trung tâm của tự do: người nông dân khao khát thoát nhọc nhằn cơ bắp song tự do đích thực lại là "không thoát ly bùn đất" (Trang 2, Dòng 1-7).',
          'Liên hệ thành công với bài thơ "Bếp lửa" của Bằng Việt qua hình ảnh ngọn khói và sự gắn bó cội nguồn; làm rõ nét riêng suy tưởng triết lý của Trần Quang Quý (Trang 2, Dòng 10-14).',
        ],
        weaknesses: [
          'Phần phân tích câu hỏi khép bài "ai cởi cho ta mùi khói cơm thơm" có thể đào sâu thêm về kết cấu vòng tròn tương ứng với ngọn khói đầu bài.',
        ],
        comment:
          'Đáp ứng toàn diện và sâu sắc các yêu cầu nội dung, nghệ thuật và so sánh liên hệ của đề bài.',
      },
      {
        criterionId: 'C2_ANALYSIS_ARGUMENT',
        criterionName: 'Phân tích, lập luận và sử dụng dẫn chứng',
        awardedScore: 0.7,
        maxScore: 0.75,
        strengths: [
          'Lập luận chặt chẽ, phát hiện trục chuỗi động từ "buộc – neo – cởi" nối cảm thức gắn bó quê hương.',
          'Trích dẫn thơ chính xác, bám sát từng từ khóa thẩm mỹ ("buộc", "ngược", "neo").',
        ],
        weaknesses: [],
        comment: 'Kĩ năng lập luận sắc sảo, dẫn chứng thuyết phục.',
      },
      {
        criterionId: 'C3_EXPRESSION_LANGUAGE',
        criterionName: 'Diễn đạt, ngôn ngữ và chính tả',
        awardedScore: 0.4,
        maxScore: 0.5,
        strengths: ['Văn phong nghị luận trong sáng, giàu chất thơ và suy tưởng.'],
        weaknesses: ['Còn lặp lại từ "tự do" ở đoạn chuyển ý giữa khổ 3 và 4.'],
        comment: 'Diễn đạt lưu loát, dùng từ chính xác.',
      },
      {
        criterionId: 'C4_STRUCTURE_FORMAT',
        criterionName: 'Bố cục và đáp ứng hình thức',
        awardedScore: 0.25,
        maxScore: 0.25,
        strengths: [
          'Bố cục 3 phần Mở – Thân – Kết chuẩn mực, chuyển ý mượt mà; dung lượng khoảng 630 chữ đạt chuẩn.',
        ],
        weaknesses: [],
        comment: 'Đáp ứng hoàn hảo yêu cầu hình thức bài văn nghị luận.',
      },
    ],
    pedagogicalTasks: [
      {
        id: 'TASK_1',
        title: 'Nâng cao: Khai thác kết cấu vòng tròn',
        description: 'Thử viết thêm 2 câu bình sâu hơn về dụng ý nghệ thuật của câu hỏi tu từ khép lại bài thơ đối ứng với ngọn khói đầu bài.',
        actionLabel: 'Luyện bình thơ',
      },
      {
        id: 'TASK_2',
        title: 'Trau chuốt nhịp điệu diễn đạt',
        description: 'Thay thế các từ ngữ lặp lại ở đoạn chuyển ý bằng các từ đồng nghĩa hoặc câu chuyển linh hoạt hơn.',
        actionLabel: 'Sửa diễn đạt',
      },
    ],
  },

  'sub-tran-minh-khoi': {
    id: 'sub-tran-minh-khoi',
    assignmentId: CENTRAL_ASSIGNMENT_ID,
    studentId: 'user-student-02',
    studentName: 'Trần Minh Khôi',
    studentCode: 'VN-12A1-002',
    submissionDate: '24/10/2026 15:10',
    status: 'graded',
    pages: SUBMISSION_MANIFEST['user-student-02'].pages.map((p) => ({
      pageIndex: p.pageIndex,
      imageUrl: p.localPath,
      size: p.size,
      caption: p.caption,
    })),
    transcriptionByPage: SUBMISSION_MANIFEST['user-student-02'].transcriptionByPage,
    totalScore: 2.65,
    maxScore: 4.0,
    scoreScale10: 6.63,
    gradeLevel: 'Trung bình Khá (Cần rèn luyện kĩ năng liên hệ)',
    ocrConfidenceLabel: 'Mô phỏng rà soát OCR (Đã đối chiếu)',
    flaggedSegmentsCount: 1,
    isPublishedToStudent: true,
    teacherNotes:
      'Học sinh cảm nhận được vẻ đẹp bình dị của làng quê nhưng chưa thực hiện yêu cầu liên hệ mở rộng với tác phẩm khác theo yêu cầu đề bài; cần rèn luyện đọc kĩ đề.',
    evaluations: [
      {
        criterionId: 'C1_CONTENT_ART_RELATION',
        criterionName: 'Nội dung, nghệ thuật và liên hệ',
        awardedScore: 1.5,
        maxScore: 2.5,
        strengths: [
          'Nêu được cảm xúc về khói rơm rạ, củ khoai lùi, con đường ông bà mở đất (Trang 1, Dòng 2-5).',
          'Chỉ ra được câu thơ quan trọng về khát vọng giải phóng nhọc nhằn và tự do của mồ hôi (Trang 2, Dòng 1-5).',
        ],
        weaknesses: [
          'CHƯA CÓ LIÊN HỆ TÁC PHẨM KHÁC: Bài viết hoàn toàn bỏ qua yêu cầu liên hệ với một bài thơ hoặc đoạn thơ khác viết về làng quê, đồng ruộng để làm rõ nét riêng của Trần Quang Quý theo barem DOCX (Trang 2 không có đoạn liên hệ).',
          'Phần phân tích nghịch lí tự do còn dừng ở mức diễn giải lại lời thơ, chưa chỉ ra được tính chất đảo chiều thẩm mỹ của từ "lại" và chiều sâu triết lý.',
        ],
        missingElements: [
          'Thiếu phần liên hệ với một bài thơ khác về làng quê (Bếp lửa, Quê hương, Chiều xuân...) để làm rõ nét riêng của tác giả.',
        ],
        comment:
          'Trừ 1.0 điểm tiêu chí C1 do thiếu hẳn phần liên hệ mở rộng tác phẩm ngoài theo yêu cầu bắt buộc của đề bài.',
      },
      {
        criterionId: 'C2_ANALYSIS_ARGUMENT',
        criterionName: 'Phân tích, lập luận và sử dụng dẫn chứng',
        awardedScore: 0.5,
        maxScore: 0.75,
        strengths: ['Dẫn chứng trích thơ chính xác, không bịa câu thơ.'],
        weaknesses: [
          'Lập luận còn mang tính liệt kê khổ thơ, chưa thấy rõ mạch cảm xúc suy tưởng và chuỗi buộc – neo – cởi.',
        ],
        comment: 'Cần phân tích sâu hơn các biện pháp tu từ và từ ngữ đắc địa.',
      },
      {
        criterionId: 'C3_EXPRESSION_LANGUAGE',
        criterionName: 'Diễn đạt, ngôn ngữ và chính tả',
        awardedScore: 0.4,
        maxScore: 0.5,
        strengths: ['Câu văn rõ ràng, không sai lỗi chính tả nghiêm trọng.'],
        weaknesses: ['Hành văn còn đơn giản, chủ yếu là các câu đơn ngắn ghép nối.'],
        comment: 'Diễn đạt cơ bản đạt yêu cầu.',
      },
      {
        criterionId: 'C4_STRUCTURE_FORMAT',
        criterionName: 'Bố cục và đáp ứng hình thức',
        awardedScore: 0.25,
        maxScore: 0.25,
        strengths: ['Đủ 3 phần Mở bài – Thân bài – Kết bài.'],
        weaknesses: ['Dung lượng khoảng 450 chữ, hơi ngắn so với mức 600 chữ.'],
        comment: 'Cấu trúc bài hoàn chỉnh.',
      },
    ],
    pedagogicalTasks: [
      {
        id: 'TASK_1',
        title: 'Bổ sung đoạn văn liên hệ mở rộng',
        description: 'Viết thêm 1 đoạn văn (khoảng 8-10 câu) so sánh với bài thơ "Quê hương" (Tế Hanh) hoặc "Bếp lửa" (Bằng Việt) để hoàn thiện yêu cầu so sánh.',
        actionLabel: 'Luyện viết đoạn liên hệ',
      },
      {
        id: 'TASK_2',
        title: 'Đào sâu nghịch lí tự do',
        description: 'Phân tích tại sao nhà thơ lại viết "tự do đầu tiên lại là tự do không thoát ly bùn đất" thay vì tự do rời bỏ làng quê.',
        actionLabel: 'Thảo luận với AI',
      },
    ],
  },

  'sub-nguyen-lan-anh': {
    id: 'sub-nguyen-lan-anh',
    assignmentId: CENTRAL_ASSIGNMENT_ID,
    studentId: 'user-student-03',
    studentName: 'Nguyễn Lan Anh',
    studentCode: 'VN-12A1-015',
    submissionDate: '24/10/2026 15:45',
    status: 'graded',
    pages: SUBMISSION_MANIFEST['user-student-03'].pages.map((p) => ({
      pageIndex: p.pageIndex,
      imageUrl: p.localPath,
      size: p.size,
      caption: p.caption,
    })),
    transcriptionByPage: SUBMISSION_MANIFEST['user-student-03'].transcriptionByPage,
    totalScore: 3.35,
    maxScore: 4.0,
    scoreScale10: 8.38,
    gradeLevel: 'Khá Giỏi (Cần đào sâu nét riêng tác giả)',
    ocrConfidenceLabel: 'Mô phỏng rà soát OCR (Đã đối chiếu)',
    flaggedSegmentsCount: 0,
    isPublishedToStudent: true,
    teacherNotes:
      'Bài viết có chất văn tốt, có liên hệ với bài thơ "Quê hương" của Tế Hanh; tuy nhiên phần so sánh cần chỉ ra sắc nét hơn nét riêng suy tưởng triết lí của Trần Quang Quý.',
    evaluations: [
      {
        criterionId: 'C1_CONTENT_ART_RELATION',
        criterionName: 'Nội dung, nghệ thuật và liên hệ',
        awardedScore: 2.05,
        maxScore: 2.5,
        strengths: [
          'Phân tích sinh động hình ảnh khói rơm rạ và phát hiện bất ngờ của câu thơ "tôi hít thở mầu tự do của đất" (Trang 1, Dòng 3-5).',
          'Đã liên hệ với bài thơ "Quê hương" của Tế Hanh qua hình ảnh chiếc thuyền và cánh buồm giương to như mảnh hồn làng (Trang 2, Dòng 4-7).',
          'Chỉ ra được điểm gặp gỡ giữa hai nhà thơ ở sự gắn bó ân tình với làng quê và người lao động.',
        ],
        weaknesses: [
          'Phần so sánh mới tập trung làm rõ sự tương đồng về tình yêu quê hương; chưa đào sâu làm nổi bật nét riêng của Trần Quang Quý ở chiều sâu nghịch lí triết luận và cái nhìn từ độ lùi suy ngẫm so với vẻ đẹp trực tiếp, khỏe khoắn của Tế Hanh.',
        ],
        comment:
          'Bài viết khá toàn diện, cần nâng tầm phân tích so sánh để đạt điểm tối đa.',
      },
      {
        criterionId: 'C2_ANALYSIS_ARGUMENT',
        criterionName: 'Phân tích, lập luận và sử dụng dẫn chứng',
        awardedScore: 0.65,
        maxScore: 0.75,
        strengths: [
          'Lập luận gãy gọn, dẫn chứng thơ của cả hai tác giả đều chính xác và phù hợp.',
        ],
        weaknesses: [],
        comment: 'Kĩ năng phân tích dẫn chứng tốt.',
      },
      {
        criterionId: 'C3_EXPRESSION_LANGUAGE',
        criterionName: 'Diễn đạt, ngôn ngữ và chính tả',
        awardedScore: 0.4,
        maxScore: 0.5,
        strengths: ['Văn phong lưu loát, giàu hình ảnh và cảm xúc.'],
        weaknesses: ['Một số câu ở phần thân bài có cấu trúc hơi trùng lặp.'],
        comment: 'Diễn đạt tốt, diễn ý trôi chảy.',
      },
      {
        criterionId: 'C4_STRUCTURE_FORMAT',
        criterionName: 'Bố cục và đáp ứng hình thức',
        awardedScore: 0.25,
        maxScore: 0.25,
        strengths: ['Bố cục 3 phần rõ ràng, dung lượng khoảng 580 chữ cân đối.'],
        weaknesses: [],
        comment: 'Đạt yêu cầu hình thức bài văn nghị luận.',
      },
    ],
    pedagogicalTasks: [
      {
        id: 'TASK_1',
        title: 'Làm sâu sắc nét riêng khi so sánh',
        description: 'Viết lại đoạn so sánh với "Quê hương" (Tế Hanh) để nhấn mạnh sự khác biệt: Tế Hanh nghiêng về vẻ đẹp tạo hình, khỏe khoắn; còn Trần Quang Quý là độ lùi suy tưởng triết lý về tự do và cội rễ.',
        actionLabel: 'Nâng cấp đoạn so sánh',
      },
    ],
  },
};

