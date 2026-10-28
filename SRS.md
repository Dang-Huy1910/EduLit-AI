# ĐẶC TẢ YÊU CẦU PHẦN MỀM (SRS)

## EduLit-AI — Trợ lý số hóa và đánh giá bài viết môn Ngữ văn THPT

| Thuộc tính | Giá trị |
| --- | --- |
| Dự án | EduLit-AI |
| Phiên bản tài liệu | 1.1 |
| Ngày cập nhật | 12/10/2026 |
| Trạng thái | Bản dự thảo đặc tả yêu cầu |
| Nguồn | Nội dung yêu cầu do người dùng cung cấp |
| Đối tượng sử dụng tài liệu | Nhóm phát triển, kiểm thử, giáo viên và bên phụ trách sản phẩm |

> Tài liệu mô tả yêu cầu dự kiến của hệ thống, không xác nhận các chức năng đã được triển khai. Các nội dung chưa được xác định trong nguồn được ghi tại mục 11; các quy tắc chuẩn hóa bổ sung được nêu rõ để xem xét.

Ngày 12/10/2026, người dùng chọn **Gemini 2.5 Flash**; đây là lựa chọn tại thời điểm đặc tả. Rà lại 2026-10-28: [kiến trúc hiện tại](docs/architecture/system-design.md) và [ADR-0004](docs/architecture/decisions/0004-python-monolith.md) ghi nhận backend Python cùng provider/model cấu hình; [ADR-0001](docs/architecture/decisions/0001-mvp-stack.md) là quyết định lịch sử đã thay thế. Các đề xuất policy review/retention/outline và ngưỡng chất lượng trong thiết kế không tự trở thành yêu cầu đã nghiệm thu.

## 1. Giới thiệu

### 1.1. Mục đích

Xác định phạm vi, yêu cầu chức năng, yêu cầu phi chức năng, luồng dữ liệu, hợp đồng dữ liệu và tiêu chí nghiệm thu cho EduLit-AI. Hệ thống hỗ trợ dạy và học Ngữ văn cấp THPT theo định hướng chương trình GDPT 2018.

### 1.2. Phạm vi sản phẩm

EduLit-AI phục vụ chu trình từ nạp học liệu và thang đánh giá, hướng dẫn học sinh lập dàn ý, số hóa và chấm bài viết tay, đến tổng hợp dữ liệu phục vụ điều chỉnh hoạt động dạy học.

Bốn phân hệ cốt lõi:

1. **Teacher Knowledge Grounding & Rubric Engine:** Nạp tri thức và chuẩn hóa rubric từ giáo viên.
2. **Socratic Writing Scaffold Agent:** Hướng dẫn học sinh xây dựng dàn ý bằng câu hỏi gợi mở.
3. **Vision-to-Rubric Evaluator:** Số hóa bài viết tay và đánh giá theo rubric.
4. **Pedagogical Feedback Loop:** Phân tích kết quả lớp học và đề xuất điều chỉnh giáo án.

Hệ thống không cung cấp chức năng viết thay đoạn văn hoặc bài văn mẫu cho học sinh. Việc thay thế quyết định đánh giá chính thức của giáo viên không được xác định trong phạm vi tài liệu nguồn.

### 1.3. Thuật ngữ

| Thuật ngữ | Ý nghĩa |
| --- | --- |
| GDPT 2018 | Chương trình giáo dục phổ thông 2018 |
| Rubric / barem | Thang tiêu chí và quy tắc đánh giá bài viết |
| Grounding | Ràng buộc phản hồi AI với học liệu và rubric được cung cấp |
| Context Injection | Đưa học liệu và rubric phù hợp vào ngữ cảnh xử lý của agent |
| Socratic | Phương pháp hướng dẫn bằng câu hỏi giúp học sinh tự tư duy |
| OCR | Nhận dạng ký tự từ ảnh, bao gồm chữ viết tay tiếng Việt |
| FSM | Máy trạng thái hữu hạn điều khiển tiến trình trò chuyện |
| PII | Thông tin có thể nhận diện cá nhân |
| TTFT | Thời gian từ khi gửi yêu cầu đến khi nhận token đầu tiên |
| Structured Outputs | Đầu ra có cấu trúc được kiểm tra theo schema |

### 1.4. Quy ước yêu cầu

- `FR-xx`: Yêu cầu chức năng.
- `BR-xx`: Quy tắc nghiệp vụ.
- `NFR-xx`: Yêu cầu phi chức năng.
- `AC-xx`: Tiêu chí nghiệm thu.
- `TBD-xx`: Nội dung cần xác định thêm trước khi chốt triển khai hoặc nghiệm thu.

