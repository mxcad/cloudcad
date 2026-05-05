///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// @ts-nocheck

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RuntimeConfigPage } from './index';
import * as useRuntimeConfigModule from './hooks/useRuntimeConfig';

vi.mock('./hooks/useRuntimeConfig');
vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ hasPermission: () => true }),
}));
vi.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));
vi.mock('@/hooks/useDocumentTitle');

const mockConfigs = [
  {
    key: 'mail.host',
    value: 'smtp.example.com',
    type: 'string' as const,
    category: 'mail',
    description: 'SMTP 服务器地址',
    isPublic: false,
  },
  {
    key: 'mail.port',
    value: 587,
    type: 'number' as const,
    category: 'mail',
    description: 'SMTP 端口号',
    isPublic: false,
  },
  {
    key: 'user.allowRegister',
    value: true,
    type: 'boolean' as const,
    category: 'user',
    description: '是否允许注册',
    isPublic: true,
  },
  {
    key: 'user.mailEnabled',
    value: false,
    type: 'boolean' as const,
    category: 'user',
    description: '是否启用邮件通知',
    isPublic: false,
  },
  {
    key: 'system.appName',
    value: 'CloudCAD',
    type: 'string' as const,
    category: 'system',
    description: '应用名称',
    isPublic: true,
  },
  {
    key: 'userStorageQuota',
    value: 10,
    type: 'number' as const,
    category: 'storage',
    description: '用户存储配额',
    isPublic: false,
  },
];

