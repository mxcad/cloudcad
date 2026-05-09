# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: spec\identity-auth.spec.ts >> 身份权限 >> 注册页 >> 基础交互 >> R-001: 注册页正常加载 → 输入框可见
- Location: e2e\spec\identity-auth.spec.ts:127:7

# Error details

```
Error: browserType.launch: Executable doesn't exist at C:\Users\MxDev\AppData\Local\ms-playwright\chromium_headless_shell-1217\chrome-headless-shell-win64\chrome-headless-shell.exe
╔════════════════════════════════════════════════════════════╗
║ Looks like Playwright was just installed or updated.       ║
║ Please run the following command to download new browsers: ║
║                                                            ║
║     pnpm exec playwright install                           ║
║                                                            ║
║ <3 Playwright Team                                         ║
╚════════════════════════════════════════════════════════════╝
```