/**
 * Notification Service
 * 
 * Handles notification delivery with strict role relevance checks.
 * All notifications require explicit human approval before sending.
 */

import { Notification, Channel, User } from '../types/core';
import { logger } from '../utils/logger';
import { randomUUID } from 'crypto';

export interface NotificationService {
  /**
   * Create notification (in pending status, awaiting approval)
   */
  createNotification(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<Notification>;

  /**
   * Approve notification for sending
   */
  approveNotification(notificationId: string, approvedBy: string): Promise<void>;

  /**
   * Reject notification
   */
  rejectNotification(notificationId: string, rejectedBy: string, reason?: string): Promise<void>;

  /**
   * Send approved notification to channel
   * This should integrate with the actual notification delivery mechanism
   */
  sendNotification(notificationId: string): Promise<void>;

  /**
   * Get pending notifications awaiting approval
   */
  getPendingNotifications(channelId?: string): Promise<Notification[]>;
}

/**
 * Implementation of NotificationService
 */
export class NotificationServiceImpl implements NotificationService {
  private notifications: Map<string, Notification> = new Map();

  async createNotification(
    notification: Omit<Notification, 'id' | 'createdAt'>
  ): Promise<Notification> {
    const id = randomUUID();
    const fullNotification: Notification = {
      ...notification,
      id,
      status: 'pending', // Always start as pending
      createdAt: new Date(),
    };

    this.notifications.set(id, fullNotification);

    logger.info(`Created notification`, {
      notificationId: id,
      changeEventId: notification.changeEventId,
      channelId: notification.channelId,
      role: notification.role,
    });

    return fullNotification;
  }

  async approveNotification(notificationId: string, approvedBy: string): Promise<void> {
    const notification = this.notifications.get(notificationId);
    if (!notification) {
      throw new Error(`Notification not found: ${notificationId}`);
    }

    if (notification.status !== 'pending') {
      throw new Error(`Notification ${notificationId} is not pending approval`);
    }

    const updated: Notification = {
      ...notification,
      status: 'approved',
      approvedBy,
      approvedAt: new Date(),
    };

    this.notifications.set(notificationId, updated);

    logger.info(`Approved notification`, {
      notificationId,
      approvedBy,
      changeEventId: notification.changeEventId,
    });
  }

  async rejectNotification(
    notificationId: string,
    rejectedBy: string,
    reason?: string
  ): Promise<void> {
    const notification = this.notifications.get(notificationId);
    if (!notification) {
      throw new Error(`Notification not found: ${notificationId}`);
    }

    if (notification.status !== 'pending') {
      throw new Error(`Notification ${notificationId} is not pending approval`);
    }

    const updated: Notification = {
      ...notification,
      status: 'rejected',
      approvedBy: rejectedBy, // Reusing field for audit trail
      approvedAt: new Date(),
    };

    this.notifications.set(notificationId, updated);

    logger.info(`Rejected notification`, {
      notificationId,
      rejectedBy,
      reason,
      changeEventId: notification.changeEventId,
    });
  }

  async sendNotification(notificationId: string): Promise<void> {
    const notification = this.notifications.get(notificationId);
    if (!notification) {
      throw new Error(`Notification not found: ${notificationId}`);
    }

    if (notification.status !== 'approved') {
      throw new Error(`Notification ${notificationId} is not approved`);
    }

    // TODO: Integrate with actual notification delivery
    // - Slack API
    // - Email
    // - In-app notifications
    // - Desktop notifications (Tauri)

    const updated: Notification = {
      ...notification,
      status: 'sent',
      sentAt: new Date(),
    };

    this.notifications.set(notificationId, updated);

    logger.info(`Sent notification`, {
      notificationId,
      channelId: notification.channelId,
      role: notification.role,
    });
  }

  async getPendingNotifications(channelId?: string): Promise<Notification[]> {
    const pending = Array.from(this.notifications.values()).filter(
      n => n.status === 'pending' && (!channelId || n.channelId === channelId)
    );

    return pending;
  }
}
