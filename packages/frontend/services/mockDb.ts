import {
  type Asset,
  type FileNode,
  type FileType,
  type Library,
  type Role,
  type User,
} from '../types';

// Mock 权限枚举（仅用于 Mock 数据库）
enum MockPermission {
  VIEW_DASHBOARD = 'VIEW_DASHBOARD',
  ASSET_UPLOAD = 'ASSET_UPLOAD',
  PROJECT_VIEW_ALL = 'PROJECT_VIEW_ALL',
  LIBRARY_MANAGE = 'LIBRARY_MANAGE',
}

// --- Seed Data ---

const MOCK_ROLES: Role[] = [
  {
    id: 'ADMIN',
    name: '超级管理员',
    description: '拥有系统所有权限',
    isSystem: true,
    permissions: Object.values(MockPermission) as any[],
  },
  {
    id: 'USER',
    name: '普通用户',
    description: '可以参与项目设计，上传资源',
    permissions: [MockPermission.VIEW_DASHBOARD, MockPermission.ASSET_UPLOAD] as any[],
  },
];

const MOCK_USERS: User[] = [
  {
    id: 'u1',
    username: 'admin',
    email: 'admin@cloudcad.com',
    role: 'ADMIN',
    avatar: 'https://picsum.photos/100/100',
    status: 'ACTIVE',
  },
  {
    id: 'u2',
    username: 'li',
    email: 'li@design.com',
    role: 'USER',
    avatar: 'https://picsum.photos/101/101',
    status: 'ACTIVE',
  },
  {
    id: 'u3',
    username: 'zhang',
    email: 'zhang@intern.com',
    role: 'USER',
    avatar: 'https://picsum.photos/102/102',
    status: 'ACTIVE',
  },
];

const MOCK_FILES: FileNode[] = [
  {
    id: 'f1',
    parentId: null,
    name: '商业中心项目',
    type: 'folder',
    size: 0,
    updatedAt: '2023-10-25T10:00:00Z',
    ownerId: 'u1',
    shared: false,
    allowedUserIds: [],
  },
  {
    id: 'f2',
    parentId: null,
    name: '住宅区规划',
    type: 'folder',
    size: 0,
    updatedAt: '2023-10-26T14:30:00Z',
    ownerId: 'u2',
    shared: true,
    allowedUserIds: ['u2'],
  }, // Private to u2
  {
    id: 'f3',
    parentId: 'f1',
    name: '一层平面图.dwg',
    type: 'cad',
    size: 12500000,
    updatedAt: '2023-10-25T10:05:00Z',
    ownerId: 'u1',
    shared: false,
  },
  {
    id: 'f4',
    parentId: 'f1',
    name: '立面图.pdf',
    type: 'pdf',
    size: 4500000,
    updatedAt: '2023-10-25T11:20:00Z',
    ownerId: 'u1',
    shared: false,
  },
];

const MOCK_LIBRARIES: Library[] = [
  {
    id: 'lib1',
    name: '常用办公家具',
    type: 'block',
    description: '包含桌椅、柜子等常用办公图块',
    itemCount: 2,
    createdAt: '2023-01-01',
    coverUrl: 'https://picsum.photos/400/300?random=10',
    allowedUserIds: [],
  },
  {
    id: 'lib2',
    name: '电气符号库',
    type: 'block',
    description: '国标电气设计符号',
    itemCount: 0,
    createdAt: '2023-02-15',
    coverUrl: 'https://picsum.photos/400/300?random=11',
    allowedUserIds: [],
  },
  {
    id: 'lib3',
    name: '企业标准字体',
    type: 'font',
    description: '公司VI规定的标准中英文字体',
    itemCount: 2,
    createdAt: '2023-01-05',
    allowedUserIds: [],
  },
];

const MOCK_ASSETS: Asset[] = [
  {
    id: 'a1',
    libraryId: 'lib1',
    name: '标准沙发组件',
    category: 'block',
    url: 'https://picsum.photos/200/200?random=1',
    tags: ['家具', '室内'],
    size: 5000,
  },
  {
    id: 'a2',
    libraryId: 'lib1',
    name: '办公桌椅组合',
    category: 'block',
    url: 'https://picsum.photos/200/200?random=2',
    tags: ['办公', '家具'],
    size: 7500,
  },
];

export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

class MockDB {
  private users: User[];
  private roles: Role[];
  private files: FileNode[];
  private libraries: Library[];
  private assets: Asset[];
  private currentUser: User;

  constructor() {
    this.users = this.load('users', MOCK_USERS);
    this.roles = this.load('roles', MOCK_ROLES);
    this.files = this.load('files', MOCK_FILES);
    this.libraries = this.load('libraries', MOCK_LIBRARIES);
    this.assets = this.load('assets', MOCK_ASSETS);
    this.currentUser = this.users[0];
  }

  private load<T>(key: string, defaultValue: T): T {
    const stored = localStorage.getItem(`cloudcad_${key}`);
    return stored ? JSON.parse(stored) : defaultValue;
  }

  private save(key: string, data: any) {
    localStorage.setItem(`cloudcad_${key}`, JSON.stringify(data));
  }

