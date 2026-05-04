declare global {
    namespace jest {
        interface Matchers<R> {
            toBeValidUser(): R;
            toBeValidAuthResponse(): R;
            toBeValidPaginatedResponse(): R;
            toHavePermission(permission: string): R;
            toBeInStatus(status: string): R;
        }
    }
    function createMockRequest(user?: unknown, params?: Record<string, unknown>, query?: Record<string, unknown>, body?: Record<string, unknown>): {
        user: unknown;
        params: Record<string, unknown>;
        query: Record<string, unknown>;
        body: Record<string, unknown>;
        headers: Record<string, string>;
        method: string;
        url: string;
    };
    function createMockResponse(): {
        status: jest.Mock;
        json: jest.Mock;
        send: jest.Mock;
        redirect: jest.Mock;
    };
    function createMockNext(): jest.Mock;
    function sleep(ms: number): Promise<void>;
    function generateId(): string;
    function generateEmail(): string;
    function generateUsername(): string;
    function createTestUser(overrides?: Record<string, unknown>): Record<string, unknown>;
    function createTestProject(overrides?: Record<string, unknown>): Record<string, unknown>;
    function createTestFile(overrides?: Record<string, unknown>): Record<string, unknown>;
}
export {};
//# sourceMappingURL=setup.d.ts.map