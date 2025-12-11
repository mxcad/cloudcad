# 开发指南

## 🚀 快速开始

### 环境准备

1. **安装 Node.js**

   ```bash
   # 推荐使用 nvm 管理版本
   nvm install 18
   nvm use 18
   ```

2. **安装 pnpm**

   ```bash
   npm install -g pnpm
   ```

3. **安装 Docker**
   - 下载并安装 [Docker Desktop](https://www.docker.com/products/docker-desktop)
   - 启动 Docker Desktop

### 项目启动

```bash
# 1. 克隆项目
git clone https://github.com/your-org/cloucad.git
cd cloudcad

# 2. 安装依赖
pnpm install

# 3. 启动开发环境
cd packages/backend
pnpm run dev

# 4. 启动前端（新开终端）
cd packages/frontend
pnpm run dev
```

## 📁 项目结构

```
cloudcad/
├── packages/
│   ├── backend/                 # 后端服务
│   │   ├── src/
│   │   │   ├── auth/           # 认证模块
│   │   │   ├── user/           # 用户管理
│   │   │   ├── file/           # 文件管理
│   │   │   ├── project/        # 项目管理
│   │   │   ├── storage/        # 存储服务
│   │   │   ├── database/       # 数据库服务
│   │   │   ├── health/         # 健康检查
│   │   │   └── common/         # 公共模块
│   │   ├── prisma/             # 数据库模型
│   │   ├── docker-compose.yml  # 生产环境
│   │   └── docker-compose.dev.yml # 开发环境
│   └── frontend/               # 前端应用
│       ├── src/
│       │   ├── components/     # 组件
│       │   ├── pages/          # 页面
│       │   ├── services/       # API服务
│       │   ├── hooks/          # 自定义Hook
│       │   └── utils/          # 工具函数
│       └── public/             # 静态资源
├── docs/                       # 文档
├── scripts/                    # 脚本
└── README.md                   # 项目说明
```

## 🛠️ 开发工作流

### 1. 功能开发流程

```bash
# 1. 创建功能分支
git checkout -b feature/user-management

# 2. 开发功能
# - 后端：创建模块、API、数据库模型
# - 前端：创建组件、页面、API调用

# 3. 运行测试
pnpm run test

# 4. 提交代码
git add .
git commit -m "feat: 添加用户管理功能"

# 5. 推送分支
git push origin feature/user-management

# 6. 创建 Pull Request
```

### 2. 后端开发

#### 创建新模块

```bash
# 生成模块
nest g module user
nest g controller user
nest g service user

# 生成 DTO
nest g class user/create-user.dto --no-spec
nest g class user/update-user.dto --no-spec
```

#### 数据库操作

```bash
# 创建迁移
npx prisma migrate dev --name add-user-table

# 生成客户端
npx prisma generate

# 查看数据库
npx prisma studio
```

#### API 开发示例

```typescript
// user.controller.ts
@Controller('users')
@ApiTags('用户管理')
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  @ApiOperation({ summary: '获取用户列表' })
  async findAll() {
    return this.userService.findAll();
  }

  @Post()
  @ApiOperation({ summary: '创建用户' })
  async create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }
}
```

### 3. 前端开发

#### 组件开发

```typescript
// components/UserCard.tsx
interface UserCardProps {
  user: User;
  onEdit?: (user: User) => void;
  onDelete?: (userId: string) => void;
}

export const UserCard: React.FC<UserCardProps> = ({ user, onEdit, onDelete }) => {
  return (
    <div className="card">
      <h3>{user.name}</h3>
      <p>{user.email}</p>
      <button onClick={() => onEdit?.(user)}>编辑</button>
      <button onClick={() => onDelete?.(user.id)}>删除</button>
    </div>
  );
};
```

#### API 调用

```typescript
// services/userService.ts
export const userService = {
  getUsers: async () => {
    const response = await api.get('/users');
    return response.data;
  },

  createUser: async (userData: CreateUserDto) => {
    const response = await api.post('/users', userData);
    return response.data;
  },
};
```

## 🔧 开发工具

### VS Code 推荐插件

- TypeScript Importer
- Prisma
- Docker
- ES7+ React/Redux/React-Native snippets
- Prettier - Code formatter
- ESLint

### 调试配置

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Backend",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/packages/backend/src/main.ts",
      "outFiles": ["${workspaceFolder}/packages/backend/dist/**/*.js"],
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

## 📋 代码规范

### TypeScript 规范

```typescript
// ✅ 好的实践
interface User {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
}

const getUserById = async (id: string): Promise<User | null> => {
  return await prisma.user.findUnique({ where: { id } });
};

// ❌ 避免的写法
const getUser = (id: any) => {
  return prisma.user.findUnique({ where: { id } });
};
```

### 组件规范

```typescript
// ✅ 使用 TypeScript 接口
interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
  onClick?: () => void;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  onClick
}) => {
  return (
    <button
      className={`btn btn-${variant}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
};
```

### API 规范

```typescript
// ✅ 使用 DTO 验证
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(6)
  password: string;
}

// ✅ 统一响应格式
@Get()
async findAll(): Promise<ApiResponse<User[]>> {
  const users = await this.userService.findAll();
  return {
    code: 'SUCCESS',
    message: '获取用户列表成功',
    data: users,
  };
}
```

## 🧪 测试指南

### 后端测试

```typescript
// user.service.spec.ts
describe('UserService', () => {
  let service: UserService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [UserService, PrismaService],
    }).compile();

    service = module.get<UserService>(UserService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  it('should create a user', async () => {
    const userData = {
      email: 'test@example.com',
      name: 'Test User',
      password: 'password123',
    };

    const user = await service.create(userData);
    expect(user.email).toBe(userData.email);
  });
});
```

### 前端测试

```typescript
// UserCard.test.tsx
describe('UserCard', () => {
  it('renders user information', () => {
    const user = {
      id: '1',
      name: 'John Doe',
      email: 'john@example.com',
    };

    render(<UserCard user={user} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('john@example.com')).toBeInTheDocument();
  });
});
```

## 🚀 部署指南

### 开发环境

```bash
# 启动所有服务
pnpm run dev

# 查看服务状态
pnpm run dev:status
```

### 生产环境

```bash
# 构建项目
pnpm run build

# 启动生产服务
pnpm run prod
```

### Docker 部署

```bash
# 构建镜像
docker build -t cloucad-backend .

# 启动服务
docker-compose up -d
```

## 🔍 故障排除

### 常见问题

1. **端口冲突**

   ```bash
   # 查看端口占用
   netstat -ano | findstr :3001

   # 修改端口
   set PORT=3002
   ```

2. **数据库连接失败**

   ```bash
   # 检查数据库状态
   docker-compose ps postgres

   # 查看日志
   docker-compose logs postgres
   ```

3. **依赖安装失败**

   ```bash
   # 清理缓存
   pnpm store prune

   # 重新安装
   rm -rf node_modules
   pnpm install
   ```

### 性能优化

1. **后端优化**
   - 使用数据库连接池
   - 添加 Redis 缓存
   - 优化查询语句

2. **前端优化**
   - 使用 React.memo
   - 实现虚拟滚动
   - 代码分割

## 📚 学习资源

- [NestJS 官方文档](https://docs.nestjs.com/)
- [React 官方文档](https://react.dev/)
- [Prisma 文档](https://www.prisma.io/docs/)
- [Docker 文档](https://docs.docker.com/)
- [TypeScript 文档](https://www.typescriptlang.org/docs/)

---

💡 如需更多帮助，请查看项目 Wiki 或提交 Issue。