  // --- Auth & Users ---
  async getCurrentUser() {
    await delay(300);
    return this.currentUser;
  }

  async getCurrentUserRole() {
    return this.roles.find((r) => r.id === this.currentUser.role);
  }

  async getUsers() {
    await delay(400);
    return this.users;
  }

  async createUser(data: Partial<User>) {
    await delay(300);
    const newUser: User = {
      id: `u_${Date.now()}`,
      username: data.username || data.email || 'newuser',
      email: data.email || '',
      role: data.role || 'USER',
      avatar: `https://ui-avatars.com/api/?name=${data.username || 'user'}&background=random`,
      status: 'ACTIVE',
    };
    this.users.push(newUser);
    this.save('users', this.users);
    return newUser;
  }

  async updateUser(id: string, data: Partial<User>) {
    await delay(300);
    this.users = this.users.map((u) => (u.id === id ? { ...u, ...data } : u));
    this.save('users', this.users);
    return this.users.find((u) => u.id === id);
  }

  async deleteUser(id: string) {
    await delay(300);
    this.users = this.users.filter((u) => u.id !== id);
    this.save('users', this.users);
  }

  // --- Roles ---
  async getRoles() {
    await delay(300);
    return this.roles;
  }

  async createRole(
    name: string,
    description: string,
    permissions: string[]
  ) {
    await delay(300);
    const newRole: Role = {
      id: `role_${Date.now()}`,
      name,
      description,
      permissions,
    };
    this.roles.push(newRole);
    this.save('roles', this.roles);
    return newRole;
  }

  async updateRole(id: string, data: Partial<Role>) {
    await delay(300);
    this.roles = this.roles.map((r) => (r.id === id ? { ...r, ...data } : r));
    this.save('roles', this.roles);
  }

  async deleteRole(id: string) {
    await delay(300);
    const role = this.roles.find((r) => r.id === id);
    if (role?.isSystem) throw new Error('无法删除系统角色');
    this.roles = this.roles.filter((r) => r.id !== id);
    this.save('roles', this.roles);
  }

  // --- Projects/Files (With Permissions) ---
  async getFiles(parentId: string | null) {
    await delay(300);
    const userRole = this.roles.find((r) => r.id === this.currentUser.role);
      const hasViewAll = userRole?.permissions.includes(
        MockPermission.PROJECT_VIEW_ALL as any
      );
    return this.files.filter((f) => {
      // Exclude deleted files
      if (f.deletedAt) return false;

      // Only verify access for root folders (Projects)
      if (f.parentId === null) {
        if (parentId !== null) return false; // Should check exact parent match first
        // If admin/view_all, show everything
        if (hasViewAll) return true;
        // If no restrictions, show it
        if (!f.allowedUserIds || f.allowedUserIds.length === 0) return true;
        // Check if user is in allowed list
        return f.allowedUserIds.includes(this.currentUser.id);
      }
      return f.parentId === parentId;
    });
  }

  async getTrash() {
    await delay(300);
    // For simplicity, trash shows all deleted items accessible to user.
    // In a real app, you might want to show hierarchy or just a flat list.
    // We'll show a flat list of deleted items owned by user or if admin.
    return this.files.filter((f) => !!f.deletedAt);
  }

  async createFolder(parentId: string | null, name: string) {
    await delay(300);
    const newFolder: FileNode = {
      id: `f_${Date.now()}`,
      parentId,
      name,
      type: 'folder',
      size: 0,
      updatedAt: new Date().toISOString(),
      ownerId: this.currentUser.id,
      shared: false,
      allowedUserIds: [], // Default public to team
    };
    this.files.push(newFolder);
    this.save('files', this.files);
    return newFolder;
  }

  async updateProjectMembers(fileId: string, userIds: string[]) {
    await delay(300);
    this.files = this.files.map((f) =>
      f.id === fileId ? { ...f, allowedUserIds: userIds } : f
    );
    this.save('files', this.files);
  }

  async renameFile(id: string, name: string) {
    await delay(200);
    this.files = this.files.map((f) => (f.id === id ? { ...f, name } : f));
    this.save('files', this.files);
    return this.files.find((f) => f.id === id);
  }

  async uploadFile(parentId: string | null, file: File) {
    await delay(800);
    let type: FileType = 'pdf'; // Default fallback
    if (file.name.endsWith('.dwg')) type = 'cad';
    else if (file.type.startsWith('image/')) type = 'image';
    else if (file.name.endsWith('.ttf') || file.name.endsWith('.otf'))
      type = 'font';

    const newFile: FileNode = {
      id: `file_${Date.now()}`,
      parentId,
      name: file.name,
      type,
      size: file.size,
      updatedAt: new Date().toISOString(),
      ownerId: this.currentUser.id,
      shared: false,
      thumbnail: type === 'image' ? URL.createObjectURL(file) : undefined,
    };

    this.files.push(newFile);
    this.save('files', this.files);
    return newFile;
  }

