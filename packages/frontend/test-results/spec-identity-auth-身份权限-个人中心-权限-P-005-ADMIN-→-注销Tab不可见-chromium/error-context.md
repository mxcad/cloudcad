# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: spec\identity-auth.spec.ts >> 身份权限 >> 个人中心 >> 权限 >> P-005: ADMIN → 注销Tab不可见
- Location: e2e\spec\identity-auth.spec.ts:308:7

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