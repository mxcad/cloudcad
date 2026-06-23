///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { PrismaClient, OrderStatus, MembershipTier } from "@prisma/client";
import request from "supertest";
import { AppModule } from "../../src/app.module";

describe("Billing → Payment Flow (Mock Mode) Integration", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  let testUserEmail: string;
  let testUserPassword: string;
  let testUserId: string;
  let accessToken: string;
  let plan1: { id: string; price: number; name: string };
  let plan2: { id: string; price: number; name: string };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = new PrismaClient();
    await prisma.$connect();

    testUserEmail = `billing-test-${Date.now()}@example.com`;
    testUserPassword = "Test@123456";
  }, 60000);

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
    await app.close();
  }, 60000);

  async function cleanupTestData() {
    if (testUserId) {
      await prisma.paymentOrder.deleteMany({ where: { userId: testUserId } });
      await prisma.userMembership.deleteMany({ where: { userId: testUserId } });
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { email: testUserEmail } });
    }
    if (plan1?.id) {
      await prisma.membershipPlan.deleteMany({ where: { id: plan1.id } });
    }
    if (plan2?.id) {
      await prisma.membershipPlan.deleteMany({ where: { id: plan2.id } });
    }
  }

  describe("T1: Setup — Create test user & seed plans", () => {
    it("T1-S1: Should register test user", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/auth/register")
        .send({
          email: testUserEmail,
          username: `billinguser-${Date.now()}`,
          password: testUserPassword,
          nickname: "Billing Test User",
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.accessToken).toBeDefined();
      testUserId = response.body.user.id;
      accessToken = response.body.accessToken;
    });

    it("T1-S2: Should seed membership plans", async () => {
      const p1 = await prisma.membershipPlan.create({
        data: {
          name: "月度会员",
          durationDays: 30,
          price: 2400,
          originalPrice: 3000,
          sortOrder: 1,
          tier: "PRO",
          features: { maxStorage: 1073741824, maxProjects: 50 },
        },
      });
      const p2 = await prisma.membershipPlan.create({
        data: {
          name: "年度会员",
          durationDays: 365,
          price: 26000,
          originalPrice: 28800,
          sortOrder: 2,
          tier: "PRO",
          features: { maxStorage: 5368709120, maxProjects: 200 },
        },
      });
      plan1 = { id: p1.id, price: p1.price, name: p1.name };
      plan2 = { id: p2.id, price: p2.price, name: p2.name };
      expect(plan1.id).toBeDefined();
      expect(plan2.id).toBeDefined();
    });
  });

  describe("T2: Public Plans API", () => {
    it("T2-S1: GET /v1/billing/plans — should return active plans", async () => {
      const response = await request(app.getHttpServer())
        .get("/v1/billing/plans")
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
      const plan = response.body.find((p: any) => p.id === plan1.id);
      expect(plan).toBeDefined();
      expect(plan.priceYuan).toBe(24);
      expect(plan.originalPriceYuan).toBe(30);
      expect(plan.tier).toBe("PRO");
      expect(plan.isActive).toBe(true);
    });
  });

  describe("T3: Create Order (Mock Mode — auto-complete)", () => {
    it("T3-S1: POST /v1/billing/orders — should create + auto-complete (mock)", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/billing/orders")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ planId: plan1.id, tradeType: "JSAPI" })
        .expect(201);

      expect(response.body.orderNo).toBeDefined();
      // Mock mode: status should be SUCCEEDED (auto-completed)
      expect(response.body.status).toBe("SUCCEEDED");
      expect(response.body.amount).toBe(plan1.price);
    });

    it("T3-S2: GET /v1/billing/membership — should show active PRO membership", async () => {
      const response = await request(app.getHttpServer())
        .get("/v1/billing/membership")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.tier).toBe("PRO");
      expect(response.body.daysRemaining).toBeGreaterThan(0);
      expect(response.body.daysRemaining).toBeLessThanOrEqual(31);
      expect(response.body.expiresAt).toBeDefined();
    });

    it("T3-S3: GET /v1/billing/orders — should list orders (paginated)", async () => {
      const response = await request(app.getHttpServer())
        .get("/v1/billing/orders")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body.items).toBeDefined();
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.items.length).toBeGreaterThanOrEqual(1);
      expect(response.body.total).toBeGreaterThanOrEqual(1);
      const order = response.body.items[0];
      expect(order.orderNo).toBeDefined();
      expect(order.status).toBe("SUCCEEDED");
      expect(order.amount).toBe(plan1.price);
    });
  });

  describe("T4: Admin APIs", () => {
    let adminToken: string;
    let createdPlanId: string;

    it("T4-S1: Should login as admin (superadmin exists in seed)", async () => {
      // Use the existing admin account from seed
      const response = await request(app.getHttpServer())
        .post("/v1/auth/login")
        .send({ email: "admin@mxdraw.com", password: "admin123456" })
        .expect(201);

      expect(response.body.accessToken).toBeDefined();
      adminToken = response.body.accessToken;
    });

    it("T4-S2: POST /v1/admin/billing/plans — create new plan", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/admin/billing/plans")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          name: "测试套餐",
          durationDays: 7,
          price: 700,
          originalPrice: 1000,
          tier: "PRO",
          sortOrder: 10,
          features: { maxStorage: 524288000 },
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.name).toBe("测试套餐");
      expect(response.body.priceYuan).toBe(7);
      createdPlanId = response.body.id;
    });

    it("T4-S3: PUT /v1/admin/billing/plans/:id — update plan", async () => {
      const response = await request(app.getHttpServer())
        .put(`/v1/admin/billing/plans/${createdPlanId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ name: "测试套餐(改)", price: 800 })
        .expect(200);

      expect(response.body.name).toBe("测试套餐(改)");
      expect(response.body.priceYuan).toBe(8);
    });

    it("T4-S4: DELETE /v1/admin/billing/plans/:id — deactivate plan", async () => {
      await request(app.getHttpServer())
        .delete(`/v1/admin/billing/plans/${createdPlanId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      const deleted = await prisma.membershipPlan.findUnique({ where: { id: createdPlanId } });
      expect(deleted?.isActive).toBe(false);
    });

    it("T4-S5: POST /v1/admin/billing/refund — refund the order", async () => {
      const ordersRes = await request(app.getHttpServer())
        .get("/v1/billing/orders")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);

      const orderNo = ordersRes.body[0]?.orderNo;
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

  describe("T5: Membership state after refund", () => {
    it("T5-S1: Should create second order (annual) before refund test", async () => {
      // Buy annual plan so we have 2 SUCCEEDED orders
      const response = await request(app.getHttpServer())
        .post("/v1/billing/orders")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ planId: plan2.id, tradeType: "JSAPI" })
        .expect(201);
      expect(response.body.status).toBe("SUCCEEDED");
    });

    it("T5-S2: GET /v1/billing/membership — should show PRO membership (annual)", async () => {
      const response = await request(app.getHttpServer())
        .get("/v1/billing/membership")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
      expect(response.body.tier).toBe("PRO");
      expect(response.body.daysRemaining).toBeGreaterThan(300);
    });

    it("T5-S3: Refund the first (monthly) order — membership should stay PRO (annual remains)", async () => {
      const ordersRes = await request(app.getHttpServer())
        .get("/v1/billing/orders")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
      const firstOrder = ordersRes.body.items.find((o: any) => o.planId === plan1.id);
      expect(firstOrder).toBeDefined();

      // Login as admin
      const adminRes = await request(app.getHttpServer())
        .post("/v1/auth/login")
        .send({ email: "admin@mxdraw.com", password: "admin123456" })
        .expect(201);
      const adminToken = adminRes.body.accessToken;

      await request(app.getHttpServer())
        .post("/v1/admin/billing/refund")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ orderNo: firstOrder.orderNo, reason: "Test refund with remaining order" })
        .expect(201);

      // Membership should still be PRO (annual order remains)
      const memRes = await request(app.getHttpServer())
        .get("/v1/billing/membership")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
      expect(memRes.body.tier).toBe("PRO");
      expect(memRes.body.daysRemaining).toBeGreaterThan(300);
    });

    it("T5-S4: Refund remaining annual order — membership should become FREE", async () => {
      const ordersRes = await request(app.getHttpServer())
        .get("/v1/billing/orders")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
      const annualOrder = ordersRes.body.items.find((o: any) => o.planId === plan2.id && o.status === "SUCCEEDED");
      expect(annualOrder).toBeDefined();

      const adminRes = await request(app.getHttpServer())
        .post("/v1/auth/login")
        .send({ email: "admin@mxdraw.com", password: "admin123456" })
        .expect(201);
      const adminToken = adminRes.body.accessToken;

      await request(app.getHttpServer())
        .post("/v1/admin/billing/refund")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ orderNo: annualOrder.orderNo, reason: "Refund last order" })
        .expect(201);

      const memRes = await request(app.getHttpServer())
        .get("/v1/billing/membership")
        .set("Authorization", `Bearer ${accessToken}`)
        .expect(200);
      expect(memRes.body.tier).toBe("FREE");
      expect(memRes.body.daysRemaining).toBe(0);
    });
  });

  describe("T6: PENDING order reuse", () => {
    let pendingOrderNo: string;

    it("T6-S1: Should create PENDING order directly in DB", async () => {
      const order = await prisma.paymentOrder.create({
        data: {
          orderNo: `MCTESTPENDING${Date.now()}`,
          userId: testUserId,
          planId: plan2.id,
          amount: plan2.price,
          status: OrderStatus.PENDING,
          gateway: "mock",
          description: plan2.name,
        },
      });
      pendingOrderNo = order.orderNo;
    });

    it("T6-S2: Same planId should reuse PENDING order (within 2h)", async () => {
      const response = await request(app.getHttpServer())
        .post("/v1/billing/orders")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ planId: plan2.id, tradeType: "JSAPI" })
        .expect(201);

      // Should reuse existing PENDING orderNo (not be SUCCEEDED)
      expect(response.body.orderNo).toBe(pendingOrderNo);
      expect(response.body.status).toBe("PENDING");
    });

    it("T6-S3: GET /v1/admin/billing/orders — admin can list all orders", async () => {
      const adminRes = await request(app.getHttpServer())
        .post("/v1/auth/login")
        .send({ email: "admin@mxdraw.com", password: "admin123456" })
        .expect(201);
      const adminToken = adminRes.body.accessToken;

      const response = await request(app.getHttpServer())
        .get("/v1/admin/billing/orders")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.items).toBeDefined();
      expect(Array.isArray(response.body.items)).toBe(true);
      expect(response.body.total).toBeGreaterThan(0);
    });
  });
});
