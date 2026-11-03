import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import {
  sanitizeRichText,
  stripHtmlTags,
  toPersistableHtml,
  escapeHtml,
  decodeEntities,
} from './sanitizeRichText';
import { RichContentView } from './RichContentView';
import { RichtextEditor, type RichtextEditorHandle } from './RichtextEditor';
import type { FeedbackAttachmentDto } from '@/api-sdk';

afterEach(cleanup);

describe('sanitizeRichText（富文本白名单净化）', () => {
  it('剥离 script 标签内容（不执行）', () => {
    const out = sanitizeRichText('<p>你好</p><script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).toContain('你好');
  });

  it('剥离 on* 事件属性', () => {
    const out = sanitizeRichText(
      '<img src="data:image/png;base64,AAAA" onerror="alert(1)">'
    );
    expect(out).not.toContain('onerror');
  });

  it('剥离 javascript: URL', () => {
    const out = sanitizeRichText('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  it('保留 http(s) 链接与 data:image 图片', () => {
    const out = sanitizeRichText(
      '<img src="data:image/png;base64,AAAA"><a href="https://a.com">L</a>'
    );
    expect(out).toContain('data:image/png');
    expect(out).toContain('https://a.com');
  });

  it('剥离 data:text/html 等非图片 data URL', () => {
    const out = sanitizeRichText('<img src="data:text/html;base64,AAAA">');
    expect(out).not.toContain('data:text/html');
  });

  it('保留附件卡片固定类与 data-att-id/data-kind/data-label', () => {
    const card =
      '<span class="fb-att-card" data-kind="DRAWING" data-label="a.mxweb" data-att-id="abc-123">' +
      '<span class="fb-att-card-icon">📄</span><span class="fb-att-card-label">a.mxweb</span></span>';
    const out = sanitizeRichText(card);
    expect(out).toContain('fb-att-card');
    expect(out).toContain('data-att-id="abc-123"');
    expect(out).toContain('data-kind="DRAWING"');
    expect(out).toContain('data-label');
  });

  it('剥离任意自定义 class（防样式注入）', () => {
    const out = sanitizeRichText('<span class="evil-float">x</span>');
    expect(out).not.toContain('evil-float');
  });

  it('剥离 iframe/object/form 未知标签，保留文本', () => {
    const out = sanitizeRichText('<p>a</p><iframe src="x"></iframe><p>b</p>');
    expect(out).not.toContain('iframe');
    expect(out).toContain('a');
    expect(out).toContain('b');
  });
});

describe('stripHtmlTags', () => {
  it('剥离标签得到可见文本（textContent 连接，无标签间空白）', () => {
    expect(stripHtmlTags('<p>你好<strong>世界</strong></p>')).toBe('你好世界');
  });
  it('解码实体', () => {
    expect(stripHtmlTags('a &amp; b &lt;c&gt;')).toBe('a & b <c>');
  });
});

describe('toPersistableHtml（提交前收敛）', () => {
  it('剥离 blob: 本地预览 src，保留 data-att-id', () => {
    const out = toPersistableHtml(
      '<p>x</p><img src="blob:http://x/abc" data-att-id="id-1" alt="i">'
    );
    expect(out).not.toContain('blob:');
    expect(out).toContain('data-att-id="id-1"');
  });

  it('保留 http(s) 图片 src', () => {
    const out = toPersistableHtml('<img src="https://a.com/x.png" data-att-id="id-1">');
    expect(out).toContain('https://a.com/x.png');
  });
});

describe('escapeHtml / decodeEntities', () => {
  it('转义与反转义', () => {
    expect(escapeHtml('<a b="c">')).toBe('&lt;a b=&quot;c&quot;&gt;');
    expect(decodeEntities('&lt;a&gt;&amp;')).toBe('<a>&');
  });
});

describe('RichContentView（安全渲染 + 附件水合）', () => {
  const att = (partial: Partial<FeedbackAttachmentDto>): FeedbackAttachmentDto =>
    ({
      id: 'id-1',
      feedbackId: null,
      type: 'IMAGE',
      kind: 'IMAGE',
      fileName: 'a.png',
      mimeType: 'image/png',
      size: 10,
      nodeId: null,
      fileHash: null,
      thumbnailUrl: null,
      downloadUrl: null,
      uploadedByName: null,
      createdAt: '',
      ...partial,
    }) as FeedbackAttachmentDto;

  it('渲染净化后内容并水合图片 src', () => {
    const { container } = render(
      <RichContentView
        html='<p>hi</p><img data-att-id="id-1" alt="x">'
        attachmentsById={{
          'id-1': att({ thumbnailUrl: 'https://cdn/t.png', downloadUrl: 'https://cdn/d.png' }),
        }}
      />
    );
    const img = container.querySelector('img[data-att-id="id-1"]') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('https://cdn/t.png');
  });

  it('附件卡片带 downloadUrl 时追加打开附件链接', () => {
    const { container } = render(
      <RichContentView
        html='<span class="fb-att-card" data-att-id="id-1" data-kind="DRAWING" data-label="a.mxweb"><span class="fb-att-card-icon">📄</span><span class="fb-att-card-label">a.mxweb</span></span>'
        attachmentsById={{ 'id-1': att({ downloadUrl: 'https://cdn/d.mxweb' }) }}
      />
    );
    const card = container.querySelector('.fb-att-card[data-att-id="id-1"]') as HTMLElement;
    expect(card).toBeTruthy();
    const link = card.querySelector('a');
    expect(link).toBeTruthy();
    expect(link?.getAttribute('href')).toBe('https://cdn/d.mxweb');
  });

  it('图纸卡片带缩略图时水合为缩略图卡片 + 悬浮查看/下载', () => {
    const { container } = render(
      <RichContentView
        html='<span class="fb-att-card" data-att-id="id-1" data-kind="DRAWING" data-label="a.mxweb"><span class="fb-att-card-icon">📄</span><span class="fb-att-card-label">a.mxweb</span></span>'
        attachmentsById={{
          'id-1': att({
            type: 'DRAWING',
            fileName: 'a.mxweb',
            thumbnailUrl: 'https://cdn/t.png',
            downloadUrl: 'https://cdn/d.mxweb',
          }),
        }}
      />
    );
    const card = container.querySelector('.fb-att-card[data-att-id="id-1"]') as HTMLElement;
    expect(card).toBeTruthy();
    // 升级为缩略图卡片
    expect(card.classList.contains('fb-att-card-with-thumb')).toBe(true);
    const thumb = card.querySelector('.fb-att-card-thumb') as HTMLImageElement;
    expect(thumb).toBeTruthy();
    expect(thumb.getAttribute('src')).toBe('https://cdn/t.png');
    // 悬浮操作：查看（缩略图）+ 下载（真实附件）
    const actions = Array.from(card.querySelectorAll('a.fb-att-card-action'));
    expect(actions.map((a) => a.textContent)).toEqual(['查看', '下载']);
    expect(actions[0]?.getAttribute('href')).toBe('https://cdn/t.png');
    expect(actions[1]?.getAttribute('href')).toBe('https://cdn/d.mxweb');
  });

  it('REFERENCE 引用图纸（有 viewUrl，管理员）→ 只读卡片：查看链接，无缩略图无下载', () => {
    const { container } = render(
      <RichContentView
        html='<span class="fb-att-card" data-att-id="id-1" data-kind="REFERENCE" data-label="a.mxweb"><span class="fb-att-card-icon">📄</span><span class="fb-att-card-label">a.mxweb</span></span>'
        attachmentsById={{
          'id-1': att({
            type: 'DRAWING',
            kind: 'REFERENCE',
            fileName: 'a.mxweb',
            viewUrl: 'https://cdn/view.mxweb',
          }),
        }}
      />
    );
    const card = container.querySelector('.fb-att-card[data-att-id="id-1"]') as HTMLElement;
    expect(card).toBeTruthy();
    // 无缩略图卡片（不升级）
    expect(card.classList.contains('fb-att-card-with-thumb')).toBe(false);
    expect(card.querySelector('.fb-att-card-thumb')).toBeFalsy();
    // 只有查看链接，无下载
    const links = Array.from(card.querySelectorAll('a'));
    expect(links).toHaveLength(1);
    expect(links[0]?.textContent).toBe('查看');
    expect(links[0]?.getAttribute('href')).toBe('https://cdn/view.mxweb');
    expect(card.querySelector('a[href*="download"]')).toBeFalsy();
  });

  it('REFERENCE 引用图纸（有 nodeId + region）→ 查看打开 CAD 编辑器并定位区域', () => {
    const { container } = render(
      <RichContentView
        html='<span class="fb-att-card" data-att-id="id-1" data-kind="REFERENCE" data-label="a.mxweb"><span class="fb-att-card-icon">📄</span><span class="fb-att-card-label">a.mxweb</span></span>'
        attachmentsById={{
          'id-1': att({
            type: 'DRAWING',
            kind: 'REFERENCE',
            fileName: 'a.mxweb',
            nodeId: 'node-1',
            region: '100,200,300,400',
            viewUrl: 'https://cdn/view.mxweb',
          }),
        }}
      />
    );
    const card = container.querySelector('.fb-att-card[data-att-id="id-1"]') as HTMLElement;
    const links = Array.from(card.querySelectorAll('a'));
    expect(links).toHaveLength(1);
    // 打开编辑器并携带框选区域（分享图纸同款），而非回落到下载 viewUrl
    expect(links[0]?.getAttribute('href')).toBe(
      '/cad-editor?nodeId=node-1&region=100%2C200%2C300%2C400'
    );
  });

  it('REFERENCE 引用图纸（提交者无 viewUrl）→ 显示「仅管理员可查看」不可点', () => {
    const { container } = render(
      <RichContentView
        html='<span class="fb-att-card" data-att-id="id-1" data-kind="REFERENCE" data-label="a.mxweb"><span class="fb-att-card-icon">📄</span><span class="fb-att-card-label">a.mxweb</span></span>'
        attachmentsById={{
          'id-1': att({ type: 'DRAWING', kind: 'REFERENCE', fileName: 'a.mxweb' }),
        }}
      />
    );
    const card = container.querySelector('.fb-att-card[data-att-id="id-1"]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.querySelector('a')).toBeFalsy();
    expect(card.textContent).toContain('仅管理员可查看');
  });

  it('无缩略图图纸（管理员）→ 查看(viewUrl) + 下载(downloadUrl) 双链接', () => {
    const { container } = render(
      <RichContentView
        html='<span class="fb-att-card" data-att-id="id-1" data-kind="DRAWING" data-label="a.mxweb"><span class="fb-att-card-icon">📄</span><span class="fb-att-card-label">a.mxweb</span></span>'
        attachmentsById={{
          'id-1': att({
            type: 'DRAWING',
            fileName: 'a.mxweb',
            viewUrl: 'https://cdn/view.mxweb',
            downloadUrl: 'https://cdn/admin-dl.mxweb',
          }),
        }}
      />
    );
    const card = container.querySelector('.fb-att-card[data-att-id="id-1"]') as HTMLElement;
    const links = Array.from(card.querySelectorAll('a'));
    expect(links.map((a) => a.textContent)).toEqual(['查看', '下载']);
    expect(links[0]?.getAttribute('href')).toBe('https://cdn/view.mxweb');
    expect(links[1]?.getAttribute('href')).toBe('https://cdn/admin-dl.mxweb');
  });

  it('不渲染脚本', () => {
    const { container } = render(<RichContentView html='<script>alert(1)</script><p>ok</p>' />);
    expect(container.querySelector('script')).toBeFalsy();
    expect(container.textContent).toContain('ok');
  });
});

describe('RichtextEditor.removeAttachment（附件托盘删除）', () => {
  function setup(initialHtml: string) {
    const ref = createRef<RichtextEditorHandle>();
    const onChange = vi.fn();
    const { container } = render(
      <RichtextEditor ref={ref} showToolbar={false} onChange={onChange} />
    );
    const body = container.querySelector('.rt-editor-body') as HTMLDivElement;
    body.innerHTML = initialHtml;
    return { ref, onChange, body };
  }

  it('移除同一附件 id 的全部节点（图片 + 卡片，支持多次插入），并触发 change', () => {
    const { ref, onChange, body } = setup(
      '<p>before</p>' +
        '<img src="https://a/1.png" data-att-id="att-1" alt="i" contenteditable="false">' +
        '<img src="https://a/1.png" data-att-id="att-1" alt="i" contenteditable="false">' +
        '<span class="fb-att-card" data-att-id="att-1" data-kind="FILE" data-label="a.pdf" contenteditable="false">c</span>' +
        '<p>after</p>'
    );
    ref.current?.removeAttachment('att-1');
    expect(body.querySelector('[data-att-id="att-1"]')).toBeNull();
    expect(body.innerHTML).toContain('before');
    expect(body.innerHTML).toContain('after');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).not.toContain('att-1');
  });

  it('只移除目标 id，其他附件节点不受影响', () => {
    const { ref, body } = setup(
      '<img src="https://a/1.png" data-att-id="att-1" contenteditable="false">' +
        '<img src="https://a/2.png" data-att-id="att-2" contenteditable="false">' +
        '<span class="fb-att-card" data-att-id="att-2" data-kind="DRAWING" data-label="a.mxweb" contenteditable="false">c</span>'
    );
    ref.current?.removeAttachment('att-1');
    expect(body.querySelector('[data-att-id="att-1"]')).toBeNull();
    expect(body.querySelectorAll('[data-att-id="att-2"]')).toHaveLength(2);
  });

  it('附件 id 含特殊字符时经 CSS.escape 正确命中', () => {
    const { ref, body } = setup(
      "<img src='https://a/1.png' data-att-id='a&quot;b c' contenteditable='false'>"
    );
    ref.current?.removeAttachment('a"b c');
    expect(body.querySelector('[data-att-id]')).toBeNull();
  });

  it('id 不存在时不改动内容、仍触发 change 同步', () => {
    const { ref, onChange, body } = setup('<p>keep</p>');
    const before = body.innerHTML;
    ref.current?.removeAttachment('nope');
    expect(body.innerHTML).toBe(before);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
