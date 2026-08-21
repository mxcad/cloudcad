module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'warn',
    'no-debugger': 'error',
  },
  overrides: [
    // 前端 React 配置
    {
      files: ['packages/frontend/**/*.{js,jsx,ts,tsx}'],
      env: {
        browser: true,
      },
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
        'prettier',
      ],
      plugins: ['@typescript-eslint', 'react', 'react-hooks', 'unused-imports'],
      settings: {
        react: {
          version: 'detect',
        },
      },
      rules: {
        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',
        'react/display-name': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-explicit-any': 'warn',
        'no-unused-vars': 'off',
        'no-console': 'warn',
        'react-hooks/exhaustive-deps': 'warn',
        'unused-imports/no-unused-imports': 'error',
        'unused-imports/no-unused-vars': 'off',
        // ADR-0034：禁止裸 fetch / EventSource 调用后端 API（豁免清单见 docs/adr/0034-frontend-fetch-governance.md）
        'no-restricted-globals': [
          'error',
          {
            name: 'fetch',
            message:
              '禁止裸 fetch 调用后端 API，请走 @cloudcad/api-sdk（ADR-0034 豁免清单除外）',
          },
        ],
        'no-restricted-syntax': [
          'error',
          {
            selector: "NewExpression[callee.name='EventSource'], CallExpression[callee.name='EventSource']",
            message:
              '禁止裸 EventSource 调用后端 API，请走 @cloudcad/api-sdk（ADR-0034 豁免清单除外）',
          },
          {
            // ADR-0032：禁止内联 style 裸 z-index 数字（局部层叠上下文小值豁免须注释）
            selector: 'Property[key.name=zIndex] > Literal[value>=0]',
            message:
              '禁止内联 style 裸 z-index 数字，请使用 Z_LAYERS.*（局部层叠上下文小值豁免须注释）',
          },
        ],
      },
    },
    // 后端 NestJS 配置
    {
      files: ['packages/backend/**/*.ts'],
      env: {
        node: true,
      },
      parser: '@typescript-eslint/parser',
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      plugins: ['@typescript-eslint', 'unused-imports'], // 'custom-rules' temporarily disabled
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        'prettier',
      ],
      rules: {
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/consistent-type-imports': 'off',
        '@typescript-eslint/interface-name-prefix': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        'no-unused-vars': 'off',
        'no-console': 'off',
        'no-useless-escape': 'off',
        'no-control-regex': 'off',
        'unused-imports/no-unused-imports': 'error',
        'unused-imports/no-unused-vars': 'off',
        // 'custom-rules/no-prisma-enum-in-api-property': 'error', // disabled until plugin is installed
      },
    },
    // 后端接口文件（interfaces/）更严格（ADR-0008：约束接口定义不出 any、显式返回类型）
    {
      files: ['packages/backend/src/**/interfaces/**/*.ts'],
      rules: {
        '@typescript-eslint/explicit-function-return-type': 'error',
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/explicit-module-boundary-types': 'error',
        '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      },
    },
  ],
  ignorePatterns: [
    'dist',
    'build',
    'node_modules',
    'coverage',
    '*.min.js',
    '*.bundle.js',
    'package-lock.json',
    'pnpm-lock.yaml',
    '.git',
    '.vscode',
    '.idea',
    'DS_Store',
    'Thumbs.db',
    '*.log',
    'tmp',
    'temp',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/test/**',
    '**/e2e/**',
    'jest.config.ts',
    'vitest.setup.ts',
    'vite.config.ts',
    'prisma/**',
    '*.d.ts',
    'types.ts',
    '**/types/**',
    '**/*.config.ts',
    '**/scripts/**',
    'conversionProgram/**',
    '代码参考/**',
    'test-*.js',
    'mxcadassembly/**',
    'src/styles/icon.js',
    'packages/frontend/src/styles/icon.js',
  ],
};