## 2. Mô tả tổng thể

### 2.1. Tác nhân

| Tác nhân | Nhu cầu và hoạt động chính |
| --- | --- |
| Giáo viên | Nạp học liệu, đề bài, rubric; xem phân tích lớp/khối; nhận gợi ý điều chỉnh giáo án |
| Học sinh | Chọn mã đề, trao đổi để lập dàn ý, nộp ảnh bài viết tay, xem điểm và nhận xét |
| Dịch vụ AI/OCR bên ngoài | Nhận dữ liệu đã xử lý quyền riêng tư và trả kết quả nhận dạng hoặc đánh giá |

### 2.2. Kiến trúc nghiệp vụ tổng quan

```text
[Giáo viên]
     |
     v
[1. Grounding & Rubric Engine]
     | Học liệu, đề bài và rubric
     +------------------------+
     |                        |
     v                        v
[2. Socratic Agent]       [3. Vision-to-Rubric]
     ^                        ^
     | Trao đổi lập dàn ý      | Nộp 1–4 ảnh bài viết tay
     +------- [Học sinh] ------+
                              |
                              +--> Điểm và nhận xét --> [Học sinh]
                              |
                              v
                     [4. Feedback Loop]
                              |
                              v
               Báo cáo và kiến nghị --> [Giáo viên]
```

### 2.3. Luồng sử dụng chính

1. Giáo viên cung cấp học liệu, đề bài và barem.
2. Hệ thống tách nội dung, chuẩn hóa rubric và liên kết với mã đề.
3. Học sinh nhập mã đề; chatbot tải đúng học liệu và rubric.
4. Chatbot hướng dẫn xác định vấn đề, xây dựng luận điểm và rà soát dàn ý.
5. Sau bước rà soát dàn ý, học sinh viết bài và nộp ảnh.
6. Hệ thống xử lý ảnh, nhận dạng chữ viết tay và tạo bản chép kèm độ tin cậy.
7. Hệ thống đối sánh bản chép với rubric để tạo báo cáo đánh giá.
8. Kết quả đánh giá được tổng hợp theo lớp/khối để hỗ trợ giáo viên điều chỉnh dạy học.

### 2.4. Phụ thuộc và ràng buộc

- Phân hệ 2 và 3 phụ thuộc vào học liệu, đề bài và rubric từ phân hệ 1.
- Phân hệ 4 phụ thuộc vào kết quả đánh giá từ phân hệ 3 và mục tiêu giáo án từ phân hệ 1.
- Khả năng nhận dạng chữ viết tay tiếng Việt phụ thuộc chất lượng ảnh và dịch vụ OCR/Vision được lựa chọn.
- Lựa chọn model ban đầu là `gemini-2.5-flash`; code hiện tại chọn `openai`, `gemini` hoặc `fake` qua `AI_PROVIDER`, model qua `AI_MODEL` và override tác vụ trong `backend/app/config.py`. Quyền/quota model thật vẫn cần kiểm tra trên project triển khai.
- Stack thực thi hiện tại: Next.js App Router, Python 3.12/FastAPI, SQLAlchemy async, PostgreSQL/Alembic; worker trong process API và tệp/ảnh lưu bytes trong PostgreSQL. Căn cứ `backend/app/main.py`, models và workers; xem ADR-0004. Chức năng có code không đồng nghĩa đã nghiệm thu các yêu cầu chất lượng của SRS.

## 3. Phân hệ 1 — Teacher Knowledge Grounding & Rubric Engine

### 3.1. Mục tiêu

Tiếp nhận giáo án, ngữ liệu, đề bài và rubric từ giáo viên; chuyển thành dữ liệu bán cấu trúc để cung cấp ngữ cảnh cho phân hệ hướng dẫn và chấm bài.

### 3.2. Yêu cầu chức năng

| Mã | Yêu cầu |
| --- | --- |
| FR-01 | Cho phép giáo viên tải tài liệu `.pdf`, `.docx`, `.txt` hoặc nhập nội dung qua biểu mẫu. |
| FR-02 | Tách riêng ngữ liệu đọc hiểu/nghị luận, yêu cầu đề bài và barem chi tiết. |
| FR-03 | Chia nội dung theo ngữ nghĩa và từng tiêu chí chấm, kèm metadata nhận diện. |
| FR-04 | Chuyển barem dạng văn bản tự do thành JSON theo Rubric Schema tại mục 7.1. |
| FR-05 | Cung cấp học liệu và rubric tương ứng với mã đề cho phân hệ 2 và 3. |

### 3.3. Pipeline

