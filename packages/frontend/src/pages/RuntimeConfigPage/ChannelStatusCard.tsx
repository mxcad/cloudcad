///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 通道状态区块（ADR-0082 #496）：每个已注册通道一张卡片，呈现
 * 配置完整度（缺失键清单）+ 验证状态（上次测试时间/操作者）+ 测试发送按钮。
 * 测试对话框可填收件人（留空 = 后端回落客服邮箱配置值）；
 * 门禁拒绝/测试失败以后端返回的文案 toast 呈现。
 */

import React from 'react';
import { Mail, Plug, Send } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatDateTimeWithSeconds } from '@/utils/dateUtils';
import styles from './RuntimeConfigPage.module.css';
import { CHANNEL_LABEL } from './meta';
import type { ChannelStatus } from './types';
import { t } from '@/languages';

interface ChannelStatusCardProps {
  channels: ChannelStatus[];
  canManageConfig: boolean;
  /** 正在执行测试发送的通道（按钮 loading 态） */
  testing: Set<string>;
  /** 打开中的测试对话框对应的通道；null 表示未打开 */
  testTarget: string | null;
  /** 测试对话框中的收件人草稿 */
  testRecipient: string;
  onOpenTest: (channel: string) => void;
  onCloseTest: () => void;
  onRecipientChange: (value: string) => void;
  onConfirmTest: () => Promise<void>;
}

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  mail: Mail,
};

export const ChannelStatusCard: React.FC<ChannelStatusCardProps> = ({
  channels,
  canManageConfig,
  testing,
  testTarget,
  testRecipient,
  onOpenTest,
  onCloseTest,
  onRecipientChange,
  onConfirmTest,
}) => {
  const testChannel = testTarget
    ? (channels.find((c) => c.channel === testTarget) ?? null)
    : null;
  const testChannelLabel = testChannel
    ? (CHANNEL_LABEL[testChannel.channel] ?? testChannel.channel)
    : '';

  return (
    <div className={styles.channelSection} data-testid="rc-channel-section">
      {channels.map((channel) => {
        const Icon = CHANNEL_ICONS[channel.channel] ?? Plug;
        return (
          <div
            key={channel.channel}
            className={styles.channelCard}
            data-testid="rc-channel-card"
            data-channel={channel.channel}
          >
            <div className={styles.channelHeader}>
              <Icon size={16} className={styles.channelIcon} />
              <span className={styles.channelTitle}>
                {CHANNEL_LABEL[channel.channel] ?? channel.channel}
              </span>
              <span className={styles.channelKey}>{channel.channel}</span>
            </div>

            <div className={styles.channelStatusRow}>
              <Tag variant={channel.configComplete ? 'success' : 'warning'}>
                {channel.configComplete ? t('配置完整') : t('配置不完整')}
              </Tag>
              {channel.missingKeys.map((key) => (
                <Tag key={key} variant="neutral">
                  {key}
                </Tag>
              ))}
              <Tag variant={channel.verified ? 'success' : 'neutral'}>
                {channel.verified ? t('已验证') : t('未验证')}
              </Tag>
              {channel.verified && channel.verifiedAt && (
                <span className={styles.channelVerifiedInfo}>
                  {t('上次测试：{time}', {
                    time: formatDateTimeWithSeconds(channel.verifiedAt),
                  })}
                  {channel.testedBy ? ` · ${channel.testedBy}` : null}
                </span>
              )}
              <div className={styles.channelActions}>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={Send}
                  disabled={!canManageConfig || testing.has(channel.channel)}
                  loading={testing.has(channel.channel)}
                  onClick={() => onOpenTest(channel.channel)}
                  data-testid="rc-channel-test"
                >
                  {t('测试发送')}
                </Button>
              </div>
            </div>
          </div>
        );
      })}

      {/* 测试发送对话框：收件人可填，留空回落客服邮箱 */}
      <Modal
        isOpen={testChannel !== null}
        onClose={onCloseTest}
        size="sm"
        title={
          testChannel
            ? t('测试{channel}通道', { channel: testChannelLabel })
            : t('测试通道')
        }
        footer={
          <div className={styles.modalFooter}>
            <Button
              variant="secondary"
              size="sm"
              onClick={onCloseTest}
              disabled={testChannel ? testing.has(testChannel.channel) : false}
            >
              {t('取消')}
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Send}
              loading={testChannel ? testing.has(testChannel.channel) : false}
              onClick={() => {
                void onConfirmTest();
              }}
              data-testid="rc-channel-test-confirm"
            >
              {t('发送测试')}
            </Button>
          </div>
        }
      >
        {testChannel && (
          <>
            <p className={styles.modalLead}>
              {t('将使用当前通道配置向收件人发送测试消息。', {})}
            </p>
            {!testChannel.configComplete && (
              <p className={styles.modalLead}>
                {t('通道配置不完整（缺失：{keys}），测试将直接失败。', {
                  keys: testChannel.missingKeys.join('、'),
                })}
              </p>
            )}
            <div className={styles.channelTestForm}>
              <label className={styles.channelTestLabel}>
                {t('测试收件人')}
              </label>
              <Input
                size="md"
                value={testRecipient}
                onChange={(e) => onRecipientChange(e.target.value)}
                placeholder={t('留空则发送到客服邮箱（supportEmail）')}
                maxLength={200}
                disabled={testing.has(testChannel.channel)}
                data-testid="rc-channel-test-recipient"
              />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
};
