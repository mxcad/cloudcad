import { useMemo } from 'react';

import {
  resolveSupportContact,
  type BrandSupport,
} from '@/constants/appConfig';
import { useRuntimeConfig } from '@/contexts/RuntimeConfigContext';

/**
 * 客服联系方式的唯一消费入口。
 *
 * 优先级：后端运行时配置（管理端可改）> `/brand/config.json` 的 `support`
 * > 内置默认值。客服弹框与法务正文共用这一组值，避免两处各存一份。
 *
 * 返回 memo 化对象：`useLegalParagraph` 把它放进 effect 依赖，
 * 若每次渲染都返回新对象会导致 effect 反复重跑。
 */
export function useSupportContact(): BrandSupport {
  const { config: runtimeConfig } = useRuntimeConfig();
  const { supportEmail, supportPhone } = runtimeConfig;

  return useMemo(
    () => resolveSupportContact({ supportEmail, supportPhone }),
    [supportEmail, supportPhone]
  );
}
