export interface ITokenBlacklistService {
  addToBlacklist: (token: string, expiresIn: number) => Promise<void>;
  removeUserFromBlacklist: (userId: string) => Promise<void>;
}
