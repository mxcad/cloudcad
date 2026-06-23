import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import type { PaymentGateway, CreatePaymentParams, CreatePaymentResult, WebhookVerifyResult, QueryOrderResult } from '../payment-gateway.interface';

@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  readonly name = 'mock';
  private readonly logger = new Logger(MockPaymentGateway.name);
  private refundedOrders = new Set<string>();

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const mockPrepayId = `mock_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    this.logger.log(
      `[Mock Pay] 创建支付: 订单=${params.orderNo}, 金额=${params.amount}分, ` +
      `商品=${params.description}, tradeType=${params.tradeType}`
    );

    await new Promise(r => setTimeout(r, 300));

    return {
      gatewayOrderId: mockPrepayId,
      codeUrl: `http://mock.qr/${mockPrepayId}`,
      payParams: {
        appId: 'mock_appid',
        timeStamp: String(Date.now()),
        nonceStr: 'mock_nonce',
        package: `prepay_id=${mockPrepayId}`,
        signType: 'MD5',
        paySign: 'mock_sign',
      },
      redirectUrl: `http://mock.pay/${mockPrepayId}`,
    };
  }

  async verifyWebhook(
    payload: any,
    _headers: Record<string, string>,
  ): Promise<WebhookVerifyResult> {
    return {
      isValid: true,
      orderNo: payload.out_trade_no as string,
      gatewayOrderId: payload.transaction_id as string,
      amount: payload.total_fee as number,
      paidAt: new Date(),
    };
  }

  async queryOrder(orderNo: string): Promise<QueryOrderResult> {
    this.logger.log(`[Mock Pay] 查询订单: ${orderNo}`);
    if (this.refundedOrders.has(orderNo)) {
      return { status: 'REFUND' };
    }
    return {
      status: 'SUCCESS',
      gatewayOrderId: `mock_${orderNo}`,
      amount: 0,
      paidAt: new Date(),
    };
  }

  async refund(orderNo: string, _amount: number): Promise<void> {
    this.logger.log(`[Mock Pay] 退款: 订单=${orderNo}, 金额=${_amount}分`);
    this.refundedOrders.add(orderNo);
  }
}
