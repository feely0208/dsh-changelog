#!/usr/bin/env node
/**
 * 客户端面板渲染自测：假 React + 假 fetch，跑初始态与「已有报告」态，抓渲染期异常。
 * 面板整页崩掉时宿主只显示 "Failed to load plugins"，用户看到一片白 —— 这里先拦住。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const 包根 = join(dirname(fileURLToPath(import.meta.url)), '..');
const 源码 = readFileSync(join(包根, 'lib', 'client.js'), 'utf8');

function 造假React(预置 = []) {
  let 序号 = 0;
  const 元素们 = [];
  function createElement(type, props, ...children) {
    const 元素 = { type, props: { ...(props || {}), children }, children };
    元素们.push(元素);
    return 元素;
  }
  class Component {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState() {}
  }
  return {
    元素们,
    react: {
      Component,
      createElement,
      useState(v) { const i = 序号++; return [i < 预置.length ? 预置[i] : v, () => {}]; },
      useEffect() {},
      useMemo(f) { return f(); },
      useRef(v) { return { current: v }; },
      useCallback(f) { return f; },
    },
  };
}

function 加载(预置, 取响应) {
  const 假 = 造假React(预置);
  let captured = null;
  const sandbox = {
    window: { __ModuleLoader__: { load(o) { captured = o; } } },
    console,
    fetch: async () => ({ ok: true, json: async () => 取响应 }),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    setTimeout, clearTimeout,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(源码, sandbox, { filename: 'client.js' });
  assert.ok(captured && captured.id === '@deepwhale-cn/dsh-changelog', 'load() id 正确');
  const mod = captured.factory((名) => {
    if (名 === 'react') return 假.react;
    throw new Error('未预期的依赖：' + 名);
  });
  assert.equal(typeof mod.apply, 'function', 'factory 应返回带 apply 的插件');

  let 面板组件 = null;
  const 注册 = [];
  mod.apply({
    slots: { register(cfg, comp) { 注册.push(cfg); if (cfg.name === 'main') 面板组件 = comp; return {}; } },
    logger: { info() {}, warn() {} },
  });
  assert.equal(typeof 面板组件, 'function', '应注册主面板');
  assert.equal(注册.length, 2, '应注册侧栏图标 + 主面板');
  return { 面板组件, 元素们: 假.元素们 };
}

function 渲染(面板组件) {
  const 外层 = 面板组件({});
  assert.ok(外层 && 外层.type, '安全面板应返回元素');
  let 内层 = 外层;
  if (typeof 外层.type === 'function' && 外层.type.prototype && 外层.type.prototype.render) {
    内层 = new 外层.type(外层.props).render();
  }
  const 面板元素 = Array.isArray(内层) ? 内层[0] : (内层 && Array.isArray(内层.children) ? 内层.children[0] : 内层);
  assert.ok(面板元素 && typeof 面板元素.type === 'function', '错误边界应包住面板组件');
  const 树 = 面板元素.type(面板元素.props);
  assert.ok(树 && 树.type, '面板渲染应返回元素');
  const 文本 = [];
  const 走 = (n) => {
    if (!n) return;
    if (typeof n === 'string' || typeof n === 'number') { 文本.push(String(n)); return; }
    if (Array.isArray(n)) { n.forEach(走); return; }
    if (n.props) {
      if (typeof n.props.children === 'string' || typeof n.props.children === 'number') 文本.push(String(n.props.children));
      if (Array.isArray(n.props.children)) n.props.children.forEach(走);
      if (typeof n.props.alt === 'string') 文本.push(n.props.alt);
    }
    if (Array.isArray(n.children)) n.children.forEach(走);
  };
  走(树);
  return { 树, 全文: 文本.join(' | ') };
}

/* ① 初始态 */
{
  const { 面板组件 } = 加载([], {});
  const { 全文 } = 渲染(面板组件);
  assert.ok(全文.includes('深鲸版本说明'), '标题应渲染');
  assert.ok(全文.includes('生成预览') && 全文.includes('写入 CHANGELOG.md'), '两个按钮都在');
  assert.ok(全文.includes('powered by dwh'), '徽章 alt 应在');
  assert.ok(全文.includes('CHANGELOG'), '应提示写入目标');
}

/* ② 已有报告态：useState 顺序 = 路径/起始/映射/报告/忙/错/版本 */
const 报告 = {
  ok: true, repo: '/tmp/demo', name: 'demo', version: '1.1.0',
  range: { text: 'v1.0.0..HEAD', from: 'v1.0.0', to: 'HEAD', mode: 'tag..HEAD', firstRelease: false },
  counts: { commits: 9, kept: 4, filtered: 5, pendingPolish: 1, byKind: { feature: 2, fix: 2, other: 0 } },
  groups: {
    feature: [
      { hash: 'aaaa1111', short: 'aaaa111', 文本: '支持批量导入素材', polished: true },
      { hash: 'bbbb2222', short: 'bbbb222', 文本: 'add dark mode', polished: false },
    ],
    fix: [{ hash: 'cccc3333', short: 'cccc333', 文本: '修复登录超时', polished: true }],
    other: [],
  },
  filtered: [],
  md: { written: true, skipped: false, path: '/tmp/demo/CHANGELOG.md', backup: '/tmp/demo/CHANGELOG.md.bak' },
  exitCode: 0,
};
{
  const { 面板组件 } = 加载(['', '', '', 报告, false, '', '0.1.0'], {});
  const { 全文 } = 渲染(面板组件);
  assert.ok(全文.includes('v1.1.0'), '应显示版本');
  assert.ok(全文.includes('采用 4 条'), '应显示采用条数');
  assert.ok(全文.includes('待润色 1 条'), '应显示待润色数');
  assert.ok(全文.includes('支持批量导入素材') && 全文.includes('add dark mode [待润色]'), '分组条目与待润色标记都在');
  assert.ok(全文.includes('修复登录超时'), '修复组应渲染');
  assert.ok(全文.includes('已写入'), '应显示写入结果');
  assert.ok(全文.includes('v0.1.0'), '应显示插件版本胶囊');
}

console.log('✓ 客户端面板：初始态 + 报告态渲染通过，关键区块齐全');
