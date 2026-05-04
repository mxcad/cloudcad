import { DatabaseService } from '../../database/database.service';
import { SearchDto } from '../dto/search.dto';
import { FileSystemPermissionService } from '../file-permission/file-system-permission.service';
import { PermissionService } from '../../common/services/permission.service';
import { NodeListResponseDto } from '../dto/file-system-response.dto';
export declare class SearchService {
    private readonly prisma;
    private readonly permissionService;
    private readonly systemPermissionService;
    private readonly logger;
    constructor(prisma: DatabaseService, permissionService: FileSystemPermissionService, systemPermissionService: PermissionService);
    search(userId: string, dto: SearchDto): Promise<NodeListResponseDto>;
    private searchProjects;
    private searchProjectFiles;
    private searchAllProjects;
    private searchLibrary;
    private getAllProjectNodeIds;
}
//# sourceMappingURL=search.service.d.ts.map