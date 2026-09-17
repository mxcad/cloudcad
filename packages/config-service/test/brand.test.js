'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { validateConfig, DEFAULT_CONFIG } = require('../brand');

const validate = validateConfig;

describe('brand.validateConfig（存在才校验、缺失放行）', () => {
  it('空配置无错误：全部字段可选，缺省走前端内置默认值', () => {
    assert.deepEqual(validate({}), []);
  });

  it('title 必填且为字符串，长度上限 100', () => {
    assert.deepEqual(validate({ title: '' }), ['title 不能为空']);
    assert.deepEqual(validate({ title: 123 }), ['title 必须是字符串']);
    assert.deepEqual(validate({ title: 'x'.repeat(101) }), [
      'title 不能超过 100 个字符',
    ]);
    assert.deepEqual(validate({ title: 'x'.repeat(100) }), []);
  });

  it('顶层字符串字段类型错误时报出字段名', () => {
    assert.deepEqual(validate({ subtitle: 123 }), [
      'subtitle 必须是字符串',
    ]);
    assert.deepEqual(validate({ docsUrl: ['a'] }), ['docsUrl 必须是字符串']);
  });

  it('顶层字符串字段允许空串（用于清空回到内置默认值）', () => {
    assert.deepEqual(validate({ tagline: '', copyrightHolder: '', subtitle: '' }), []);
  });

  it('support 必须是对象，字段类型逐条校验', () => {
    assert.deepEqual(validate({ support: 'a@b.c' }), ['support 必须是对象']);
    assert.deepEqual(validate({ support: { email: 123 } }), [
      'support.email 必须是字符串',
    ]);
    assert.deepEqual(validate({ support: { email: '', phone: '', hours: '' } }), []);
  });

  it('legal 标量字段校验，productName 留空由前端按语言兜底', () => {
    assert.deepEqual(validate({ legal: 'x' }), ['legal 必须是对象']);
    assert.deepEqual(validate({ legal: { productName: 5 } }), [
      'legal.productName 必须是字符串',
    ]);
    assert.deepEqual(validate({ legal: { productName: '', productShortName: 'CloudCAD' } }), []);
  });

  it('legal.identities 按语言逐字段校验，entityName 上限 200', () => {
    assert.deepEqual(validate({ legal: { identities: [] } }), [
      'legal.identities 必须是对象',
    ]);
    assert.deepEqual(validate({ legal: { identities: { 'zh-CN': 123 } } }), [
      'legal.identities.zh-CN 必须是对象',
    ]);
    assert.deepEqual(
      validate({
        legal: { identities: { 'zh-CN': { entityName: 'x'.repeat(201) } } },
      }),
      ['legal.identities.zh-CN.entityName 不能超过 200 个字符']
    );
    assert.deepEqual(
      validate({
        legal: {
          identities: {
            'zh-CN': { entityName: '成都梦想凯德科技有限公司' },
            'en-US': { entityName: 'Chengdu Dreamkaide Technology Co., Ltd.' },
          },
        },
      }),
      []
    );
  });

  it('apps 必须是对象，逐应用校验 title 100 / 其余 200 上限', () => {
    assert.deepEqual(validate({ apps: [] }), ['apps 必须是对象']);
    assert.deepEqual(validate({ apps: { cadview: { title: 1, tagline: 2 } } }), [
      'apps.cadview.title 必须是字符串',
      'apps.cadview.tagline 必须是字符串',
    ]);
    assert.deepEqual(
      validate({ apps: { cadview: { title: 'x'.repeat(101) } } }),
      ['apps.cadview.title 不能超过 100 个字符']
    );
    assert.deepEqual(
      validate({ apps: { cadview: { title: '梦想网页CAD实时协同平台', tagline: '' } } }),
      []
    );
  });
});

describe('brand 未知字段与默认配置', () => {
  it('未知字段不报错：校验器不做白名单裁剪，配置可前向兼容', () => {
    assert.deepEqual(
      validate({ title: 'CloudCAD', wordmark: 'logo', future: { any: 1 } }),
      []
    );
  });

  it('DEFAULT_CONFIG 只含 title + logo：其余字段由前端内置默认值兜底', () => {
    assert.deepEqual(Object.keys(DEFAULT_CONFIG).sort(), ['logo', 'title']);
  });
});
