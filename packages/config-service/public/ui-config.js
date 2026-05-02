/**
 * CloudCAD UI 配置前端模块
 * 处理 CAD 编辑器界面配置表单
 */

const UI_CONFIG = (function () {
  let token = '';
  let currentConfig = {};

  const SCHEMA = {
    textFields: [
      { key: 'title', label: '应用标题', maxLength: 100 },
      { key: 'headerTitle', label: '顶部标题', maxLength: 100 },
    ],
    enumFields: [
      {
        key: 'defaultActiveLanguage',
        label: '默认语言',
        options: [
          { value: 'zh-CN', label: '中文' },
          { value: 'en-US', label: 'English' },
        ],
      },
    ],
    booleanFields: [
      { key: 'isShowNameOCurrentlyOpenDrawing', label: '显示当前打开的图纸名' },
      { key: 'isShowHeader', label: '显示顶部栏' },
      { key: 'logoImg', label: '显示 Logo 图片' },
      { key: 'isShowHeaderTopBar', label: '显示顶部工具栏' },
      { key: 'isShowHeaderTopBarRightBtns', label: '显示顶部右侧按钮' },
      { key: 'isSketchesAndNotesUiMode', label: '草图笔记 UI 模式' },
      { key: 'isShowSketchesAndNotesUiMode', label: '显示 UI 模式切换' },
      { key: 'isShowUseAiFunctionButton', label: '显示 AI 功能按钮' },
      { key: 'isShowTitleButtonBar', label: '显示标题栏按钮' },
      { key: 'isShowTopButtonBar', label: '显示顶部按钮栏' },
      { key: 'isShowMenuBar', label: '显示菜单栏' },
      { key: 'isShowFooter', label: '显示底部栏' },
      { key: 'isMobileCommandLineMode', label: '移动端命令行模式' },
      { key: 'isShowModelNav', label: '显示模型导航' },
      { key: 'isShowCommandLinePanel', label: '显示命令行面板' },
      { key: 'isShowCommandInput', label: '显示命令输入' },
      { key: 'isShowFooterStatusBar', label: '显示状态栏' },
      { key: 'isShowLeftDrawer', label: '显示左侧抽屉' },
      { key: 'isShowRightDrawer', label: '显示右侧抽屉' },
      { key: 'isShowSkeletonLoader', label: '显示骨架屏' },
      { key: 'isPriorityLoadingUi', label: '优先加载 UI' },
      {
        key: 'isDisableRightMenuCommandRuning',
        label: '禁用命令运行时右键菜单',
      },
      {
        key: 'isDisableRightMenuCommandRuningOsnapSet',
        label: '禁用 OSNAP 设置右键菜单',
      },
      { key: 'isDisableRightMenuSelectEntity', label: '禁用选择实体右键菜单' },
    ],
    multiSelectFields: [
      {
        key: 'leftDrawerComponents',
        label: '左侧抽屉组件',
        options: [
          { value: 'DrawingComparison', label: '图纸比对' },
          { value: 'TextSearch', label: '文字搜索' },
          { value: 'BlockLibrary', label: '图块库' },
          { value: 'CodeEditor', label: '代码编辑器' },
          { value: 'DatabaseDisplay', label: '数据库展示' },
          { value: 'PatternRec', label: '图形识别' },
        ],
      },
      {
        key: 'rightDrawerComponents',
        label: '右侧抽屉组件',
        options: [{ value: 'EntityAttribute', label: '实体属性' }],
      },
      {
        key: 'footerRightBtnSwitchData',
        label: '底部状态栏按钮',
        options: [
          { value: '栅格', label: '栅格' },
          { value: '正交', label: '正交' },
          { value: '极轴', label: '极轴' },
          { value: '对象捕捉', label: '对象捕捉' },
          { value: '对象追踪', label: '对象追踪' },
          { value: 'DYN', label: 'DYN' },
          { value: '线宽', label: '线宽' },
        ],
      },
    ],
  };

  const BUTTON_SCHEMAS = [
    {
      key: 'headerTopBarCustomRightBtns',
      label: '顶部自定义按钮',
      fields: [
        {
          key: 'icon',
          label: '图标',
          type: 'text',
          placeholder: 'qiehuan / class:iconfont AI',
          desc: '图标名称或 class:iconfont XXX',
        },
        {
          key: 'cmd',
          label: '命令',
          type: 'text',
          placeholder: '执行的命令',
          desc: '点击按钮后执行的 CAD 命令',
        },
        {
          key: 'prompt',
          label: '提示',
          type: 'text',
          placeholder: '鼠标悬停提示',
          desc: '鼠标悬停时显示的提示文字',
        },
        {
          key: 'openPromptDelay',
          label: '延迟(ms)',
          type: 'number',
          optional: true,
          desc: '打开提示的延迟时间(毫秒)',
        },
      ],
    },
    {
      key: 'mTitleButtonBarData',
      label: '标题栏按钮',
      fields: [
        {
          key: 'icon',
          label: '图标',
          type: 'text',
          placeholder: '图标名称',
          desc: '图标名称或 class:iconfont XXX',
        },
        {
          key: 'cmd',
          label: '命令',
          type: 'text',
          placeholder: '执行的命令',
          desc: '点击按钮后执行的 CAD 命令',
        },
        {
          key: 'prompt',
          label: '提示',
          type: 'text',
          placeholder: '鼠标悬停提示',
          desc: '鼠标悬停时显示的提示文字',
        },
        {
          key: 'commandOptions',
          label: '命令选项',
          type: 'text',
          optional: true,
          placeholder: '["A","B"] 或 ""',
          desc: '自动选择的命令关键字，如"C"圆心，"A"角度；空字符串""让用户自行输入',
        },
      ],
    },
    {
      key: 'mTopButtonBarData',
      label: '顶部工具栏按钮',
      fields: [
        {
          key: 'icon',
          label: '图标',
          type: 'text',
          placeholder: '图标名称',
          desc: '图标名称或 class:iconfont XXX',
        },
        {
          key: 'cmd',
          label: '命令',
          type: 'text',
          placeholder: '执行的命令',
          desc: '点击按钮后执行的 CAD 命令',
        },
        {
          key: 'prompt',
          label: '提示',
          type: 'text',
          placeholder: '鼠标悬停提示',
          desc: '鼠标悬停时显示的提示文字',
        },
        {
          key: 'commandOptions',
          label: '命令选项',
          type: 'text',
          optional: true,
          placeholder: '["A","B"] 或 ""',
          desc: '自动选择的命令关键字，如"C"圆心，"A"角度；空字符串""让用户自行输入',
        },
      ],
    },
  ];

  const BUTTON_BAR_SCHEMAS = [
    {
      key: 'mLeftButtonBarData',
      label: '左侧按钮栏',
      isShowKey: 'isShow',
      itemFields: [
        {
          key: 'icon',
          label: '图标',
          type: 'text',
          placeholder: '图标名称',
          desc: '图标名称或 class:iconfont XXX',
        },
        {
          key: 'cmd',
          label: '命令',
          type: 'text',
          placeholder: '执行的命令',
          desc: '点击按钮后执行的 CAD 命令',
        },
        {
          key: 'prompt',
          label: '提示',
          type: 'text',
          placeholder: '鼠标悬停提示',
          desc: '鼠标悬停时显示的提示文字',
        },
        {
          key: 'commandOptions',
          label: '命令选项',
          type: 'text',
          optional: true,
          placeholder: '["A"] 或 ""',
          desc: '自动选择的命令关键字，如"C"圆心，"A"角度；空字符串""让用户自行输入',
        },
      ],
    },
    {
      key: 'mRightButtonBarData',
      label: '右侧按钮栏',
      isShowKey: 'isShow',
      itemFields: [
        {
          key: 'icon',
          label: '图标',
          type: 'text',
          placeholder: '图标名称',
          desc: '图标名称或 class:iconfont XXX',
        },
        {
          key: 'cmd',
          label: '命令',
          type: 'text',
          placeholder: '执行的命令',
          desc: '点击按钮后执行的 CAD 命令',
        },
        {
          key: 'prompt',
          label: '提示',
          type: 'text',
          placeholder: '鼠标悬停提示',
          desc: '鼠标悬停时显示的提示文字',
        },
        {
          key: 'commandOptions',
          label: '命令选项',
          type: 'text',
          optional: true,
          placeholder: '["A"] 或 ""',
          desc: '自动选择的命令关键字，如"C"圆心，"A"角度；空字符串""让用户自行输入',
        },
      ],
    },
  ];

  const MENU_SCHEMAS = [
    {
      key: 'mMenuBarData',
      label: '菜单栏',
      isShowKey: 'isShowMenuBar',
      itemFields: [
        {
          key: 'tab',
          label: '菜单名',
          type: 'text',
          placeholder: '文件(F)',
          desc: '菜单显示名称，括号内为快捷键',
        },
        {
          key: 'icon',
          label: '图标',
          type: 'text',
          optional: true,
          placeholder: '图标名称',
          desc: '图标名称',
        },
        {
          key: 'cmd',
          label: '命令',
          type: 'text',
          optional: true,
          placeholder: '执行的命令',
          desc: '点击菜单项执行的命令',
        },
        {
          key: 'isResponsive',
          label: '响应式',
          type: 'boolean',
          optional: true,
          desc: '是否为响应式菜单数据',
        },
        {
          key: 'isNoDataTransfer',
          label: '无数据传输',
          type: 'boolean',
          optional: true,
          desc: '不传递按钮配置数据给命令，由命令自行获取数据',
        },
      ],
      childrenKey: 'list',
      childFields: [
        {
          key: 'tab',
          label: '名称',
          type: 'text',
          placeholder: '菜单项名称',
          desc: '菜单项显示名称',
        },
        {
          key: 'icon',
          label: '图标',
          type: 'text',
          optional: true,
          placeholder: '图标名称',
          desc: '图标名称',
        },
        {
          key: 'cmd',
          label: '命令',
          type: 'text',
          optional: true,
          placeholder: '执行的命令',
          desc: '点击菜单项执行的命令',
        },
        {
          key: 'isNoDataTransfer',
          label: '无数据传输',
          type: 'boolean',
          optional: true,
          desc: '不传递按钮配置数据给命令，由命令自行获取数据',
        },
        {
          key: 'commandOptions',
          label: '命令选项',
          type: 'text',
          optional: true,
          placeholder: '["A"] 或 ""',
          desc: '自动选择的命令关键字，如"C"圆心，"A"角度；空字符串""让用户自行输入',
        },
      ],
    },
  ];

  const RIGHT_MENU_SCHEMAS = [
    {
      key: 'mRightMenuData',
      label: '右键菜单(普通)',
      isShowKey: null,
      itemFields: [
        { key: 'label', label: '名称', type: 'text', placeholder: '菜单名称' },
        { key: 'tips', label: '提示', type: 'text', placeholder: '鼠标提示' },
        {
          key: 'cmd',
          label: '命令',
          type: 'text',
          optional: true,
          placeholder: '执行的命令',
        },
      ],
      childrenKey: 'children',
    },
    {
      key: 'mRightMenuDataCommandRuning',
      label: '右键菜单(命令运行)',
      isShowKey: 'isDisableRightMenuCommandRuning',
      itemFields: [
        { key: 'label', label: '名称', type: 'text', placeholder: '菜单名称' },
        { key: 'tips', label: '提示', type: 'text', placeholder: '鼠标提示' },
        {
          key: 'execute_operations',
          label: '操作编号',
          type: 'number',
          optional: true,
          hint: '1=确认, 2=取消',
        },
      ],
    },
    {
      key: 'mRightMenuDataCommandRuningOsnapSet',
      label: '右键菜单(OSNAP设置)',
      isShowKey: 'isDisableRightMenuCommandRuningOsnapSet',
      itemFields: [
        { key: 'label', label: '名称', type: 'text', placeholder: '菜单名称' },
        { key: 'tips', label: '提示', type: 'text', placeholder: '鼠标提示' },
        {
          key: 'set_osnap_type',
          label: 'OSNAP类型',
          type: 'number',
          optional: true,
          hint: '1=端点,2=中点,4=圆心...',
        },
      ],
    },
    {
      key: 'mRightMenuDataSelectEntity',
      label: '右键菜单(选择实体)',
      isShowKey: 'isDisableRightMenuSelectEntity',
      itemFields: [
        { key: 'label', label: '名称', type: 'text', placeholder: '菜单名称' },
        { key: 'tips', label: '提示', type: 'text', placeholder: '鼠标提示' },
        {
          key: 'cmd',
          label: '命令',
          type: 'text',
          optional: true,
          placeholder: '执行的命令',
        },
      ],
    },
  ];

  function init(authToken) {
    token = authToken;
  }

  async function loadConfig() {
    try {
      const res = await fetch('/api/ui-config', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.status === 401) {
        return { success: false, error: '未授权' };
      }
      const data = await res.json();
      if (data.success) {
        currentConfig = data.data || {};
        return { success: true, data: currentConfig };
      }
      return { success: false, error: data.error };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  function renderForm(container) {
    if (!container) return;

    let html = `
      <div class="ui-config-container">
        <h3 class="ui-config-title">UI 界面配置</h3>
        <div class="ui-config-actions">
          <button class="btn btn-primary btn-save" id="saveUiConfigBtn">
            <span class="btn-text">保存配置</span>
            <span class="btn-loading" style="display:none">保存中...</span>
          </button>
          <button class="btn btn-secondary" id="importUiConfigBtn">导入</button>
          <button class="btn btn-secondary" id="exportUiConfigBtn">导出</button>
          <button class="btn btn-warning" id="resetUiConfigBtn">还原默认</button>
          <button class="btn btn-secondary" id="refreshUiConfigBtn">刷新</button>
        </div>
        <input type="file" id="uiConfigJsonFile" accept=".json" style="display: none;" />
        <div class="ui-config-content">
    `;

    html += renderBasicSection();
    html += renderButtonSections();
    html += renderMenuSections();
    html += renderRightMenuSections();

    html += '</div></div>';

    container.innerHTML = html;
    setTimeout(() => bindEvents(container), 0);
  }

  function renderBasicSection() {
    let html = `<div class="config-section">
      <div class="section-header collapsed">
        <span>▶</span> 基础信息
      </div>
      <div class="section-content" style="display:none">`;

    SCHEMA.textFields.forEach((field) => {
      const value = currentConfig[field.key] || '';
      html += `<div class="form-group"><label>${field.label}</label><input type="text" id="ui-${field.key}" value="${escapeHtml(value)}" maxlength="${field.maxLength}" placeholder="请输入${field.label}" /></div>`;
    });

    SCHEMA.enumFields.forEach((field) => {
      const value = currentConfig[field.key] || '';
      const optionsHtml = field.options
        .map(
          (opt) =>
            `<option value="${opt.value}" ${opt.value === value ? 'selected' : ''}>${opt.label}</option>`
        )
        .join('');
      html += `<div class="form-group"><label>${field.label}</label><select id="ui-${field.key}">${optionsHtml}</select></div>`;
    });

    html += `</div></div>`;

    html += `<div class="config-section">
      <div class="section-header collapsed">
        <span>▶</span> 显示控制
      </div>
      <div class="section-content" style="display:none; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px;">`;
    SCHEMA.booleanFields.forEach((field) => {
      const checked = currentConfig[field.key] ? 'checked' : '';
      html += `<label class="checkbox-inline"><input type="checkbox" id="ui-${field.key}" ${checked} /> ${field.label}</label>`;
    });
    html += `</div></div>`;

    html += `<div class="config-section">
      <div class="section-header collapsed">
        <span>▶</span> 组件配置
      </div>
      <div class="section-content" style="display:none">`;
    SCHEMA.multiSelectFields.forEach((field) => {
      const values = currentConfig[field.key] || [];
      const optionsHtml = field.options
        .map(
          (opt) =>
            `<option value="${opt.value}" ${values.includes(opt.value) ? 'selected' : ''}>${opt.label}</option>`
        )
        .join('');
      html += `<div class="form-group"><label>${field.label}</label><select id="ui-${field.key}" multiple style="height: 80px;">${optionsHtml}</select><small>按住 Ctrl 多选</small></div>`;
    });
    html += `</div></div>`;

    return html;
  }

  function renderButtonSections() {
    let html = `<div class="config-section">
      <div class="section-header collapsed">
        <span>▶</span> 按钮配置
      </div>
      <div class="section-content" style="display:none">`;

    BUTTON_SCHEMAS.forEach((schema) => {
      const items = currentConfig[schema.key] || [];
      html += renderSimpleButtonList(schema, items);
    });

    BUTTON_BAR_SCHEMAS.forEach((schema) => {
      const container = currentConfig[schema.key] || {
        isShow: true,
        buttonBarData: [],
      };
      const isShow = container.isShow !== false;
      const items = container.buttonBarData || [];
      html += renderButtonBarCard(schema, items, isShow);
    });

    html += `</div></div>`;
    return html;
  }

  function renderSimpleButtonList(schema, items) {
    let itemsHtml = items.length
      ? items.map((item, idx) => renderButtonItem(schema, item, idx)).join('')
      : '<div class="empty-hint">暂无配置</div>';
    return `
      <div class="complex-card" data-schema="${schema.key}">
        <div class="card-header">
          <span class="card-title">${schema.label}</span>
          <button type="button" class="btn btn-sm btn-primary add-btn">+ 添加</button>
        </div>
        <div class="card-items">${itemsHtml}</div>
      </div>
    `;
  }

  function renderButtonBarCard(schema, items, isShow) {
    let itemsHtml = items.length
      ? items.map((item, idx) => renderButtonItem(schema, item, idx)).join('')
      : '<div class="empty-hint">暂无配置</div>';
    return `
      <div class="complex-card" data-schema="${schema.key}">
        <div class="card-header">
          <label class="checkbox-inline"><input type="checkbox" class="is-show-check" ${isShow ? 'checked' : ''} /> ${schema.label}</label>
          <button type="button" class="btn btn-sm btn-primary add-btn">+ 添加</button>
        </div>
        <div class="card-items">${itemsHtml}</div>
      </div>
    `;
  }

  function renderButtonItem(schema, item, idx) {
    const fields = schema.fields || schema.itemFields || [];
    let fieldsHtml = fields
      .map((field) => {
        let value = item[field.key] || '';
        if (field.type === 'boolean') {
          const checked = value ? 'checked' : '';
          return `<label class="checkbox-inline small"><input type="checkbox" data-field="${field.key}" ${checked} /> ${field.label}</label>`;
        }
        if (field.type === 'number') {
          return `<div class="field-inline" title="${field.desc || ''}"><label>${field.label}${field.optional ? '(可选)' : ''}</label><input type="number" data-field="${field.key}" value="${value}" ${field.optional ? '' : 'required'} placeholder="${field.placeholder || ''}" /></div>`;
        }
        return `<div class="field-inline" title="${field.desc || ''}"><label>${field.label}${field.optional ? '(可选)' : ''}</label><input type="text" data-field="${field.key}" value="${escapeHtml(value)}" ${field.optional ? '' : 'required'} placeholder="${field.placeholder || ''}" /></div>`;
      })
      .join('');

    return `
      <div class="complex-item">
        <div class="item-fields">${fieldsHtml}</div>
        <button type="button" class="btn btn-sm btn-danger delete-btn">删除</button>
      </div>
    `;
  }

  function renderMenuSections() {
    let html = `<div class="config-section">
      <div class="section-header collapsed">
        <span>▶</span> 菜单配置
      </div>
      <div class="section-content" style="display:none">`;

    MENU_SCHEMAS.forEach((schema) => {
      const isShow = schema.isShowKey
        ? currentConfig[schema.isShowKey] !== false
        : true;
      const items = currentConfig[schema.key] || [];
      html += renderMenuCard(schema, items, isShow);
    });

    html += `</div></div>`;
    return html;
  }

  function renderMenuCard(schema, items, isShow) {
    let itemsHtml = items.length
      ? items.map((item, idx) => renderMenuItem(schema, item, idx)).join('')
      : '<div class="empty-hint">暂无配置</div>';
    return `
      <div class="complex-card" data-schema="${schema.key}">
        <div class="card-header">
          <label class="checkbox-inline"><input type="checkbox" class="is-show-check" ${isShow ? 'checked' : ''} /> ${schema.label}</label>
          <button type="button" class="btn btn-sm btn-primary add-btn">+ 添加菜单</button>
        </div>
        <div class="card-items">${itemsHtml}</div>
      </div>
    `;
  }

  function renderMenuItem(schema, item, idx) {
    let fieldsHtml = schema.itemFields
      .map((field) => {
        let value = item[field.key] || '';
        if (field.type === 'boolean') {
          const checked = value ? 'checked' : '';
          return `<label class="checkbox-inline small" title="${field.desc || ''}"><input type="checkbox" data-field="${field.key}" ${checked} /> ${field.label}</label>`;
        }
        return `<div class="field-inline" title="${field.desc || ''}"><label>${field.label}${field.optional ? '(可选)' : ''}</label><input type="text" data-field="${field.key}" value="${escapeHtml(value)}" placeholder="${field.placeholder || ''}" /></div>`;
      })
      .join('');

    const children = item[schema.childrenKey] || [];
    let childrenHtml = '';
    if (children.length > 0 || true) {
      childrenHtml = `<div class="menu-children"><div class="children-label">子菜单</div><div class="children-items">${children.map((child, cidx) => renderMenuChild(schema, child, cidx)).join('')}<button type="button" class="btn btn-sm btn-secondary add-child-btn">+ 添加</button></div></div>`;
    }

    return `
      <div class="complex-item menu-item">
        <div class="item-fields">${fieldsHtml}</div>
        <div class="item-actions">
          <button type="button" class="btn btn-sm btn-secondary add-child-btn">+ 子菜单</button>
          <button type="button" class="btn btn-sm btn-danger delete-btn">删除</button>
        </div>
        ${childrenHtml}
      </div>
    `;
  }

  function renderMenuChild(schema, item, idx) {
    const fields = schema.childFields || schema.itemFields || [];
    let fieldsHtml = fields
      .map((field) => {
        let value = item[field.key] || '';
        if (field.type === 'boolean') {
          const checked = value ? 'checked' : '';
          return `<label class="checkbox-inline small" title="${field.desc || ''}"><input type="checkbox" data-field="${field.key}" ${checked} /> ${field.label}</label>`;
        }
        return `<div class="field-inline" title="${field.desc || ''}"><label>${field.label}${field.optional ? '(可选)' : ''}</label><input type="text" data-field="${field.key}" value="${escapeHtml(value)}" placeholder="${field.placeholder || ''}" /></div>`;
      })
      .join('');

    return `
      <div class="complex-item child-item">
        <div class="item-fields">${fieldsHtml}</div>
        <button type="button" class="btn btn-sm btn-danger delete-btn">删除</button>
      </div>
    `;
  }

  function renderRightMenuSections() {
    let html = `<div class="config-section">
      <div class="section-header collapsed">
        <span>▶</span> 右键菜单配置
      </div>
      <div class="section-content" style="display:none">`;

    RIGHT_MENU_SCHEMAS.forEach((schema) => {
      const isShow = schema.isShowKey ? !currentConfig[schema.isShowKey] : true;
      const items = currentConfig[schema.key] || [];
      html += renderRightMenuCard(schema, items, isShow);
    });

    html += `</div></div>`;
    return html;
  }

  function renderRightMenuCard(schema, items, isShow) {
    let itemsHtml = items.length
      ? items
          .map((item, idx) => renderRightMenuItem(schema, item, idx))
          .join('')
      : '<div class="empty-hint">暂无配置</div>';
    const showCheck = schema.isShowKey
      ? `<label class="checkbox-inline"><input type="checkbox" class="is-show-check" data-disable-key="${schema.isShowKey}" ${isShow ? 'checked' : ''} /> ${schema.label}</label>`
      : `<span class="card-title">${schema.label}</span>`;
    return `
      <div class="complex-card" data-schema="${schema.key}">
        <div class="card-header">
          ${showCheck}
          <button type="button" class="btn btn-sm btn-primary add-btn">+ 添加</button>
        </div>
        <div class="card-items">${itemsHtml}</div>
      </div>
    `;
  }

  function renderRightMenuItem(schema, item, idx) {
    let fieldsHtml = schema.itemFields
      .map((field) => {
        let value = item[field.key] || '';
        if (field.type === 'number') {
          return `<div class="field-inline" title="${field.desc || ''}"><label>${field.label}${field.optional ? '(可选)' : ''}${field.hint ? ` <small>${field.hint}</small>` : ''}</label><input type="number" data-field="${field.key}" value="${value}" placeholder="${field.placeholder || ''}" /></div>`;
        }
        return `<div class="field-inline" title="${field.desc || ''}"><label>${field.label}${field.optional ? '(可选)' : ''}${field.hint ? ` <small>${field.hint}</small>` : ''}</label><input type="text" data-field="${field.key}" value="${escapeHtml(value)}" placeholder="${field.placeholder || ''}" /></div>`;
      })
      .join('');

    const childrenKey = schema.childrenKey;
    const children = childrenKey ? item[childrenKey] || [] : [];
    let childrenHtml = '';
    if (children.length > 0 || childrenKey) {
      childrenHtml = `<div class="menu-children"><div class="children-label">子菜单</div><div class="children-items">${children.map((child, cidx) => renderRightMenuItem(schema, child, cidx)).join('')}<button type="button" class="btn btn-sm btn-secondary add-child-btn">+ 添加</button></div></div>`;
    }

    return `
      <div class="complex-item menu-item">
        <div class="item-fields">${fieldsHtml}</div>
        <div class="item-actions">
          ${childrenKey ? '<button type="button" class="btn btn-sm btn-secondary add-child-btn">+ 子菜单</button>' : ''}
          <button type="button" class="btn btn-sm btn-danger delete-btn">删除</button>
        </div>
        ${childrenHtml}
      </div>
    `;
  }

  function bindFieldValidation(container) {
    container
      .querySelectorAll('.complex-item input[data-field]')
      .forEach((input) => {
        input.addEventListener('blur', function () {
          validateField(this);
        });
        input.addEventListener('input', function () {
          clearFieldError(this);
        });
      });
  }

  function validateField(input) {
    const fieldKey = input.dataset.field;
    const value = input.value.trim();
    clearFieldError(input);

    if (!value) return true;

    if (fieldKey === 'commandOptions' && value) {
      if (value !== '""' && value !== '') {
        try {
          JSON.parse(value);
        } catch (e) {
          showFieldError(input, 'JSON格式无效，如 ["C","A"]');
          return false;
        }
      }
    }
    return true;
  }

  function showFieldError(input, message) {
    const parent = input.closest('.field-inline') || input.parentElement;
    let errorEl = parent.querySelector('.field-error');
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'field-error';
      errorEl.style.color = '#ff6b6b';
      errorEl.style.fontSize = '12px';
      errorEl.style.marginTop = '4px';
      parent.appendChild(errorEl);
    }
    errorEl.textContent = message;
    input.style.borderColor = '#ff6b6b';
  }

  function clearFieldError(input) {
    const parent = input.closest('.field-inline') || input.parentElement;
    const errorEl = parent.querySelector('.field-error');
    if (errorEl) errorEl.remove();
    input.style.borderColor = '';
  }

  function bindEvents(container) {
    container.querySelectorAll('.section-header').forEach((header) => {
      header.addEventListener('click', function () {
        this.classList.toggle('collapsed');
        const content = this.nextElementSibling;
        if (content) {
          content.style.display = this.classList.contains('collapsed')
            ? 'none'
            : 'block';
        }
      });
    });

    bindFieldValidation(container);

    container
      .querySelector('#saveUiConfigBtn')
      .addEventListener('click', saveConfig);
    container
      .querySelector('#refreshUiConfigBtn')
      .addEventListener(
        'click',
        () => window.loadUiConfig && window.loadUiConfig()
      );
    container
      .querySelector('#importUiConfigBtn')
      .addEventListener('click', () =>
        container.querySelector('#uiConfigJsonFile').click()
      );
    container
      .querySelector('#uiConfigJsonFile')
      .addEventListener('change', importJson);
    container
      .querySelector('#exportUiConfigBtn')
      .addEventListener('click', exportJson);
    container
      .querySelector('#resetUiConfigBtn')
      .addEventListener('click', resetConfig);

    container.querySelectorAll('.add-btn').forEach((btn) => {
      btn.addEventListener('click', (e) =>
        handleAddItem(e.target.closest('.complex-card'))
      );
    });

    container.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', (e) =>
        handleDeleteItem(e.target.closest('.complex-item'))
      );
    });

    container.querySelectorAll('.add-child-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        handleAddChild(e.target);
      });
    });
  }

  function handleAddItem(card) {
    const schemaKey = card.dataset.schema;
    let schema = [
      ...BUTTON_SCHEMAS,
      ...BUTTON_BAR_SCHEMAS,
      ...MENU_SCHEMAS,
      ...RIGHT_MENU_SCHEMAS,
    ].find((s) => s.key === schemaKey);
    if (!schema) return;

    let newItem = {};
    (schema.itemFields || schema.fields).forEach((field) => {
      if (!field.optional) newItem[field.key] = '';
    });

    if (
      schemaKey === 'mLeftButtonBarData' ||
      schemaKey === 'mRightButtonBarData'
    ) {
      const newBar = {
        isShow: true,
        buttonBarData: [
          ...(currentConfig[schemaKey]?.buttonBarData || []),
          newItem,
        ],
      };
      currentConfig[schemaKey] = newBar;
    } else {
      currentConfig[schemaKey] = [...(currentConfig[schemaKey] || []), newItem];
    }

    refreshCard(card, schema);
  }

  function handleDeleteItem(item) {
    const card =
      item.closest('.complex-config-card') || item.closest('.complex-card');
    if (!card) return;

    const schemaKey = card.dataset.schema;
    const idx =
      parseInt(item.dataset.idx) ||
      Array.from(item.parentElement.children).indexOf(item);
    const parent = item.closest('.menu-children');

    if (parent) {
      const parentItem = parent.closest('.complex-item');
      const parentIdx =
        parseInt(parentItem.dataset.idx) ||
        Array.from(parentItem.parentElement.children).indexOf(parentItem) - 1;
      const childrenKey = card.querySelector('.add-child-btn')
        ? 'list'
        : 'children';
      if (
        currentConfig[schemaKey] &&
        currentConfig[schemaKey][parentIdx] &&
        currentConfig[schemaKey][parentIdx][childrenKey]
      ) {
        currentConfig[schemaKey][parentIdx][childrenKey].splice(idx, 1);
      }
    } else {
      if (
        schemaKey === 'mLeftButtonBarData' ||
        schemaKey === 'mRightButtonBarData'
      ) {
        if (
          currentConfig[schemaKey] &&
          currentConfig[schemaKey].buttonBarData
        ) {
          currentConfig[schemaKey].buttonBarData.splice(idx, 1);
        }
      } else if (currentConfig[schemaKey]) {
        currentConfig[schemaKey].splice(idx, 1);
      }
    }

    if (item) {
      item.classList.add('deleted');
      setTimeout(() => item.remove(), 200);
    }
  }

  function handleAddChild(btn) {
    const card = btn.closest('.complex-card');
    const schemaKey = card.dataset.schema;

    let schema = [...MENU_SCHEMAS, ...RIGHT_MENU_SCHEMAS].find(
      (s) => s.key === schemaKey
    );
    if (!schema) return;

    const parentItem =
      btn.closest('.menu-item') || btn.closest('.complex-item');
    const childrenContainer = parentItem.querySelector('.children-items');
    if (!childrenContainer) return;

    const childrenKey = schema.childrenKey || 'list';
    const itemsContainer = card.querySelector('.card-items');
    const allItems = Array.from(
      itemsContainer.querySelectorAll(':scope > .complex-item')
    );
    const idx = allItems.indexOf(parentItem);

    if (
      idx === -1 ||
      !currentConfig[schemaKey] ||
      !currentConfig[schemaKey][idx]
    ) {
      console.error('Cannot find parent item index', {
        idx,
        schemaKey,
        hasData: !!currentConfig[schemaKey],
      });
      return;
    }

    let newChild = {};
    const fields = schema.childFields || schema.itemFields || [];
    fields.forEach((field) => {
      if (!field.optional) newChild[field.key] = '';
    });

    if (!currentConfig[schemaKey][idx][childrenKey]) {
      currentConfig[schemaKey][idx][childrenKey] = [];
    }
    currentConfig[schemaKey][idx][childrenKey].push(newChild);

    const childHtml = schema.key.startsWith('mRightMenu')
      ? renderRightMenuItem(
          schema,
          newChild,
          currentConfig[schemaKey][idx][childrenKey].length - 1
        )
      : renderMenuChild(
          schema,
          newChild,
          currentConfig[schemaKey][idx][childrenKey].length - 1
        );
    const addBtn = childrenContainer.querySelector('.add-child-btn');
    addBtn.insertAdjacentHTML('beforebegin', childHtml);

    const newChildEl = addBtn.previousElementSibling;
    newChildEl.classList.add('new-item');

    const deleteBtn = newChildEl.querySelector('.delete-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleDeleteItem(e.target.closest('.complex-item'));
      });
    }
    newChildEl.querySelectorAll('input[data-field]').forEach((input) => {
      input.addEventListener('blur', function () {
        validateField(this);
      });
      input.addEventListener('input', function () {
        clearFieldError(this);
      });
    });
  }

  function refreshCard(card, schema) {
    const schemaKey = schema.key;
    let items = [];

    if (
      schemaKey === 'mLeftButtonBarData' ||
      schemaKey === 'mRightButtonBarData'
    ) {
      items = currentConfig[schemaKey]?.buttonBarData || [];
    } else {
      items = currentConfig[schemaKey] || [];
    }

    const itemsContainer = card.querySelector('.card-items');
    let html = items
      .map((item, i) => {
        if (MENU_SCHEMAS.find((s) => s.key === schemaKey)) {
          return renderMenuItem(schema, item, i);
        } else if (RIGHT_MENU_SCHEMAS.find((s) => s.key === schemaKey)) {
          return renderRightMenuItem(schema, item, i);
        } else {
          return renderButtonItem(schema, item, i);
        }
      })
      .join('');

    if (!html) html = '<div class="empty-hint">暂无配置</div>';
    itemsContainer.innerHTML = html;

    itemsContainer
      .querySelectorAll('.add-btn')
      .forEach((btn) =>
        btn.addEventListener('click', (e) =>
          handleAddItem(e.target.closest('.complex-card'))
        )
      );
    itemsContainer
      .querySelectorAll('.delete-btn')
      .forEach((btn) =>
        btn.addEventListener('click', (e) =>
          handleDeleteItem(e.target.closest('.complex-item'))
        )
      );
    itemsContainer
      .querySelectorAll('.add-child-btn')
      .forEach((btn) =>
        btn.addEventListener('click', (e) =>
          handleAddChild(e.target.closest('.complex-item'))
        )
      );

    itemsContainer.querySelectorAll('input[data-field]').forEach((input) => {
      input.addEventListener('blur', function () {
        validateField(this);
      });
      input.addEventListener('input', function () {
        clearFieldError(this);
      });
    });
  }

  async function saveConfig() {
    const updates = {};

    SCHEMA.textFields.forEach((field) => {
      const el = document.getElementById(`ui-${field.key}`);
      if (el) updates[field.key] = el.value;
    });

    SCHEMA.enumFields.forEach((field) => {
      const el = document.getElementById(`ui-${field.key}`);
      if (el) updates[field.key] = el.value;
    });

    SCHEMA.booleanFields.forEach((field) => {
      const el = document.getElementById(`ui-${field.key}`);
      if (el) updates[field.key] = el.checked;
    });

    SCHEMA.multiSelectFields.forEach((field) => {
      const el = document.getElementById(`ui-${field.key}`);
      if (el)
        updates[field.key] = Array.from(el.selectedOptions).map(
          (opt) => opt.value
        );
    });

    document.querySelectorAll('.complex-card').forEach((card) => {
      const schemaKey = card.dataset.schema;
      const schema = [
        ...BUTTON_SCHEMAS,
        ...BUTTON_BAR_SCHEMAS,
        ...MENU_SCHEMAS,
        ...RIGHT_MENU_SCHEMAS,
      ].find((s) => s.key === schemaKey);
      if (!schema) return;

      const isShowCheck = card.querySelector('.is-show-check');
      if (
        schemaKey === 'mLeftButtonBarData' ||
        schemaKey === 'mRightButtonBarData'
      ) {
        const isShow = isShowCheck?.checked ?? true;
        const items = collectComplexItems(card, schema, 'buttonBarData');
        updates[schema.key] = { isShow, buttonBarData: items };
      } else if (schema.isShowKey) {
        const isShow = isShowCheck?.checked ?? true;
        updates[schema.isShowKey] = !isShow;
        updates[schema.key] = collectComplexItems(
          card,
          schema,
          schema.childrenKey
        );
      } else {
        updates[schema.key] = collectComplexItems(
          card,
          schema,
          schema.childrenKey
        );
      }
    });

    const saveBtn = document.getElementById('saveUiConfigBtn');
    setButtonLoading(saveBtn, true);

    try {
      const res = await fetch('/api/ui-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(updates),
      });

      const data = await res.json();
      setButtonLoading(saveBtn, false);
      if (res.ok && data.success) {
        showToast('UI 配置已保存', 'success');
        loadConfig();
      } else {
        if (data.errors) {
          const msg = data.errors
            .slice(0, 5)
            .map((err) => `${err.path}: ${err.error}`)
            .join('\n');
          showToast('校验失败:\n' + msg, 'error', 5000);
        } else {
          showToast(data.error || '保存失败', 'error');
        }
      }
    } catch (e) {
      setButtonLoading(saveBtn, false);
      showToast('保存失败: ' + e.message, 'error');
    }
  }

  function collectComplexItems(card, schema, childrenKey) {
    const items = [];
    card.querySelectorAll('.complex-item').forEach((item, idx) => {
      if (item.classList.contains('child-item')) return;

      const obj = {};
      const fields = schema.itemFields || schema.fields || [];
      fields.forEach((field) => {
        const input = item.querySelector(`[data-field="${field.key}"]`);
        if (input) {
          obj[field.key] =
            field.type === 'boolean' ? input.checked : input.value;
        }
      });

      if (childrenKey) {
        const childContainer = item.querySelector(`.children-items`);
        if (childContainer) {
          const childItems = [];
          childContainer
            .querySelectorAll('.complex-item:not(.menu-item)')
            .forEach((child) => {
              const childObj = {};
              const childFields = schema.childFields || schema.itemFields || [];
              childFields.forEach((field) => {
                const input = child.querySelector(
                  `[data-field="${field.key}"]`
                );
                if (input) {
                  childObj[field.key] =
                    field.type === 'boolean' ? input.checked : input.value;
                }
              });
              childItems.push(childObj);
            });
          if (childItems.length > 0) obj[childrenKey] = childItems;
        }
      }

      items.push(obj);
    });
    return items;
  }

  async function importJson(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);

      const res = await fetch('/api/ui-config/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify(json),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('配置导入成功', 'success');
        loadConfig().then(() => {
          const container = document.getElementById('uiConfigTab');
          if (container) renderForm(container);
        });
      } else {
        if (data.errors) {
          const msg = data.errors
            .slice(0, 5)
            .map((err) => `${err.path}: ${err.error}`)
            .join('\n');
          const more =
            data.errors.length > 5
              ? `\n...还有 ${data.errors.length - 5} 个错误`
              : '';
          showToast('校验失败:\n' + msg + more, 'error', 5000);
        } else {
          showToast(data.error || '导入失败', 'error');
        }
      }
    } catch (err) {
      showToast('JSON 解析失败: ' + err.message, 'error');
    }

    e.target.value = '';
  }

  async function exportJson() {
    try {
      const res = await fetch('/api/ui-config/export', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'myUiConfig.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('配置已导出', 'success');
      } else {
        const data = await res.json();
        showToast(data.error || '导出失败', 'error');
      }
    } catch (e) {
      showToast('导出失败: ' + e.message, 'error');
    }
  }

  async function resetConfig() {
    if (!confirm('确定要还原为默认配置吗？当前的自定义配置将被覆盖。')) {
      return;
    }

    try {
      const res = await fetch('/api/ui-config/reset', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('配置已还原为默认', 'success');
        loadConfig().then(() => {
          const container = document.getElementById('uiConfigTab');
          if (container) renderForm(container);
        });
      } else {
        showToast(data.error || '还原失败', 'error');
      }
    } catch (e) {
      showToast('还原失败: ' + e.message, 'error');
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showToast(message, type = 'info', duration = 3000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function setButtonLoading(btn, loading) {
    const text = btn.querySelector('.btn-text');
    const loadingEl = btn.querySelector('.btn-loading');
    if (loading) {
      btn.classList.add('loading');
      if (text) text.style.display = 'none';
      if (loadingEl) loadingEl.style.display = 'inline';
    } else {
      btn.classList.remove('loading');
      if (text) text.style.display = 'inline';
      if (loadingEl) loadingEl.style.display = 'none';
    }
  }

  return {
    init,
    loadConfig,
    renderForm,
    BUTTON_SCHEMAS,
    BUTTON_BAR_SCHEMAS,
    MENU_SCHEMAS,
    RIGHT_MENU_SCHEMAS,
    SCHEMA,
  };
})();
