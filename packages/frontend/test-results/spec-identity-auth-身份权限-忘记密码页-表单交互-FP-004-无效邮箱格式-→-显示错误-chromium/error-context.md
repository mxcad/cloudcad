# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: spec\identity-auth.spec.ts >> 身份权限 >> 忘记密码页 >> 表单交互 >> FP-004: 无效邮箱格式 → 显示错误
- Location: e2e\spec\identity-auth.spec.ts:217:7

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