```text
Tải file / nhập biểu mẫu
    -> Phân tích tài liệu
    -> Tách ngữ liệu, đề bài, barem
    -> Semantic chunking và gắn metadata
    -> Trích xuất rubric có cấu trúc
    -> Kiểm tra schema
    -> Cung cấp ngữ cảnh cho agent
```

## 4. Phân hệ 2 — Socratic Writing Scaffold Agent

### 4.1. Mục tiêu

Hỗ trợ học sinh tự xây dựng dàn ý chi tiết trước khi viết bài hoàn chỉnh bằng phương pháp hỏi gợi mở.

### 4.2. Yêu cầu chức năng

| Mã | Yêu cầu |
| --- | --- |
| FR-06 | Nhận mã đề từ học sinh và tải đúng rubric cùng ngữ cảnh từ phân hệ 1. |
| FR-07 | Gợi mở để học sinh xác định vấn đề trọng tâm và thông điệp cá nhân. |
| FR-08 | Hướng dẫn xây dựng hệ thống luận điểm, dẫn chứng và phản đề. |
| FR-09 | Rà soát mức độ bao phủ yêu cầu đề bài của dàn ý và xác định khả năng chuyển sang bước viết tay. |
| FR-10 | Từ chối lịch sự yêu cầu viết hộ hoặc cung cấp bài mẫu, sau đó chuyển hướng sang câu hỏi giúp học sinh tự hình thành ý tưởng. |

### 4.3. Máy trạng thái trò chuyện

| Trạng thái | Xử lý chính | Điều kiện chuyển tiếp |
| --- | --- | --- |
| `STATE_0_INIT` | Nhận mã đề, tải rubric và học liệu | Xác định được đề bài và ngữ cảnh tương ứng |
| `STATE_1_THESIS` | Gợi mở vấn đề trọng tâm và thông điệp cá nhân | Học sinh xác định được hướng triển khai |
| `STATE_2_OUTLINE` | Phát triển luận điểm, dẫn chứng, phản đề | Học sinh tạo dàn ý để rà soát |
| `STATE_3_REVIEW` | Đối chiếu dàn ý với đề bài và rubric | Đủ điều kiện chuyển sang viết tay; điều kiện cụ thể tại TBD-03 |

Các điều kiện chuyển tiếp trên diễn giải luồng nghiệp vụ từ nguồn. Cơ chế quay lại trạng thái trước, khôi phục phiên và ngưỡng đạt dàn ý cần được xác định thêm.

### 4.4. Quy tắc nghiệp vụ và guardrail

| Mã | Quy tắc |
| --- | --- |
| BR-01 | Không viết hoàn chỉnh mở bài, thân bài, kết bài hoặc bất kỳ đoạn văn mẫu nào cho học sinh. |
| BR-02 | Khi gặp yêu cầu viết hộ hoặc bài mẫu, từ chối lịch sự và hướng dẫn học sinh tự suy nghĩ. |
| BR-03 | Không trả lời vượt phạm vi ngữ liệu và barem được cấp. |
| BR-04 | Mỗi phản hồi không quá 4 câu; luôn kết thúc bằng một câu hỏi gợi ý hành động tiếp theo. |

Đặc tả chỉ dẫn hệ thống:

```text
Bạn là Trợ lý Sư phạm Ngữ văn THPT theo định hướng GDPT 2018.
Nhiệm vụ: Gợi ý tư duy và hướng dẫn lập dàn ý bằng các câu hỏi mở.

NGUYÊN TẮC BẮT BUỘC:
1. Không viết hoàn chỉnh mở bài, thân bài, kết bài hoặc đoạn văn mẫu.
2. Khi học sinh yêu cầu viết hộ hoặc bài mẫu, từ chối lịch sự và chuyển
   sang câu hỏi giúp học sinh tự hình thành ý tưởng.
   Ví dụ: "Thầy/Cô không thể viết thay em, nhưng chúng ta hãy cùng phác
   thảo ý tưởng. Em dự định bắt đầu bằng hình ảnh hay nhận định nào?"
3. Chỉ phản hồi trong phạm vi ngữ liệu và barem được cung cấp.
4. Mỗi phản hồi tối đa 4 câu và kết thúc bằng một câu hỏi gợi ý hành động.
```

## 5. Phân hệ 3 — Vision-to-Rubric Evaluator

### 5.1. Mục tiêu

Tiếp nhận từ 1 đến 4 ảnh bài viết tay, chuyển thành văn bản và đánh giá trực tiếp theo rubric của giáo viên.

### 5.2. Yêu cầu chức năng

