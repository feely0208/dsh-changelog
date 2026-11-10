/**
 * 深鲸版本说明 —— 宿主半边
 *
 * 出口（同源 HTTP，面板直接用 fetch）：
 *   GET  /dsh-changelog/api/info       版本号（读 package.json）
 *   GET  /dsh-changelog/api/badge      powered-by-dwh 徽章（本地 PNG，离线不裂图）
 *   POST /dsh-changelog/api/generate   生成版本说明（body: {path, since?, map?, write?, dryRun?}）
 *   GET  /dsh-changelog/api/generate   ?path=&since=&write=1&dryRun=1
 *
 * 只有 body.write === true 才会写 CHANGELOG.md（写前自动备份），默认只预览。
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { 生成 } from './core.mjs';

const 包根 = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTE = '/dsh-changelog';
// 版本号只从 package.json 读：面板和 /api/info 都不写死，发版后各处不会说法不一
const 插件版本 = JSON.parse(readFileSync(join(包根, 'package.json'), 'utf8')).version;

export const name = 'changelog';
export const inject = ['webServer'];

function 回(res, 码, 数据) {
  const 体 = JSON.stringify(数据);
  res.writeHead(码, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(体),
    'cache-control': 'no-store',
  });
  res.end(体);
}

function 读体(req, 上限 = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let 大 = 0;
    const 块 = [];
    req.on('data', (c) => {
      大 += c.length;
      if (大 > 上限) { reject(new Error('请求体过大（超过 256KB）')); req.destroy(); return; }
      块.push(c);
    });
    req.on('end', () => {
      const 文本 = Buffer.concat(块).toString('utf8').trim();
      if (!文本) return resolve({});
      try { resolve(JSON.parse(文本)); } catch { reject(new Error('body 不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function 建处理器() {
  return async function handler(req, res, url) {
    // 宿主给 handler 的第三个参数不保证是 URL 对象；查询串也不能当路径。
    const 原始 = (url && url.pathname) ? (url.pathname + (url.search || '')) : String(req.url || '/');
    let 解析;
    try { 解析 = new URL(原始, 'http://local'); } catch { 解析 = new URL('/', 'http://local'); }
    const 全路径 = decodeURIComponent(解析.pathname);
    const 路 = 全路径.replace(ROUTE, '') || '/';
    const 查询 = 解析.searchParams;

    try {
      if (路 === '/api/info' && req.method === 'GET') {
        return 回(res, 200, { ok: true, version: 插件版本 });
      }

      if (路 === '/api/badge' && req.method === 'GET') {
        try {
          const 图 = readFileSync(join(包根, 'assets', 'deepwhale-badge.png'));
          res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'public, max-age=86400' });
          return res.end(图);
        } catch {
          return 回(res, 404, { ok: false, 原因: '徽章图片缺失' });
        }
      }

      if (路 === '/api/generate' && (req.method === 'GET' || req.method === 'POST')) {
        let 体 = {};
        if (req.method === 'POST') {
          try { 体 = await 读体(req); } catch (e) { return 回(res, 400, { ok: false, 原因: String(e && e.message || e) }); }
        }
        const 目录 = String(体.path || 查询.get('path') || '').trim();
        if (!目录) return 回(res, 400, { ok: false, 原因: '请给仓库目录（path）' });
        const 布尔 = (v) => v === true || v === '1' || v === 'true' || v === 1;
        const 报告 = 生成(目录, {
          since: String(体.since || 查询.get('since') || '').trim() || undefined,
          map: String(体.map || 查询.get('map') || '').trim() || undefined,
          version: String(体.version || 查询.get('version') || '').trim() || undefined,
          tagPrefix: String(体.tagPrefix || 查询.get('tagPrefix') || '').trim() || undefined,
          changelog: String(体.changelog || 查询.get('changelog') || '').trim() || undefined,
          write: 布尔(体.write) || 布尔(查询.get('write')),
          dryRun: 布尔(体.dryRun) || 布尔(查询.get('dryRun')),
        });
        return 回(res, 200, 报告);
      }

      return 回(res, 404, { ok: false, 原因: '未知路径：' + 路 });
    } catch (e) {
      const 码 = (e && e.代码) === 2 ? 400 : 500;
      return 回(res, 码, { ok: false, 原因: String(e && e.message ? e.message : e), exitCode: (e && e.代码) || 2 });
    }
  };
}

export function apply(ctx) {
  if (ctx.webServer && typeof ctx.webServer.register === 'function') {
    const handler = 建处理器();
    ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: ROUTE, handler }), 'changelog: http 出口');
    ctx.logger?.info?.('[changelog] 已挂 HTTP 出口 ' + ROUTE + '/api');
  } else {
    ctx.logger?.warn?.('[changelog] 没有 webServer 服务，面板会取不到数据');
  }
}

export default { name, inject, apply };
