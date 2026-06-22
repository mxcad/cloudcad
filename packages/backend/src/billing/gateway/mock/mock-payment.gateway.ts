import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'node:crypto';
import type { PaymentGateway, CreatePaymentParams, CreatePaymentResult, WebhookVerifyResult, QueryOrderResult } from '../payment-gateway.interface';

interface MockOrder {
  orderNo: string;
  status: 'NOTPAY' | 'SUCCESS' | 'CLOSED' | 'REFUND';
  amount: number;
  prepayId: string;
  transactionId?: string;
  paidAt?: Date;
  createdAt: Date;
}

@Injectable()
export class MockPaymentGateway implements PaymentGateway {
  readonly name = 'mock';
  private readonly logger = new Logger(MockPaymentGateway.name);
  
  private orders = new Map<string, MockOrder>();

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const mockPrepayId = `prepay_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    this.logger.log(
      `[Mock Pay] 创建支付: 订单=${params.orderNo}, 金额=${params.amount}分, ` +
      `商品=${params.description}, tradeType=${params.tradeType}`
    );

    await new Promise(r => setTimeout(r, 200));

    this.orders.set(params.orderNo, {
      orderNo: params.orderNo,
      status: 'NOTPAY',
      amount: params.amount,
      prepayId: mockPrepayId,
      createdAt: new Date(),
    });

    const timeStamp = String(Math.floor(Date.now() / 1000));
    const nonceStr = crypto.randomBytes(16).toString('hex');
    
    return {
      gatewayOrderId: mockPrepayId,
      codeUrl: params.tradeType === 'NATIVE' ? `http://mock.qr/${mockPrepayId}` : undefined,
      payParams: {
        appId: 'wx_mock_appid',
        timeStamp,
        nonceStr,
        package: `prepay_id=${mockPrepayId}`,
        signType: 'MD5',
        paySign: crypto.createHash('md5').update(
          `appId=wx_mock_appid&nonceStr=${nonceStr}&package=prepay_id=${mockPrepayId}&signType=MD5&timeStamp=${timeStamp}&key=mock_key`
        ).digest('hex').toUpperCase(),
      },
      redirectUrl: params.tradeType === 'MWEB' ? `http://mock.pay/${mockPrepayId}` : undefined,
    };
  }

  async verifyWebhook(
    payload: any,
    _headers: Record<string, string>,
  ): Promise<WebhookVerifyResult> {
    const orderNo = payload.out_trade_no as string;
    const order = this.orders.get(orderNo);

    if (!order) {
      this.logger.warn(`[Mock Pay] 回调验证失败: 订单不存在 ${orderNo}`);
      return {
        isValid: false,
        orderNo: '',
        gatewayOrderId: '',
        amount: 0,
        paidAt: new Date(),
      };
    }

    this.logger.log(`[Mock Pay] 回调验证成功: 订单=${orderNo}`);
    return {
      isValid: true,
      orderNo: payload.out_trade_no as string,
      gatewayOrderId: payload.transaction_id as string,
      amount: payload.total_fee as number,
      paidAt: new Date(),
    };
  }

  async queryOrder(orderNo: string): Promise<QueryOrderResult> {
    const order = this.orders.get(orderNo);
    
    if (!order) {
      this.logger.warn(`[Mock Pay] 查询订单不存在: ${orderNo}`);
      return { status: 'NOTPAY' };
    }

    this.logger.log(`[Mock Pay] 查询订单: ${orderNo}, 状态=${order.status}`);

    switch (order.status) {
      case 'SUCCESS':
        return {
          status: 'SUCCESS',
          gatewayOrderId: order.transactionId ?? `mock_txn_${orderNo}`,
          amount: order.amount,
          paidAt: order.paidAt,
        };
      case 'CLOSED':
        return { status: 'CLOSED' };
      case 'REFUND':
        return { status: 'REFUND' };
      default:
        return { status: 'NOTPAY' };
    }
  }

  async completePayment(orderNo: string): Promise<void> {
    const order = this.orders.get(orderNo);
    if (!order) {
      throw new Error(`订单不存在: ${orderNo}`);
    }
    if (order.status !== 'NOTPAY') {
      throw new Error(`订单状态错误: ${order.status}`);
    }

    order.status = 'SUCCESS';
    order.transactionId = `mock_txn_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    order.paidAt = new Date();
    
    this.logger.log(`[Mock Pay] 支付完成: 订单=${orderNo}, transactionId=${order.transactionId}`);
  }

  async refund(orderNo: string, amount: number): Promise<void> {
    const order = this.orders.get(orderNo);
    if (!order) {
      throw new Error(`订单不存在: ${orderNo}`);
    }

    order.status = 'REFUND';
    this.logger.log(`[Mock Pay] 退款: 订单=${orderNo}, 金额=${amount}分`);
  }
}
