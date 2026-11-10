#!/usr/bin/env node
/**
 * 纯函数单测：版本比较 / 约定式提交解析 / 过滤判据 / 映射优先级。
 * 不碰 git，不写文件，离线可重复。
 */
import assert from 'node:assert/strict';
import { 比较版本, 解析提交主题, 过滤原因, 查映射, 解析版本号, 默认配置 } from '../lib/core.mjs';

let 失败 = 0;
function ok(名) { console.log('ok - ' + 名); }
function notOk(名, e) { 失败++; console.log('not ok - ' + 名 + '\n  ' + String((e && e.message) || e).split('\n').join('\n  ')); }
function 测(名, fn) { try { fn(); ok(名); } catch (e) { notOk(名, e); } }

const 配置 = { ...默认配置 };

测('版本比较：三段数字、预发布小于正式版', () => {
  assert.ok(比较版本('1.2.3', '1.2.4') < 0);
  assert.ok(比较版本('1.3.0', '1.2.9') > 0);
  assert.equal(比较版本('1.2.3', '1.2.3'), 0);
  assert.ok(比较版本('1.2.3-rc.1', '1.2.3') < 0);
  assert.ok(比较版本('1.2.3', '1.2.3-rc.9') > 0);
  assert.equal(解析版本号('v1.2.3'), null, '带前缀不算合法版本号');
});

测('约定式提交解析：type/scope/中文描述', () => {
  const a = 解析提交主题('feat(ui): 支持深色模式');
  assert.equal(a.type, 'feat');
  assert.equal(a.scope, 'ui');
  assert.equal(a.文本, '支持深色模式');
  assert.equal(a.约定式, true);
  const b = 解析提交主题('随便写的一句话');
  assert.equal(b.约定式, false);
  assert.equal(b.文本, '随便写的一句话');
});

测('过滤判据：chore/docs/ci/test/merge/版本号提交', () => {
  for (const s of ['chore: 更新依赖', 'docs: 补 README', 'ci: 调整流水线', 'test: 加用例']) {
    assert.ok(过滤原因({ subject: s }, 配置), '应过滤：' + s);
  }
  for (const s of ['Merge branch \'main\'', '1.2.3', 'chore(release): bump version to 1.2.3', 'bump deps']) {
    assert.ok(过滤原因({ subject: s }, 配置), '应过滤：' + s);
  }
  for (const s of ['feat: 新功能', 'fix: 修 bug', 'perf: 快一点', '随便一句中文']) {
    assert.equal(过滤原因({ subject: s }, 配置), null, '不该过滤：' + s);
  }
});

测('映射优先级：整句 > type(scope) > type:关键词 > 关键词 > type', () => {
  const 映射 = {
    'feat: 支持批量导入': '整句命中',
    'feat(x)': 'scope 命中',
    'fix:登录': '关键词命中',
    '登录': '纯词命中',
    'fix': '类型兜底',
  };
  assert.equal(查映射({ subject: 'feat: 支持批量导入', type: 'feat', scope: '' }, 映射).文本, '整句命中');
  assert.equal(查映射({ subject: 'feat(x): 别的', type: 'feat', scope: 'x' }, 映射).文本, 'scope 命中');
  assert.equal(查映射({ subject: 'fix: 登录超时', type: 'fix', scope: '' }, 映射).文本, '关键词命中');
  assert.equal(查映射({ subject: 'fix: 登录', type: 'fix', scope: '' }, 映射).文本, '关键词命中');
  assert.equal(查映射({ subject: 'fix: 别的事', type: 'fix', scope: '' }, 映射).文本, '类型兜底');
  assert.equal(查映射({ subject: 'perf: 别的', type: 'perf', scope: '' }, 映射), null, '没命中就该 null');
});

测('映射容错：空映射 / 非对象值不崩、不误命中', () => {
  assert.equal(查映射({ subject: 'a', type: '', scope: '' }, null), null);
  assert.equal(查映射({ subject: 'a', type: '', scope: '' }, {}), null);
  assert.equal(查映射({ subject: 'a', type: '', scope: '' }, { a: 123 }), null, '值不是字符串不算命中');
});

console.log('');
if (失败) { console.log('有 ' + 失败 + ' 条断言失败'); process.exit(1); }
