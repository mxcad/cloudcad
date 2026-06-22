export interface CreatePaymentParams {
  orderNo: string;
  amount: number;
  description: string;
  tradeType: string;
  openid?: string;
  ip: string;
}

export interface CreatePaymentResult {
  gatewayOrderId: string;
  payParams?: Record<string, any>;
  codeUrl?: string;
  redirectUrl?: string;
}

export interface WebhookVerifyResult {
  isValid: boolean;
  orderNo: string;
  gatewayOrderId: string;
  amount: number;
  paidAt: Date;
}

export interface QueryOrderResult {
  status: 'SUCCESS' | 'NOTPAY' | 'CLOSED' | 'REFUND';
  gatewayOrderId?: string;
  amount?: number;
  paidAt?: Date;
}

export interface PaymentGateway {
  readonly name: string;

  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;

  verifyWebhook(
    payload: any,
    headers: Record<string, string>,
  ): Promise<WebhookVerifyResult>;

  queryOrder(orderNo: string): Promise<QueryOrderResult>;

  refund(orderNo: string, amount: number): Promise<void>;
}
