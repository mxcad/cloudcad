import re

# ============================================================
# 1. Fix file-system.controller.ts - add ApiBody import + @ApiBody for updateProjectMember
# ============================================================
fs_path = r"D:\web\MxCADOnline\cloudcad\packages\backend\src\file-system\file-system.controller.ts"
with open(fs_path, "r", encoding="utf-8") as f:
    content = f.read()

# Add ApiBody to imports
content = content.replace(
    "import {\n\t\tApiBearerAuth,\n\t\tApiOperation,",
    "import {\n\t\tApiBearerAuth,\n\t\tApiBody,\n\t\tApiOperation,"
)

# Add @ApiBody before updateProjectMember
old_block = '\t@ApiResponse({ status: 404, description: "项目或成员不存在" })\n\tasync updateProjectMember('
new_block = '''\t@ApiResponse({ status: 404, description: "项目或成员不存在" })
\t@ApiBody({
\t\tschema: {
\t\t\ttype: 'object',
\t\t\tproperties: {
\t\t\t\tprojectRoleId: { type: 'string', description: '项目角色ID' },
\t\t\t\troleId: { type: 'string', description: '角色ID（兼容旧字段）' },
\t\t\t},
\t\t\trequired: [],
\t\t},
\t})
\tasync updateProjectMember('''
content = content.replace(old_block, new_block)

with open(fs_path, "w", encoding="utf-8") as f:
    f.write(content)
print("file-system.controller.ts: ApiBody import + updateProjectMember @ApiBody added")

# ============================================================
# 2. Fix auth.controller.ts - add @ApiBody for all inline body endpoints
# ============================================================
auth_path = r"D:\web\MxCADOnline\cloudcad\packages\backend\src\auth\auth.controller.ts"
with open(auth_path, "r", encoding="utf-8") as f:
    content = f.read()