  async deleteFile(fileId: string) {
    await delay(300);
    const timestamp = new Date().toISOString();

    // Recursive soft delete
    const softDeleteRecursive = (id: string) => {
      this.files = this.files.map((f) => {
        if (f.id === id) return { ...f, deletedAt: timestamp };
        if (f.parentId === id) softDeleteRecursive(f.id); // Recurse first
        if (f.parentId === id) return { ...f, deletedAt: timestamp }; // Then mark child
        return f;
      });
    };

    softDeleteRecursive(fileId);
    this.save('files', this.files);
  }

  async restoreFile(fileId: string) {
    await delay(300);

    // Recursive restore
    const restoreRecursive = (id: string) => {
      this.files = this.files.map((f) => {
        if (f.id === id) return { ...f, deletedAt: undefined };
        // Note: strictly restoring children might restore items deleted prior to parent deletion in a complex system
        // but for this mock, assuming all children were deleted with parent
        if (f.parentId === id && f.deletedAt) restoreRecursive(f.id);
        if (f.parentId === id) return { ...f, deletedAt: undefined };
        return f;
      });
    };

    restoreRecursive(fileId);
    this.save('files', this.files);
  }

  async permanentlyDelete(fileId: string) {
    await delay(300);
    const file = this.files.find((f) => f.id === fileId);
    if (!file) return;

    const deleteRecursive = (id: string) => {
      const children = this.files.filter((f) => f.parentId === id);
      children.forEach((c) => deleteRecursive(c.id));

      const target = this.files.find((f) => f.id === id);
      if (target && target.type !== 'folder') {
        // File deleted
      }
      this.files = this.files.filter((f) => f.id !== id);
    };

    deleteRecursive(fileId);
    this.save('files', this.files);
  }

  async emptyTrash() {
    await delay(500);
    // Find all deleted files to calculate storage release
    const deletedFiles = this.files.filter((f) => !!f.deletedAt);

    deletedFiles.forEach((f) => {
      if (f.type !== 'folder') {
        // File permanently deleted
      }
    });

    this.files = this.files.filter((f) => !f.deletedAt);
    this.save('files', this.files);
  }

  async toggleShare(fileId: string) {
    await delay(200);
    this.files = this.files.map((f) =>
      f.id === fileId ? { ...f, shared: !f.shared } : f
    );
    this.save('files', this.files);
    return this.files.find((f) => f.id === fileId);
  }

  // --- Libraries ---
  async getLibraries(type: 'block' | 'font') {
    await delay(300);
    const userRole = this.roles.find((r) => r.id === this.currentUser.role);
      const canManage = userRole?.permissions.includes(
        MockPermission.LIBRARY_MANAGE as any
      );
    const updatedLibraries = this.libraries.map((lib) => ({
      ...lib,
      itemCount: this.assets.filter((a) => a.libraryId === lib.id).length,
    }));

    return updatedLibraries.filter((l) => {
      if (l.type !== type) return false;
      // Access Control Logic
      if (canManage) return true; // Managers see all
      if (!l.allowedUserIds || l.allowedUserIds.length === 0) return true; // Public
      return l.allowedUserIds.includes(this.currentUser.id); // Private
    });
  }

  async createLibrary(
    name: string,
    type: 'block' | 'font',
    description: string
  ) {
    await delay(400);
    const newLib: Library = {
      id: `lib_${Date.now()}`,
      name,
      type,
      description,
      itemCount: 0,
      createdAt: new Date().toISOString(),
      allowedUserIds: [],
    };
    this.libraries.push(newLib);
    this.save('libraries', this.libraries);
    return newLib;
  }

  async updateLibraryMembers(libId: string, userIds: string[]) {
    await delay(300);
    this.libraries = this.libraries.map((l) =>
      l.id === libId ? { ...l, allowedUserIds: userIds } : l
    );
    this.save('libraries', this.libraries);
  }

  async getLibraryById(id: string) {
    await delay(200);
    return this.libraries.find((l) => l.id === id) || null;
  }

  async getAssetsByLibrary(libraryId: string) {
    await delay(300);
    return this.assets.filter((a) => a.libraryId === libraryId);
  }

  async addAsset(libraryId: string, file: File, category: 'block' | 'font') {
    await delay(500);
    const newAsset: Asset = {
      id: `a_${Date.now()}`,
      libraryId,
      name: file.name,
      category,
      url: category === 'block' ? URL.createObjectURL(file) : '',
      tags: ['新上传'],
      size: file.size,
    };
    this.assets.push(newAsset);
    this.save('assets', this.assets);
    return newAsset;
  }

  // --- Stats ---
  async getStats() {
    await delay(400);
    return {
      totalFiles: this.files.filter((f) => f.type !== 'folder' && !f.deletedAt)
        .length,
      totalProjects: this.files.filter(
        (f) => f.parentId === null && !f.deletedAt
      ).length,
      recentFiles: this.files
        .filter((f) => f.type !== 'folder' && !f.deletedAt)
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
        .slice(0, 5),
      storageUsed: 0, // Storage tracking removed
      storageTotal: 0, // Storage tracking removed
    };
  }
}

export const mockDb = new MockDB();
