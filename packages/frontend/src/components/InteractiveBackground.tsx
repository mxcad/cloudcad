import React, { useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../contexts/ThemeContext';

/**
 * 交互式动态背景组件 - CloudCAD 完美主题版
 *
 * 设计特色：
 * - Canvas 高性能渲染
 * - 粒子网络系统：节点间智能连线
 * - 鼠标照明效果：光晕跟随鼠标移动
 * - 呼吸光球：模拟环境光照
 * - 主题自适应：深浅色模式无缝切换
 * - 性能优化：requestAnimationFrame + 节流处理
 */
interface InteractiveBackgroundProps {
  /** 是否显示背景，默认为 true */
  visible?: boolean;
  /** 粒子密度：low | medium | high */
  density?: 'low' | 'medium' | 'high';
  /** 是否启用鼠标交互 */
  interactive?: boolean;
}

// ==================== 配置常量 ====================
const CONFIG = {
  particleCount: {
    low: 25,
    medium: 45,
    high: 70,
  },
  connectionDistance: 120,
  mouseRadius: 150,
  particleSpeed: 0.3,
  colors: {
    dark: {
      bg: '#141619',
      particle: 'rgba(99, 102, 241, 0.6)',      // 主色：靛蓝
      particleHighlight: 'rgba(34, 211, 238, 0.9)', // 强调色：青蓝
      connection: 'rgba(99, 102, 241, 0.15)',
      glow: 'rgba(34, 211, 238, 0.15)',
    },
    light: {
      bg: '#f8fafc',
      particle: 'rgba(79, 70, 229, 0.5)',      // 主色：工程蓝
      particleHighlight: 'rgba(6, 182, 212, 0.8)',  // 强调色：青蓝
      connection: 'rgba(79, 70, 229, 0.12)',
      glow: 'rgba(6, 182, 212, 0.12)',
    },
  },
};

// ==================== 类型定义 ====================
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  phase: number;
  pulseSpeed: number;
}

interface MouseState {
  x: number;
  y: number;
  isActive: boolean;
}

// ==================== 全局状态管理 ====================
class BackgroundState {
  private static instance: BackgroundState;
  canvas: HTMLCanvasElement | null = null;
  ctx: CanvasRenderingContext2D | null = null;
  animationId: number | null = null;
  particles: Particle[] = [];
  mouse: MouseState = { x: 0, y: 0, isActive: false };
  theme: 'dark' | 'light' = 'light';
  isRunning = false;
  instanceCount = 0;
  resizeTimeout: ReturnType<typeof setTimeout> | null = null;

  // 事件处理器引用（用于清理）
  resizeHandler: (() => void) | null = null;
  mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
  mouseLeaveHandler: (() => void) | null = null;

  static getInstance(): BackgroundState {
    if (!BackgroundState.instance) {
      BackgroundState.instance = new BackgroundState();
    }
    return BackgroundState.instance;
  }
}

const state = BackgroundState.getInstance();

// ==================== 粒子系统 ====================
const createParticles = (width: number, height: number, count: number): Particle[] => {
  const particles: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const baseRadius = Math.random() * 2 + 1.5;
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * CONFIG.particleSpeed,
      vy: (Math.random() - 0.5) * CONFIG.particleSpeed,
      radius: baseRadius,
      baseRadius,
      phase: Math.random() * Math.PI * 2,
      pulseSpeed: 0.02 + Math.random() * 0.03,
    });
  }
  return particles;
};

const updateParticles = (width: number, height: number) => {
  const time = Date.now() * 0.001;

  state.particles.forEach((p) => {
    // 基础移动
    p.x += p.vx;
    p.y += p.vy;

    // 边界反弹（柔和）
    if (p.x < 0 || p.x > width) p.vx *= -1;
    if (p.y < 0 || p.y > height) p.vy *= -1;

    // 保持在边界内
    p.x = Math.max(0, Math.min(width, p.x));
    p.y = Math.max(0, Math.min(height, p.y));

    // 脉冲效果
    p.phase += p.pulseSpeed;
    p.radius = p.baseRadius + Math.sin(p.phase) * 0.5;

    // 鼠标交互：粒子被吸引
    if (state.mouse.isActive) {
      const dx = state.mouse.x - p.x;
      const dy = state.mouse.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < CONFIG.mouseRadius && dist > 20) {
        const force = (CONFIG.mouseRadius - dist) / CONFIG.mouseRadius;
        p.vx += (dx / dist) * force * 0.02;
        p.vy += (dy / dist) * force * 0.02;
      }
    }

    // 速度衰减（保持稳定）
    p.vx *= 0.99;
    p.vy *= 0.99;

    // 最小速度保持
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (speed < 0.1) {
      p.vx += (Math.random() - 0.5) * 0.05;
      p.vy += (Math.random() - 0.5) * 0.05;
    }
  });
};

