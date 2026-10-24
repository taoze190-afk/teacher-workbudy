'use client';

import type { ImportType } from '@/lib/importer';
import ImportFlow from '@/components/ImportFlow';
import { Modal } from '@/components/ui';

export default function ImportDialog({
  open,
  onClose,
  type,
  initialExamId,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  type: ImportType;
  initialExamId?: string;
  onImported?: () => void;
}) {
  return (
    <Modal
      open={open}
      title={type === 'students' ? '导入学生名单' : '导入成绩'}
      onClose={onClose}
      wide
    >
      <ImportFlow type={type} initialExamId={initialExamId} onDone={onImported} />
    </Modal>
  );
}
