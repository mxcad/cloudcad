import { VersionControlService } from './version-control.service';
import { SvnLogResponseDto, FileContentResponseDto } from './dto';
export declare class VersionControlController {
    private readonly versionControlService;
    constructor(versionControlService: VersionControlService);
    /**
     * 获取节点的 SVN 提交历史（自动提取目录路径）
     * 传入文件路径时，会自动提取所在目录的历史记录
     * 这样可以看到节点目录下所有文件的变更记录
     */
    getFileHistory(projectId: string, filePath: string, limit?: number): Promise<SvnLogResponseDto>;
    /**
     * 获取指定版本的文件内容
     */
    getFileContentAtRevision(revision: number, projectId: string, filePath: string): Promise<FileContentResponseDto>;
}
//# sourceMappingURL=version-control.controller.d.ts.map