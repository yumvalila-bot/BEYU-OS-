/**
 * Noelia persistence and governance (spec §41, §54-§60).
 *
 * The single rule this file exists to enforce: NOELIA PROPOSES, A HUMAN
 * DISPOSES. Every path through here either performs a read the principal
 * could already have performed themselves, or it records a recommendation
 * that does nothing until a named person accepts it.
 *
 * Note what is absent. There is no method that applies a recommendation.
 * Accepting one records agreement and returns the proposed action; enacting it
 * means calling the owning domain endpoint, as that human, under their own
 * authorization and their own audit record. Wiring acceptance directly to
 * execution would collapse the separation the whole design rests on, and it
 * would do so in a way that is easy to miss in review — so the capability
 * simply does not exist here.
 */

import {
  AiActionVerdict,
  governAiAction,
  minimizeForAi,
  type AiActionGovernanceResult,
} from '@beyu/auth';
import {
  Action,
  DataClassification,
  ResourceType,
  type SecurityContext,
} from '@beyu/types';

import { invalidRequest, notFound } from '../../common/errors';
import { resolveLimit, resolveOffset, type Page } from '../../common/pagination';
import { DomainRepository } from '../../common/domain.repository';
import type { Database, DatabaseSession } from '../../db/driver';
import type { AuditRepository } from '../audit/audit.repository';
import type { GroundingFact, NoeliaProvider } from './noelia.provider';

export interface NoeliaAgent {
  id: string;
  code: string;
  name: string;
  system: 'NOELIA' | 'HIVE';
  role: string;
  description: string | null;
  allowedScopes: string[];
  maxClassification: string;
  enabled: boolean;
}

export interface NoeliaConversation {
  id: string;
  agentId: string | null;
  agentCode: string | null;
  userId: string;
  tenantId: string | null;
  title: string | null;
  startedAt: string;
  lastMessageAt: string | null;
  messageCount: number;
}

export interface NoeliaMessage {
  id: string;
  conversationId: string;
  role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
  content: string;
  contextRefs: unknown[];
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  createdAt: string;
}

export interface NoeliaRecommendation {
  id: string;
  agentId: string | null;
  conversationId: string | null;
  category: string;
  title: string;
  rationale: string;
  proposedAction: Record<string, unknown>;
  resourceType: string | null;
  resourceId: string | null;
  confidenceBps: number | null;
  impact: string | null;
  status: string;
  governanceVerdict: string | null;
  approverRoles: string[];
  reviewedBy: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  reviewNotes: string | null;
  createdAt: string;
}

export interface NoeliaActionLogEntry {
  id: string;
  agentId: string | null;
  onBehalfOf: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  decision: 'PERMITTED' | 'REQUIRES_HUMAN_APPROVAL' | 'DENIED';
  reason: string;
  downgradedToRecommendation: boolean;
  occurredAt: string;
}

export interface AskResult {
  conversationId: string;
  question: NoeliaMessage;
  answer: NoeliaMessage;
  citations: GroundingFact[];
  /** True when the provider had nothing in scope to ground an answer in. */
  ungrounded: boolean;
  /** Which provider answered. 'stub-deterministic' means no model was called. */
  model: string;
}

export interface ProposeResult {
  verdict: AiActionVerdict;
  reason: string;
  downgradedToRecommendation: boolean;
  approverRolesRequired: string[];
  /** Present when the proposal was recorded for human review. */
  recommendation: NoeliaRecommendation | null;
}

/** Categories a recommendation may carry, mirroring the CHECK in 0005. */
export const RECOMMENDATION_CATEGORIES = [
  'STRATEGY', 'RISK', 'COMPLIANCE', 'CAPITAL',
  'WATERFALL', 'GOVERNANCE', 'ORGANIZATION', 'OTHER',
] as const;
export type RecommendationCategory = (typeof RECOMMENDATION_CATEGORIES)[number];

/**
 * Maps a recommendation category onto the resource whose authorization governs
 * it. A proposal to change capital allocation is judged as a capital mutation,
 * not as "an AI chat message" — the governance question is about the change
 * being proposed, not the channel it arrived through.
 */
