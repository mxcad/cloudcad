# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-15T02:56:24.894Z
**Commit:** unknown
**Branch:** unknown

## OVERVIEW

React frontend application providing CAD editor UI, project management, user authentication, and real-time collaboration features.

## STRUCTURE

```
packages/frontend/
├── src/
│   ├── assets/           # Static assets (images, icons, etc.)
│   ├── components/       # Reusable UI components
│   ├── hooks/            # Custom React hooks
│   ├── stores/           # Zustand state management stores
│   ├── utils/            # Utility functions and helpers
│   ├── types/            # TypeScript types and interfaces
│   ├── api/              # API client and service functions
│   ├── routes/           # Application routes and layout
│   └── main.tsx          # Application entry point
```

## WHERE TO LOOK

| Task               | Location                           | Notes                                               |
| ------------------ | ---------------------------------- | --------------------------------------------------- |
| UI Components      | src/components/                    | Reusable UI elements (buttons, modals, forms, etc.) |
| Custom Hooks       | src/hooks/                         | Custom React hooks for state and side effects       |
| State Management   | src/stores/                        | Zustand stores for global state                     |
| API Integration    | src/api/                           | Axios instance and service functions                |
| Route Components   | src/routes/                        | Page components and route definitions               |
| CAD Editor         | src/components/cad-editor/         | CAD editor specific components                      |
| File Operations    | src/components/file-manager/       | File tree and operations                            |
| User Management    | src/components/user-management/    | User and role management UI                         |
| Project Management | src/components/project-management/ | Project creation and settings                       |

## CONVENTIONS

- **Components**: Function components with hooks, PascalCase naming
- **State**: Zustand stores with immutable updates
- **Forms**: React Hook Form with Zod validation
- **API Calls**: Async/await with error handling, using axios instance
- **TypeScript**: Strict mode, no `any` types, proper typing for props and state
- **Imports**: Absolute paths using `@/` alias (configured in tsconfig.json)
- **Event Handling**: Prevent default where needed, use camelCase for handlers
- **Accessibility**: Use semantic HTML, proper ARIA labels, keyboard navigation
- **Performance**: Use `useMemo`, `useCallback` for expensive operations

## ANTI-PATTERNS (THIS PROJECT)

- Using `any` type in TypeScript files
- Defining components inside components (causes remounting)
- Mutating state directly (must use Zustand setters)
- Using index.ts barrel exports excessively
- Not cleaning up subscriptions or event listeners
- Doing heavy computations in render (should use useMemo)
- Ignoring React keys in lists
- Using `div` for semantic elements when better options exist
- Not handling loading and error states in API calls

## UNIQUE STYLES

- **State Management**: Zustand stores with selectors for fine-grained reactivity
- **API Layer**: Centralized API service with interceptors for auth and error handling
- **Component Library**: Reusable components with consistent styling and behavior
- **CAD Integration**: Specialized components for mxcad assembly integration
- **File System**: Tree view with drag-and-drop for file organization
- **Real-time Updates**: Subscription-based updates for collaborative editing

## COMMANDS

```bash
# Frontend specific (in packages/frontend)
pnpm dev              # Start development server (port 3000)
pnpm build            # Build production version
pnpm test             # Run Vitest tests
pnpm test:ui          # Run UI mode tests
pnpm test:coverage    # Generate test coverage report
pnpm type-check       # Run TypeScript type checking
pnpm i18n:init        # Initialize i18n language config (zh/en/cht)
pnpm i18n:extract     # Extract translatable strings from source
pnpm i18n:compile     # Compile translation JSON -> TS language packs
pnpm i18n             # Full i18n pipeline: init → extract → compile
```

## NOTES

- **Authentication**: JWT tokens stored in localStorage, refresh token handled automatically
- **Real-time Collaboration**: WebSocket connection to cooperation service on port 3091
- **CAD Editor**: Based on mxcad assembly, requires proper initialization and cleanup
- **File Upload**: Uses chunked upload for large files, progress tracking
- **Environment Variables**: In `.env.local`:
  - `VITE_APP_NAME`: Application title
  - `VITE_API_BASE_URL`: API gateway path
  - `VITE_APP_COOPERATE_URL`: WebSocket service URL
- **Browser Support**: Modern browsers (Chrome, Firefox, Safari, Edge)
- **Responsive Design**: Mobile-first approach with Tailwind breakpoints

## i18n (VoerkaI18n)

### 架构
- **子库模式** (`library: true`)：CloudCAD 是 mxcad-app 的 VoerkaI18n 子库，语言切换跟随 mxcad-app
- 多库联动：mxcad-app 切换语言时，通过全局 `VoerkaI18n` 单例通知所有子库 scope 同步切换

### 使用方式
```tsx
// 在组件中使用 t 函数
import { t } from '@/languages';
<Button>{t("登录")}</Button>

// 或使用 Translate 组件（大段文本）
import { Translate } from '@/languages';
<Translate message="请输入用户名" />

// 语言切换（由 mxcad-app 驱动，不要手动调用 change）
// 仅在需要读取当前语言时
import { useVoerkaI18n } from '@voerkai18n/react';
const { activeLanguage, languages } = useVoerkaI18n();
```

### 关键约束
- `@voerkai18n/vite` 插件必须在 `react()` 之前注册（vite.config.ts）
- `import "./languages"` 必须在 `VoerkaI18nProvider` 之前，确保 scope 注册到全局
- **每次运行 `pnpm i18n:compile` 后，必须手动检查 `src/languages/index.ts` 中 `library: true` 是否被覆盖**（compile 会重置为 `false`）

### 工作流
1. 源码中使用 `t("中文文本")` 包装需翻译的内容
2. `pnpm i18n:extract` — 扫描提取文本到 `translates/messages/default.json`
3. 编辑 `translates/messages/default.json` 补充 en/cht 翻译（或运行 `voerkai18n translate` 自动翻译）
4. `pnpm i18n:compile -t` — 编译为 TS 语言包
5. 编译后手动恢复 `library: true`

### 文件结构
```
src/languages/
├── index.ts          # VoerkaI18nScope + t 导出（compile 自动生成，library 需手动修正）
├── settings.json     # 语言列表（zh/en/cht）
├── storage.ts        # localStorage 持久化（compile 自动生成）
├── idMap.ts          # 文本 ID 映射（compile 自动生成）
├── zh.ts / en.ts / cht.ts  # 语言包（compile 自动生成）
├── formatters/       # 格式化器（compile 自动生成）
└── translates/       # 翻译源文件（extract 生成）
```