| Mã | Yêu cầu |
| --- | --- |
| FR-11 | Tiếp nhận một bài nộp gồm từ 1 đến 4 ảnh bài viết tay. |
| FR-12 | Khử nhiễu, tăng tương phản và chuẩn hóa góc xoay ảnh trước khi nhận dạng. |
| FR-13 | Nhận dạng chữ viết tay tiếng Việt bằng dịch vụ Vision/OCR. |
| FR-14 | Tạo bản chép dạng plaintext và độ tin cậy nhận dạng theo từng đoạn. |
| FR-15 | Đối sánh bản chép với từng tiêu chí của rubric được cấp; phát hiện thiếu sót nội dung và lỗi diễn đạt. |
| FR-16 | Sinh báo cáo đánh giá có cấu trúc, gồm điểm tổng, điểm từng tiêu chí, nhận xét, lỗi và gợi ý cải thiện. |
| FR-17 | Cung cấp kết quả cho học sinh và dữ liệu phân tích cho phân hệ 4. |

### 5.3. Pipeline hai giai đoạn

```text
Giai đoạn 1 — Số hóa
Ảnh đầu vào
    -> Xử lý thông tin cá nhân trước khi gửi dịch vụ bên ngoài
    -> Khử nhiễu, tăng tương phản, chuẩn hóa góc xoay
    -> Vision OCR
    -> Bản chép và độ tin cậy theo đoạn

Giai đoạn 2 — Đánh giá
Bản chép + rubric giáo viên
    -> Đối chiếu từng tiêu chí, xác định bằng chứng và lỗi
    -> Tạo báo cáo đánh giá
    -> Kiểm tra schema và tính nhất quán điểm
    -> Trả kết quả và chuyển dữ liệu tổng hợp
```

Việc đối chiếu phải tạo nhận xét và bằng chứng phục vụ đánh giá. Đặc tả đầu ra không yêu cầu công bố chuỗi suy luận nội bộ của mô hình.

### 5.4. Quy tắc chuẩn hóa điểm đề xuất

Các quy tắc sau bổ sung để hợp đồng dữ liệu có thể kiểm tra nhất quán:

| Mã | Quy tắc |
| --- | --- |
| BR-05 | Trong schema hiện tại, `weight` được hiểu là điểm tối đa của tiêu chí, không phải hệ số nhân. Tổng `weight` bằng `max_score` của rubric. |
| BR-06 | Điểm mỗi tiêu chí nằm trong khoảng từ 0 đến điểm tối đa của tiêu chí đó. |
| BR-07 | Điểm tổng bằng tổng điểm được cấp cho các tiêu chí; mỗi tiêu chí tham chiếu phải tồn tại trong rubric. |
| BR-08 | Khi sử dụng `penalty_per_error`, điểm sau trừ lỗi không được thấp hơn 0. Cách đếm lỗi và làm tròn cần chốt tại TBD-05. |

## 6. Phân hệ 4 — Pedagogical Feedback Loop

### 6.1. Mục tiêu

Tổng hợp dữ liệu đánh giá theo lớp hoặc khối lớp để phát hiện các vấn đề phổ biến, đo chênh lệch với mục tiêu giáo án và đưa ra gợi ý điều chỉnh hoạt động dạy học trước tiết tiếp theo.

### 6.2. Yêu cầu chức năng

| Mã | Yêu cầu |
| --- | --- |
| FR-18 | Tổng hợp số bài nộp, điểm trung bình và phân bố điểm theo lớp/bài tập; hỗ trợ tổng hợp theo khối. |
| FR-19 | Hiển thị ma trận nhiệt tần suất lỗi và các vấn đề phổ biến, bao gồm thiếu phản đề, dẫn chứng thiếu xác thực, lạc đề, dùng từ sai, câu thiếu thành phần và sai chính tả thanh điệu. |
| FR-20 | Đo mức chênh lệch giữa mục tiêu giáo án từ phân hệ 1 và năng lực thể hiện qua kết quả phân hệ 3. |
| FR-21 | Sinh gợi ý điều chỉnh giáo án dưới dạng hành động cụ thể cho giáo viên. |

Tài liệu nguồn đề cập heatmap theo 4 nhóm nhưng chỉ liệt kê nhóm lập luận và ngôn ngữ. Hai nhóm còn lại và cách ánh xạ với tiêu chí rubric cần chốt tại TBD-07.

### 6.3. Ví dụ hành động sư phạm

- Dành 15 phút đầu tiết học tiếp theo cho bài tập nhóm tìm và phân tích phản đề.
- Giao bài tập viết ngắn để học sinh sửa một câu phức chứa mệnh đề nhượng bộ.

## 7. Hợp đồng dữ liệu

