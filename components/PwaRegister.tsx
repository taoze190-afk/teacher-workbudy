'use client';

import { useEffect } from 'react';

/**
 * 注册 Service Worker（PWA 安装条件之一：必须有带 fetch 处理器的 SW）。
 *
 * 需要 HTTPS 或 localhost 才是安全上下文，否则浏览器直接拒绝注册；
 * 开发模式（next dev）不注册，避免热更新时 SW 缓存干扰调试。
 * 首页路径已由 manifest 的 scope='/' 覆盖，这里显式传 scope 以免部署在子路径时失控。
 */
export default function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (typeof window === 'undefined') return;
    if (!window.isSecureContext) return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        /* 注册失败不影响任何业务功能，静默即可 */
      });
    };

    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
