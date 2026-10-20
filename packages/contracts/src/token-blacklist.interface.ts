// 只有 token 级名单（token:blacklist:<完整 JWT>），写入方与读侧都在用。
//
// 用户级名单（user:blacklist:<userId>）已退役（Gitea #484）：写入方恒为空，而读侧挂在四处
// 鉴权热路径上并 fail-closed——它唯一可能被触发的情况就是 Redis 异常，效果是全平台用户被拒。
// 用户停用/删除由 DB 实时判定负责（deletedAt: null + status !== 'ACTIVE'）。
export interface ITokenBlacklistService {
  addToBlacklist: (token: string, expiresIn: number) => Promise<void>;
}