const CATEGORY_RESOURCE: Record<RecommendationCategory, ResourceType> = {
  STRATEGY: ResourceType.Strategy,
  RISK: ResourceType.Risk,
  COMPLIANCE: ResourceType.Compliance,
  CAPITAL: ResourceType.Capital,
  WATERFALL: ResourceType.Waterfall,
  GOVERNANCE: ResourceType.Governance,
  ORGANIZATION: ResourceType.Organization,
  OTHER: ResourceType.Noelia,
};

/**
 * Fields Noelia is allowed to see from an organizational node.
 *
 * Everything not listed is dropped before the record reaches the prompt
 * (spec §59). Note the omissions: registration numbers, incorporation
 * jurisdictions and internal identifiers beyond the id are not here, because
 * nothing Noelia legitimately answers requires them.
 */
const ORG_FIELDS = ['id', 'name', 'node_type', 'status', 'country_code', 'depth'] as const;
const OS_FIELDS = ['os_id', 'name', 'attachment_kind', 'sector_code', 'status', 'is_core'] as const;

export class NoeliaRepository extends DomainRepository {
  constructor(
    db: Database,
    audit: AuditRepository,
    private readonly provider: NoeliaProvider,
  ) {
    super(db, audit);
  }

  // --- agents -------------------------------------------------------------

  async listAgents(security: SecurityContext): Promise<NoeliaAgent[]> {
    const result = await this.read(security, (session) =>
      session.query<Record<string, unknown>>(
        `SELECT id, code, name, system, role, description, allowed_scopes,
                max_classification, enabled
           FROM ai.agents
          WHERE system = 'NOELIA'
          ORDER BY code`,
      ),
    );
    return result.rows.map(toAgent);
  }

  private async requireAgent(session: DatabaseSession, code?: string): Promise<NoeliaAgent> {
    const result = await session.query<Record<string, unknown>>(
      `SELECT id, code, name, system, role, description, allowed_scopes,
              max_classification, enabled
         FROM ai.agents
        WHERE system = 'NOELIA' AND enabled = TRUE
          AND ($1::text IS NULL OR code = $1)
        ORDER BY code
        LIMIT 1`,
      [code ?? null],
    );
    const row = result.rows[0];
    if (!row) {
      notFound('enabled Noelia agent', code);
    }
    return toAgent(row);
  }

  // --- conversations ------------------------------------------------------

