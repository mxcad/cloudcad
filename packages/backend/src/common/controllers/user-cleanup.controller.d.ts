import { UserCleanupService } from '../services/user-cleanup.service';
import { UserCleanupStatsResponseDto, UserCleanupTriggerDto, UserCleanupTriggerResponseDto } from './dto/user-cleanup.dto';
export declare class UserCleanupController {
    private readonly userCleanupService;
    constructor(userCleanupService: UserCleanupService);
    getStats(): Promise<UserCleanupStatsResponseDto>;
    triggerCleanup(body: UserCleanupTriggerDto): Promise<UserCleanupTriggerResponseDto>;
}
//# sourceMappingURL=user-cleanup.controller.d.ts.map