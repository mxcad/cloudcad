import { User } from '@prisma/client';

export interface AuthenticatedRequest {
  user: User;
}

export interface FileUploadRequest extends AuthenticatedRequest {
  file(): Promise<Express.Multer.File>;
  body: {
    projectId: string;
  };
}