  async listConversations(
    security: SecurityContext,
    query: { limit?: number; offset?: number },
  ): Promise<Page<NoeliaConversation>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);

    return this.read(security, async (session) => {
      // Scoped to the caller's own conversations. A trust administrator can
      // read the audit trail and the action log, which is the accountable way
      // to oversee AI use; reading colleagues' chat transcripts is not, and
      // RLS would refuse anyway.
      const rows = await session.query<Record<string, unknown>>(
        `SELECT c.id, c.agent_id, a.code AS agent_code, c.user_id, c.tenant_id,
                c.title, c.started_at, c.last_message_at,
                (SELECT count(*) FROM ai.messages m WHERE m.conversation_id = c.id)
                  AS message_count
           FROM ai.conversations c
           LEFT JOIN ai.agents a ON a.id = c.agent_id
          WHERE c.user_id = $1
          ORDER BY coalesce(c.last_message_at, c.started_at) DESC
          LIMIT $2 OFFSET $3`,
        [security.userId, limit, offset],
      );
      const total = await session.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM ai.conversations WHERE user_id = $1',
        [security.userId],
      );
      return {
        items: rows.rows.map(toConversation),
        total: Number(total.rows[0]?.count ?? '0'),
        limit,
        offset,
      };
    });
  }

  async listMessages(security: SecurityContext, conversationId: string): Promise<NoeliaMessage[]> {
    return this.read(security, async (session) => {
      await this.assertConversationVisible(session, security, conversationId);
      const result = await session.query<Record<string, unknown>>(
        `SELECT id, conversation_id, role, content, context_refs, model,
                tokens_in, tokens_out, created_at
           FROM ai.messages
          WHERE conversation_id = $1
          ORDER BY created_at, id`,
        [conversationId],
      );
      return result.rows.map(toMessage);
    });
  }

  private async assertConversationVisible(
    session: DatabaseSession,
    security: SecurityContext,
    conversationId: string,
  ): Promise<void> {
    const found = await session.query<{ user_id: string }>(
      'SELECT user_id FROM ai.conversations WHERE id = $1',
      [conversationId],
    );
    const row = found.rows[0];
    // A conversation belonging to someone else is reported as absent rather
    // than forbidden: "that exists but is not yours" is itself a disclosure.
    if (!row || String(row.user_id) !== security.userId) {
      notFound('conversation', conversationId);
    }
  }

  // --- ask ----------------------------------------------------------------

  /**
   * Answers a question, grounded only in records the principal is authorized
   * to read.
   *
   * The order here is load-bearing: govern first, then gather, then prompt.
   * Gathering before governing would mean data had already been read on the
   * agent's behalf by the time the verdict arrived.
   */
  async ask(
    security: SecurityContext,
    input: { question: string; conversationId?: string; agentCode?: string },
  ): Promise<AskResult> {
    return this.db.withContext(
      { tenantId: security.activeTenantId, userId: security.userId, crossTenant: false },
      async (session) => {
        const agent = await this.requireAgent(session, input.agentCode);

        const governance = governAiAction(security, {
          agent: 'NOELIA',
          agentId: agent.id,
          onBehalfOfUserId: security.userId,
          resource: ResourceType.Noelia,
          action: Action.Read,
          classification: DataClassification.Confidential,
          rationale: 'Answer an executive question from control-plane records.',
        });

        await this.logAgentAction(session, {
          agentId: agent.id,
          onBehalfOf: security.userId,
          action: Action.Read,
          resourceType: ResourceType.Noelia,
          resourceId: null,
          governance,
        });

        if (governance.verdict !== AiActionVerdict.Permitted) {
          invalidRequest(`Noelia may not answer this: ${governance.reason}`);
        }

        const conversationId = input.conversationId
          ? await this.continueConversation(session, security, input.conversationId)
          : await this.startConversation(session, security, agent.id, input.question);

        const history = await session.query<Record<string, unknown>>(
          `SELECT role, content FROM ai.messages
            WHERE conversation_id = $1 AND role IN ('USER','ASSISTANT')
            ORDER BY created_at, id
            LIMIT 20`,
          [conversationId],
        );

        const facts = await this.gatherFacts(session, security);

        const completion = await this.provider.complete({
          question: input.question,
          history: history.rows.map((row) => ({
            role: String(row.role) as 'USER' | 'ASSISTANT',
            content: String(row.content),
          })),
          facts,
          principalDisplayName: security.displayName,
          principalRoles: security.roles,
        });

        const question = await this.insertMessage(session, {
          conversationId,
          role: 'USER',
          content: input.question,
          contextRefs: [],
          model: null,
          tokensIn: null,
          tokensOut: null,
        });

        const answer = await this.insertMessage(session, {
          conversationId,
          role: 'ASSISTANT',
          content: completion.content,
          contextRefs: completion.citedRefs,
          model: completion.model,
          tokensIn: completion.tokensIn,
          tokensOut: completion.tokensOut,
        });

        await session.query(
          'UPDATE ai.conversations SET last_message_at = now() WHERE id = $1',
          [conversationId],
        );

        const cited = new Set(completion.citedRefs);
        return {
          conversationId,
          question,
          answer,
          citations: facts.filter((fact) => cited.has(fact.ref)),
          ungrounded: completion.ungrounded,
          model: completion.model,
        };
      },
    );
  }

  private async startConversation(
    session: DatabaseSession,
    security: SecurityContext,
    agentId: string,
    question: string,
  ): Promise<string> {
    const title = question.length > 80 ? `${question.slice(0, 77)}...` : question;
    const inserted = await session.query<{ id: string }>(
      `INSERT INTO ai.conversations (agent_id, user_id, tenant_id, title, last_message_at)
       VALUES ($1, $2, $3, $4, now())
       RETURNING id`,
      [agentId, security.userId, security.activeTenantId, title],
    );
    return String(inserted.rows[0]!.id);
  }

  private async continueConversation(
    session: DatabaseSession,
    security: SecurityContext,
    conversationId: string,
  ): Promise<string> {
    await this.assertConversationVisible(session, security, conversationId);
    return conversationId;
  }

  private async insertMessage(
    session: DatabaseSession,
    input: {
      conversationId: string;
      role: 'USER' | 'ASSISTANT' | 'SYSTEM' | 'TOOL';
      content: string;
      contextRefs: unknown[];
      model: string | null;
      tokensIn: number | null;
      tokensOut: number | null;
    },
  ): Promise<NoeliaMessage> {
    const result = await session.query<Record<string, unknown>>(
      `INSERT INTO ai.messages
         (conversation_id, role, content, context_refs, model, tokens_in, tokens_out)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
       RETURNING id, conversation_id, role, content, context_refs, model,
                 tokens_in, tokens_out, created_at`,
      [
        input.conversationId,
        input.role,
        input.content,
        JSON.stringify(input.contextRefs),
        input.model,
        input.tokensIn,
        input.tokensOut,
      ],
    );
    return toMessage(result.rows[0]!);
  }

  /**
   * Collects the facts Noelia may reason over.
   *
   * Every query runs inside the caller's RLS context, so the database has
   * already excluded anything out of tenant scope before minimization runs.
   * Two filters, applied in that order — the database first, then the field
   * allowlist — because either one alone has a failure mode the other covers.
   */
  private async gatherFacts(
    session: DatabaseSession,
    security: SecurityContext,
  ): Promise<GroundingFact[]> {
    const facts: GroundingFact[] = [];

    const orgs = await session.query<Record<string, unknown>>(
      `SELECT id, name, node_type, status, country_code, depth
         FROM organization.org_nodes
        ORDER BY depth, name
        LIMIT 200`,
    );
    for (const row of orgs.rows) {
      const safe = minimizeForAi(row, ORG_FIELDS);
      facts.push({
        source: 'organization',
        ref: `organization:${String(safe.id)}`,
        label: String(safe.name),
        detail:
          `${String(safe.node_type)} at depth ${String(safe.depth)}, status ${String(safe.status)}` +
          (safe.country_code ? `, country ${String(safe.country_code)}` : ''),
      });
    }

    const registry = await session.query<Record<string, unknown>>(
      `SELECT os_id, name, attachment_kind, sector_code, status, is_core
         FROM organization.os_registry
        ORDER BY os_id
        LIMIT 100`,
    );
    for (const row of registry.rows) {
      const safe = minimizeForAi(row, OS_FIELDS);
      facts.push({
        source: 'os-registry',
        ref: `os:${String(safe.os_id)}`,
        label: String(safe.name),
        detail:
          `${String(safe.attachment_kind)} operating system, status ${String(safe.status)}` +
          (safe.sector_code ? `, sector ${String(safe.sector_code)}` : '') +
          (safe.is_core ? ', the core control plane' : ''),
      });
    }

    // Only the counts, never the contents: the audit trail is readable through
    // its own endpoint, under its own permission, not through a chat window.
    if (security.roles.length > 0) {
      const audit = await session.query<{ count: string; max_seq: string | null }>(
        'SELECT count(*)::text AS count, max(sequence)::text AS max_seq FROM audit.audit_log',
      );
      const row = audit.rows[0];
      if (row) {
        facts.push({
          source: 'audit',
          ref: 'audit:summary',
          label: 'Audit trail',
          detail:
            `${row.count} audit records recorded, highest sequence ${row.max_seq ?? '0'}. ` +
            'Chain integrity is verified through the audit endpoint, not here.',
        });
      }
    }

    return facts;
  }

  // --- recommendations ----------------------------------------------------

  /**
   * Records a proposal from Noelia.
   *
   * This is where the downgrade happens and it is the whole point of the
   * module. `governAiAction` decides; this method only writes down what it
   * decided. A verdict of Permitted cannot occur for a mutation — the
   * governance layer never returns it for one, and migration 0009's
   * `ai_permitted_actions_are_reads_only` CHECK will abort the transaction if
   * that ever stops being true.
   */
  async propose(
    security: SecurityContext,
    input: {
      category: RecommendationCategory;
      title: string;
      rationale: string;
      proposedAction: Record<string, unknown>;
      resourceType?: string;
      resourceId?: string;
      confidenceBps?: number;
      impact?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      conversationId?: string;
      agentCode?: string;
      /** The mutation being proposed. Defaults to Update. */
      action?: Action;
    },
  ): Promise<ProposeResult> {
    const resource = CATEGORY_RESOURCE[input.category];
    const action = input.action ?? Action.Update;

    if (action === Action.Read || action === Action.Export) {
      invalidRequest(
        'A read is not a proposal. Use POST /noelia/ask for questions; ' +
          'recommendations describe changes.',
      );
    }

    return this.mutate(
      security,
      async (session) => {
        const agent = await this.requireAgent(session, input.agentCode);
        if (input.conversationId) {
          await this.assertConversationVisible(session, security, input.conversationId);
        }

        const governance = governAiAction(security, {
          agent: 'NOELIA',
          agentId: agent.id,
          onBehalfOfUserId: security.userId,
          resource,
          action,
          resourceId: input.resourceId,
          classification: DataClassification.Confidential,
          rationale: input.rationale,
        });

        await this.logAgentAction(session, {
          agentId: agent.id,
          onBehalfOf: security.userId,
          action,
          resourceType: resource,
          resourceId: input.resourceId ?? null,
          governance,
          conversationId: input.conversationId ?? null,
        });

        // Denied means denied. Nothing is recorded as a pending proposal,
        // because a denied action is not a decision awaiting a signature — it
        // is an action that must not happen, and leaving it in a review queue
        // invites someone to approve it.
        if (governance.verdict === AiActionVerdict.Denied) {
          return {
            verdict: governance.verdict,
            reason: governance.reason,
            downgradedToRecommendation: false,
            approverRolesRequired: [],
            recommendation: null,
          } satisfies ProposeResult;
        }

        const inserted = await session.query<Record<string, unknown>>(
          `INSERT INTO ai.recommendations
             (agent_id, conversation_id, category, title, rationale, proposed_action,
              resource_type, resource_id, confidence_bps, impact, status,
              governance_verdict, approver_roles)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,'PENDING_REVIEW',$11,$12)
           RETURNING ${RECOMMENDATION_COLUMNS}`,
          [
            agent.id,
            input.conversationId ?? null,
            input.category,
            input.title,
            input.rationale,
            JSON.stringify(input.proposedAction),
            input.resourceType ?? resource,
            input.resourceId ?? null,
            input.confidenceBps ?? null,
            input.impact ?? null,
            governance.verdict,
            governance.approverRolesRequired ?? [],
          ],
        );

        return {
          verdict: governance.verdict,
          reason: governance.reason,
          downgradedToRecommendation: governance.downgradedToRecommendation,
          approverRolesRequired: governance.approverRolesRequired ?? [],
          recommendation: toRecommendation(inserted.rows[0]!, null),
        } satisfies ProposeResult;
      },
      (result) => ({
        action: 'CREATE',
        resourceType: ResourceType.Noelia,
        resourceId: result.recommendation?.id ?? null,
        newState: {
          verdict: result.verdict,
          category: input.category,
          title: input.title,
          downgradedToRecommendation: result.downgradedToRecommendation,
        },
        reason: `Noelia proposal: ${result.reason}`,
      }),
    );
  }

  async listRecommendations(
    security: SecurityContext,
    query: { status?: string; category?: string; limit?: number; offset?: number },
  ): Promise<Page<NoeliaRecommendation>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);

    return this.read(security, async (session) => {
      const where: string[] = [];
      const params: unknown[] = [];
      if (query.status) {
        params.push(query.status);
        where.push(`r.status = $${params.length}`);
      }
      if (query.category) {
        params.push(query.category);
        where.push(`r.category = $${params.length}`);
      }
      const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

      const total = await session.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM ai.recommendations r ${clause}`,
        params,
      );
      const rows = await session.query<Record<string, unknown>>(
        `SELECT ${RECOMMENDATION_COLUMNS_PREFIXED}, u.display_name AS reviewed_by_name
           FROM ai.recommendations r
           LEFT JOIN identity.users u ON u.id = r.reviewed_by
           ${clause}
          ORDER BY r.created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );

      return {
        items: rows.rows.map((row) => toRecommendation(row, asString(row.reviewed_by_name))),
        total: Number(total.rows[0]?.count ?? '0'),
        limit,
        offset,
      };
    });
  }

  async findRecommendation(
    security: SecurityContext,
    id: string,
  ): Promise<NoeliaRecommendation> {
    const result = await this.read(security, (session) =>
      session.query<Record<string, unknown>>(
        `SELECT ${RECOMMENDATION_COLUMNS_PREFIXED}, u.display_name AS reviewed_by_name
           FROM ai.recommendations r
           LEFT JOIN identity.users u ON u.id = r.reviewed_by
          WHERE r.id = $1`,
        [id],
      ),
    );
    const row = result.rows[0];
    if (!row) notFound('recommendation', id);
    return toRecommendation(row, asString(row.reviewed_by_name));
  }

  /**
   * Records a human's decision on a recommendation (spec §57).
   *
   * ACCEPT DOES NOT EXECUTE. It records that a named person, at a recorded
   * time, agreed the proposed change should be made. Making it is a separate,
   * separately-authorized, separately-audited act through the owning domain
   * endpoint. The response returns `proposedAction` precisely so the caller
   * has to go and do that deliberately.
   */
  async review(
    security: SecurityContext,
    id: string,
    input: { decision: 'ACCEPTED' | 'REJECTED'; notes?: string },
  ): Promise<NoeliaRecommendation> {
    return this.mutate(
      security,
      async (session) => {
        const current = await session.query<Record<string, unknown>>(
          `SELECT ${RECOMMENDATION_COLUMNS} FROM ai.recommendations r WHERE id = $1`,
          [id],
        );
        const existing = current.rows[0];
        if (!existing) notFound('recommendation', id);

        if (existing.status !== 'PENDING_REVIEW') {
          invalidRequest(
            `Recommendation ${id} is ${String(existing.status)} and has already been ` +
              'decided. A reviewed recommendation is never reopened; supersede it ' +
              'with a new one instead.',
          );
        }

        // The reviewer must actually hold one of the roles the governance
        // layer named when the recommendation was produced. Without this,
        // "requires human approval" would mean "requires any logged-in human",
        // which is not approval — it is a click.
        const required = toStringArray(existing.approver_roles);
        if (required.length > 0 && !security.roles.some((role) => required.includes(role))) {
          invalidRequest(
            `This recommendation requires approval from one of: ${required.join(', ')}. ` +
              `You hold: ${security.roles.join(', ') || 'no roles'}.`,
          );
        }

        const updated = await session.query<Record<string, unknown>>(
          `UPDATE ai.recommendations
              SET status = $2, reviewed_by = $3, reviewed_at = now(), review_notes = $4
            WHERE id = $1
            RETURNING ${RECOMMENDATION_COLUMNS}`,
          [id, input.decision, security.userId, input.notes ?? null],
        );
        return toRecommendation(updated.rows[0]!, security.displayName);
      },
      (result) => ({
        action: result.status === 'ACCEPTED' ? 'APPROVE' : 'REJECT',
        resourceType: ResourceType.Noelia,
        resourceId: result.id,
        newState: {
          status: result.status,
          reviewedBy: result.reviewedBy,
          // Recorded explicitly so a later reader of the audit trail cannot
          // mistake approval for execution.
          executed: false,
          note: 'Approval records agreement only. Execution is a separate act.',
        },
        reason:
          input.notes ??
          `Recommendation ${result.status.toLowerCase()} by ${security.displayName}.`,
      }),
    );
  }

  // --- action log ---------------------------------------------------------

  async listActionLog(
    security: SecurityContext,
    query: { limit?: number; offset?: number },
  ): Promise<Page<NoeliaActionLogEntry>> {
    const limit = resolveLimit(query.limit);
    const offset = resolveOffset(query.offset);

    return this.read(security, async (session) => {
      const total = await session.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM ai.action_log',
      );
      const rows = await session.query<Record<string, unknown>>(
        `SELECT id, agent_id, on_behalf_of, action, resource_type, resource_id,
                decision, reason, downgraded_to_recommendation, occurred_at
           FROM ai.action_log
          ORDER BY occurred_at DESC, id DESC
          LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      return {
        items: rows.rows.map(toActionLogEntry),
        total: Number(total.rows[0]?.count ?? '0'),
        limit,
        offset,
      };
    });
  }

  /**
   * Writes the governance verdict to the AI action log.
   *
   * Every verdict is recorded, including denials — especially denials. A log
   * that only contains what was allowed cannot answer "what did it try to do",
   * which is the question that matters when reviewing an AI system.
   */
  private async logAgentAction(
    session: DatabaseSession,
    input: {
      agentId: string;
      onBehalfOf: string;
      action: Action;
      resourceType: ResourceType;
      resourceId: string | null;
      governance: AiActionGovernanceResult;
      conversationId?: string | null;
    },
  ): Promise<void> {
    await session.query(
      `INSERT INTO ai.action_log
         (agent_id, on_behalf_of, action, resource_type, resource_id,
          decision, reason, downgraded_to_recommendation, conversation_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        input.agentId,
        input.onBehalfOf,
        input.action,
        input.resourceType,
        input.resourceId,
        input.governance.verdict,
        input.governance.reason,
        input.governance.downgradedToRecommendation,
        input.conversationId ?? null,
      ],
    );
  }
}