// ==================== 渲染系统 ====================
const drawBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
  const colors = CONFIG.colors[state.theme];

  // 渐变背景
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, colors.bg);
  gradient.addColorStop(0.5, state.theme === 'dark' ? '#1a1d23' : '#ffffff');
  gradient.addColorStop(1, colors.bg);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // 绘制环境光球（呼吸效果）
  const time = Date.now() * 0.0005;
  const orbs = [
    { x: width * 0.2, y: height * 0.3, r: 200, color: colors.particle, phase: 0 },
    { x: width * 0.8, y: height * 0.7, r: 180, color: colors.particleHighlight, phase: Math.PI / 2 },
    { x: width * 0.5, y: height * 0.1, r: 150, color: colors.glow, phase: Math.PI },
  ];

  orbs.forEach((orb) => {
    const breathe = 1 + Math.sin(time + orb.phase) * 0.1;
    const orbGradient = ctx.createRadialGradient(
      orb.x, orb.y, 0,
      orb.x, orb.y, orb.r * breathe
    );
    orbGradient.addColorStop(0, orb.color.replace(/[\d.]+\)$/, '0.08)'));
    orbGradient.addColorStop(0.5, orb.color.replace(/[\d.]+\)$/, '0.03)'));
    orbGradient.addColorStop(1, 'transparent');

    ctx.fillStyle = orbGradient;
    ctx.fillRect(0, 0, width, height);
  });
};

const drawConnections = (ctx: CanvasRenderingContext2D) => {
  const colors = CONFIG.colors[state.theme];
  const particles = state.particles;

  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < CONFIG.connectionDistance) {
        const opacity = (1 - dist / CONFIG.connectionDistance) * 0.5;
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = colors.connection.replace(/[\d.]+\)$/, `${opacity})`);
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }
};

const drawMouseGlow = (ctx: CanvasRenderingContext2D) => {
  if (!state.mouse.isActive) return;

  const colors = CONFIG.colors[state.theme];
  const { x, y } = state.mouse;

  // 多层光晕效果
  const layers = [
    { r: 80, alpha: 0.15 },
    { r: 120, alpha: 0.08 },
    { r: 180, alpha: 0.04 },
  ];

  layers.forEach((layer) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, layer.r);
    gradient.addColorStop(0, colors.particleHighlight.replace(/[\d.]+\)$/, `${layer.alpha})`));
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.fillRect(x - layer.r, y - layer.r, layer.r * 2, layer.r * 2);
  });

  // 中心光点
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = colors.particleHighlight;
  ctx.fill();

  // 外圈光环
  ctx.beginPath();
  ctx.arc(x, y, 12, 0, Math.PI * 2);
  ctx.strokeStyle = colors.particleHighlight.replace(/[\d.]+\)$/, '0.3)');
  ctx.lineWidth = 1;
  ctx.stroke();
};

const drawParticles = (ctx: CanvasRenderingContext2D) => {
  const colors = CONFIG.colors[state.theme];

  state.particles.forEach((p) => {
    // 计算与鼠标的距离
    let distToMouse = Infinity;
    if (state.mouse.isActive) {
      const dx = state.mouse.x - p.x;
      const dy = state.mouse.y - p.y;
      distToMouse = Math.sqrt(dx * dx + dy * dy);
    }

    // 根据距离调整颜色和大小
    const isNearMouse = distToMouse < CONFIG.mouseRadius * 0.5;
    const color = isNearMouse ? colors.particleHighlight : colors.particle;
    const radiusMultiplier = isNearMouse ? 1.5 : 1;

    // 绘制粒子光晕
    const glowGradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 3);
    glowGradient.addColorStop(0, color.replace(/[\d.]+\)$/, '0.4)'));
    glowGradient.addColorStop(1, 'transparent');

    ctx.fillStyle = glowGradient;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * 3, 0, Math.PI * 2);
    ctx.fill();

    // 绘制粒子核心
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius * radiusMultiplier, 0, Math.PI * 2);
    ctx.fill();
  });
};

// ==================== 动画循环 ====================
const animate = () => {
  if (!state.isRunning || !state.ctx || !state.canvas) return;

  const { ctx, canvas } = state;
  const { width, height } = canvas;

  // 清空画布
  ctx.clearRect(0, 0, width, height);

  // 绘制背景
  drawBackground(ctx, width, height);

  // 更新粒子
  updateParticles(width, height);

  // 绘制连线
  drawConnections(ctx);

  // 绘制鼠标光晕
  drawMouseGlow(ctx);

  // 绘制粒子
  drawParticles(ctx);

  // 继续动画
  state.animationId = requestAnimationFrame(animate);
};

