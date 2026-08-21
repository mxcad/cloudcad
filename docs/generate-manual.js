const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  ImageRun, PageBreak, Header, Footer, PageNumber, NumberFormat,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
  PageOrientation, TableOfContents,
} = require("docx");
const fs = require("fs");
const path = require("path");

// 调色板 - 技术产品手册风格
const palette = {
  primary: "#0A1628",
  body: "#1A2B40",
  secondary: "#6878A0",
  accent: "#5B8DB8",
  surface: "#F4F8FC",
};

const c = (hex) => hex.replace("#", "");

// 辅助函数：生成标题段落
function heading(text, level = HeadingLevel.HEADING_1) {
  const fontSizes = {
    [HeadingLevel.HEADING_1]: 32,
    [HeadingLevel.HEADING_2]: 28,
    [HeadingLevel.HEADING_3]: 24,
  };
  const spacingBefore = level === HeadingLevel.HEADING_1 ? 360 : 240;
  
  return new Paragraph({
    heading: level,
    spacing: { before: spacingBefore, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: fontSizes[level] || 32,
        color: c(palette.primary),
        font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
      }),
    ],
  });
}

// 辅助函数：生成正文段落
function body(text) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120 },
    children: [
      new TextRun({
        text,
        size: 24,
        color: c(palette.body),
        font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
      }),
    ],
  });
}

// 辅助函数：生成带图片的段落（修复宽高比问题）
function imageParagraph(imagePath, maxWidth, caption) {
  const imageBuffer = fs.readFileSync(imagePath);
  
  // 获取图片实际尺寸
  const imageInfo = getImageDimensions(imageBuffer);
  const aspectRatio = imageInfo.height / imageInfo.width;
  
  // 按最大宽度计算高度，保持比例
  const displayWidth = maxWidth;
  const displayHeight = Math.round(maxWidth * aspectRatio);
  
  const children = [
    new ImageRun({
      data: imageBuffer,
      transformation: { width: displayWidth, height: displayHeight },
      type: "png",
    }),
  ];
  
  if (caption) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 180 },
        children: [
          new TextRun({
            text: caption,
            italics: true,
            size: 20,
            color: c(palette.secondary),
            font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
          }),
        ],
      })
    );
  }
  
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children,
  });
}

// 获取PNG图片尺寸的简单函数
function getImageDimensions(buffer) {
  // PNG文件头：8字节签名 + 4字节长度 + 4字节"IHDR" + 4字节宽度 + 4字节高度
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    return { width, height };
  }
  // 默认返回常见的截图尺寸比例
  return { width: 1920, height: 1080 };
}

// 辅助函数：生成列表项
function bulletItem(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after: 60 },
    children: [
      new TextRun({
        text,
        size: 24,
        color: c(palette.body),
        font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
      }),
    ],
  });
}

// 辅助函数：生成步骤说明
function stepItem(stepNumber, text) {
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({
        text: `步骤${stepNumber}：`,
        bold: true,
        size: 24,
        color: c(palette.accent),
        font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
      }),
      new TextRun({
        text,
        size: 24,
        color: c(palette.body),
        font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
      }),
    ],
  });
}

// 截图路径
const screenshotsDir = path.join(__dirname, "manual-screenshots");