replacements = [
    # sendVerification: { email: string }
    (
        "  @ApiResponse({ status: 400, description: '请求参数错误或发送过于频繁' })\n  async sendVerification(\n    @Body() dto: { email: string }",
        "  @ApiResponse({ status: 400, description: '请求参数错误或发送过于频繁' })\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        email: { type: 'string', description: '邮箱地址' },\n      },\n      required: ['email'],\n    },\n  })\n  async sendVerification(\n    @Body() dto: { email: string }"
    ),
    # verifyEmailAndRegisterPhone: multiline inline type
    (
        "  @ApiResponse({ status: 409, description: '手机号、邮箱或用户名已存在' })\n  async verifyEmailAndRegisterPhone(\n    @Body()\n    dto: {\n      email: string;\n      code: string;\n      phone: string;\n      phoneCode: string;\n      username: string;\n      password: string;\n      nickname?: string;\n    },",
        "  @ApiResponse({ status: 409, description: '手机号、邮箱或用户名已存在' })\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        email: { type: 'string', description: '邮箱地址' },\n        code: { type: 'string', description: '邮箱验证码' },\n        phone: { type: 'string', description: '手机号' },\n        phoneCode: { type: 'string', description: '短信验证码' },\n        username: { type: 'string', description: '用户名' },\n        password: { type: 'string', description: '密码' },\n        nickname: { type: 'string', description: '昵称（可选）' },\n      },\n      required: ['email', 'code', 'phone', 'phoneCode', 'username', 'password'],\n    },\n  })\n  async verifyEmailAndRegisterPhone(\n    @Body()\n    dto: {\n      email: string;\n      code: string;\n      phone: string;\n      phoneCode: string;\n      username: string;\n      password: string;\n      nickname?: string;\n    },"
    ),
    # resendVerification: { email: string }
    (
        "  @ApiResponse({ status: 400, description: '请求参数错误或发送过于频繁' })\n  async resendVerification(\n    @Body() dto: { email: string }",
        "  @ApiResponse({ status: 400, description: '请求参数错误或发送过于频繁' })\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        email: { type: 'string', description: '邮箱地址' },\n      },\n      required: ['email'],\n    },\n  })\n  async resendVerification(\n    @Body() dto: { email: string }"
    ),
    # bindEmailAndLogin: { tempToken; email; code }
    (
        "  @ApiResponse({ status: 400, description: '验证码无效或令牌过期' })\n  async bindEmailAndLogin(\n    @Body() dto: { tempToken: string; email: string; code: string },",
        "  @ApiResponse({ status: 400, description: '验证码无效或令牌过期' })\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        tempToken: { type: 'string', description: '临时令牌' },\n        email: { type: 'string', description: '邮箱地址' },\n        code: { type: 'string', description: '验证码' },\n      },\n      required: ['tempToken', 'email', 'code'],\n    },\n  })\n  async bindEmailAndLogin(\n    @Body() dto: { tempToken: string; email: string; code: string },"
    ),
    # bindPhoneAndLogin: { tempToken; phone; code }
    (
        "  @ApiResponse({ status: 400, description: '验证码无效或令牌过期' })\n  async bindPhoneAndLogin(\n    @Body() dto: { tempToken: string; phone: string; code: string },",
        "  @ApiResponse({ status: 400, description: '验证码无效或令牌过期' })\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        tempToken: { type: 'string', description: '临时令牌' },\n        phone: { type: 'string', description: '手机号' },\n        code: { type: 'string', description: '验证码' },\n      },\n      required: ['tempToken', 'phone', 'code'],\n    },\n  })\n  async bindPhoneAndLogin(\n    @Body() dto: { tempToken: string; phone: string; code: string },"
    ),
    # verifyPhone: { phone; code }
    (
        "  @ApiResponse({ status: 400, description: '验证码无效或已过期' })\n  async verifyPhone(\n    @Body() dto: { phone: string; code: string },",
        "  @ApiResponse({ status: 400, description: '验证码无效或已过期' })\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        phone: { type: 'string', description: '手机号' },\n        code: { type: 'string', description: '验证码' },\n      },\n      required: ['phone', 'code'],\n    },\n  })\n  async verifyPhone(\n    @Body() dto: { phone: string; code: string },"
    ),
    # sendBindEmailCode: BindEmailDto & { isRebind?: boolean }
    (
        "  @ApiResponse({ status: 409, description: '邮箱已被其他用户绑定' })\n  @ApiBearerAuth()\n  async sendBindEmailCode(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: BindEmailDto & { isRebind?: boolean }",
        "  @ApiResponse({ status: 409, description: '邮箱已被其他用户绑定' })\n  @ApiBearerAuth()\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        email: { type: 'string', description: '邮箱地址' },\n        isRebind: { type: 'boolean', description: '是否为换绑操作' },\n      },\n      required: ['email'],\n    },\n  })\n  async sendBindEmailCode(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: BindEmailDto & { isRebind?: boolean }"
    ),
    # verifyUnbindEmailCode: { code: string }
    (
        "  @ApiResponse({ status: 401, description: '未绑定邮箱' })\n  @ApiBearerAuth()\n  async verifyUnbindEmailCode(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { code: string }",
        "  @ApiResponse({ status: 401, description: '未绑定邮箱' })\n  @ApiBearerAuth()\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        code: { type: 'string', description: '验证码' },\n      },\n      required: ['code'],\n    },\n  })\n  async verifyUnbindEmailCode(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { code: string }"
    ),
    # rebindEmail: { email; code; token }
    (
        "  @ApiResponse({ status: 409, description: '新邮箱已被其他用户绑定' })\n  @ApiBearerAuth()\n  async rebindEmail(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { email: string; code: string; token: string }",
        "  @ApiResponse({ status: 409, description: '新邮箱已被其他用户绑定' })\n  @ApiBearerAuth()\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        email: { type: 'string', description: '新邮箱地址' },\n        code: { type: 'string', description: '新邮箱验证码' },\n        token: { type: 'string', description: '解绑验证令牌' },\n      },\n      required: ['email', 'code', 'token'],\n    },\n  })\n  async rebindEmail(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { email: string; code: string; token: string }"
    ),
    # loginByPhone: { phone; code }
    (
        "  @ApiResponse({ status: 412, description: '手机号未注册，需要跳转注册页' })\n  async loginByPhone(\n    @Body() dto: { phone: string; code: string },",
        "  @ApiResponse({ status: 412, description: '手机号未注册，需要跳转注册页' })\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        phone: { type: 'string', description: '手机号' },\n        code: { type: 'string', description: '短信验证码' },\n      },\n      required: ['phone', 'code'],\n    },\n  })\n  async loginByPhone(\n    @Body() dto: { phone: string; code: string },"
    ),
    # bindPhone: { phone; code }
    (
        "  @ApiResponse({ status: 409, description: '手机号已被其他用户绑定' })\n  @ApiBearerAuth()\n  async bindPhone(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { phone: string; code: string }",
        "  @ApiResponse({ status: 409, description: '手机号已被其他用户绑定' })\n  @ApiBearerAuth()\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        phone: { type: 'string', description: '手机号' },\n        code: { type: 'string', description: '短信验证码' },\n      },\n      required: ['phone', 'code'],\n    },\n  })\n  async bindPhone(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { phone: string; code: string }"
    ),
    # verifyUnbindPhoneCode: { code: string }
    (
        "  @ApiResponse({ status: 401, description: '未绑定手机号' })\n  @ApiBearerAuth()\n  async verifyUnbindPhoneCode(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { code: string }",
        "  @ApiResponse({ status: 401, description: '未绑定手机号' })\n  @ApiBearerAuth()\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        code: { type: 'string', description: '验证码' },\n      },\n      required: ['code'],\n    },\n  })\n  async verifyUnbindPhoneCode(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { code: string }"
    ),
    # rebindPhone: { phone; code; token }
    (
        "  @ApiResponse({ status: 409, description: '新手机号已被其他用户绑定' })\n  @ApiBearerAuth()\n  async rebindPhone(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { phone: string; code: string; token: string }",
        "  @ApiResponse({ status: 409, description: '新手机号已被其他用户绑定' })\n  @ApiBearerAuth()\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        phone: { type: 'string', description: '新手机号' },\n        code: { type: 'string', description: '新手机号验证码' },\n        token: { type: 'string', description: '解绑验证令牌' },\n      },\n      required: ['phone', 'code', 'token'],\n    },\n  })\n  async rebindPhone(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { phone: string; code: string; token: string }"
    ),
    # bindWechat: { code; state }
    (
        "  @ApiResponse({ status: 409, description: '该微信已绑定其他账号' })\n  @ApiBearerAuth()\n  async bindWechat(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { code: string; state: string }",
        "  @ApiResponse({ status: 409, description: '该微信已绑定其他账号' })\n  @ApiBearerAuth()\n  @ApiBody({\n    schema: {\n      type: 'object',\n      properties: {\n        code: { type: 'string', description: '微信授权code' },\n        state: { type: 'string', description: '微信授权state' },\n      },\n      required: ['code', 'state'],\n    },\n  })\n  async bindWechat(\n    @Request() req: AuthenticatedRequest,\n    @Body() dto: { code: string; state: string }"
    ),
]

applied = 0
for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        applied += 1
    else:
        print(f"WARNING: replacement not found, first 80 chars: {old[:80]}...")

with open(auth_path, "w", encoding="utf-8") as f:
    f.write(content)
print(f"auth.controller.ts: {applied}/{len(replacements)} @ApiBody replacements applied")
