/**
 * Starter questions the assistant can actually answer: they map to sections
 * of the user guide or to materials the user is allowed to read.
 */

export interface ChatSuggestion {
  icon: string;
  title: string;
  hint: string;
  prompt: string;
}

export const STUDENT_SUGGESTIONS: ChatSuggestion[] = [
  {
    icon: 'photo_camera',
    title: 'Nộp bài viết tay',
    hint: 'Các bước chụp và nộp ảnh bài làm',
    prompt: 'Làm thế nào để nộp ảnh bài viết tay?',
  },
  {
    icon: 'psychology',
    title: 'Lập dàn ý với Socratic',
    hint: 'Trợ lý gợi mở ý tưởng, không viết hộ',
    prompt: 'Cách lập dàn ý bằng trợ lý Socratic như thế nào?',
  },
  {
    icon: 'grading',
    title: 'Xem điểm và nhận xét',
    hint: 'Khi nào kết quả được công bố',
    prompt: 'Khi nào em xem được điểm và nhận xét của giáo viên?',
  },
  {
    icon: 'menu_book',
    title: 'Ngữ liệu bài tập',
    hint: 'Hỏi về nội dung ngữ liệu em được giao',
    prompt: 'Tóm tắt nội dung ngữ liệu trong bài tập em được giao.',
  },
];

export const TEACHER_SUGGESTIONS: ChatSuggestion[] = [
  {
    icon: 'upload_file',
    title: 'Import tài liệu',
    hint: 'Đưa tài liệu DOCX vào kho học liệu',
    prompt: 'Làm thế nào để import tài liệu vào kho học liệu?',
  },
  {
    icon: 'library_books',
    title: 'Quản lý ngữ liệu',
    hint: 'Tạo, sửa và sắp xếp ngữ liệu',
    prompt: 'Cách tạo và quản lý ngữ liệu trong kho?',
  },
  {
    icon: 'assignment_add',
    title: 'Giao bài cho lớp',
    hint: 'Từ đề nguồn đến bài tập cho học sinh',
    prompt: 'Các bước giao bài cho lớp là gì?',
  },
  {
    icon: 'fact_check',
    title: 'Chấm và công bố',
    hint: 'Rà soát kết quả rồi công bố cho học sinh',
    prompt: 'Cách chấm bài và công bố kết quả cho học sinh?',
  },
];

export function suggestionsFor(isTeacher: boolean): ChatSuggestion[] {
  return isTeacher ? TEACHER_SUGGESTIONS : STUDENT_SUGGESTIONS;
}
