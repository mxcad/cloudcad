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