Các JSON dưới đây là mẫu dữ liệu minh họa. JSON Schema hoặc mô hình Pydantic dùng để kiểm tra chúng là sản phẩm triển khai tiếp theo, chưa được cung cấp trong tài liệu này.

### 7.1. Rubric Schema

```json
{
  "rubric_id": "RUBRIC_V12_NLXH_2026",
  "topic_title": "Nghị luận xã hội: Ý chí và lòng kiên định của giới trẻ",
  "grade_level": 12,
  "max_score": 10.0,
  "criteria": [
    {
      "criterion_id": "C1_STRUCTURE",
      "name": "Bố cục & Cấu trúc lập luận",
      "weight": 2.0,
      "levels": [
        {
          "score": 2.0,
          "descriptor": "Đủ 3 phần Mở - Thân - Kết; luận điểm phân tách rõ ràng, logic."
        },
        {
          "score": 1.0,
          "descriptor": "Có bố cục nhưng chuyển ý còn rời rạc, thiếu kết bài trọn vẹn."
        },
        {
          "score": 0.0,
          "descriptor": "Không rõ cấu trúc đoạn/bài, lộn xộn."
        }
      ]
    },
    {
      "criterion_id": "C2_ARGUMENT",
      "name": "Luận điểm & Dẫn chứng thực tế",
      "weight": 4.0,
      "required_elements": [
        "Giải thích khái niệm",
        "Bình luận/chứng minh có ít nhất 01 dẫn chứng thực tế xác thực",
        "Phản đề/Mở rộng vấn đề",
        "Bài học nhận thức và hành động"
      ]
    },
    {
      "criterion_id": "C3_EXPRESSION",
      "name": "Diễn đạt, Chính tả & Ngữ pháp",
      "weight": 2.0,
      "penalty_per_error": 0.25
    },
    {
      "criterion_id": "C4_CREATIVITY",
      "name": "Tính sáng tạo & Cảm xúc cá nhân",
      "weight": 2.0,
      "anti_patterns": ["văn mẫu sáo rỗng", "suy nghĩ rập khuôn"]
    }
  ]
}
```

Quy tắc dữ liệu đề xuất:

- `rubric_id` định danh rubric; `criterion_id` không trùng trong cùng rubric.
- `grade_level` biểu thị khối học THPT, dự kiến thuộc 10, 11 hoặc 12.
- `max_score` phải lớn hơn 0; `weight` không âm.
- Điểm trong `levels` không vượt `weight` của tiêu chí.
- `levels`, `required_elements`, `penalty_per_error` và `anti_patterns` được sử dụng tùy tiêu chí.
- Định dạng metadata của chunk, quan hệ giữa mã đề và rubric, cùng cơ chế phiên bản rubric cần xác định tại TBD-02.

### 7.2. Grading Result Schema

```json
{
  "submission_id": "SUB_20261012_001",
  "student_id": "HS_ANONYMOUS_48",
  "transcription": "Cuộc sống không bao giờ là một đường thẳng bằng phẳng...",
  "ocr_confidence": 0.94,
  "scoring_summary": {
    "total_score": 7.5,
    "max_score": 10.0,
    "grade_level": "Khá"
  },
  "detailed_evaluations": [
    {
      "criterion_id": "C1_STRUCTURE",
      "awarded_score": 2.0,
      "max_score": 2.0,
      "comment": "Bố cục rõ ràng 3 phần, mở bài trực tiếp, kết bài có đúc kết."
    },
    {
      "criterion_id": "C2_ARGUMENT",
      "awarded_score": 3.0,
      "max_score": 4.0,
      "strengths": ["Giải thích chính xác khái niệm lòng kiên định."],
      "weaknesses": ["Dẫn chứng còn quen thuộc, chưa làm rõ mối liên hệ với luận điểm."],
      "missing_elements": ["Chưa phân tích hiện tượng dễ bỏ cuộc của một bộ phận người trẻ."]
    },
    {
      "criterion_id": "C3_EXPRESSION",
      "awarded_score": 1.25,
      "max_score": 2.0,
      "syntax_errors": [
        {
          "line_ref": 14,
          "quote": "Mặc dù khó khăn nhưng mà nó vẫn...",
          "issue": "Diễn đạt rườm rà; cần rà soát chủ thể và cấu trúc câu đầy đủ."
        }
      ],
      "spelling_errors": [
        {
          "line_ref": 22,
          "wrong": "chải nghiệm",
          "corrected": "trải nghiệm"
        }
      ]
    },
    {
      "criterion_id": "C4_CREATIVITY",
      "awarded_score": 1.25,
      "max_score": 2.0,
      "comment": "Có suy nghĩ độc lập ở đoạn liên hệ bản thân nhưng hành văn còn an toàn."
    }
  ],
  "pedagogical_suggestions": [
    "Lựa chọn dẫn chứng thực tế có thể kiểm chứng và phân tích rõ liên hệ với luận điểm.",
    "Viết lại câu số 14 theo hướng tinh gọn mệnh đề trạng ngữ."
  ]
}
```