// --- row mapping -------------------------------------------------------------

/**
 * Selected columns, listed once. Spelled out rather than `SELECT *` so that
 * adding a column to the table cannot silently start returning it over the
 * wire — several of these tables are one migration away from holding something
 * that should not leave the service.
 */
const RECOMMENDATION_FIELDS = [
  'id', 'agent_id', 'conversation_id', 'category', 'title', 'rationale',
  'proposed_action', 'resource_type', 'resource_id', 'confidence_bps', 'impact',
  'status', 'governance_verdict', 'approver_roles', 'reviewed_by', 'reviewed_at',
  'review_notes', 'created_at',
] as const;

const RECOMMENDATION_COLUMNS = RECOMMENDATION_FIELDS.join(', ');
const RECOMMENDATION_COLUMNS_PREFIXED = RECOMMENDATION_FIELDS.map((f) => `r.${f}`).join(', ');

function asString(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

function asNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  return [];
}

function toAgent(row: Record<string, unknown>): NoeliaAgent {
  return {
    id: String(row.id),
    code: String(row.code),
    name: String(row.name),
    system: String(row.system) as 'NOELIA' | 'HIVE',
    role: String(row.role),
    description: asString(row.description),
    allowedScopes: toStringArray(row.allowed_scopes),
    maxClassification: String(row.max_classification),
    enabled: Boolean(row.enabled),
  };
}

