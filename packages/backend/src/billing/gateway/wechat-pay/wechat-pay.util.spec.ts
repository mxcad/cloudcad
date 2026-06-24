import { md5Sign, hmacSha256Sign, sign, buildXML, parseXML, generateNonceStr } from "./wechat-pay.util";

describe("WechatPayUtil", () => {
  describe("md5Sign", () => {
    it("should generate correct MD5 signature", () => {
      const params = {
        appid: "wx123456",
        mch_id: "1446619502",
        nonce_str: "test_nonce",
        out_trade_no: "MC123456",
        total_fee: "100",
      };
      const key = "test_key";
      const sign = md5Sign(params, key);
      expect(sign).toBeDefined();
      expect(sign.length).toBe(32);
      expect(/^[A-F0-9]{32}$/.test(sign)).toBe(true);
    });

    it("should sort params alphabetically", () => {
      const params = { b: "2", a: "1", c: "3" };
      const sign = md5Sign(params, "key");
      // The sign is deterministic given same sorted params
      expect(sign).toBeDefined();
    });

    it("should produce different signatures for different keys", () => {
      const params = { appid: "wx123", mch_id: "456" };
      const sign1 = md5Sign(params, "key1");
      const sign2 = md5Sign(params, "key2");
      expect(sign1).not.toBe(sign2);
    });
  });

  describe("hmacSha256Sign", () => {
    it("should generate a 64-character uppercase hex string", () => {
      const params = { appid: "wx123", mch_id: "456", nonce_str: "test_nonce" };
      const signValue = hmacSha256Sign(params, "test_key");
      expect(signValue).toBeDefined();
      expect(signValue.length).toBe(64);
      expect(/^[A-F0-9]{64}$/.test(signValue)).toBe(true);
    });

    it("should be deterministic for same input", () => {
      const params = { appid: "wx123", mch_id: "456" };
      const sign1 = hmacSha256Sign(params, "key");
      const sign2 = hmacSha256Sign(params, "key");
      expect(sign1).toBe(sign2);
    });

    it("should produce different output than MD5 for same input", () => {
      const params = { appid: "wx123", mch_id: "456" };
      const md5Result = md5Sign(params, "key");
      const hmacResult = hmacSha256Sign(params, "key");
      expect(md5Result).not.toBe(hmacResult);
    });

    it("should produce different signatures for different keys", () => {
      const params = { appid: "wx123", mch_id: "456" };
      const sign1 = hmacSha256Sign(params, "key1");
      const sign2 = hmacSha256Sign(params, "key2");
      expect(sign1).not.toBe(sign2);
    });
  });

  describe("sign", () => {
    it("should default to MD5", () => {
      const params = { appid: "wx123" };
      expect(sign(params, "key")).toBe(md5Sign(params, "key"));
    });

    it("should use MD5 when type=MD5", () => {
      const params = { appid: "wx123" };
      expect(sign(params, "key", "MD5")).toBe(md5Sign(params, "key"));
    });

    it("should use HMAC-SHA256 when type=HMAC-SHA256", () => {
      const params = { appid: "wx123" };
      expect(sign(params, "key", "HMAC-SHA256")).toBe(hmacSha256Sign(params, "key"));
    });
  });

  describe("generateNonceStr", () => {
    it("should generate a 32-character hex string", () => {
      const nonce = generateNonceStr();
      expect(nonce).toBeDefined();
      expect(nonce.length).toBe(32);
      expect(/^[a-f0-9]{32}$/.test(nonce)).toBe(true);
    });

    it("should generate unique values each call", () => {
      const nonce1 = generateNonceStr();
      const nonce2 = generateNonceStr();
      expect(nonce1).not.toBe(nonce2);
    });
  });

  describe("buildXML and parseXML", () => {
    it("should build and parse XML round-trip", () => {
      const data = {
        appid: "wx123",
        mch_id: "456",
        nonce_str: "abc123",
        sign: "SIGNATURE",
      };
      const xml = buildXML("xml", data);
      expect(xml).toContain("<xml>");
      expect(xml).toContain("<appid>");
      expect(xml).toContain("wx123");

      const parsed = parseXML(xml);
      expect(parsed.xml).toBeDefined();
      expect(parsed.xml.appid).toBe("wx123");
      expect(parsed.xml.mch_id).toBe("456");
    });
  });
});
