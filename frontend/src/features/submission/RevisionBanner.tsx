import DeadlineNotice from '../assignments/DeadlineNotice';
import { roundLabel, revisionDeadlineFields } from '../assessment/revision';
import type { SubmissionPayload } from './types';

const REVISION_CLOSED = 'Đã hết hạn viết lại. Em hãy liên hệ giáo viên nếu cần thêm thời gian.';

/** Shows the writing round. Rewrite rounds borrow the deadline notice, but the date is revisionDueAt. */
export default function RevisionBanner({ payload }: { payload: SubmissionPayload }) {
  const round = payload.revisionRound ?? 1;
  const rewrite = round > 1;
  return <div className="space-y-2">
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-3 text-sm space-y-1">
      <p className="font-semibold">{roundLabel(round)}</p>
      {rewrite && <p>Điểm bản trước vẫn giữ cho tới khi bản mới được công bố.</p>}
    </div>
    <DeadlineNotice fields={rewrite ? revisionDeadlineFields(payload) : payload} title={rewrite ? 'Hạn viết lại' : undefined} closedMessage={rewrite ? REVISION_CLOSED : undefined} />
  </div>;
}