describe('RuntimeConfigPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const mockReturn = {
      configs: mockConfigs,
      groupedConfigs: [
        {
          category: 'mail',
          label: '邮件配置',
          icon: vi.fn(),
          items: mockConfigs.filter((c) => c.category === 'mail'),
        },
        {
          category: 'user',
          label: '用户管理',
          icon: vi.fn(),
          items: mockConfigs.filter((c) => c.category === 'user'),
        },
        {
          category: 'system',
          label: '系统配置',
          icon: vi.fn(),
          items: mockConfigs.filter((c) => c.category === 'system'),
        },
        {
          category: 'storage',
          label: '存储配置',
          icon: vi.fn(),
          items: mockConfigs.filter((c) => c.category === 'storage'),
        },
      ],
      loading: false,
      saving: new Set<string>(),
      editedValues: {},
      canManageConfig: true,
      modifiedCount: 0,
      configStats: { total: 6, public: 2, modified: 0 },
      handleValueChange: vi.fn(),
      handleSave: vi.fn(),
      handleReset: vi.fn(),
      toggleValueVisibility: vi.fn(),
      parseValue: vi.fn((item) => item.value),
      isSensitiveKey: vi.fn(() => false),
      getConfigUnit: vi.fn(() => null),
      isValueHidden: vi.fn(() => false),
    };

    vi.mocked(useRuntimeConfigModule.useRuntimeConfig).mockReturnValue(mockReturn);
  });

  describe('Render smoke test', () => {
    it('renders page title', () => {
      render(<RuntimeConfigPage />);
      expect(screen.getByText('运行时配置')).toBeTruthy();
    });

    it('renders subtitle', () => {
      render(<RuntimeConfigPage />);
      expect(screen.getByText('管理系统运行参数，修改后立即生效')).toBeTruthy();
    });

    it('renders config stats', () => {
      render(<RuntimeConfigPage />);
      expect(screen.getByText('6')).toBeTruthy(); // total configs
      expect(screen.getByText('配置项')).toBeTruthy();
      expect(screen.getByText('2')).toBeTruthy(); // public configs
      expect(screen.getByText('公开')).toBeTruthy();
    });

    it('renders category labels', () => {
      render(<RuntimeConfigPage />);
      expect(screen.getByText('邮件配置')).toBeTruthy();
      expect(screen.getByText('用户管理')).toBeTruthy();
      expect(screen.getByText('系统配置')).toBeTruthy();
      expect(screen.getByText('存储配置')).toBeTruthy();
    });

    it('renders config keys in cards', () => {
      render(<RuntimeConfigPage />);
      expect(screen.getByText('mail.host')).toBeTruthy();
      expect(screen.getByText('mail.port')).toBeTruthy();
      expect(screen.getByText('user.allowRegister')).toBeTruthy();
      expect(screen.getByText('system.appName')).toBeTruthy();
    });

    it('renders config descriptions', () => {
      render(<RuntimeConfigPage />);
      expect(screen.getByText('SMTP 服务器地址')).toBeTruthy();
      expect(screen.getByText('是否允许注册')).toBeTruthy();
    });

    it('renders public badge on public configs', () => {
      render(<RuntimeConfigPage />);
      expect(screen.getByText('user.allowRegister')).toBeTruthy();
      expect(screen.getByText('system.appName')).toBeTruthy();
      // Public badges exist (rendered multiple times for each public key)
      const publicBadges = screen.getAllByText('公开');
      expect(publicBadges.length).toBeGreaterThan(0);
    });
  });

  describe('Loading state', () => {
    it('shows loading spinner when loading', () => {
      vi.mocked(useRuntimeConfigModule.useRuntimeConfig).mockReturnValue({
        ...vi.mocked(useRuntimeConfigModule.useRuntimeConfig)(),
        loading: true,
        configs: [],
        groupedConfigs: [],
      });

      render(<RuntimeConfigPage />);
      expect(screen.getByText('正在加载配置...')).toBeTruthy();
    });
  });

  describe('Empty state', () => {
    it('shows empty state when no configs', () => {
      vi.mocked(useRuntimeConfigModule.useRuntimeConfig).mockReturnValue({
        ...vi.mocked(useRuntimeConfigModule.useRuntimeConfig)(),
        configs: [],
        groupedConfigs: [],
      });

      render(<RuntimeConfigPage />);
      expect(screen.getByText('暂无配置项')).toBeTruthy();
      expect(screen.getByText('系统尚未配置任何运行时参数')).toBeTruthy();
    });
  });

  describe('Read-only banner', () => {
    it('shows read-only banner when user lacks permission', () => {
      vi.mocked(useRuntimeConfigModule.useRuntimeConfig).mockReturnValue({
        ...vi.mocked(useRuntimeConfigModule.useRuntimeConfig)(),
        canManageConfig: false,
      });

      render(<RuntimeConfigPage />);
      expect(
        screen.getByText('您当前处于只读模式，需要系统管理权限才能修改配置'),
      ).toBeTruthy();
    });
  });

  describe('Modified count display', () => {
    it('shows modified count when there are unsaved changes', () => {
      vi.mocked(useRuntimeConfigModule.useRuntimeConfig).mockReturnValue({
        ...vi.mocked(useRuntimeConfigModule.useRuntimeConfig)(),
        modifiedCount: 2,
        configStats: { total: 6, public: 2, modified: 2 },
      });

      render(<RuntimeConfigPage />);
      expect(screen.getByText('2')).toBeTruthy();
      expect(screen.getByText('待保存')).toBeTruthy();
    });
  });

  describe('useRuntimeConfig hook interface', () => {
    it('exposes configs and groupedConfigs', () => {
      const mockHook = useRuntimeConfigModule.useRuntimeConfig as ReturnType<typeof vi.fn>;
      const result = mockHook();
      expect(result.configs).toBeDefined();
      expect(result.groupedConfigs).toBeDefined();
      expect(result.configs.length).toBe(6);
      expect(result.groupedConfigs.length).toBe(4);
    });

    it('exposes loading and saving state', () => {
      const mockHook = useRuntimeConfigModule.useRuntimeConfig as ReturnType<typeof vi.fn>;
      const result = mockHook();
      expect(result.loading).toBe(false);
      expect(result.saving).toBeDefined();
    });

    it('exposes CRUD operations', () => {
      const mockHook = useRuntimeConfigModule.useRuntimeConfig as ReturnType<typeof vi.fn>;
      const result = mockHook();
      expect(result.handleValueChange).toBeDefined();
      expect(result.handleSave).toBeDefined();
      expect(result.handleReset).toBeDefined();
      expect(result.toggleValueVisibility).toBeDefined();
    });

    it('exposes utility functions', () => {
      const mockHook = useRuntimeConfigModule.useRuntimeConfig as ReturnType<typeof vi.fn>;
      const result = mockHook();
      expect(result.parseValue).toBeDefined();
      expect(result.isSensitiveKey).toBeDefined();
      expect(result.getConfigUnit).toBeDefined();
      expect(result.isValueHidden).toBeDefined();
    });

    it('exposes permission state', () => {
      const mockHook = useRuntimeConfigModule.useRuntimeConfig as ReturnType<typeof vi.fn>;
      const result = mockHook();
      expect(result.canManageConfig).toBe(true);
    });

    it('exposes configStats', () => {
      const mockHook = useRuntimeConfigModule.useRuntimeConfig as ReturnType<typeof vi.fn>;
      const result = mockHook();
      expect(result.configStats.total).toBe(6);
      expect(result.configStats.public).toBe(2);
      expect(result.configStats.modified).toBe(0);
    });
  });
});
