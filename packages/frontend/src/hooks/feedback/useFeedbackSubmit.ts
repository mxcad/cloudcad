import { useCallback, useState } from 'react';
import { feedbackControllerCreate } from '@/api-sdk';
import type { SubmitFeedbackResultDto } from '@/api-sdk';
import { getFeedbackAnonToken } from '@/constants/feedback';

export interface FeedbackSubmitInput {
  type: 'BUG' | 'SUGGESTION' | 'COMPLAINT' | 'OTHER';
  title: string;
  content: string;
  contact?: string;
  source: 'PC' | 'MOBILE';
  /** 匿名提交（未登录）时置 true，携带设备令牌 */
  anonymous: boolean;
  /** 已上传/注册的附件 id 列表（提交时绑定归属） */
  attachmentIds?: string[];
}

/**
 * 提交反馈（PC 端唯一出口）。
 *
 * 匿名/登录共用同一端点：匿名携带 localStorage 设备令牌（后端只存 HMAC），
 * 登录用户不传令牌、由后端从会话取提交者身份。限额与内容长度由后端强制执行，
 * 前端仅做展示层校验提示。
 */
export function useFeedbackSubmit() {
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (input: FeedbackSubmitInput): Promise<SubmitFeedbackResultDto> => {
      setSubmitting(true);
      try {
        const result = await feedbackControllerCreate({
          throwOnError: true,
          body: {
            type: input.type,
            title: input.title,
            content: input.content,
            source: input.source,
            contact: input.contact || undefined,
            anonToken: input.anonymous ? getFeedbackAnonToken() : undefined,
            attachmentIds: input.attachmentIds,
            pageUrl:
              typeof window !== 'undefined' ? window.location.href : undefined,
          },
        });
        return result.data as SubmitFeedbackResultDto;
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  return { submitting, submit };
}