// ==================== 事件处理 ====================
const handleResize = () => {
  if (state.resizeTimeout) {
    clearTimeout(state.resizeTimeout);
  }

  state.resizeTimeout = setTimeout(() => {
    if (state.canvas) {
      const dpr = window.devicePixelRatio || 1;
      state.canvas.width = window.innerWidth * dpr;
      state.canvas.height = window.innerHeight * dpr;
      state.canvas.style.width = `${window.innerWidth}px`;
      state.canvas.style.height = `${window.innerHeight}px`;

      if (state.ctx) {
        state.ctx.scale(dpr, dpr);
      }

      // 重新初始化粒子
      const density = (state.canvas.dataset.density as 'low' | 'medium' | 'high') || 'medium';
      state.particles = createParticles(window.innerWidth, window.innerHeight, CONFIG.particleCount[density]);
    }
  }, 200);
};

const handleMouseMove = (e: MouseEvent) => {
  state.mouse.x = e.clientX;
  state.mouse.y = e.clientY;
  state.mouse.isActive = true;
};

const handleMouseLeave = () => {
  state.mouse.isActive = false;
};

// ==================== 组件 ====================
export const InteractiveBackground: React.FC<InteractiveBackgroundProps> = ({
  visible = true,
  density = 'medium',
  interactive = true,
}) => {
  const { isDark } = useTheme();
  const initialized = useRef(false);

  // 初始化 Canvas
  const initCanvas = useCallback(() => {
    if (!state.canvas) return;

    const dpr = window.devicePixelRatio || 1;
    state.canvas.width = window.innerWidth * dpr;
    state.canvas.height = window.innerHeight * dpr;
    state.canvas.style.width = `${window.innerWidth}px`;
    state.canvas.style.height = `${window.innerHeight}px`;

    if (state.ctx) {
      state.ctx.scale(dpr, dpr);
    }

    // 初始化粒子
    state.particles = createParticles(window.innerWidth, window.innerHeight, CONFIG.particleCount[density]);
  }, [density]);

  useEffect(() => {
    state.instanceCount++;
    const currentInstance = state.instanceCount;

    // 更新主题
    state.theme = isDark ? 'dark' : 'light';

    // 第一个实例：创建 Canvas 和启动动画
    if (currentInstance === 1 && !initialized.current) {
      initialized.current = true;

      // 移除可能存在的旧 canvas
      const oldCanvas = document.getElementById('interactive-bg-canvas');
      if (oldCanvas) {
        oldCanvas.remove();
      }

      // 创建新 canvas
      state.canvas = document.createElement('canvas');
      state.canvas.id = 'interactive-bg-canvas';
      state.canvas.dataset.density = density;
      state.canvas.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: -1;
        display: ${visible ? 'block' : 'none'};
      `;

      document.body.insertBefore(state.canvas, document.body.firstChild);

      // 获取上下文
      state.ctx = state.canvas.getContext('2d');
      if (!state.ctx) {
        console.error('[InteractiveBackground] Failed to get canvas context');
        return;
      }

      // 初始化
      initCanvas();

      // 绑定事件
      state.resizeHandler = handleResize;
      window.addEventListener('resize', state.resizeHandler, { passive: true });

      if (interactive) {
        state.mouseMoveHandler = handleMouseMove;
        state.mouseLeaveHandler = handleMouseLeave;
        window.addEventListener('mousemove', state.mouseMoveHandler, { passive: true });
        document.body.addEventListener('mouseleave', state.mouseLeaveHandler);
      }

      // 启动动画
      state.isRunning = true;
      animate();
    } else if (state.canvas) {
      // 后续实例：更新属性
      state.canvas.style.display = visible ? 'block' : 'none';
      state.canvas.dataset.density = density;
    }

    // 清理函数
    return () => {
      state.instanceCount--;

      if (state.instanceCount === 0) {
        state.isRunning = false;

        if (state.animationId) {
          cancelAnimationFrame(state.animationId);
          state.animationId = null;
        }

        if (state.resizeHandler) {
          window.removeEventListener('resize', state.resizeHandler);
        }
        if (state.mouseMoveHandler) {
          window.removeEventListener('mousemove', state.mouseMoveHandler);
        }
        if (state.mouseLeaveHandler) {
          document.body.removeEventListener('mouseleave', state.mouseLeaveHandler);
        }

        if (state.canvas) {
          state.canvas.remove();
          state.canvas = null;
        }

        state.ctx = null;
        state.particles = [];
        initialized.current = false;
      }
    };
  }, [isDark, visible, density, interactive, initCanvas]);

  // 更新可见性
  useEffect(() => {
    if (state.canvas) {
      state.canvas.style.display = visible ? 'block' : 'none';
    }
  }, [visible]);

  return null;
};

export default InteractiveBackground;