function toConversation(row: Record<string, unknown>): NoeliaConversation {
  return {
    id: String(row.id),
    agentId: asString(row.agent_id),
    agentCode: asString(row.agent_code),
    userId: String(row.user_id),
    tenantId: asString(row.tenant_id),
    title: asString(row.title),
    startedAt: new Date(row.started_at as string).toISOString(),
    lastMessageAt: row.last_message_at
      ? new Date(row.last_message_at as string).toISOString()
      : null,
    messageCount: Number(row.message_count ?? 0),
  };
}

function toMessage(row: Record<string, unknown>): NoeliaMessage {
  const refs = row.context_refs;
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    role: String(row.role) as NoeliaMessage['role'],
    content: String(row.content),
    contextRefs: Array.isArray(refs)
      ? refs
      : typeof refs === 'string'
        ? (JSON.parse(refs) as unknown[])
        : [],
    model: asString(row.model),
    tokensIn: asNumber(row.tokens_in),
    tokensOut: asNumber(row.tokens_out),
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

function toRecommendation(
  row: Record<string, unknown>,
  reviewedByName: string | null,
): NoeliaRecommendation {
  const proposed = row.proposed_action;
  return {
    id: String(row.id),
    agentId: asString(row.agent_id),
    conversationId: asString(row.conversation_id),
    category: String(row.category),
    title: String(row.title),
    rationale: String(row.rationale),
    proposedAction:
      typeof proposed === 'string'
        ? (JSON.parse(proposed) as Record<string, unknown>)
        : ((proposed ?? {}) as Record<string, unknown>),
    resourceType: asString(row.resource_type),
    resourceId: asString(row.resource_id),
    confidenceBps: asNumber(row.confidence_bps),
    impact: asString(row.impact),
    status: String(row.status),
    governanceVerdict: asString(row.governance_verdict),
    approverRoles: toStringArray(row.approver_roles),
    reviewedBy: asString(row.reviewed_by),
    reviewedByName,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at as string).toISOString() : null,
    reviewNotes: asString(row.review_notes),
    createdAt: new Date(row.created_at as string).toISOString(),
  };
}

function toActionLogEntry(row: Record<string, unknown>): NoeliaActionLogEntry {
  return {
    id: String(row.id),
    agentId: asString(row.agent_id),
    onBehalfOf: String(row.on_behalf_of),
    action: String(row.action),
    resourceType: asString(row.resource_type),
    resourceId: asString(row.resource_id),
    decision: String(row.decision) as NoeliaActionLogEntry['decision'],
    reason: String(row.reason),
    downgradedToRecommendation: Boolean(row.downgraded_to_recommendation),
    occurredAt: new Date(row.occurred_at as string).toISOString(),
  };
}
