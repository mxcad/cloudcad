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
 * 配置完整度（缺失键清单）+ 验证状态（上次验证时间/操作者）+ 验证按钮。
 * 验证对话框按通道渲染（CHANNEL_TEST_META）：mail/sms 可填接收方，
 * wechat/payment/webhook 只做无副作用探测、不渲染接收方输入框；
 * 门禁拒绝/验证失败以后端返回的文案 toast 呈现，失败时对话框保留错误文案
 * 与后端归因的出错配置键（problemKeys，可点击定位到对应配置项）。
 */

import React, { useMemo } from 'react';
import {
  CornerUpRight,
  Mail,
  MessageCircle,
  Plug,
  Send,
  Smartphone,
  Webhook,
  Wallet,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatDateTimeWithSeconds } from '@/utils/dateUtils';
import styles from './RuntimeConfigPage.module.css';
import {
  CHANNEL_LABEL,
  channelTestMeta,
  missingKeyHints,
  type MissingKeyHint,
} from './meta';
import type { ChannelStatus, ChannelTestResult, ConfigItem } from './types';
import { t } from '@/languages';

interface ChannelStatusCardProps {
  channels: ChannelStatus[];
  canManageConfig: boolean;
  /** 正在执行测试发送的通道（按钮 loading 态） */
  testing: Set<string>;
  /** 打开中的测试对话框对应的通道；null 表示未打开 */
  testTarget: string | null;
  /** 测试对话框中的接收方草稿（邮箱/手机号，按通道而定） */
  testRecipient: string;
  /** 最近一次测试失败的结果（对话框内展示错误文案 + 出错配置项定位） */
  testResult: ChannelTestResult | null;
  onOpenTest: (channel: string) => void;
  onCloseTest: () => void;
  onRecipientChange: (value: string) => void;
  onConfirmTest: () => Promise<void>;
  /** 配置项索引（key → ConfigItem）：缺失键/出错键的中文说明与格式示例来源 */
  configsByKey: Map<string, ConfigItem>;
  /** 定位到指定配置项（缺失键/出错键清单的跳转入口） */
  onFocusConfig: (key: string) => void;
}

/**
 * 可点击定位的配置项（缺失键清单与测试失败原因清单共用）：
 * 中文说明 + 键名 + 格式示例 + 定位图标。
 */
const ConfigKeyJumpButton: React.FC<{
  hint: MissingKeyHint;
  testId: string;
  onClick: () => void;
}> = ({ hint, testId, onClick }) => (
  <button
    type="button"
    className={styles.missingKeyItem}
    onClick={onClick}
    data-testid={testId}
  >
    <span className={styles.missingKeyLabel}>{hint.label}</span>
    <span className={styles.missingKeyName}>{hint.key}</span>
    {hint.example ? (
      <code className={styles.missingKeyExample}>{hint.example}</code>
    ) : null}
    <CornerUpRight size={13} className={styles.missingKeyGo} />
  </button>
);

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  mail: Mail,
  sms: Smartphone,
  wechat: MessageCircle,
  payment: Wallet,
  webhook: Webhook,
};

export const ChannelStatusCard: React.FC<ChannelStatusCardProps> = ({
  channels,
  canManageConfig,
  testing,
  testTarget,
  testRecipient,
  testResult,
  onOpenTest,
  onCloseTest,
  onRecipientChange,
  onConfirmTest,
  configsByKey,
  onFocusConfig,
}) => {
  const testChannel = testTarget
    ? (channels.find((c) => c.channel === testTarget) ?? null)
    : null;
  const testChannelLabel = testChannel
    ? (CHANNEL_LABEL[testChannel.channel] ?? testChannel.channel)
    : '';
  /** 当前对话框的通道能力（接收方/说明按通道而定） */
  const testMeta = channelTestMeta(testTarget ?? '');
  /** 对话框通道缺失键的可行动提示（中文说明 + 格式示例） */
  const testHints = useMemo(
    () => missingKeyHints(testChannel?.missingKeys ?? [], configsByKey),
    [testChannel, configsByKey]
  );
  /** 测试失败时出错配置键的可行动提示（点击定位后关闭对话框） */
  const problemHints = useMemo(
    () => missingKeyHints(testResult?.problemKeys ?? [], configsByKey),
    [testResult, configsByKey]
  );

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
              <Tag variant={channel.verified ? 'success' : 'neutral'}>
                {channel.verified ? t('已验证') : t('未验证')}
              </Tag>
              {channel.verified && channel.verifiedAt && (
                <span className={styles.channelVerifiedInfo}>
                  {t('上次验证：{time}', {
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
                  {t('验证')}
                </Button>
              </div>
            </div>

            {/* 缺失键清单：中文说明 + 格式示例 + 一键定位，代替裸键名罗列 */}
            {channel.missingKeys.length > 0 && (
              <div
                className={styles.missingKeysBlock}
                data-testid="rc-missing-keys"
              >
                <div className={styles.missingKeysTitle}>
                  {t('补全以下配置项后即可验证，点击可定位到该项')}
                </div>
                <ul className={styles.missingKeysList}>
                  {missingKeyHints(channel.missingKeys, configsByKey).map(
                    (hint) => (
                      <li key={hint.key}>
                        <ConfigKeyJumpButton
                          hint={hint}
                          testId="rc-missing-key"
                          onClick={() => onFocusConfig(hint.key)}
                        />
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}
          </div>
        );
      })}

      {/* 验证对话框：说明与接收方输入框按通道能力渲染（CHANNEL_TEST_META） */}
      <Modal
        isOpen={testChannel !== null}
        onClose={onCloseTest}
        size="sm"
        title={
          testChannel
            ? t('验证{channel}通道', { channel: testChannelLabel })
            : t('验证通道')
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
              {t('开始验证')}
            </Button>
          </div>
        }
      >
        {testChannel && (
          <>
            <p className={styles.modalLead}>{testMeta.description}</p>
            {!testChannel.configComplete && (
              <p className={styles.modalLead}>
                {t('通道配置不完整（缺失：{keys}），验证将直接失败。', {
                  keys: testHints.map((hint) => hint.label).join('、'),
                })}
              </p>
            )}
            {/* 验证失败：保留错误文案 + 后端归因的出错配置键（点击定位并关闭对话框） */}
            {testResult && !testResult.ok && (
              <div
                className={styles.missingKeysBlock}
                data-testid="rc-test-failure"
              >
                <p
                  className={styles.modalLead}
                  data-testid="rc-test-failure-message"
                >
                  {testResult.message}
                </p>
                {testResult.problemKeys.length > 0 && (
                  <>
                    <div className={styles.missingKeysTitle}>
                      {t('以下配置项可能是错误原因，点击可定位到该项')}
                    </div>
                    <ul className={styles.missingKeysList}>
                      {problemHints.map((hint) => (
                        <li key={hint.key}>
                          <ConfigKeyJumpButton
                            hint={hint}
                            testId="rc-test-problem-key"
                            onClick={() => {
                              onFocusConfig(hint.key);
                              onCloseTest();
                            }}
                          />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            {testMeta.acceptsRecipient && (
              <div className={styles.channelTestForm}>
                <label className={styles.channelTestLabel}>
                  {testMeta.recipientLabel}
                </label>
                <Input
                  size="md"
                  value={testRecipient}
                  onChange={(e) => onRecipientChange(e.target.value)}
                  placeholder={testMeta.recipientPlaceholder}
                  maxLength={200}
                  disabled={testing.has(testChannel.channel)}
                  data-testid="rc-channel-test-recipient"
                />
              </div>
            )}
          </>
        )}
      </Modal>
    </div>
  );
};
