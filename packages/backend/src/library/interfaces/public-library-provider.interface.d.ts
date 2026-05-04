import { CreateFolderDto } from '../../file-system/dto/create-folder.dto';
export interface IPublicLibraryProvider {
    getLibraryId(): Promise<string>;
    getRootNode(): Promise<any>;
    createFolder(dto: CreateFolderDto): Promise<any>;
    deleteNode(nodeId: string): Promise<any>;
}
export declare const PUBLIC_LIBRARY_PROVIDER_DRAWING = "PUBLIC_LIBRARY_PROVIDER_DRAWING";
export declare const PUBLIC_LIBRARY_PROVIDER_BLOCK = "PUBLIC_LIBRARY_PROVIDER_BLOCK";
//# sourceMappingURL=public-library-provider.interface.d.ts.map