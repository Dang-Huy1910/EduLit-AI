# Google Stitch Prompt — EduLit-AI MVP

Phiên bản: 2.0 · Cập nhật: 12/10/2026.

Prompt dựa trên [SRS](../SRS.md) và bảng màu [DESIGN.md](../DESIGN.md), bao phủ bốn phân hệ ở mức MVP. Sao chép toàn bộ nội dung trong khối bên dưới vào Stitch; prompt đã chứa ngữ cảnh cần thiết để dùng độc lập.

Giả định UX để thiết kế: đăng nhập bằng tài khoản có sẵn; giáo viên xác nhận rubric trước khi giao đề; học sinh xem bản chép OCR nhưng không tự sửa nội dung sau khi nộp; giáo viên rà soát đoạn OCR được đánh dấu. Đây là đề xuất cho prototype, cần chốt theo TBD-01–TBD-05 của SRS trước khi triển khai. Prompt không quy định công nghệ backend hoặc ngưỡng chất lượng OCR.

```text
Design a coherent, responsive MVP web application for EduLit-AI, a Vietnamese high school Literature learning and assessment assistant aligned with GDPT 2018.

Create the 10 connected screens specified below, using one shared design system. Include realistic Vietnamese UI copy, meaningful interactions, and the required alternate states. This is an application prototype using synthetic data; uploading or displaying a file in the prototype must not imply that real OCR, privacy processing, or AI grading has been performed.

1. PRODUCT AND MVP BOUNDARIES

The product has two roles: Giáo viên and Học sinh, and four connected capabilities:
- Grounding: teachers provide learning materials, assignment instructions, and scoring rubrics.
- Socratic guidance: students develop their own essay outlines through questions.
- Assessment: students submit 1–4 photos of handwritten essays, then receive OCR and rubric-based feedback.
- Classroom feedback: teachers see common difficulties, learning-goal gaps, and teaching recommendations.

Focus the design on this teaching cycle. Use existing accounts and classes for the MVP. Self-registration, school administration, payments, gamification, model settings, and full lesson-plan authoring are outside this prototype.

UX assumptions to illustrate, pending final business rules:
- Roles are assigned to accounts; users do not grant themselves teacher access by selecting a role.
- Teachers confirm an extracted rubric before publishing an assignment.
- Students can inspect OCR and report unreadable text; they cannot rewrite a submitted essay in the OCR view.
- Teachers can review flagged transcription segments against the image before assessment continues.
- The exact outline readiness policy, OCR review rules, and rubric approval workflow are not finalized. Show sample states without inventing numeric thresholds.

2. VISUAL DIRECTION AND SHARED TOKENS

Adapt the warm sand/ocean/forest palette to a calm Vietnamese classroom application. Aim for a paper-like reading experience, clear hierarchy, restrained decoration, and comfortable long-form text.

Colors:
- Page background: #FFFDF7.
- Card and dialog surface: #FFFFFF.
- Primary action: #D4A373, with dark label text #1F2937.
- Main text: #1F2937; secondary text: #4B5563.
- Ocean accent: #0891B2 for decorative accents and informational backgrounds; use darker #0E7490 for small links on light surfaces.
- Forest success accent: #166534.
- Warning accent: #CA8A04, with a pale background and readable dark text.
- Error accent: #DC2626, with explicit error text and recovery actions.
- Subtle dividers: #E5E7EB; input borders: #9CA3AF.

Typography:
- Use Inter or a comparable Vietnamese-capable sans-serif for navigation, controls, and body text.
- Use Merriweather or a comparable Vietnamese-capable serif sparingly for the essay topic and reading headings.
- Body text: 16px; essay/transcript line height: approximately 1.6–1.75.
- Keep every user-facing label in Vietnamese; avoid technical state names, raw JSON, and internal agent traces in product screens.

Components:
- Use a spacing scale based on 4/8px increments.
- Button/input corner radius: 8px; card/dialog radius: 12px.
- Prefer subtle borders and restrained shadows.
- Combine status color with a label and icon. Provide readable numeric labels for charts.
- Maintain text contrast of at least 4.5:1 for normal text.
- Show default, hover, pressed, keyboard-focus, disabled, and loading states for controls.
- Use clear visible labels, logical keyboard order, and visible focus indicators. Tooltips must also work through focus or tap.
- Do not make drag-and-drop the only way to upload or reorder photos.

3. NAVIGATION AND CONNECTED USER JOURNEYS

Teacher desktop shell:
- Left navigation: Bài tập, Học liệu, Báo cáo lớp.
- Header: current page, class context where relevant, teacher account menu.
- A teacher may open an individual student's assessment from the class report.

Student desktop shell:
- Navigation: Bài tập của em, Bài đã nộp.
- Header: current assignment when applicable, student account menu.
- The Socratic workspace keeps the topic, learning materials, and draft outline within easy reach.
- “Bài đã nộp” can be a filtered view of Screen 06, rather than an additional screen.

Connected journeys:
- Teacher: 01 → 02 → 03 → 04 → publish assignment → 02 → 05 → 10 for an individual report.
- Student: 01 → 06 → 07 → 08 → 09 → 10.
- Documents selected in Screen 04 come from Screen 03. Student tasks in Screen 06 come from published teacher assignments.
- Show pre-submission and post-assessment screens as successive states of the same journey, not simultaneous states of one submission.
- Use clear breadcrumb/back navigation without losing the current assignment context.

4. SCREENS TO DESIGN

SCREEN 01 — Đăng nhập
- A simple sign-in page with EduLit-AI branding and a short description: “Tự lập dàn ý, nhận phản hồi, tiến bộ qua từng bài viết.”
- Username and password inputs, show/hide password, and “Đăng nhập” action.
- A brief note: “Sử dụng tài khoản được nhà trường cung cấp.”
- After sign-in, route by the account's assigned role. A role switcher, if used to demonstrate the prototype, must be labeled “Chế độ xem thử” and kept separate from authentication.
- Alternate states: submitting, incorrect credentials, and service unavailable.

SCREEN 02 — Giáo viên: Bài tập theo lớp
- Class selector with sample “12A1” and a list of assignments.
- Columns/cards: title, grade, linked learning materials, rubric status, assignment status, and number of assessed submissions.
- Primary action “Tạo bài tập”; secondary navigation to “Học liệu”.
- Distinguish “Bản nháp”, “Chưa đủ học liệu”, and “Đã giao”.
- Assignment actions lead to Screen 04 for editing a draft or Screen 05 for its report.
- Empty state: “Lớp này chưa có bài tập” with “Tạo bài tập đầu tiên”.

SCREEN 03 — Giáo viên: Kho học liệu và nhập tài liệu
- A dedicated learning-material workspace, not just an upload dialog.
- Material list: title, type, associated assignment/class, version label, and processing status.
- Search by title and filter by class/status.
- Primary action “Thêm học liệu” opens a drawer or dialog with two methods: upload PDF/DOCX/TXT or paste text.
- Show accepted formats explicitly. File-size limits should be described as configurable, without inventing a fixed maximum.
- Collect title, material purpose (Ngữ liệu, Giáo án, Đề bài, Barem), and class/assignment association.
- After upload, show “Đã tải lên” → “Đang xử lý” → “Sẵn sàng”, or “Xử lý thất bại”.
- A detail panel previews extracted text and separates available source text, instructions, and rubric candidates. Missing sections are clearly marked.
- A failed material has a readable error and “Thử lại” or “Chọn tài liệu khác”.
- New material only becomes selectable as ready context after successful processing. Show pending/failed additions separately from previously ready materials.
- Explain: “Học liệu sẵn sàng sẽ được dùng cho hướng dẫn và đánh giá bài viết của đề tương ứng.”

SCREEN 04 — Giáo viên: Soạn đề và kiểm tra rubric
- A structured assignment editor with sections for “Thông tin đề”, “Học liệu”, “Mục tiêu học tập”, and “Tiêu chí đánh giá”.
- Fields: title, grade 10/11/12, existing class, and assignment instructions.
- Select ready materials from Screen 03; include “Thêm học liệu” as a secondary action.
- Learning goals are short teacher-entered statements, linked to relevant rubric criteria for the class report.
- An extracted rubric is editable by the teacher. Show criterion names, maximum points, level descriptions, required elements, and optional error deductions.
- Use four sample criteria totaling 10 points: Bố cục 2, Luận điểm và dẫn chứng 4, Diễn đạt 2, Sáng tạo 2. These are sample data; allow other criterion counts and score totals in the design.
- Show a clear total-points summary and validation when criterion maxima do not sum to the rubric maximum.
- Primary actions: “Lưu bản nháp”, then “Xác nhận rubric” and “Giao bài” when prerequisites are satisfied.
- An assignment requires instructions, relevant ready learning material, and a valid confirmed rubric under this prototype's UX assumptions.
- Show rubric version and a concise warning that changes should preserve the version used for prior assessments. Do not design a full version-management application.

SCREEN 05 — Giáo viên: Báo cáo lớp và gợi ý dạy học
- Filters: class and assignment; retain the selected context when opening an individual report.
- Metrics: “Bài đã chấm”, “Điểm trung bình”, and “Bài cần kiểm tra”. Define the report denominator as successfully assessed submissions.
- Score-distribution chart with visible counts and interval labels.
- Error-frequency heatmap organized by rubric criteria and issues; missing categories must not be invented as finalized pedagogical rules.
- A plain-language table compares teacher learning goals with observed evidence: goal, linked criterion, issue frequency, and suggested next action.
- Use specific teaching recommendations, such as a 15-minute discussion of counterarguments and a short sentence-revision exercise.
- A student/submission list links to Screen 10. Use names or pseudonyms appropriate to the viewing role, without exposing raw internal IDs prominently.
- Empty state: no assessed submissions. Partial-data state: explain which submissions are excluded while pending or needing review.
- Do not invent a “rubric coverage” percentage or treat class completion as equivalent to assessed submissions.

SCREEN 06 — Học sinh: Bài tập của em và bài đã nộp
- List assigned tasks with topic, class, and current stage.
- Show assignment instructions and a collapsible read-only rubric summary.
- Status-aware actions: “Bắt đầu lập dàn ý”, “Tiếp tục”, “Nộp ảnh bài viết”, or “Xem kết quả”.
- Include an assignment-code input for opening an accessible assignment, with an invalid/unavailable-code state.
- “Bài đã nộp” displays submissions with processing/review/result status and the appropriate next action.
- Include empty and loading states. A task outside the student's accessible scope is not available through this interface.

SCREEN 07 — Học sinh: Trợ lý lập dàn ý Socratic
- Desktop split view: chat on the left; the student's outline on the right.
- Show topic and progress: Khởi tạo → Xác định vấn đề → Lập dàn ý → Rà soát.
- A calm introductory note: “Trợ lý gợi mở để em tự xây dựng ý tưởng và dàn ý.”
- AI example responses contain at most four sentences and end with one actionable open-ended question. Stay within the supplied assignment and learning materials.
- Example: “Em đã nêu được ý nghĩa của lòng kiên định. Để lập luận có chiều sâu hơn, em hãy xem xét trường hợp kiên định trở thành cố chấp. Em sẽ phân biệt hai điều này bằng dấu hiệu nào?”
- Include a refusal variant for requests to write an essay: a brief, polite refusal followed by a guiding question, without providing a model paragraph.
- Quick-action chips trigger guiding questions, such as “Xem lại phản đề” and “Kiểm tra dẫn chứng”.
- The outline is student-authored, using editable bullet-point fields for introduction, arguments/evidence, counterargument, and conclusion. Do not show AI generating complete prose or silently filling the outline.
- Display a read-only “Xem ngữ liệu” panel for the learning material linked to this assignment.
- Review shows what is covered and what remains missing, without giving a numeric pass threshold.
- “Chuyển sang viết tay” is enabled in a sample ready state. In an incomplete state, explain the next step needed; the final readiness policy remains configurable.
- Show first-use, sending, response-in-progress, connection-error, and resumed-session variants. A failed message has an explicit retry action; do not submit the same message automatically on reconnect.

SCREEN 08 — Học sinh: Nộp ảnh bài viết tay
- Display the assignment and instructions to photograph the entire page clearly, in order, with adequate lighting.
- Accept 1–4 photos; offer camera/file selection on mobile and file picker/drag-and-drop on desktop. Exact image formats and size limits remain configurable.
- Page thumbnails show page number, preview, replace/remove actions, and accessible move-earlier/move-later controls.
- Disable “Nộp bài” when there are no photos, more than four photos, or invalid files; explain the specific problem.
- Before submission, explain: “Thông tin định danh cần được che trước khi ảnh được gửi đến dịch vụ AI.”
- Privacy processing has pending, successful, and failed states. Only a successful state may claim that identifying information has been masked. If masking fails, show a blocked state and an action to provide another image.
- After successful upload, show high-level stages: Kiểm tra ảnh → Bảo vệ thông tin → Đọc chữ viết tay → Kiểm tra bản chép → Đánh giá.
- Use indeterminate progress for unknown-duration work. Do not fabricate completion percentages or promise a fixed countdown.
- Include unreadable-image, upload-failure, and interrupted-connection variants with recovery actions.

SCREEN 09 — Bản chép OCR và đoạn cần kiểm tra
- Desktop side-by-side view of the masked image and a line-numbered transcript; provide page navigation for all submitted pages.
- Show overall recognition confidence and flagged segments with text labels; the sample whole-document value is 94%.
- Explain that confidence estimates recognition reliability, not the essay's quality. A high average must not hide flagged segments.
- Student view: read-only transcript, “Báo đoạn chưa đọc đúng”, and processing/review status. Reporting an issue does not rewrite the submission or imply immediate regrading.
- Teacher view: inspect flagged segments against the image and confirm/correct the transcription, preserving the original submission. Show “Xác nhận bản chép” under the stated UX assumption.
- Do not mark OCR uncertainty as a student spelling error before the transcription issue is resolved.
- Show ready, needs-review, recognition-failed, and confirmed variants. Pending review shows “Chờ kiểm tra bản chép”; no final score is displayed yet.
- The final review authority, confidence threshold, and correction policy are pending business decisions. Illustrate the role distinction clearly.

SCREEN 10 — Kết quả đánh giá theo rubric
- Show assignment title, total score, rubric version, and “Phản hồi đánh giá bằng AI” label. Do not imply the score is automatically an official teacher grade.
- Use a sample result of 7.5/10; if a “Khá” label appears, treat its classification rules as sample data pending final grading policy.
- Criterion breakdown: Bố cục 2/2; Luận điểm và dẫn chứng 3/4; Diễn đạt 1.25/2; Sáng tạo 1.25/2. The sum must equal the total.
- Each criterion shows relevant strengths, missing elements, concise feedback, and supporting transcript references where available.
- Selecting a reference highlights the corresponding transcript line/segment. Differentiate grammar/spelling issues using icons and labels as well as color.
- Include actionable improvement suggestions as questions or revision tasks, not complete replacement paragraphs.
- Students can return to their assignment or submission history. Teachers can return to the same filtered class report.
- Show pending and unavailable-result variants separately; do not display a fabricated score during processing or errors.

5. REQUIRED SHARED STATES AND RESPONSIVE BEHAVIOR

Apply consistent empty, loading, success, validation-error, service-error, and access-unavailable states to the screens where they make sense. Each error explains what happened and provides a practical next action. Use skeletons only for loading, not as evidence of offline functionality.

MVP network behavior:
- AI guidance, recognition, and grading require connectivity.
- If the network drops, keep currently typed, unsent text visible in the open view, show “Mất kết nối”, and offer an explicit retry.
- Do not promise full offline AI processing or claim drafts are saved without a confirmed saved state.

Responsive targets:
- Desktop, approximately 1440px: sidebar and spacious two-column chat/OCR workspaces.
- Tablet, approximately 768px: compact navigation and stacked or tabbed workspaces.
- Mobile, approximately 360–390px: single column, drawer navigation, large comfortable controls, and easy camera upload.
- On mobile, switch chat/outline and image/transcript through labeled tabs while preserving entered content and page selection.
- Keep important actions reachable without covering the chat composer or content when the keyboard is open.
- Convert wide tables into readable cards or controlled scroll regions. No whole-page horizontal overflow.
- Dialogs become mobile sheets with clear close/cancel actions. Provide keyboard focus and restore focus on closing.
- Preserve Vietnamese diacritics and allocate stable space for images, charts, and loading content.

6. CONSISTENT SYNTHETIC DEMO DATA

Use fictional data only and add a small “Dữ liệu minh họa” indicator in prototype views.
- Class: 12A1, grade 12, 42 students.
- Assignment: “Bài viết số 1 — Nghị luận xã hội”.
- Topic: “Ý chí và lòng kiên định của giới trẻ”.
- Teacher materials: one reading text and one rubric document; show additional pending/failed uploads as alternate states.
- Student display name: “Học sinh 48”, a fictional pseudonym.
- Rubric: four sample criteria with maxima 2, 4, 2, 2.
- Student result: 7.5/10, with criterion scores 2, 3, 1.25, 1.25.
- Teacher report baseline: 42 assessed submissions, zero awaiting review, mean score 6.85/10.
- Distribution: 8 in [8,10], 22 in [6.5,8), 11 in [5,6.5), 1 in [0,5). Counts sum to 42; use continuous score intervals.
- Issues: missing counterargument 27/42, about 64.3%; incomplete compound sentence 16/42, about 38.1%; insufficiently supported evidence 10/42, about 23.8%.
- Example goal comparison: “Có phân tích phản đề” linked to the argument criterion; 27/42 assessed essays lack that element. Recommend a short counterargument exercise.
- For empty/partial/error variants, adjust denominators and labels consistently instead of reusing the completed baseline blindly.

7. OUTPUT AND DESIGN CHECKLIST

Deliver the 10 numbered screens as one coherent application design with consistent navigation, component styling, and topic data. Prioritize complete teaching/student journeys over decorative landing pages.

Suggested design batches, if generating incrementally:
- Teacher batch: Screens 01–05, using the shared tokens and demo data.
- Student batch: Screens 06–10, retaining exactly the same shared tokens and demo data.
- Follow-up variants: mobile layouts and error/empty/processing states for both batches.

Verify visually that:
- All four capabilities are represented, including teacher ingestion and rubric review.
- Every main action has a clear next destination or visible result.
- Student outline content remains student-authored.
- OCR uncertainty, privacy-processing status, and final assessment status are distinct.
- Teacher learning goals are connected to observed classroom difficulties.
- Scores and report counts are internally consistent.
- All user-facing copy is Vietnamese, with no code traces or provider configuration in the learning flow.
- These are UI designs and simulated states; actual authentication, privacy processing, OCR, and grading require implementation and validation.
```