// 文档内容
const doc = new Document({
  styles: {
    default: {
      document: {
        run: {
          font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
          size: 24,
          color: c(palette.body),
        },
        paragraph: {
          spacing: { line: 312 },
        },
      },
    },
  },
  sections: [
    // 封面
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
        },
      },
      children: [
        // 封面标题
        new Paragraph({ spacing: { before: 3000 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: "梦想云图协同平台",
              bold: true,
              size: 56,
              color: c(palette.primary),
              font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [
            new TextRun({
              text: "操作手册",
              bold: true,
              size: 44,
              color: c(palette.primary),
              font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
          children: [
            new TextRun({
              text: "CloudCAD Online Collaboration Platform User Manual",
              italics: true,
              size: 28,
              color: c(palette.secondary),
              font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
            }),
          ],
        }),
        new Paragraph({ spacing: { before: 2000 }, children: [] }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: "版本：v1.0",
              size: 24,
              color: c(palette.secondary),
              font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
            }),
          ],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 100 },
          children: [
            new TextRun({
              text: "日期：2026年8月",
              size: 24,
              color: c(palette.secondary),
              font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
            }),
          ],
        }),
      ],
    },
    // 目录
    {
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
        },
      },
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [
            new TextRun({
              text: "目录",
              bold: true,
              size: 32,
              color: c(palette.primary),
              font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
            }),
          ],
        }),
        new TableOfContents("目录", {
          hyperlink: true,
          headingStyleRange: "1-3",
        }),
        new Paragraph({ children: [new PageBreak()] }),
      ],
    },
    // 第一部分：快速入门
    {
      properties: {
        page: {
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  text: "梦想云图协同平台操作手册",
                  size: 18,
                  color: c(palette.secondary),
                  font: { ascii: "Calibri", eastAsia: "Microsoft YaHei" },
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({
                  children: [PageNumber.CURRENT],
                  size: 18,
                  color: c(palette.secondary),
                }),
              ],
            }),
          ],
        }),
      },
      children: [
        // 第一章：平台简介
        heading("第一章 平台简介", HeadingLevel.HEADING_1),
        body("梦想云图协同平台（CloudCAD）是一款基于Web的在线CAD协同设计平台，支持多人实时协同编辑、文件管理、资源共享等功能。平台采用先进的WebGL技术，提供流畅的CAD绘图体验，同时支持项目管理和团队协作。"),
        body("本手册将详细介绍平台的各项功能，帮助用户快速上手并高效使用平台进行设计工作。"),
        body("平台主要功能包括："),
        bulletItem("在线CAD绘图与编辑"),
        bulletItem("多人实时协同设计"),
        bulletItem("项目文件管理"),
        bulletItem("公共资源库（图纸库、图块库、字体库）"),
        bulletItem("文件分享与协作"),
        bulletItem("会员服务与管理"),
        
        // 第二章：账号管理
        heading("第二章 账号管理", HeadingLevel.HEADING_1),
        heading("2.1 登录平台", HeadingLevel.HEADING_2),
        body("访问平台首页，点击右上角的\"登录\"按钮，进入登录页面。平台支持以下登录方式："),
        body("账号密码登录：输入用户名和密码进行登录，适用于已注册用户。"),
        body("手机验证码登录：输入手机号获取验证码进行登录，更加安全便捷。"),
        body("微信扫码登录：使用微信扫描二维码进行登录，快速便捷。"),
        imageParagraph(path.join(screenshotsDir, "01-login.png"), 500, "图2-1 登录页面"),
        
        body("登录操作步骤："),
        stepItem(1, "打开浏览器，访问平台首页 https://demo.mxdraw3d.com"),
        stepItem(2, "点击页面右上角的\"登录\"按钮"),
        stepItem(3, "选择登录方式（账号密码/手机验证码/微信扫码）"),
        stepItem(4, "输入相应的登录信息"),
        stepItem(5, "点击\"立即登录\"按钮完成登录"),
        
        heading("2.2 注册新账号", HeadingLevel.HEADING_2),
        body("如果您还没有账号，可以点击登录页面的\"立即注册\"按钮进行注册。注册流程分为两步："),
        stepItem(1, "填写基本信息：输入用户名、邮箱或手机号"),
        stepItem(2, "设置密码：输入并确认密码，完成注册"),
        body("注册完成后，系统会自动登录并跳转到仪表盘页面。"),
        
        // 第三章：界面概览
        heading("第三章 界面概览", HeadingLevel.HEADING_1),
        heading("3.1 仪表盘", HeadingLevel.HEADING_2),
        body("登录后，默认显示仪表盘页面。仪表盘是用户的工作概览中心，提供以下信息："),
        bulletItem("项目数量和文件统计：显示您参与的项目总数和文件数量"),
        bulletItem("最近打开的文件列表：快速访问最近编辑过的文件"),
        bulletItem("快捷操作入口：一键创建项目、上传文件、新建图纸"),
        bulletItem("存储空间使用情况：查看已用空间和剩余空间"),
        imageParagraph(path.join(screenshotsDir, "03-dashboard.png"), 500, "图3-1 仪表盘页面"),
        
        heading("3.2 主菜单导航", HeadingLevel.HEADING_2),
        body("平台左侧为主菜单导航栏，包含以下功能入口："),
        bulletItem("仪表盘：返回工作概览首页"),
        bulletItem("项目管理：管理参与的所有项目"),
        bulletItem("我的图纸：管理个人图纸文件"),
        bulletItem("分享管理：管理分享链接"),
        bulletItem("个人资料：修改个人信息和设置"),
        body("点击相应菜单项即可跳转到对应功能页面。"),
        
        new Paragraph({ children: [new PageBreak()] }),
        
        // 第二部分：普通用户操作指南
        heading("第二部分 普通用户操作指南", HeadingLevel.HEADING_1),
        
        // 第四章：文件管理
        heading("第四章 文件管理", HeadingLevel.HEADING_1),
        heading("4.1 项目管理", HeadingLevel.HEADING_2),
        body("点击主菜单的\"项目管理\"进入项目列表页面。项目是组织文件的基本单位，支持多人协作。"),
        imageParagraph(path.join(screenshotsDir, "04-projects.png"), 500, "图4-1 项目管理页面"),
        
        body("项目管理功能包括："),
        bulletItem("查看所有参与的项目：显示您创建的和加入的项目"),
        bulletItem("创建新项目：点击\"创建项目\"按钮，输入项目名称即可创建"),
        bulletItem("进入项目查看文件：点击项目卡片进入项目详情"),
        bulletItem("管理项目成员和权限：邀请成员、设置权限角色"),
        
        body("创建新项目步骤："),
        stepItem(1, "在项目管理页面，点击\"创建项目\"按钮"),
        stepItem(2, "在弹出的对话框中输入项目名称"),
        stepItem(3, "点击\"确定\"按钮完成创建"),
        stepItem(4, "新项目将出现在项目列表中"),
        
        heading("4.2 个人空间", HeadingLevel.HEADING_2),
        body("点击主菜单的\"我的图纸\"进入个人空间。个人空间用于管理您的私人图纸文件，独立于项目空间。"),
        imageParagraph(path.join(screenshotsDir, "05-personal-space.png"), 500, "图4-2 个人空间页面"),
        
        body("个人空间支持以下操作："),
        bulletItem("创建文件夹组织文件：点击新建文件夹图标，输入文件夹名称"),
        bulletItem("上传文件：点击上传按钮或拖拽文件到页面"),
        bulletItem("移动文件：选中文件，拖拽到目标文件夹"),
        bulletItem("复制文件：右键点击文件，选择\"复制\""),
        bulletItem("删除文件：右键点击文件，选择\"删除\""),
        bulletItem("文件重命名：右键点击文件，选择\"重命名\""),
        
        heading("4.3 文件上传", HeadingLevel.HEADING_2),
        body("在项目或个人空间中，支持多种方式上传文件："),
        stepItem(1, "点击页面顶部的\"上传\"按钮"),
        stepItem(2, "在文件选择对话框中选择要上传的文件"),
        stepItem(3, "等待上传完成"),
        body("也可以直接拖拽文件到页面区域进行上传。"),
        body("平台支持多种CAD文件格式，包括DWG、DXF、MXWEB等。"),
        
        new Paragraph({ children: [new PageBreak()] }),
        
        // 第五章：CAD编辑器
        heading("第五章 CAD编辑器", HeadingLevel.HEADING_1),
        body("CAD编辑器是平台的核心功能，提供专业的在线CAD绘图工具。"),
        
        heading("5.1 编辑器界面", HeadingLevel.HEADING_2),
        body("打开任意CAD图纸后，将进入CAD编辑器界面。编辑器界面包括以下区域："),
        imageParagraph(path.join(screenshotsDir, "02-cad-editor-with-content.png"), 550, "图5-1 CAD编辑器界面（包含图纸内容）"),
        
        bulletItem("顶部菜单栏：文件操作、编辑、视图、插入、注释、输出等功能"),
        bulletItem("工具栏：常用绘图和编辑工具的快捷按钮"),
        bulletItem("绘图区域：主要的绘图工作区，显示当前图纸内容"),
        bulletItem("属性面板：查看和编辑选中对象的属性"),
        bulletItem("图层管理：管理图层显示和属性"),
        bulletItem("命令行：输入CAD命令进行精确操作"),
        
        heading("5.2 基本绘图操作", HeadingLevel.HEADING_2),
        body("CAD编辑器提供丰富的绘图工具，支持以下基本操作："),
        
        body("绘制直线："),
        stepItem(1, "在工具栏中点击\"直线\"工具"),
        stepItem(2, "在绘图区域点击确定起点"),
        stepItem(3, "移动鼠标到终点位置，点击确定"),
        stepItem(4, "按ESC键或右键结束绘制"),
        
        body("绘制矩形："),
        stepItem(1, "在工具栏中点击\"矩形\"工具"),
        stepItem(2, "在绘图区域点击确定一个角点"),
        stepItem(3, "移动鼠标到对角点位置，点击确定"),
        
        body("绘制圆："),
        stepItem(1, "在工具栏中点击\"圆\"工具"),
        stepItem(2, "在绘图区域点击确定圆心"),
        stepItem(3, "移动鼠标确定半径，点击完成绘制"),
        
        heading("5.3 协同编辑", HeadingLevel.HEADING_2),
        body("平台支持多人实时协同编辑，团队成员可以同时编辑同一图纸。"),
        body("开启协同编辑步骤："),
        stepItem(1, "打开需要协同编辑的图纸"),
        stepItem(2, "点击菜单栏的\"分享\"按钮"),
        stepItem(3, "选择\"协同编辑\"选项"),
        stepItem(4, "复制分享链接发送给团队成员"),
        stepItem(5, "团队成员点击链接即可加入协同编辑"),
        body("协同编辑时，所有参与者的更改会实时同步显示。"),
        
        heading("5.4 文件保存与导出", HeadingLevel.HEADING_2),
        body("CAD编辑器支持自动保存和手动保存："),
        bulletItem("自动保存：编辑过程中系统会自动保存更改"),
        bulletItem("手动保存：按Ctrl+S或点击保存按钮手动保存"),
        body("导出文件步骤："),
        stepItem(1, "点击菜单栏的\"输出\"选项"),
        stepItem(2, "选择导出格式（PDF、图片、DWG等）"),
        stepItem(3, "设置导出参数"),
        stepItem(4, "点击\"导出\"按钮完成"),
        
        new Paragraph({ children: [new PageBreak()] }),
        
        // 第六章：资源库
        heading("第六章 资源库", HeadingLevel.HEADING_1),
        body("公共资源库提供丰富的设计资源供用户下载使用。"),
        
        heading("6.1 公共资源库", HeadingLevel.HEADING_2),
        body("公共资源库包含图纸库和图块库，提供各类CAD设计资源。"),
        imageParagraph(path.join(screenshotsDir, "06-library.png"), 500, "图6-1 公共资源库"),
        
        body("浏览和下载资源："),
        stepItem(1, "点击主菜单的\"图纸库\"或\"图块库\""),
        stepItem(2, "在列表中浏览可用资源"),
        stepItem(3, "点击资源卡片查看详情"),
        stepItem(4, "点击\"下载\"按钮下载到本地"),
        
        heading("6.2 字体库", HeadingLevel.HEADING_2),
        body("字体库管理平台提供的CAD字体资源，支持下载和使用各种字体。"),
        imageParagraph(path.join(screenshotsDir, "07-font-library.png"), 500, "图6-2 字体库"),
        
        body("下载字体步骤："),
        stepItem(1, "进入字体库页面"),
        stepItem(2, "浏览或搜索所需字体"),
        stepItem(3, "点击字体卡片查看详情"),
        stepItem(4, "点击\"下载\"按钮下载字体文件"),
        
        new Paragraph({ children: [new PageBreak()] }),
        
        // 第七章：分享管理
        heading("第七章 分享管理", HeadingLevel.HEADING_1),
        body("分享管理用于管理您创建的所有分享链接，方便文件共享和协作。"),
        imageParagraph(path.join(screenshotsDir, "09-shares.png"), 500, "图7-1 分享管理页面"),
        
        body("创建分享链接："),
        stepItem(1, "在文件管理页面，右键点击要分享的文件"),
        stepItem(2, "选择\"分享\"选项"),
        stepItem(3, "设置分享有效期（可选）"),
        stepItem(4, "点击\"创建分享链接\""),
        stepItem(5, "复制生成的分享链接"),
        
        body("管理分享链接："),
        bulletItem("查看所有分享链接：显示您创建的所有分享"),
        bulletItem("设置分享有效期：修改分享链接的有效期"),
        bulletItem("撤销分享链接：删除分享链接，停止分享"),
        
        new Paragraph({ children: [new PageBreak()] }),
        
        // 第八章：会员中心
        heading("第八章 会员中心", HeadingLevel.HEADING_1),
        body("会员中心提供会员服务相关信息，帮助您了解和管理会员权益。"),
        imageParagraph(path.join(screenshotsDir, "08-member-center.png"), 500, "图8-1 会员中心"),
        
        body("会员中心功能包括："),
        bulletItem("当前会员等级和状态：显示您的会员等级和有效期"),
        bulletItem("会员权益对比：查看不同等级会员的权益差异"),
        bulletItem("升级会员套餐：选择合适的套餐进行升级"),
        bulletItem("订单历史记录：查看购买记录和订单详情"),
        
        body("升级会员步骤："),
        stepItem(1, "进入会员中心页面"),
        stepItem(2, "浏览会员套餐列表"),
        stepItem(3, "选择合适的套餐"),
        stepItem(4, "点击\"立即购买\"按钮"),
        stepItem(5, "完成支付后自动升级"),
        
        new Paragraph({ children: [new PageBreak()] }),
        
        // 第九章：个人资料
        heading("第九章 个人资料", HeadingLevel.HEADING_1),
        body("在个人资料页面，您可以管理个人信息和安全设置。"),
        imageParagraph(path.join(screenshotsDir, "10-profile.png"), 500, "图9-1 个人资料页面"),
        
        body("个人信息管理："),
        bulletItem("修改昵称和头像：点击相应区域进行修改"),
        bulletItem("绑定/解绑邮箱：用于账号安全和找回密码"),
        bulletItem("绑定/解绑手机号：用于登录和安全验证"),
        bulletItem("绑定/解绑微信：方便微信登录"),
        bulletItem("修改密码：定期修改密码保障账号安全"),
        
        body("修改密码步骤："),
        stepItem(1, "进入个人资料页面"),
        stepItem(2, "点击\"修改密码\"按钮"),
        stepItem(3, "输入当前密码"),
        stepItem(4, "输入新密码并确认"),
        stepItem(5, "点击\"保存\"按钮完成修改"),
        
        new Paragraph({ children: [new PageBreak()] }),
        
        // 第三部分：管理员操作指南
        heading("第三部分 管理员操作指南", HeadingLevel.HEADING_1),
        
        // 第十章：用户管理
        heading("第十章 用户管理", HeadingLevel.HEADING_1),
        body("管理员可以管理平台所有用户，包括创建、编辑、禁用等操作。"),
        imageParagraph(path.join(screenshotsDir, "11-admin-users.png"), 500, "图10-1 用户管理页面"),
        
        body("用户管理功能："),
        bulletItem("查看用户列表：显示所有注册用户信息"),
        bulletItem("创建新用户：点击\"创建用户\"按钮添加新用户"),
        bulletItem("编辑用户信息：修改用户的基本信息"),
        bulletItem("管理用户会员等级：设置用户的会员等级"),
        bulletItem("搜索和筛选：按角色、会员等级等条件筛选"),
        
        body("创建新用户步骤："),
        stepItem(1, "进入用户管理页面"),
        stepItem(2, "点击\"创建用户\"按钮"),
        stepItem(3, "填写用户信息（用户名、邮箱、密码等）"),
        stepItem(4, "设置用户角色和权限"),
        stepItem(5, "点击\"确定\"按钮完成创建"),
        
        new Paragraph({ children: [new PageBreak()] }),
        
        // 第十一章：角色权限管理
        heading("第十一章 角色权限管理", HeadingLevel.HEADING_1),
        body("角色权限管理用于配置系统角色和权限，控制用户访问权限。"),
        imageParagraph(path.join(screenshotsDir, "12-admin-roles.png"), 500, "图11-1 角色权限管理"),
        
        body("角色管理功能："),
        bulletItem("系统角色管理：管理系统预设角色"),
        bulletItem("项目角色模板：创建和管理项目角色模板"),
        bulletItem("权限配置：为角色分配具体权限"),
        
        body("创建自定义角色："),
        stepItem(1, "进入角色权限管理页面"),
        stepItem(2, "点击\"创建角色\"按钮"),
        stepItem(3, "输入角色名称和描述"),
        stepItem(4, "勾选该角色拥有的权限"),
        stepItem(5, "点击\"保存\"按钮完成创建"),
        
        new Paragraph({ children: [new PageBreak()] }),
        
        // 第十二章：审计日志
        heading("第十二章 审计日志", HeadingLevel.HEADING_1),
        body("审计日志记录系统所有操作日志，用于安全审计和问题排查。"),
        imageParagraph(path.join(screenshotsDir, "13-admin-audit-logs.png"), 500, "图12-1 审计日志页面"),
        
        body("日志查询功能："),
        bulletItem("按用户筛选：查看特定用户的操作记录"),
        bulletItem("按操作类型筛选：筛选登录、上传、删除等操作"),
        bulletItem("按时间范围筛选：查看特定时间段的日志"),
        bulletItem("按资源类型筛选：筛选项目、文件等资源的操作"),
        
        body("导出日志："),
        stepItem(1, "设置筛选条件（可选）"),
        stepItem(2, "点击\"导出CSV\"按钮"),
        stepItem(3, "等待导出完成"),
        stepItem(4, "下载导出的日志文件"),
        
        new Paragraph({ children: [new PageBreak()] }),
        
        // 第十三章：系统监控
        heading("第十三章 系统监控", HeadingLevel.HEADING_1),
        body("系统监控提供平台运行状态的实时监控，帮助管理员了解系统健康状况。"),
        imageParagraph(path.join(screenshotsDir, "14-admin-system-monitor.png"), 500, "图13-1 系统监控页面"),
        
        body("监控内容包括："),
        bulletItem("服务健康检查：显示各项服务的运行状态"),
        bulletItem("缓存监控：查看Redis缓存使用情况"),
        bulletItem("后台任务状态：监控异步任务执行情况"),
        bulletItem("告警历史：查看系统告警记录"),
        
        new Paragraph({ children: [new PageBreak()] }),
        
        // 第十四章：支付管理
        heading("第十四章 支付管理", HeadingLevel.HEADING_1),
        body("支付管理用于管理VIP会员相关业务，包括套餐、订单、退款等。"),
        imageParagraph(path.join(screenshotsDir, "15-admin-billing.png"), 500, "图14-1 支付管理页面"),
        
        body("支付管理功能："),
        bulletItem("VIP等级管理：配置会员等级和权益"),
        bulletItem("时长定价管理：设置不同套餐的价格"),
        bulletItem("订单管理：查看和处理用户订单"),
        bulletItem("退款审核：审核用户的退款申请"),
        
        body("处理退款申请："),
        stepItem(1, "进入支付管理页面"),
        stepItem(2, "点击\"退款申请\"选项卡"),
        stepItem(3, "查看待审核的退款申请"),
        stepItem(4, "点击\"审核\"按钮查看详情"),
        stepItem(5, "选择\"通过\"或\"拒绝\"并填写原因"),
        
        new Paragraph({ children: [new PageBreak()] }),
        
        // 第十五章：运行时配置
        heading("第十五章 运行时配置", HeadingLevel.HEADING_1),
        body("运行时配置用于管理平台的系统参数和功能开关，无需重启即可生效。"),
        imageParagraph(path.join(screenshotsDir, "16-admin-runtime-config.png"), 500, "图15-1 运行时配置页面"),
        
        body("配置项包括："),
        bulletItem("邮件服务配置：SMTP服务器、发件人设置"),
        bulletItem("短信服务配置：短信服务商、API密钥"),
        bulletItem("存储配额设置：用户存储空间限制"),
        bulletItem("文件大小限制：上传文件大小上限"),
        bulletItem("功能开关：启用或禁用特定功能"),
        
        body("修改配置步骤："),
        stepItem(1, "进入运行时配置页面"),
        stepItem(2, "找到需要修改的配置项"),
        stepItem(3, "点击配置项进行编辑"),
        stepItem(4, "输入新的配置值"),
        stepItem(5, "点击\"保存\"按钮生效"),
        
        new Paragraph({ children: [new PageBreak()] }),
        
        // 第十六章：IP黑名单管理
        heading("第十六章 IP黑名单管理", HeadingLevel.HEADING_1),
        body("IP黑名单用于限制特定IP地址的访问，增强系统安全性。"),
        imageParagraph(path.join(screenshotsDir, "17-admin-ip-blacklist.png"), 500, "图16-1 IP黑名单管理"),
        
        body("IP黑名单功能："),
        bulletItem("查看黑名单列表：显示所有被封禁的IP地址"),
        bulletItem("添加IP到黑名单：封禁恶意IP"),
        bulletItem("从黑名单移除IP：解除IP封禁"),
        bulletItem("设置永久/临时封禁：设置封禁时长"),
        
        body("添加IP到黑名单："),
        stepItem(1, "进入IP黑名单管理页面"),
        stepItem(2, "点击\"添加IP\"按钮"),
        stepItem(3, "输入要封禁的IP地址"),
        stepItem(4, "选择封禁类型（永久/临时）"),
        stepItem(5, "填写封禁原因（可选）"),
        stepItem(6, "点击\"确定\"按钮完成添加"),
        
        new Paragraph({ children: [new PageBreak()] }),
        
        // 附录
        heading("附录", HeadingLevel.HEADING_1),
        
        heading("A. 常见问题解答", HeadingLevel.HEADING_2),
        body("1. 如何重置密码？"),
        body("在登录页面点击\"忘记密码\"，通过邮箱或手机号验证后设置新密码。"),
        body("2. 如何升级会员？"),
        body("在会员中心选择合适的套餐进行购买即可升级。"),
        body("3. 如何分享图纸？"),
        body("在文件管理页面右键点击文件，选择\"分享\"选项创建分享链接。"),
        body("4. 如何创建协同编辑？"),
        body("打开图纸后，点击菜单栏的\"分享\"按钮，选择\"协同编辑\"选项。"),
        body("5. 上传文件有大小限制吗？"),
        body("普通用户单文件最大100MB，会员用户可根据套餐享受更大空间。"),
        
        heading("B. 快捷键列表", HeadingLevel.HEADING_2),
        body("以下是平台常用的快捷键："),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: c(palette.secondary) },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: c(palette.secondary) },
            left: { style: BorderStyle.SINGLE, size: 1, color: c(palette.secondary) },
            right: { style: BorderStyle.SINGLE, size: 1, color: c(palette.secondary) },
            insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: c(palette.secondary) },
            insideVertical: { style: BorderStyle.SINGLE, size: 1, color: c(palette.secondary) },
          },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: "快捷键", bold: true, size: 22 })] })],
                  shading: { type: ShadingType.CLEAR, fill: c(palette.surface) },
                  width: { size: 40, type: WidthType.PERCENTAGE },
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: "功能", bold: true, size: 22 })] })],
                  shading: { type: ShadingType.CLEAR, fill: c(palette.surface) },
                  width: { size: 60, type: WidthType.PERCENTAGE },
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Ctrl + S", size: 22 })] })], width: { size: 40, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "保存文件", size: 22 })] })], width: { size: 60, type: WidthType.PERCENTAGE } }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Ctrl + Z", size: 22 })] })], width: { size: 40, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "撤销操作", size: 22 })] })], width: { size: 60, type: WidthType.PERCENTAGE } }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Ctrl + Y", size: 22 })] })], width: { size: 40, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "重做操作", size: 22 })] })], width: { size: 60, type: WidthType.PERCENTAGE } }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Ctrl + A", size: 22 })] })], width: { size: 40, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "全选", size: 22 })] })], width: { size: 60, type: WidthType.PERCENTAGE } }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Delete", size: 22 })] })], width: { size: 40, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "删除选中对象", size: 22 })] })], width: { size: 60, type: WidthType.PERCENTAGE } }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Esc", size: 22 })] })], width: { size: 40, type: WidthType.PERCENTAGE } }),
                new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "取消当前操作", size: 22 })] })], width: { size: 60, type: WidthType.PERCENTAGE } }),
              ],
            }),
          ],
        }),
        
        heading("C. 联系方式", HeadingLevel.HEADING_2),
        body("如有任何问题或建议，请联系平台管理员。"),
        body("邮箱：admin@cloudcad.com"),
        body("电话：400-xxx-xxxx"),
        body("工作时间：周一至周五 9:00-18:00"),
      ],
    },
  ],
});

// 生成文档
async function generate() {
  const buffer = await Packer.toBuffer(doc);
  const outputPath = path.join(__dirname, "梦想云图协同平台操作手册.docx");
  fs.writeFileSync(outputPath, buffer);
  console.log("文档已生成：" + outputPath);
}

generate().catch(console.error);
