# ADR-0003: Socratic AI trên Python với LangGraph

**Ngày:** 2026-10-18
**Trạng thái:** Được chấp nhận

## Bối cảnh

Nhánh `feat/ai-langchain` triển khai Socratic Writing Scaffold Agent (FR-06 đến FR-10) trên Python backend hiện có. Quyết định kiến trúc này ghi nhận phương án triển khai và các nền tảng đã được bổ sung.

## Quyết định

### 1. Ngôn ngữ: Python 3.12

Python được chọn để tận dụng LangChain/LangGraph và các thư viện AI phong phú. Backend hiện tại đã có foundation Python với FastAPI, SQLAlchemy async, và Alembic.

### 2. AI Orchestration: LangGraph

[LangGraph](https://langchain-ai.github.io/langgraph/) được dùng để điều phối workflow Socratic:

- **Pre-guardrail**: Phát hiện yêu cầu viết hộ, bypass model trả fallback
- **Call model**: Structured output với rubric và context
- **Post-guardrail**: Kiểm tra 4 câu, kết thúc bằng câu hỏi, source references

### 3. AI Provider: cấu hình `AI_PROVIDER` / `AI_MODEL`

Provider và model đọc từ Settings. OpenAI dùng Responses API (`responses.parse`, `text_format`) của SDK bị khóa trong `uv.lock`. Retry hạ tầng do SDK. Gemini REST vẫn có adapter. `fake` chỉ dùng cho test.

### 4. Database: PostgreSQL với SQLAlchemy 2 async

Tiếp tục sử dụng PostgreSQL hiện có với SQLAlchemy 2 async. Các bảng mới:

- `assignment_revisions` — Đề bài và ngữ cảnh
- `socratic_sessions` — Session FSM state
- `chat_messages` — Message history
- `outline_revisions` — Immutable outline revisions
- `idempotency_records` — Idempotency tracking

### 5. Prompt Management

Prompts được lưu tại `prompts/socratic/` với version tracking. Assets được đóng gói khi build, không phụ thuộc cwd.

## Nền tảng được thêm

### Models (backend/app/db/models/)

- `SocraticSession` với FSM state: INIT → THESIS → OUTLINE → REVIEW
- `ChatMessage` với validation status
- `OutlineRevision` (immutable, tạo revision mới khi sửa)
- `IdempotencyRecord` cho safe replay

### AI Layer (backend/app/ai/)

- `adapters.py` với interface `AiPort` và implementations:
  - `OpenAiAdapter` — Responses API + structured parse
  - `GeminiAdapter` — Google Gemini REST API
  - `FakeAiAdapter` — Testing adapter
- `prompt_assets.py` — nạp `prompts/socratic` đã đóng gói theo `SOCRATIC_PROMPT_VERSION`
- `schemas.py` — `SourceReference`, `SocraticOutput`

### Workflows (backend/app/workflows/)

- `guardrails.py` — Pre/post validation theo BR-01 đến BR-04
- `socratic_graph.py` — LangGraph StateGraph workflow

### Services (backend/app/services/)

- `socratic_service.py` — Business logic cho sessions, turns, outlines

### API (backend/app/api/routers/)

- `socratic.py` — REST endpoints với idempotency và concurrency control

### Authorization

- `assignment_access` là quan hệ phân công tối thiểu. Mã đề chỉ tra cứu.
- DRAFT: học sinh không thấy. CLOSED: không tạo session/không mutation. Thu hồi grant có hiệu lực với session đã có.

### Idempotency và reservation

- Reservation token + `reservation_expires_at` (không dùng `updated_at` làm lease).
- Commit reservation trước khi gọi AI; không giữ transaction khi chờ provider.
- Finalize atomic theo token. Worker cũ không ghi đè khi token đã bị giành.

## Hạn chế

Các giới hạn dưới đây ghi tại thời điểm ADR (2026-10-18). Rà lại 2026-10-28: OCR, chấm, quản lý lớp và hồ sơ viết đã có bản Python; xem [ADR-0004](0004-python-monolith.md) và [roadmap](../../development/implementation-roadmap.md). Guardrail heuristic và việc chưa có streaming/SSE vẫn áp dụng.

- OCR và Assessment chưa được triển khai
- Guardrail viết hộ là heuristic (câu hỏi gợi mở vs đoạn văn mẫu); không bảo đảm tuyệt đối
- Streaming/SSE chưa được hỗ trợ
- Classroom CRUD đầy đủ nằm ngoài phạm vi Socratic MVP

## References

- [SRS.md](../../../SRS.md) — Yêu cầu chức năng FR-06 đến FR-10
- [gemini-pipeline.md](../gemini-pipeline.md) — AI pipeline design
- [data-model.md](../data-model.md) — Data model specifications