Lưu ý chuẩn hóa:

- `student_id` trong dữ liệu gửi dịch vụ bên ngoài phải là mã ẩn danh, không chứa định danh trực tiếp.
- `ocr_confidence` nằm trong khoảng `[0, 1]`; mẫu nguồn chỉ có độ tin cậy toàn bài. Schema độ tin cậy từng đoạn theo FR-14 cần bổ sung tại TBD-04.
- Thiết kế Gemini đề xuất confidence nullable kèm nguồn và `needsReview`; self-confidence của model chưa là xác suất OCR đúng đã hiệu chuẩn. Giá trị `0.94` trong ví dụ không phải kết quả kiểm thử. Contract thực thi và điều kiện review cần hoàn thiện theo TBD-04/TBD-10.
- `scoring_summary.grade_level` là nhãn xếp loại, khác với khối học trong Rubric Schema; có thể đổi thành `performance_level` khi chốt hợp đồng API.
- `line_ref` tham chiếu dòng của bản chép được đánh số ổn định; quy ước dòng và liên kết về trang ảnh cần chốt tại TBD-04.
- Các nhận xét và lỗi trong ví dụ chỉ minh họa cấu trúc; `transcription` được rút gọn, không phải một bài làm hoàn chỉnh để kiểm chứng kết quả chấm.
- Ví dụ lỗi chính tả đã được chuẩn hóa để giá trị `wrong` và `corrected` thể hiện hai cách viết khác nhau.

### 7.3. Teacher Class Analytics Schema

```json
{
  "class_id": "12A1",
  "assignment_id": "ASSIGN_NLXH_01",
  "total_submissions": 42,
  "cohort_metrics": {
    "average_score": 6.85,
    "score_distribution": {
      "gioi_8_to_10": 8,
      "kha_6.5_to_7.9": 22,
      "trung_binh_5_to_6.4": 11,
      "yeu_under_5": 1
    }
  },
  "top_common_issues": [
    {
      "issue_type": "ARGUMENT_GAP",
      "description": "Khoảng 64% học sinh bỏ qua thao tác phản đề.",
      "impact": "Mất điểm ở tiêu chí C2"
    },
    {
      "issue_type": "SYNTAX_ERROR",
      "description": "Khoảng 38% học sinh mắc lỗi câu ghép thiếu thành phần chính.",
      "impact": "Mất điểm ở tiêu chí C3"
    }
  ],
  "actionable_teaching_recommendations": [
    "Dành 15 phút đầu tiết học tiếp theo cho bài tập nhóm: Tìm và phân tích 3 trường hợp phản đề cho đề tài kiên định.",
    "Giao bài tập viết ngắn: Viết lại 01 câu phức chứa mệnh đề nhượng bộ không bị lỗi cấu trúc."
  ]
}
```

Quy tắc tổng hợp đề xuất:

- Các số liệu được tính trên cùng tập bài đã chấm thành công của lớp/bài tập; cách xử lý bài nộp lại cần chốt tại TBD-07.
- Tổng số bài trong các nhóm điểm phải bằng số bài thuộc tập tổng hợp.
- Điểm trung bình tính từ điểm tổng của các bài trong tập tổng hợp; không chia cho 0 khi chưa có bài hợp lệ.
- Các ngưỡng trong ví dụ là cách phân nhóm minh họa, chưa được xác định là quy tắc xếp loại chính thức.
- Nếu giữ cách phân nhóm này, sử dụng các khoảng liên tục: `[8, 10]`, `[6.5, 8)`, `[5, 6.5)`, `[0, 5)`; tránh bỏ sót các điểm như 7.95 hoặc 6.45.
- Schema hiện tại minh họa báo cáo lớp; schema tổng hợp khối, heatmap và chỉ số chênh lệch mục tiêu cần bổ sung.

## 8. Yêu cầu phi chức năng và bảo mật

