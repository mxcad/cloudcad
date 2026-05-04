import { ConfigService } from "@nestjs/config";
import { Server } from "@tus/server";
import { TusEventHandler } from "./tus-event-handler.service";
export declare class TusService {
    private readonly configService;
    private readonly tusEventHandler;
    private readonly logger;
    private server;
    private _initialized;
    constructor(configService: ConfigService, tusEventHandler: TusEventHandler);
    private ensureInitialized;
    getServer(): Server;
    getHandler(): (req: import("http").IncomingMessage, res: import("http").ServerResponse) => Promise<void>;
}
//# sourceMappingURL=tus.service.d.ts.map