const fs = require('fs');

// ============================================================
// 1. Fix file-system.controller.ts
// ============================================================
const fsPath = 'D:\\web\\MxCADOnline\\cloudcad\\packages\\backend\\src\\file-system\\file-system.controller.ts';
let fsContent = fs.readFileSync(fsPath, 'utf-8');

// Add ApiBody to imports (tab-indented)
fsContent = fsContent.replace(
  'import {\n\t\tApiBearerAuth,\n\t\tApiOperation,',
  'import {\n\t\tApiBearerAuth,\n\t\tApiBody,\n\t\tApiOperation,'
);

// Add @ApiBody before updateProjectMember
const oldFsBlock = '\t@ApiResponse({ status: 404, description: "项目或成员不存在" })\n\tasync updateProjectMember(';
const newFsBlock = '\t@ApiResponse({ status: 404, description: "项目或成员不存在" })\n\t@ApiBody({\n\t\tschema: {\n\t\t\ttype: \'object\',\n\t\t\tproperties: {\n\t\t\t\tprojectRoleId: { type: \'string\', description: \'项目角色ID\' },\n\t\t\t\troleId: { type: \'string\', description: \'角色ID（兼容旧字段）\' },\n\t\t\t},\n\t\t\trequired: [],\n\t\t},\n\t})\n\tasync updateProjectMember(';
fsContent = fsContent.replace(oldFsBlock, newFsBlock);

fs.writeFileSync(fsPath, fsContent, 'utf-8');
console.log('file-system.controller.ts: ApiBody import + updateProjectMember @ApiBody done');

// ============================================================
// 2. Fix auth.controller.ts
// ============================================================
const authPath = 'D:\\web\\MxCADOnline\\cloudcad\\packages\\backend\\src\\auth\\auth.controller.ts';
let authContent = fs.readFileSync(authPath, 'utf-8');

