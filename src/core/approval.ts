import { getDb, logActivity } from '../database';
import { generateId } from '../utils/helpers';
import logger from '../utils/logger';

export interface ApprovalRequest {
  id: string;
  type: 'ad_spend' | 'email_campaign' | 'paid_promotion' | 'subscription' | 'tool_purchase' | 'other';
  action: string;
  description: string;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'denied';
  metadata: Record<string, any>;
  requestedAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

export class ApprovalWorkflow {
  // Create an approval request for any financial action
  createRequest(
    type: ApprovalRequest['type'],
    action: string,
    description: string,
    amount: number,
    metadata: Record<string, any> = {}
  ): ApprovalRequest {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO approvals (id, type, action, description, amount, currency, status, metadata, requested_at)
      VALUES (?, ?, ?, ?, ?, 'USD', 'pending', ?, ?)
    `).run(id, type, action, description, amount, JSON.stringify(metadata), now);

    const request: ApprovalRequest = {
      id,
      type,
      action,
      description,
      amount,
      currency: 'USD',
      status: 'pending',
      metadata,
      requestedAt: now,
    };

    logActivity('approval_requested', 'approval', id, {
      type,
      action,
      amount,
      description,
    });

    logger.info('Approval request created', { id, type, amount, action });
    return request;
  }

  // Get all pending approvals
  getPendingApprovals(): ApprovalRequest[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM approvals WHERE status = 'pending' ORDER BY requested_at DESC
    `).all() as any[];

    return rows.map(this.mapRow);
  }

  // Get approval by ID
  getApproval(id: string): ApprovalRequest | null {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM approvals WHERE id = ?`).get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  // Approve a request
  approve(id: string, approvedBy: string = 'owner'): ApprovalRequest | null {
    const db = getDb();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE approvals SET status = 'approved', resolved_at = ?, resolved_by = ? WHERE id = ?
    `).run(now, approvedBy, id);

    logActivity('approval_approved', 'approval', id, { approvedBy });
    logger.info('Approval request approved', { id, approvedBy });

    return this.getApproval(id);
  }

  // Deny a request
  deny(id: string, deniedBy: string = 'owner'): ApprovalRequest | null {
    const db = getDb();
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE approvals SET status = 'denied', resolved_at = ?, resolved_by = ? WHERE id = ?
    `).run(now, deniedBy, id);

    logActivity('approval_denied', 'approval', id, { deniedBy });
    logger.info('Approval request denied', { id, deniedBy });

    return this.getApproval(id);
  }

  // Get all approvals with optional status filter
  getApprovals(status?: string): ApprovalRequest[] {
    const db = getDb();
    let query = 'SELECT * FROM approvals';
    const params: any[] = [];

    if (status) {
      query += ' WHERE status = ?';
      params.push(status);
    }

    query += ' ORDER BY requested_at DESC';
    const rows = db.prepare(query).all(...params) as any[];
    return rows.map(this.mapRow);
  }

  // Get total pending spend
  getTotalPendingSpend(): number {
    const db = getDb();
    const result = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM approvals WHERE status = 'pending'
    `).get() as any;
    return result.total;
  }

  // Get total approved spend
  getTotalApprovedSpend(): number {
    const db = getDb();
    const result = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total FROM approvals WHERE status = 'approved'
    `).get() as any;
    return result.total;
  }

  // Check if an action requires approval (any financial action does)
  requiresApproval(amount: number): boolean {
    // ALL financial actions require approval regardless of amount
    return amount > 0;
  }

  private mapRow(row: any): ApprovalRequest {
    return {
      id: row.id,
      type: row.type,
      action: row.action,
      description: row.description,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      metadata: JSON.parse(row.metadata || '{}'),
      requestedAt: row.requested_at,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
    };
  }
}

export const approvalWorkflow = new ApprovalWorkflow();
