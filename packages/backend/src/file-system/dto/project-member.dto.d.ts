/**
 * 添加项目成员 DTO
 */
export declare class AddProjectMemberDto {
    userId: string;
    roleId: string;
}
/**
 * 更新项目成员 DTO
 */
export declare class UpdateProjectMemberDto {
    projectRoleId: string;
    roleId?: string;
}
/**
 * 批量添加项目成员 DTO
 */
export declare class BatchAddProjectMembersDto {
    members: AddProjectMemberDto[];
}
/**
 * 批量更新项目成员 DTO
 */
export declare class BatchUpdateProjectMembersDto {
    updates: Array<{
        userId: string;
        roleId: string;
    }>;
}
//# sourceMappingURL=project-member.dto.d.ts.map