const replacements = [
  // sendVerification: { email: string }
  {
    old: "  @ApiResponse({ status: 400, description: '请求参数错误或发送过于频繁' })\n  async sendVerification(\n    @Body() dto: { email: string }",
    new: "  @ApiResponse({ status: 400, description: '请求参数错误或发送过于频繁' })\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        email: { type: 'string', description: '邮箱地址' },\n      },\n      required: ['email'],\n    },\n  })\n  async sendVerification(\n    @Body() dto: { email: string }"
  },
  // verifyEmailAndRegisterPhone: multiline inline type
  {
    old: "  @ApiResponse({ status: 409, description: '手机号、邮箱或用户名已存在' })\n  async verifyEmailAndRegisterPhone(\n    @Body()\n    dto: {\n      email: string;\n      code: string;\n      phone: string;\n      phoneCode: string;\n      username: string;\n      password: string;\n      nickname?: string;\n    },",
    new: "  @ApiResponse({ status: 409, description: '手机号、邮箱或用户名已存在' })\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        email: { type: 'string', description: '邮箱地址' },\n        code: { type: 'string', description: '邮箱验证码' },\n        phone: { type: 'string', description: '手机号' },\n        phoneCode: { type: 'string', description: '短信验证码' },\n        username: { type: 'string', description: '用户名' },\n        password: { type: 'string', description: '密码' },\n        nickname: { type: 'string', description: '昵称（可选）' },\n      },\n      required: ['email', 'code', 'phone', 'phoneCode', 'username', 'password'],\n    },\n  })\n  async verifyEmailAndRegisterPhone(\n    @Body()\n    dto: {\n      email: string;\n      code: string;\n      phone: string;\n      phoneCode: string;\n      username: string;\n      password: string;\n      nickname?: string;\n    },"
  },
  // resendVerification: { email: string }
  {
    old: "  @ApiResponse({ status: 400, description: '请求参数错误或发送过于频繁' })\n  async resendVerification(\n    @Body() dto: { email: string }",
    new: "  @ApiResponse({ status: 400, description: '请求参数错误或发送过于频繁' })\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        email: { type: 'string', description: '邮箱地址' },\n      },\n      required: ['email'],\n    },\n  })\n  async resendVerification(\n    @Body() dto: { email: string }"
  },
  // bindEmailAndLogin: { tempToken; email; code }
  {
    old: "  @ApiResponse({ status: 400, description: '验证码无效或令牌过期' })\n  async bindEmailAndLogin(\n    @Body() dto: { tempToken: string; email: string; code: string },",
    new: "  @ApiResponse({ status: 400, description: '验证码无效或令牌过期' })\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        tempToken: { type: 'string', description: '临时令牌' },\n        email: { type: 'string', description: '邮箱地址' },\n        code: { type: 'string', description: '验证码' },\n      },\n      required: ['tempToken', 'email', 'code'],\n    },\n  })\n  async bindEmailAndLogin(\n    @Body() dto: { tempToken: string; email: string; code: string },"
  },
  // bindPhoneAndLogin: { tempToken; phone; code }
  {
    old: "  @ApiResponse({ status: 400, description: '验证码无效或令牌过期' })\n  async bindPhoneAndLogin(\n    @Body() dto: { tempToken: string; phone: string; code: string },",
    new: "  @ApiResponse({ status: 400, description: '验证码无效或令牌过期' })\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        tempToken: { type: 'string', description: '临时令牌' },\n        phone: { type: 'string', description: '手机号' },\n        code: { type: 'string', description: '验证码' },\n      },\n      required: ['tempToken', 'phone', 'code'],\n    },\n  })\n  async bindPhoneAndLogin(\n    @Body() dto: { tempToken: string; phone: string; code: string },"
  },
  // verifyPhone: { phone; code }
  {
    old: "  @ApiResponse({ status: 400, description: '验证码无效或已过期' })\n  async verifyPhone(\n    @Body() dto: { phone: string; code: string },",
    new: "  @ApiResponse({ status: 400, description: '验证码无效或已过期' })\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        phone: { type: 'string', description: '手机号' },\n        code: { type: 'string', description: '验证码' },\n      },\n      required: ['phone', 'code'],\n    },\n  })\n  async verifyPhone(\n    @Body() dto: { phone: string; code: string },"
  },
  // sendBindEmailCode: BindEmailDto & { isRebind?: boolean }
  {
    old: "  @ApiResponse({ status: 409, description: '邮箱已被其他用户绑定' })\n  @ApiBearerAuth()\n  async sendBindEmailCode(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: BindEmailDto & { isRebind?: boolean }",
    new: "  @ApiResponse({ status: 409, description: '邮箱已被其他用户绑定' })\n  @ApiBearerAuth()\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        email: { type: 'string', description: '邮箱地址' },\n        isRebind: { type: 'boolean', description: '是否为换绑操作' },\n      },\n      required: ['email'],\n    },\n  })\n  async sendBindEmailCode(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: BindEmailDto & { isRebind?: boolean }"
  },
  // verifyUnbindEmailCode: { code: string }
  {
    old: "  @ApiResponse({ status: 401, description: '未绑定邮箱' })\n  @ApiBearerAuth()\n  async verifyUnbindEmailCode(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { code: string }",
    new: "  @ApiResponse({ status: 401, description: '未绑定邮箱' })\n  @ApiBearerAuth()\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        code: { type: 'string', description: '验证码' },\n      },\n      required: ['code'],\n    },\n  })\n  async verifyUnbindEmailCode(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { code: string }"
  },
  // rebindEmail: { email; code; token }
  {
    old: "  @ApiResponse({ status: 409, description: '新邮箱已被其他用户绑定' })\n  @ApiBearerAuth()\n  async rebindEmail(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { email: string; code: string; token: string }",
    new: "  @ApiResponse({ status: 409, description: '新邮箱已被其他用户绑定' })\n  @ApiBearerAuth()\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        email: { type: 'string', description: '新邮箱地址' },\n        code: { type: 'string', description: '新邮箱验证码' },\n        token: { type: 'string', description: '解绑验证令牌' },\n      },\n      required: ['email', 'code', 'token'],\n    },\n  })\n  async rebindEmail(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { email: string; code: string; token: string }"
  },
  // loginByPhone: { phone; code }
  {
    old: "  @ApiResponse({ status: 412, description: '手机号未注册，需要跳转注册页' })\n  async loginByPhone(\n    @Body() dto: { phone: string; code: string },",
    new: "  @ApiResponse({ status: 412, description: '手机号未注册，需要跳转注册页' })\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        phone: { type: 'string', description: '手机号' },\n        code: { type: 'string', description: '短信验证码' },\n      },\n      required: ['phone', 'code'],\n    },\n  })\n  async loginByPhone(\n    @Body() dto: { phone: string; code: string },"
  },
  // bindPhone: { phone; code }
  {
    old: "  @ApiResponse({ status: 409, description: '手机号已被其他用户绑定' })\n  @ApiBearerAuth()\n  async bindPhone(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { phone: string; code: string }",
    new: "  @ApiResponse({ status: 409, description: '手机号已被其他用户绑定' })\n  @ApiBearerAuth()\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        phone: { type: 'string', description: '手机号' },\n        code: { type: 'string', description: '短信验证码' },\n      },\n      required: ['phone', 'code'],\n    },\n  })\n  async bindPhone(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { phone: string; code: string }"
  },
  // verifyUnbindPhoneCode: { code: string }
  {
    old: "  @ApiResponse({ status: 401, description: '未绑定手机号' })\n  @ApiBearerAuth()\n  async verifyUnbindPhoneCode(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { code: string }",
    new: "  @ApiResponse({ status: 401, description: '未绑定手机号' })\n  @ApiBearerAuth()\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        code: { type: 'string', description: '验证码' },\n      },\n      required: ['code'],\n    },\n  })\n  async verifyUnbindPhoneCode(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { code: string }"
  },
  // rebindPhone: { phone; code; token }
  {
    old: "  @ApiResponse({ status: 409, description: '新手机号已被其他用户绑定' })\n  @ApiBearerAuth()\n  async rebindPhone(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { phone: string; code: string; token: string }",
    new: "  @ApiResponse({ status: 409, description: '新手机号已被其他用户绑定' })\n  @ApiBearerAuth()\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        phone: { type: 'string', description: '新手机号' },\n        code: { type: 'string', description: '新手机号验证码' },\n        token: { type: 'string', description: '解绑验证令牌' },\n      },\n      required: ['phone', 'code', 'token'],\n    },\n  })\n  async rebindPhone(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { phone: string; code: string; token: string }"
  },
  // bindWechat: { code; state }
  {
    old: "  @ApiResponse({ status: 409, description: '该微信已绑定其他账号' })\n  @ApiBearerAuth()\n  async bindWechat(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { code: string; state: string }",
    new: "  @ApiResponse({ status: 409, description: '该微信已绑定其他账号' })\n  @ApiBearerAuth()\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        code: { type: 'string', description: '微信授权code' },\n        state: { type: 'string', description: '微信授权state' },\n      },\n      required: ['code', 'state'],\n    },\n  })\n  async bindWechat(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { code: string; state: string }"
  },
];

let applied = 0;
for (const { old, new: newStr } of replacements) {
  if (authContent.includes(old)) {
    authContent = authContent.replace(old, newStr);
    applied++;
  } else {
    console.log('WARNING: replacement not found, first 80 chars:', old.substring(0, 80));
  }
}

fs.writeFileSync(authPath, authContent, 'utf-8');
console.log(`auth.controller.ts: ${applied}/${replacements.length} @ApiBody replacements applied`);
