import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { DatabaseService } from '../../database/database.service';
import { JwtService } from '@nestjs/jwt';

export interface MxCadContext {
  projectId?: string;
  parentId?: string;
  userId?: string;
  userRole?: string;
}

@Injectable()
export class MxCadContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(MxCadContextInterceptor.name);

  constructor(
    private readonly prisma: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const referer = request.headers.referer;
    
    // 优先从请求体中获取项目ID和父文件夹ID
    let projectId = request.body?.projectId;
    let parentId = request.body?.parentId;
    
    // 添加调试信息
    this.logger.log(`拦截器执行时 - request.body 存在: ${!!request.body}, 内容: ${JSON.stringify(request.body)}`);
    this.logger.log(`拦截器执行时 - request.fields 存在: ${!!request.fields}`);
    
    // 对于 multipart/form-data 请求，字段可能在 req.body 中但未解析
    // 尝试从原始请求中解析（如果需要）
    if (!projectId && request.fields) {
      projectId = request.fields.projectId?.value;
      parentId = request.fields.parentId?.value;
      this.logger.log(`从 request.fields 获取项目信息: projectId=${projectId}, parentId=${parentId}`);
    }
    
    // 如果请求体中没有，则从 Referer 解析
    if (!projectId && referer) {
      // 解析 Referer: http://localhost:3000/projects/123/folders/456
      const urlPattern = /\/projects\/(\d+)(?:\/folders\/(\d+))?/;
      const match = referer.match(urlPattern);
      projectId = match?.[1];
      parentId = parentId || match?.[2];
    }
    
    // 尝试手动验证 JWT token
    let user = request.user || request.session?.user;
    
    if (!user && request.headers.authorization) {
      try {
        const token = request.headers.authorization.replace('Bearer ', '');
        const payload = this.jwtService.verify(token);
        user = await this.prisma.user.findUnique({
          where: { id: payload.sub },
          select: {
            id: true,
            email: true,
            username: true,
            nickname: true,
            avatar: true,
            role: true,
            status: true,
          },
        });
        
        if (user && user.status === 'ACTIVE') {
          this.logger.log(`手动 JWT 验证成功: ${user.username}`);
        } else {
          user = null;
        }
      } catch (error) {
        this.logger.warn('JWT 验证失败，继续使用匿名访问', error.message);
        user = null;
      }
    }
    
    // 添加调试日志
    this.logger.log(`解析 MxCAD 上下文 - projectId: ${projectId}, parentId: ${parentId}, userId: ${user?.id}`);
    this.logger.log(`请求体内容: ${JSON.stringify(request.body)}`);
    
    const mxcadContext: MxCadContext = {
      projectId,
      parentId,
      userId: user?.id,
      userRole: user?.role,
    };
    
    // 将上下文附加到请求对象
    request.mxcadContext = mxcadContext;
    
    return next.handle();
  }
}