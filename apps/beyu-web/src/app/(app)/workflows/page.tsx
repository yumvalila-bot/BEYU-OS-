import type { Metadata } from 'next';

import { NotBuilt } from '@/components/primitives';

export const metadata: Metadata = { title: 'Workflows' };

export default function WorkflowsPage() {
  return (
    <NotBuilt
      title="Workflows"
      summary="Approval workflows and task routing."
      backend="DEFERRED"
      planned={[
            'Workflow definitions with typed steps and role-based routing',
            'Running instances with current state and history',
            'Escalation and reassignment',
            'Every approval recorded in the audit trail as a human act',
      ]}
    />
  );
}
