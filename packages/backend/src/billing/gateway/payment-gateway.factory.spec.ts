import { Test, type TestingModule } from "@nestjs/testing";
import { RuntimeConfigService } from "../../runtime-config/runtime-config.service";
import { PaymentGatewayFactory } from "./payment-gateway.factory";
import { MockPaymentGateway } from "./mock/mock-payment.gateway";
import { WechatPayGateway } from "./wechat-pay/wechat-pay.gateway";

describe("PaymentGatewayFactory", () => {
  let factory: PaymentGatewayFactory;
  let module: TestingModule;

  /** 按键分派的 getValue mock：paymentEnabled / paymentProvider 各自取值 */
  const mockRuntimeValues = (
    enabled: boolean,
    provider: string
  ): jest.Mock =>
    jest.fn(async (key: string) =>
      key === "paymentEnabled" ? enabled : provider
    );

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
          provide: RuntimeConfigService,
          useValue: {
            getValue: mockRuntimeValues(true, "mock"),
          },
        },
      ],
    }).compile();

    factory = module.get<PaymentGatewayFactory>(PaymentGatewayFactory);
  });

  const setRuntimeValues = (enabled: boolean, provider: string) => {
    const runtimeConfig = module.get<RuntimeConfigService>(RuntimeConfigService);
    jest
      .spyOn(runtimeConfig, "getValue")
      .mockImplementation(async (key: string) =>
        key === "paymentEnabled" ? enabled : provider
      );
  };

  describe("getActiveGateway", () => {
    it("should throw error when paymentEnabled is false", async () => {
      setRuntimeValues(false, "mock");

      await expect(factory.getActiveGateway()).rejects.toThrow("payment is disabled");
    });

    it("should return wechat_pay gateway when paymentEnabled is true and provider is wechat_pay", async () => {
      setRuntimeValues(true, "wechat_pay");

      const gateway = await factory.getActiveGateway();
      expect(gateway.name).toBe("wechat_pay");
    });

    it("should throw error for unknown provider", async () => {
      setRuntimeValues(true, "nonexistent_provider");

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
