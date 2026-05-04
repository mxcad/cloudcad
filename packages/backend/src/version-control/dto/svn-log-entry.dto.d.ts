import { SvnLogPathDto } from './svn-log-path.dto';
/**
 * SVN 提交记录条目 DTO
 */
export declare class SvnLogEntryDto {
    revision: number;
    author: string;
    date: Date;
    message: string;
    userName?: string;
    paths?: SvnLogPathDto[];
}
//# sourceMappingURL=svn-log-entry.dto.d.ts.map