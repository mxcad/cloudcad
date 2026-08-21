import { Test, type TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { RuntimeConfigService } from "../../runtime-config/runtime-config.service";
import { PaymentGatewayFactory } from "./payment-gateway.factory";
import { MockPaymentGateway } from "./mock/mock-payment.gateway";
import { WechatPayGateway } from "./wechat-pay/wechat-pay.gateway";

describe("PaymentGatewayFactory", () => {
  let factory: PaymentGatewayFactory;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        PaymentGatewayFactory,
        MockPaymentGateway,
        {
          provide: WechatPayGateway,
          useValue: {
            name: "wechat_pay",
            createPayment: jest.fn(),
            verifyWebhook: jest.fn(),
            queryOrder: jest.fn(),
            refund: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue("mock"),
          },
        },
        {
          provide: RuntimeConfigService,
          useValue: {
            getValue: jest.fn(),
          },
        },
      ],
    }).compile();

    factory = module.get<PaymentGatewayFactory>(PaymentGatewayFactory);
  });

  describe("getActiveGateway", () => {
    it("should throw error when paymentEnabled is false", async () => {
      const runtimeConfig = module.get<RuntimeConfigService>(RuntimeConfigService);
      jest.spyOn(runtimeConfig, "getValue").mockResolvedValue(false);

      await expect(factory.getActiveGateway()).rejects.toThrow("payment is disabled");
    });

    it("should return wechat_pay gateway when paymentEnabled is true and provider is wechat_pay", async () => {
      const runtimeConfig = module.get<RuntimeConfigService>(RuntimeConfigService);
      jest.spyOn(runtimeConfig, "getValue").mockResolvedValue(true);
      const configService = module.get<ConfigService>(ConfigService);
      jest.spyOn(configService, "get").mockReturnValue("wechat_pay");

      const gateway = await factory.getActiveGateway();
      expect(gateway.name).toBe("wechat_pay");
    });

    it("should throw error for unknown provider", async () => {
      const runtimeConfig = module.get<RuntimeConfigService>(RuntimeConfigService);
      jest.spyOn(runtimeConfig, "getValue").mockResolvedValue(true);
      const configService = module.get<ConfigService>(ConfigService);
      jest.spyOn(configService, "get").mockReturnValue("nonexistent_provider");

      await expect(factory.getActiveGateway()).rejects.toThrow("active payment gateway not found");
    });
  });

  describe("getGateway", () => {
    it("should return mock gateway by name", () => {
      const gateway = factory.getGateway("mock");
      expect(gateway.name).toBe("mock");
    });

    it("should return wechat_pay gateway by name", () => {
      const gateway = factory.getGateway("wechat_pay");
      expect(gateway.name).toBe("wechat_pay");
    });

    it("should throw for unsupported gateway name", () => {
      expect(() => factory.getGateway("alipay")).toThrow("unsupported payment gateway");
    });
  });

  describe("getAvailableGateways", () => {
    it("should list available gateways", () => {
      const gateways = factory.getAvailableGateways();
      expect(gateways).toContain("mock");
      expect(gateways).toContain("wechat_pay");
    });
  });
});
