import { Router, Request, Response } from 'express';
import { approvalWorkflow } from '../core/approval';
import { amazonAdsManager } from '../modules/amazon/ads';
import logger from '../utils/logger';

const router = Router();

// GET /api/approvals - List all approvals
router.get('/', (req: Request, res: Response) => {
  try {
    const { status } = req.query;
    const approvals = approvalWorkflow.getApprovals(status as string);
    res.json({ success: true, data: approvals });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/approvals/pending - List pending approvals
router.get('/pending', (_req: Request, res: Response) => {
  try {
    const approvals = approvalWorkflow.getPendingApprovals();
    const totalPending = approvalWorkflow.getTotalPendingSpend();
    res.json({
      success: true,
      data: approvals,
      summary: {
        count: approvals.length,
        totalPendingSpend: totalPending,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/approvals/:id - Get single approval
router.get('/:id', (req: Request, res: Response) => {
  try {
    const approval = approvalWorkflow.getApproval(req.params.id);
    if (!approval) return res.status(404).json({ success: false, error: 'Approval not found' });
    res.json({ success: true, data: approval });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/approvals/:id/approve - Approve a request
router.post('/:id/approve', (req: Request, res: Response) => {
  try {
    const approval = approvalWorkflow.approve(req.params.id, req.body.approvedBy || 'owner');

    if (!approval) {
      return res.status(404).json({ success: false, error: 'Approval not found' });
    }

    // If this was an ad campaign approval, activate the campaign
    if (approval.type === 'ad_spend' && approval.metadata?.bookId) {
      const campaigns = amazonAdsManager.getCampaigns(approval.metadata.bookId);
      const pendingCampaign = campaigns.find(
        (c: any) => JSON.parse(c.config || '{}').approvalId === approval.id
      );
      if (pendingCampaign) {
        amazonAdsManager.updateCampaignStatus(pendingCampaign.id, 'active');
      }
    }

    res.json({
      success: true,
      data: approval,
      message: `Approved: ${approval.action} ($${approval.amount})`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/approvals/:id/deny - Deny a request
router.post('/:id/deny', (req: Request, res: Response) => {
  try {
    const approval = approvalWorkflow.deny(req.params.id, req.body.deniedBy || 'owner');

    if (!approval) {
      return res.status(404).json({ success: false, error: 'Approval not found' });
    }

    // If this was an ad campaign denial, mark the campaign as draft
    if (approval.type === 'ad_spend' && approval.metadata?.bookId) {
      const campaigns = amazonAdsManager.getCampaigns(approval.metadata.bookId);
      const pendingCampaign = campaigns.find(
        (c: any) => JSON.parse(c.config || '{}').approvalId === approval.id
      );
      if (pendingCampaign) {
        amazonAdsManager.updateCampaignStatus(pendingCampaign.id, 'draft');
      }
    }

    res.json({
      success: true,
      data: approval,
      message: `Denied: ${approval.action}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/approvals/summary/spend - Get spend summary
router.get('/summary/spend', (_req: Request, res: Response) => {
  try {
    const pendingSpend = approvalWorkflow.getTotalPendingSpend();
    const approvedSpend = approvalWorkflow.getTotalApprovedSpend();

    res.json({
      success: true,
      data: {
        pendingSpend,
        approvedSpend,
        totalCommitted: pendingSpend + approvedSpend,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
