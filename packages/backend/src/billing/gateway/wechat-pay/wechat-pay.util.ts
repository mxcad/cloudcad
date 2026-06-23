import * as crypto from 'node:crypto';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  cdataPropName: '__cdata',
  parseTagValue: false,
});

const builder = new XMLBuilder({
  format: true,
  cdataPropName: '__cdata',
});

export function md5Sign(params: Record<string, any>, key: string): string {
  const sorted = Object.keys(params)
    .filter((k) => params[k] != null && params[k] !== '')
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&') + `&key=${key}`;
  return crypto.createHash('md5').update(sorted, 'utf8').digest('hex').toUpperCase();
}

export function buildXML(root: string, data: Record<string, any>): string {
  return builder.build({ [root]: data });
}

export function parseXML(xml: string): any {
  return parser.parse(xml);
}

export function generateNonceStr(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * 解析微信支付 time_end 格式 (yyyyMMddHHmmss) 为 Date
 * 微信回调 time_end 示例: "20260623142059"
 * 不能直接用 new Date(str) 因为 Safari 不识别该格式
 */
export function parseTimeEnd(str: string | undefined): Date {
  if (!str || str.length < 14) return new Date();
  const y = +str.slice(0, 4);
  const m = +str.slice(4, 6) - 1;
  const d = +str.slice(6, 8);
  const h = +str.slice(8, 10);
  const min = +str.slice(10, 12);
  const s = +str.slice(12, 14);
  return new Date(y, m, d, h, min, s);
}
