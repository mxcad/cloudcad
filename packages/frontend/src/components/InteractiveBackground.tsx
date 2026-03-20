import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTheme } from '../contexts/ThemeContext';

/**
 * 交互式动态背景组件 - 漂浮光晕
 *
 * 设计特色：
 * - 随机漂浮的模糊光晕（2-4个），带有呼吸动画
 * - 网格适配明暗主题，随鼠标距离产生照明效果
 * - 光晕与网格完全独立，互不干扰
 * - 通过 createPortal 渲染到 body
 */
export const InteractiveBackground: React.FC = () => {
  const { isDark } = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 设置 canvas 尺寸
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // 鼠标跟随
    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

        // 初始化随机光晕
        type Orb = {
          x: number;
          y: number;
          baseX: number;
          baseY: number;
          radius: number;
          color: [number, number, number];
          opacity: number;
          phase: number;
          speedX: number;
          speedY: number;
          driftRange: number;
        };
    
        const orbs: Orb[] = [];
        const orbCount = 2 + Math.floor(Math.random() * 3); // 2-4个光晕
    
        const colors: [number, number, number][] = [
          [99, 102, 241], // primary (indigo)
          [34, 211, 238], // accent (cyan)
          [139, 92, 246], // violet
          [236, 72, 153], // pink
        ];
    
        for (let i = 0; i < orbCount; i++) {
          const baseX = Math.random() * canvas.width;
          const baseY = Math.random() * canvas.height;
          orbs.push({
            x: baseX,
            y: baseY,
            baseX,
            baseY,
            radius: 180 + Math.random() * 220, // 180-400
            color: colors[Math.floor(Math.random() * colors.length)],
            opacity: 0.1 + Math.random() * 0.15, // 0.1-0.25
            phase: Math.random() * Math.PI * 2,
            speedX: 0.0008 + Math.random() * 0.0012, // 更快的速度
            speedY: 0.0006 + Math.random() * 0.001,
            driftRange: 50 + Math.random() * 80, // 更大的漂移范围
          });
        }
    // 动画循环
    let time = 0;
    const animate = () => {
      time += 0.016;
      const { width, height } = canvas;
      const { x: mx, y: my } = mouseRef.current;

      // 清空画布
      ctx.fillStyle = isDark ? '#141619' : '#f8fafc';
      ctx.fillRect(0, 0, width, height);

      // 绘制模糊光晕 - 明显漂浮动画
      orbs.forEach((orb) => {
        // 活跃的随机漂移（使用多层正弦波模拟有机运动）
        const driftX =
          Math.sin(time * orb.speedX * 1000 + orb.phase) * orb.driftRange +
          Math.cos(time * orb.speedX * 600 + orb.phase * 1.5) * (orb.driftRange * 0.6) +
          Math.sin(time * orb.speedX * 300 + orb.phase * 0.5) * (orb.driftRange * 0.3);
        const driftY =
          Math.cos(time * orb.speedY * 1000 + orb.phase) * orb.driftRange +
          Math.sin(time * orb.speedY * 800 + orb.phase * 0.7) * (orb.driftRange * 0.6) +
          Math.cos(time * orb.speedY * 400 + orb.phase * 1.2) * (orb.driftRange * 0.3);

        // 添加呼吸效果（大小变化）
        const breathe = 1 + Math.sin(time * 0.8 + orb.phase) * 0.15;
        const radius = orb.radius * breathe;

        const x = orb.baseX + driftX;
        const y = orb.baseY + driftY;

        // 非常柔和的径向渐变，模拟模糊光晕
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(${orb.color[0]}, ${orb.color[1]}, ${orb.color[2]}, ${orb.opacity})`);
        gradient.addColorStop(0.4, `rgba(${orb.color[0]}, ${orb.color[1]}, ${orb.color[2]}, ${orb.opacity * 0.5})`);
        gradient.addColorStop(0.8, `rgba(${orb.color[0]}, ${orb.color[1]}, ${orb.color[2]}, ${orb.opacity * 0.1})`);
        gradient.addColorStop(1, 'transparent');

        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      });

      // 绘制网格 - 适配明暗主题，仅根据鼠标距离调整透明度
      const gridSize = 50;
      const maxDist = 280; // 最大影响距离
      const centerRadius = 100; // 中心清晰区域
      const baseGridOpacity = isDark ? 0.04 : 0.06; // 基础网格透明度
      const maxGridOpacity = isDark ? 0.25 : 0.3; // 最近时最大透明度

      // 网格颜色：深色主题用白色，亮色主题用深色（主色调）
      const gridR = isDark ? 255 : 99;
      const gridG = isDark ? 255 : 102;
      const gridB = isDark ? 255 : 241;

      ctx.lineWidth = 1;

      // 计算某点距离鼠标的透明度系数（0-1）
      const getLightingFactor = (px: number, py: number): number => {
        const dist = Math.sqrt((px - mx) ** 2 + (py - my) ** 2);

        if (dist < centerRadius) {
          return 1;
        } else if (dist > maxDist) {
          return 0;
        } else {
          const t = (dist - centerRadius) / (maxDist - centerRadius);
          return 1 - t * t * (3 - 2 * t); // smoothstep
        }
      };

      // 绘制竖线
      for (let x = 0; x <= width; x += gridSize) {
        const segments = Math.ceil(height / 25);
        const segHeight = height / segments;

        for (let i = 0; i < segments; i++) {
          const sy = i * segHeight;
          const ey = (i + 1) * segHeight;
          const midY = (sy + ey) / 2;

          const lighting = getLightingFactor(x, midY);
          const opacity = baseGridOpacity + (maxGridOpacity - baseGridOpacity) * lighting;

          ctx.strokeStyle = `rgba(${gridR}, ${gridG}, ${gridB}, ${opacity})`;
          ctx.beginPath();
          ctx.moveTo(x, sy);
          ctx.lineTo(x, ey);
          ctx.stroke();
        }
      }

      // 绘制横线
      for (let y = 0; y <= height; y += gridSize) {
        const segments = Math.ceil(width / 25);
        const segWidth = width / segments;

        for (let i = 0; i < segments; i++) {
          const sx = i * segWidth;
          const ex = (i + 1) * segWidth;
          const midX = (sx + ex) / 2;

          const lighting = getLightingFactor(midX, y);
          const opacity = baseGridOpacity + (maxGridOpacity - baseGridOpacity) * lighting;

          ctx.strokeStyle = `rgba(${gridR}, ${gridG}, ${gridB}, ${opacity})`;
          ctx.beginPath();
          ctx.moveTo(sx, y);
          ctx.lineTo(ex, y);
          ctx.stroke();
        }
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isDark]);

  return createPortal(
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
      }}
    />,
    document.body
  );
};

export default InteractiveBackground;