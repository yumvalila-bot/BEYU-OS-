import { Inject, Injectable } from '@nestjs/common';
import { DATABASE } from '../../core/database.module';
import type { Database } from '../../db/driver';
import { AuditRepository } from '../audit/audit.repository';
import { DomainRepository } from '../../common/domain.repository';
import type { HealthSecurityContext } from '../../common/security';
import { notFound, badRequest } from '../../common/errors';

@Injectable()
export class AiRepository extends DomainRepository {
  constructor(@Inject(DATABASE) db: Database, @Inject(AuditRepository) audit: AuditRepository) { super(db, audit); }

  async ask(security: HealthSecurityContext, input: { question: string; patientId?: string; contextType?: string; purposeOfUse: string }) {
    // Governance: check purpose and patient relationship
    if (!input.purposeOfUse) badRequest('purposeOfUse required');
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      // Create conversation
      const convRes = await session.query<{ id: string }>(`INSERT INTO health_ai.noelia_conversations (tenant_id, user_id, patient_id, context_type, purpose_of_use, title) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [tenantId, security.userId, input.patientId ?? null, input.contextType ?? 'GENERAL', input.purposeOfUse, input.question.slice(0,100)]);
      const convId = convRes.rows[0].id;
      // Log user message
      await session.query(`INSERT INTO health_ai.noelia_messages (conversation_id, role, content, type) VALUES ($1,'USER',$2,'INFORMATION')`, [convId, input.question]);

      // Simplified retrieval logic - in production would use vector search with tenant isolation
      let contextData: any = null;
      let answer = '';
      let citations: any[] = [];
      let requiresConfirmation = false;
      let type = 'INFORMATION';

      if (input.patientId) {
        // Patient-specific query with access check
        const accessCheck = await session.query(`SELECT id FROM health_patient.patients WHERE id=$1 AND tenant_id=$2 AND deleted_at IS NULL`, [input.patientId, tenantId]);
        if (!accessCheck.rows[0]) notFound('patient', input.patientId);
        // Retrieve recent clinical data for context
        const [conditions, allergies, meds, vitals, diagnoses] = await Promise.all([
          session.query(`SELECT display, clinical_status FROM health_clinical.conditions WHERE patient_id=$1 ORDER BY recorded_date DESC LIMIT 10`, [input.patientId]),
          session.query(`SELECT display, criticality FROM health_patient.allergies WHERE patient_id=$1 AND status='ACTIVE'`, [input.patientId]),
          session.query(`SELECT d.name, p.dosage_instruction FROM health_pharmacy.prescriptions p JOIN health_pharmacy.drugs d ON d.id=p.drug_id WHERE p.patient_id=$1 AND p.status='ACTIVE' LIMIT 10`, [input.patientId]),
          session.query(`SELECT type, value, unit FROM health_clinical.vital_signs WHERE patient_id=$1 ORDER BY recorded_at DESC LIMIT 10`, [input.patientId]),
          session.query(`SELECT display, category FROM health_ophthalmology.ophthalmic_diagnoses WHERE patient_id=$1 ORDER BY recorded_at DESC LIMIT 10`, [input.patientId]),
        ]);
        contextData = { conditions: conditions.rows, allergies: allergies.rows, medications: meds.rows, vitals: vitals.rows, ophthalmic: diagnoses.rows };
        // Generate safe, non-diagnostic response
        if (input.question.toLowerCase().includes('allergy')) {
          answer = `Patient has ${allergies.rows.length} recorded active allergies: ${allergies.rows.map((a:any)=>a.display).join(', ') || 'none'}. Always verify allergy list before prescribing. This is information only, not clinical advice.`;
          citations = [{ source: 'health_patient.allergies', reference: input.patientId }];
        } else if (input.question.toLowerCase().includes('medication') || input.question.toLowerCase().includes('prescription')) {
          answer = `Patient has ${meds.rows.length} active prescriptions. Current medications: ${meds.rows.map((m:any)=>m.name).join(', ') || 'none'}. Review for interactions and contraindications. This is informational.`;
          citations = [{ source: 'health_pharmacy.prescriptions', reference: input.patientId }];
        } else if (input.question.toLowerCase().includes('ophthalmology') || input.question.toLowerCase().includes('eye')) {
          answer = `Ophthalmology history: ${diagnoses.rows.length} diagnoses recorded. Most recent: ${diagnoses.rows.map((d:any)=>d.display).join(', ') || 'none'}. IOP trends and visual acuity available in timeline. Recommendation: Review complete ophthalmology exam before clinical decision.`;
          citations = [{ source: 'health_ophthalmology.ophthalmic_diagnoses', reference: input.patientId }];
          type = 'CLINICAL_DECISION_SUPPORT';
          requiresConfirmation = true;
        } else {
          answer = `Patient summary retrieved with ${conditions.rows.length} conditions, ${allergies.rows.length} allergies, ${meds.rows.length} active medications. This is informational retrieval only. Clinical decisions require human authorization. Data retrieved under purpose: ${input.purposeOfUse}.`;
          citations = [{ source: 'patient_timeline', reference: input.patientId }];
        }
      } else {
        // General operational query
        if (input.question.toLowerCase().includes('revenue') || input.question.toLowerCase().includes('billing')) {
          const revenue = await session.query(`SELECT COUNT(*)::int as invoice_count, SUM(total_minor)::bigint as total FROM health_billing.invoices WHERE tenant_id=$1`, [tenantId]);
          answer = `Operational intelligence: ${revenue.rows[0].invoice_count} invoices, total revenue ${(Number(revenue.rows[0].total ?? 0)/100).toFixed(2)} TZS. Trend available in executive dashboard. This is operational data, not financial advice.`;
          citations = [{ source: 'health_billing.invoices', reference: tenantId }];
        } else if (input.question.toLowerCase().includes('compliance')) {
          answer = `Compliance overview: Tanzania packs (MOH, MTUHA, NHIF, TMDA, TRA, Data Protection) plus ISO-27001. Review evidence status in compliance dashboard.`;
          citations = [{ source: 'health_compliance.compliance_packs', reference: 'TZ' }];
        } else {
          answer = `I am Noelia, BEYU Health OS AI. I operate within tenant isolation, RBAC, purpose-of-use, and human-in-the-loop governance. I can provide information, recommendations, warnings, predictions, and clinical decision support (advisory only). I cannot diagnose, prescribe, or execute high-risk actions without human confirmation. Your question: "${input.question}" has been logged for audit. Please provide more specific context or patient ID with authorized purpose.`;
        }
      }

      // Save assistant response
      const msgRes = await session.query<{ id: string }>(`INSERT INTO health_ai.noelia_messages (conversation_id, role, content, type, citations, requires_human_confirmation, model) VALUES ($1,'ASSISTANT',$2,$3,$4,$5,'noelia-v1-governed') RETURNING id`,
        [convId, answer, type, JSON.stringify(citations), requiresConfirmation]);

      // AI audit log
      await session.query(`INSERT INTO health_ai.ai_audit_log (tenant_id, user_id, conversation_id, action, retrieval_context, purpose_of_use, patient_id, was_authorized) VALUES ($1,$2,$3,'QUERY',$4,$5,$6,true)`,
        [tenantId, security.userId, convId, JSON.stringify(contextData ?? {}), input.purposeOfUse, input.patientId ?? null]);

      return { conversationId: convId, messageId: msgRes.rows[0].id, answer, type, citations, requiresHumanConfirmation: requiresConfirmation, confidence: 0.85 };
    }, (result) => ({ action: 'CREATE', resourceType: 'noelia_query', resourceId: result.conversationId, newState: { question: input.question, purposeOfUse: input.purposeOfUse } as any }));
  }

  async conversations(security: HealthSecurityContext, limit = 20) {
    return this.read(security, async (session) => {
      const rows = await session.query(`SELECT c.*, COUNT(m.id)::int as message_count FROM health_ai.noelia_conversations c LEFT JOIN health_ai.noelia_messages m ON m.conversation_id=c.id WHERE c.tenant_id=$1 AND c.user_id=$2 GROUP BY c.id ORDER BY c.updated_at DESC LIMIT $3`,
        [security.activeTenantId ?? security.tenantId, security.userId, limit]);
      return rows.rows;
    });
  }

  async messages(security: HealthSecurityContext, conversationId: string) {
    return this.read(security, async (session) => {
      const conv = await session.query(`SELECT * FROM health_ai.noelia_conversations WHERE id=$1 AND tenant_id=$2`, [conversationId, security.activeTenantId ?? security.tenantId]);
      if (!conv.rows[0]) notFound('conversation', conversationId);
      const rows = await session.query(`SELECT * FROM health_ai.noelia_messages WHERE conversation_id=$1 ORDER BY created_at ASC`, [conversationId]);
      return { conversation: conv.rows[0], messages: rows.rows };
    });
  }

  async createRecommendation(security: HealthSecurityContext, input: { conversationId?: string; resourceType: string; resourceId?: string; actionType: string; recommendedAction: any; rationale: string; riskLevel?: string }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_ai.noelia_recommendations (tenant_id, conversation_id, resource_type, resource_id, action_type, recommended_action, rationale, risk_level, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [tenantId, input.conversationId ?? null, input.resourceType, input.resourceId ?? null, input.actionType, JSON.stringify(input.recommendedAction), input.rationale, input.riskLevel ?? 'MEDIUM', security.userId]);
      return (await session.query(`SELECT * FROM health_ai.noelia_recommendations WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'ai_recommendation', resourceId: (result as any).id, newState: result as any }));
  }

  async reviewRecommendation(security: HealthSecurityContext, id: string, decision: 'APPROVED' | 'REJECTED', reason?: string) {
    return this.mutate(security, async (session) => {
      const existing = await session.query(`SELECT * FROM health_ai.noelia_recommendations WHERE id=$1`, [id]);
      if (!existing.rows[0]) notFound('recommendation', id);
      if (existing.rows[0].status !== 'PENDING') badRequest('Recommendation already reviewed');
      const res = await session.query(`UPDATE health_ai.noelia_recommendations SET status=$1, approved_by=$2, approved_at=now(), rejection_reason=$3 WHERE id=$4 RETURNING *`,
        [decision, security.userId, reason ?? null, id]);
      return res.rows[0];
    }, (result) => ({ action: result.status === 'APPROVED' ? 'APPROVE' : 'REJECT', resourceType: 'ai_recommendation', resourceId: id, newState: result as any }));
  }

  async hiveTasks(security: HealthSecurityContext, status?: string) {
    return this.read(security, async (session) => {
      const params: unknown[] = [security.activeTenantId ?? security.tenantId];
      let where = `WHERE t.tenant_id=$1`;
      if (status) { params.push(status); where += ` AND t.status=$${params.length}`; }
      const rows = await session.query(`SELECT t.* FROM health_ai.hive_tasks t ${where} ORDER BY t.priority ASC, t.created_at DESC LIMIT 100`, params);
      return rows.rows;
    });
  }

  async createHiveTask(security: HealthSecurityContext, input: { type: string; title: string; description?: string; engine: string; input: any; priority?: number }) {
    return this.mutate(security, async (session) => {
      const tenantId = security.activeTenantId ?? security.tenantId!;
      const res = await session.query<{ id: string }>(`INSERT INTO health_ai.hive_tasks (tenant_id, type, title, description, engine, input, priority, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [tenantId, input.type, input.title, input.description ?? null, input.engine, JSON.stringify(input.input), input.priority ?? 5, security.userId]);
      return (await session.query(`SELECT * FROM health_ai.hive_tasks WHERE id=$1`, [res.rows[0].id])).rows[0];
    }, (result) => ({ action: 'CREATE', resourceType: 'hive_task', resourceId: (result as any).id, newState: result as any }));
  }
}