| Mã | Nhóm | Yêu cầu | Cách kiểm chứng |
| --- | --- | --- | --- |
| NFR-01 | Quyền riêng tư | Cắt bỏ hoặc che vùng họ tên, lớp, trường, số báo danh trước khi gửi ảnh tới API Vision bên ngoài. | Kiểm tra ảnh tại điểm gửi ra ngoài; không còn các vùng định danh nêu trên. |
| NFR-02 | Lưu trữ | Không lưu vĩnh viễn ảnh bài làm chứa định danh học sinh trên máy chủ công cộng. | Kiểm tra vị trí lưu, thời hạn lưu và cơ chế xóa sau khi chính sách được chốt. |
| NFR-03 | Hiệu năng chatbot | TTFT của phân hệ 2 không quá 1.2 giây. | Đo từ thời điểm gửi yêu cầu đến token đầu tiên trong môi trường kiểm thử thống nhất. |
| NFR-04 | Hiệu năng chấm bài | Hoàn tất OCR và xuất báo cáo không quá 20 giây cho bài thi 2 trang giấy. | Đo thời gian xử lý đầu cuối trên bộ ảnh hai trang theo điều kiện thống nhất. |
| NFR-05 | Đầu ra có cấu trúc | Mọi phản hồi JSON từ agent phải qua Structured Outputs và kiểm tra JSON Schema hoặc Pydantic trước khi dùng ở bước tiếp theo. | Đầu ra sai schema không được chuyển trực tiếp tới giao diện hoặc pipeline tổng hợp. |

Các mục tiêu thời gian giữ nguyên từ nguồn; kích thước ảnh, tải đồng thời, điều kiện mạng và tỷ lệ yêu cầu cần đạt chưa được xác định. Chính sách lưu ảnh và xử lý khi không xác định được vùng PII cũng cần chốt trước nghiệm thu.

## 9. Tình huống ngoại lệ cần xử lý

Đây là các yêu cầu xử lý ngoại lệ đề xuất để hoàn thiện luồng; chính sách chi tiết cần được xác định khi triển khai.

| Tình huống | Hành vi đề xuất |
| --- | --- |
| Tài liệu không thuộc định dạng hỗ trợ hoặc không đọc được | Thông báo lỗi nhập tài liệu và cho phép cung cấp lại dữ liệu. |
| Không tìm thấy mã đề hoặc thiếu rubric | Thông báo thiếu dữ liệu, chưa khởi tạo hướng dẫn/chấm cho đề đó. |
| Bài nộp không nằm trong giới hạn 1–4 ảnh | Thông báo giới hạn và yêu cầu điều chỉnh số ảnh. |
| Ảnh mờ, thiếu trang hoặc OCR có độ tin cậy thấp | Đánh dấu phần cần kiểm tra; quy trình chụp lại hoặc xác nhận bản chép tại TBD-04. |
| Không xác định chắc chắn vùng thông tin cá nhân | Chặn gửi ảnh ra ngoài cho đến khi đáp ứng quy tắc ẩn danh hóa; quy trình xử lý tại TBD-06. |
| Dịch vụ AI/OCR hết thời gian hoặc lỗi | Trả trạng thái lỗi có thể xử lý; chính sách thử lại và giới hạn thời gian tại TBD-09. |
| Kết quả JSON sai schema hoặc điểm không nhất quán | Không công bố kết quả như một báo cáo hợp lệ; chính sách xử lý lại tại TBD-09. |
| Chưa có bài chấm thành công | Hiển thị trạng thái chưa có dữ liệu và không tạo thống kê điểm giả định. |

## 10. Tiêu chí nghiệm thu và truy vết

| Mã | Yêu cầu liên quan | Tiêu chí nghiệm thu |
| --- | --- | --- |
| AC-01 | FR-01–FR-05 | Với mỗi định dạng được hỗ trợ và biểu mẫu trực tiếp, hệ thống tách được ngữ liệu/đề/barem, tạo rubric hợp lệ và cung cấp đúng ngữ cảnh theo mã đề. |
| AC-02 | FR-06–FR-09 | Một phiên hướng dẫn đi qua các trạng thái khởi tạo, xác định vấn đề, lập dàn ý và rà soát; đầu ra gắn với đề và rubric đã chọn. |
| AC-03 | FR-10, BR-01–BR-04 | Trên bộ tình huống yêu cầu viết hộ/bài mẫu, chatbot từ chối và hỏi gợi mở; không tạo đoạn mẫu, không vượt 4 câu, kết thúc bằng một câu hỏi. Bộ tình huống phải thống nhất trước kiểm thử. |
| AC-04 | FR-11–FR-14 | Một bài nộp từ 1 đến 4 ảnh đi qua xử lý ảnh và OCR, tạo bản chép cùng độ tin cậy từng đoạn sau khi schema đoạn được chốt. |
| AC-05 | FR-15–FR-17, BR-05–BR-08 | Báo cáo có điểm tổng, đánh giá từng tiêu chí và gợi ý cải thiện; mọi tiêu chí khớp rubric, điểm nằm trong giới hạn và tổng điểm nhất quán. |
| AC-06 | FR-18, FR-19 | Với tập bài đã chấm được kiểm soát, số bài, điểm trung bình, phân bố và tần suất lỗi khớp dữ liệu nguồn. |
| AC-07 | FR-20, FR-21 | Khi có mục tiêu giáo án và dữ liệu đánh giá tương ứng, báo cáo chỉ ra chênh lệch và đề xuất hành động liên quan đến các vấn đề phát hiện được. Cách đo cần chốt tại TBD-07. |
| AC-08 | NFR-01, NFR-02 | Ảnh gửi API bên ngoài đã xử lý vùng định danh; việc lưu/xóa tuân thủ chính sách lưu trữ được thống nhất. |
| AC-09 | NFR-03, NFR-04 | TTFT không quá 1.2 giây và xử lý bài hai trang không quá 20 giây theo điều kiện kiểm thử hiệu năng được chốt tại TBD-08. |
| AC-10 | NFR-05 | Dữ liệu JSON sai schema không đi vào giao diện hoặc bước tổng hợp như dữ liệu hợp lệ. |

