import { Controller, Post, Get, Req, Res, Body, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from './decorators/public.decorator';

// 扩展 Session 类型
declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      email: string;
      username: string;
      role: string;
    };
  }
}

@Public()
@Controller('session')
export class SessionController {
  private readonly logger = new Logger(SessionController.name);

  /**
   * 设置用户 Session
   */
  @Post('create')
  async createSession(@Req() req: Request, @Body() body: { user: { id: string; email: string; username: string; role: string } }) {
    this.logger.debug(`创建 Session, 用户: ${body.user?.id}`);
    this.logger.debug(`Session ID: ${req.sessionID}`);

    if (!body.user) {
      return { success: false, message: '用户信息不能为空' };
    }

    // 将用户信息存储到 session 中
    req.session.user = {
      id: body.user.id,
      email: body.user.email,
      username: body.user.username,
      role: body.user.role,
    };

    // 确保 session 保存
    await new Promise<void>((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          this.logger.error(`Session 保存失败: ${err.message}`);
          reject(err);
        } else {
          this.logger.debug('Session 保存成功');
          resolve();
        }
      });
    });

    return { success: true, message: 'Session 创建成功' };
  }

  /**
   * 获取当前 Session 用户信息
   */
  @Get('user')
  async getSessionUser(@Req() req: Request) {
    this.logger.debug('获取 Session 用户信息');
    this.logger.debug(`Session ID: ${req.sessionID}`);

    const user = req.session?.user;
    if (!user) {
      return { success: false, message: '用户未登录' };
    }

    return { success: true, user };
  }

  /**
   * 清除 Session
   */
  @Post('destroy')
  async destroySession(@Req() req: Request, @Res() res: Response) {
    req.session.destroy((err) => {
      if (err) {
        return res
          .status(500)
          .json({ success: false, message: 'Session 销毁失败' });
      }
      res.clearCookie('mxcad.sid');
      res.json({ success: true, message: 'Session 已销毁' });
    });
  }
}