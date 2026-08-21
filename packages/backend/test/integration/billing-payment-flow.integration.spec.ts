import type { INestApplication } from "@nestjs/common";
import { VersioningType } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaClient, OrderStatus } from "@cloudcad/db";
import { PrismaPg } from "@prisma/adapter-pg";
import request from "supertest";
import { AppModule } from "../../src/app.module";
import { RuntimeConfigService } from "../../src/runtime-config/runtime-config.service";

describe("Billing → Payment Flow (Mock Mode) Integration", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let testUserEmail: string;
  let testUserPassword: string;
  let testUserId: string;
  let accessToken: string;
  let vipTier1: { id: string; baseMonthlyPrice: number; name: string; level: number };
  let vipTier2: { id: string; baseMonthlyPrice: number; name: string; level: number };
  let dur1: { id: string; months: number; multiplierBps: number; label: string };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();

    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
    await prisma.$connect();

    // 支付总开关是运行时配置（默认 false），未开启时下单会报 "payment is disabled"
    const runtimeConfigService = app.get(RuntimeConfigService);
    await runtimeConfigService.set("paymentEnabled", true);

    testUserEmail = `billing-test-${Date.now()}@example.com`;
    testUserPassword = "Test@123456";
  }, 60000);

  afterAll(async () => {
    await cleanupTestData();
    const runtimeConfigService = app.get(RuntimeConfigService);
    await runtimeConfigService.set("paymentEnabled", false);
    await prisma.$disconnect();
    await app.close();
  }, 60000);

  async function cleanupTestData() {
    if (testUserId) {
      // 先删退款申请（外键引用 payment_orders），再删订单
      await prisma.refundApplication.deleteMany({ where: { userId: testUserId } });
      await prisma.paymentOrder.deleteMany({ where: { userId: testUserId } });
      await prisma.userMembership.deleteMany({ where: { userId: testUserId } });
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { email: testUserEmail } });
    }
  }

  describe("T1: Setup — Create test user & seed VIP data", () => {
    it("T1-S1: Should register test user", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/auth/register")
        .send({
          email: testUserEmail,
          username: `billinguser${Date.now().toString().slice(-8)}`,
          password: testUserPassword,
          nickname: "Billing Test User",
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.data.accessToken).toBeDefined();
      testUserId = response.body.data.user.id;
      accessToken = response.body.data.accessToken;
    });

    it("T1-S2: Should seed VIP tiers and durations", async () => {
      const tier1 = await prisma.vipTier.findFirst({ where: { level: 1 } });
      const tier2 = await prisma.vipTier.findFirst({ where: { level: 2 } });
      const dur = await prisma.durationPricing.findFirst({ where: { months: 1 } });

      if (tier1 && tier2 && dur) {
        vipTier1 = { id: tier1.id, baseMonthlyPrice: tier1.baseMonthlyPrice, name: tier1.name, level: tier1.level };
        vipTier2 = { id: tier2.id, baseMonthlyPrice: tier2.baseMonthlyPrice, name: tier2.name, level: tier2.level };
        dur1 = { id: dur.id, months: dur.months, multiplierBps: dur.multiplierBps, label: dur.label };
        expect(vipTier1.id).toBeDefined();
        expect(vipTier2.id).toBeDefined();
        expect(dur1.id).toBeDefined();
      } else {
        // create seed data if not exist
        const vt1 = await prisma.vipTier.create({
          data: { level: 1, name: "VIP1", baseMonthlyPrice: 1500, configs: {} },
        });
        const vt2 = await prisma.vipTier.create({
          data: { level: 2, name: "VIP2", baseMonthlyPrice: 3000, configs: {} },
        });
        const d1 = await prisma.durationPricing.create({
          data: { months: 1, multiplierBps: 10000, label: "1个月", sortOrder: 1 },
        });
        vipTier1 = { id: vt1.id, baseMonthlyPrice: vt1.baseMonthlyPrice, name: vt1.name, level: vt1.level };
        vipTier2 = { id: vt2.id, baseMonthlyPrice: vt2.baseMonthlyPrice, name: vt2.name, level: vt2.level };
        dur1 = { id: d1.id, months: d1.months, multiplierBps: d1.multiplierBps, label: d1.label };
      }
    });
  });

  describe("T2: Public VIP API", () => {
    it("T2-S1: GET /v1/vip/tiers — should return active tiers", async () => {
      const response = await request(app.getHttpServer())
        .get("/v1/vip/tiers")
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
      const tier = response.body.data.find((p: any) => p.id === vipTier1.id);
      expect(tier).toBeDefined();
      expect(tier.baseMonthlyPriceYuan).toBe(15);
    });

    it("T2-S2: GET /v1/vip/durations — should return active durations", async () => {
      const response = await request(app.getHttpServer())
        .get("/v1/vip/durations")
        .expect(200);

      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("T3: Create Order (Mock Mode — auto-complete)", () => {
    it("T3-S1: POST /v1/billing/orders — should create + auto-complete (mock)", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/billing/orders")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ vipTierId: vipTier1.id, durationPricingId: dur1.id, tradeType: "JSAPI" })
        .expect(201);

      expect(response.body.data.orderNo).toBeDefined();
      expect(response.body.data.status).toBe("PENDING");

      // mock 模式：触发模拟支付完成
      const scanRes = await request(app.getHttpServer())
        .post(`/v1/billing/orders/${response.body.data.orderNo}/mock-scan`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(201);

      expect(scanRes.body.data.status).toBe("SUCCEEDED");
    });

    it("T3-S2: GET /v1/billing/membership — should show active membership", async () => {
      const response = await request(app.getHttpServer())
        .get("/v1/billing/membership")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.tierLevel).toBe(1);
      expect(response.body.data.daysRemaining).toBeGreaterThan(0);
      expect(response.body.data.daysRemaining).toBeLessThanOrEqual(31);
    });

    it("T3-S3: GET /v1/billing/orders — should list orders (paginated)", async () => {
      const response = await request(app.getHttpServer())
        .get("/v1/billing/orders")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.data.items).toBeDefined();
      expect(Array.isArray(response.body.data.items)).toBe(true);
      expect(response.body.data.items.length).toBeGreaterThanOrEqual(1);
      expect(response.body.data.total).toBeGreaterThanOrEqual(1);
      const order = response.body.data.items[0];
      expect(order.orderNo).toBeDefined();
      expect(order.status).toBe("SUCCEEDED");
    });
  });

  describe("T4: Admin VIP APIs", () => {
    let adminToken: string;

    it("T4-S1: Should login as admin", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/auth/login")
        .send({ account: "admin@example.com", password: "Admin123!" })
        .expect(200);

      expect(response.body.data.accessToken).toBeDefined();
      adminToken = response.body.data.accessToken;
    });

    it("T4-S2: GET /v1/admin/billing/orders — admin can list all orders", async () => {
      const response = await request(app.getHttpServer())
        .get("/v1/admin/billing/orders")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.items).toBeDefined();
      expect(Array.isArray(response.body.data.items)).toBe(true);
      expect(response.body.data.total).toBeGreaterThan(0);
    });

    it("T4-S3: POST /v1/admin/billing/refund — refund the order", async () => {
      const ordersRes = await request(app.getHttpServer())
        .get("/v1/billing/orders")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      const orderNo = ordersRes.body.data.items[0]?.orderNo;
      expect(orderNo).toBeDefined();

      await request(app.getHttpServer())
        .post("/v1/admin/billing/refund")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ orderNo, reason: "Test refund" })
        .expect(201);

      const refundedOrder = await prisma.paymentOrder.findUnique({ where: { orderNo } });
      expect(refundedOrder?.status).toBe("REFUNDED");
    });
  });

  describe("T5: User refund application — reject flow", () => {
    let adminToken: string;
    let orderNo: string;

    it("T5-S1: Should login as admin", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/auth/login")
        .send({ account: "admin@example.com", password: "Admin123!" })
        .expect(200);

      expect(response.body.data.accessToken).toBeDefined();
      adminToken = response.body.data.accessToken;
    });

    it("T5-S2: Should create a fresh SUCCEEDED order for refund application", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/billing/orders")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ vipTierId: vipTier1.id, durationPricingId: dur1.id, tradeType: "JSAPI" })
        .expect(201);

      orderNo = response.body.data.orderNo;
      const scanRes = await request(app.getHttpServer())
        .post(`/v1/billing/orders/${orderNo}/mock-scan`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(201);
      expect(scanRes.body.data.status).toBe("SUCCEEDED");
    });

    it("T5-S3: POST /v1/billing/orders/:orderNo/refund-apply — user applies", async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/billing/orders/${orderNo}/refund-apply`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ reason: "买错了，想退款" })
        .expect(201);

      expect(response.body.data.status).toBe("PENDING");
      expect(response.body.data.reason).toBe("买错了，想退款");

      const application = await prisma.refundApplication.findFirst({
        where: { order: { orderNo } },
      });
      expect(application).toBeDefined();
      expect(application?.status).toBe("PENDING");
    });

    it("T5-S4: Should reject duplicate PENDING application", async () => {
      await request(app.getHttpServer())
        .post(`/v1/billing/orders/${orderNo}/refund-apply`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ reason: "再次申请" })
        .expect(400);
    });

    it("T5-S5: POST refund-applications/:id/reject — admin rejects, order keeps SUCCEEDED", async () => {
      const application = await prisma.refundApplication.findFirst({
        where: { order: { orderNo } },
      });
      expect(application).toBeDefined();

      await request(app.getHttpServer())
        .post(`/v1/admin/billing/refund-applications/${application!.id}/reject`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ note: "不符合退款条件" })
        .expect(201);

      const rejected = await prisma.refundApplication.findUnique({
        where: { id: application!.id },
      });
      expect(rejected?.status).toBe("REJECTED");
      expect(rejected?.reviewNote).toBe("不符合退款条件");

      const order = await prisma.paymentOrder.findUnique({ where: { orderNo } });
      expect(order?.status).toBe("SUCCEEDED");
    });

    it("T5-S6: User can apply again after rejection", async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/billing/orders/${orderNo}/refund-apply`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ reason: "补充说明：确实需要退款" })
        .expect(201);
      expect(response.body.data.status).toBe("PENDING");
    });
  });

  describe("T6: Refund application — approve flow (immediate refund)", () => {
    let adminToken: string;
    let orderNo: string;

    it("T6-S1: Should login as admin", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/auth/login")
        .send({ account: "admin@example.com", password: "Admin123!" })
        .expect(200);
      adminToken = response.body.data.accessToken;
    });

    it("T6-S2: Should create a fresh SUCCEEDED order", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/billing/orders")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ vipTierId: vipTier1.id, durationPricingId: dur1.id, tradeType: "JSAPI" })
        .expect(201);

      orderNo = response.body.data.orderNo;
      await request(app.getHttpServer())
        .post(`/v1/billing/orders/${orderNo}/mock-scan`)
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(201);
    });

    it("T6-S3: User applies refund", async () => {
      await request(app.getHttpServer())
        .post(`/v1/billing/orders/${orderNo}/refund-apply`)
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ reason: "重复购买" })
        .expect(201);
    });

    it("T6-S4: Admin list refund applications", async () => {
      const response = await request(app.getHttpServer())
        .get("/v1/admin/billing/refund-applications")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data.items).toBeDefined();
      expect(Array.isArray(response.body.data.items)).toBe(true);
      const refundApp = response.body.data.items.find(
        (a: any) => a.order?.orderNo === orderNo
      );
      expect(refundApp).toBeDefined();
      expect(refundApp.status).toBe("PENDING");
    });

    it("T6-S5: POST refund-applications/:id/approve — refund executed immediately", async () => {
      const application = await prisma.refundApplication.findFirst({
        where: { order: { orderNo } },
      });
      expect(application).toBeDefined();

      await request(app.getHttpServer())
        .post(`/v1/admin/billing/refund-applications/${application!.id}/approve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ note: "同意退款" })
        .expect(201);

      const approved = await prisma.refundApplication.findUnique({
        where: { id: application!.id },
      });
      expect(approved?.status).toBe("APPROVED");
      expect(approved?.reviewNote).toBe("同意退款");

      // 审核通过即执行网关退款：订单变为 REFUNDED
      const order = await prisma.paymentOrder.findUnique({ where: { orderNo } });
      expect(order?.status).toBe("REFUNDED");
      expect(order?.refundReason).toBe("重复购买");
    });
  });
});
