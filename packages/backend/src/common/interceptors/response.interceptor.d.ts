import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
export interface Response<T> {
    code: string;
    message: string;
    data: T;
    timestamp: string;
}
export declare class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
    intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>>;
}
//# sourceMappingURL=response.interceptor.d.ts.map