Tiêu chí cấu trúc và nhất quán dữ liệu không thay thế đánh giá chất lượng OCR hoặc độ phù hợp của điểm AI với đánh giá giáo viên. Các ngưỡng chất lượng đó cần xác định tại TBD-10.

## 11. Nội dung cần xác định thêm

| Mã | Nội dung |
| --- | --- |
| TBD-01 | Cơ chế đăng nhập, phân quyền giáo viên/học sinh, quản lý lớp, và giới hạn truy cập dữ liệu giữa các lớp. |
| TBD-02 | Định danh đề/bài tập, quan hệ với rubric và học liệu; metadata chunk; phiên bản rubric và cách giữ phiên bản đã dùng khi chấm. |
| TBD-03 | Điều kiện dàn ý đạt yêu cầu, việc nộp bài khi chưa hoàn tất hướng dẫn, quay lại trạng thái trước và lưu/khôi phục phiên chat. |
| TBD-04 | Định dạng/kích thước ảnh, thứ tự trang; schema đoạn OCR, cách tính confidence, ngưỡng cần kiểm tra, quy trình xác nhận/sửa bản chép và quy ước tham chiếu dòng. |
| TBD-05 | Quy tắc đếm lỗi, làm tròn điểm, mức điểm cho tiêu chí không có `levels`, ngưỡng xếp loại và quyền giáo viên rà soát/điều chỉnh kết quả. |
| TBD-06 | Thời hạn lưu ảnh gốc và bản đã ẩn danh, vị trí lưu, quyền truy cập, cơ chế xóa; xử lý PII trong nội dung bản chép và trường hợp che định danh không thành công. |
| TBD-07 | Đủ 4 nhóm lỗi heatmap; ánh xạ lỗi sang rubric, định dạng mục tiêu giáo án, cách tính chênh lệch, tập bài hợp lệ, bài nộp lại và tổng hợp khối. |
| TBD-08 | Môi trường và cách đo hiệu năng: tải đồng thời, kích thước ảnh, dịch vụ AI, mạng, thời điểm bắt đầu đo và tỷ lệ yêu cầu cần đạt mục tiêu. |
| TBD-09 | Chính sách timeout/thử lại, giới hạn chi phí gọi API và xử lý dữ liệu sai schema hoặc kết quả chưa hoàn tất. |
| TBD-10 | Bộ dữ liệu kiểm thử tiếng Việt, chỉ số/ngưỡng chất lượng OCR và mức độ đồng thuận điểm giữa AI với giáo viên. |
| TBD-11 | Đã có thiết kế stack trong ADR-0001 và model người dùng chọn là Gemini 2.5 Flash; còn khóa runtime/dependencies, xác nhận quyền model và cấp môi trường triển khai trước thực thi. |

## 12. Lịch sử phiên bản

| Phiên bản | Ngày | Thay đổi |
| --- | --- | --- |
| 1.0 | 11/10/2026 | Chuyển nội dung yêu cầu được cung cấp thành SRS; bổ sung mã yêu cầu, tiêu chí nghiệm thu, quy tắc chuẩn hóa đề xuất và danh sách nội dung cần xác định. |
| 1.1 | 12/10/2026 | Ghi lựa chọn Gemini 2.5 Flash và liên kết kiến trúc/stack MVP; phân biệt confidence minh họa với độ đúng đã đo. Giữ FR/BR/NFR và các policy còn mở. |
