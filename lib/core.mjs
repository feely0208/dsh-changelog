/**
 * 深鲸版本说明（dsh-changelog）—— 检查内核（纯 Node 内置模块，零依赖）
 *
 * 从本地 git 历史生成「对外可发」的版本说明：
 *   · 按约定式提交归类：新增(feat) / 修复(fix) / 其他
 *   · 过滤掉不该对外的：chore / docs / ci / test / merge / 版本号提交
 *   · 可选 --map：把提交前缀翻成面向用户的中文；未命中标「待润色」
 *   · 三种输出：终端中文 / --md 幂等写 CHANGELOG / --json（带 commit hash）
 *
 * 只读 git（不联网）；只有 --md 才写文件，且写前先备份。
 * 默认值只写通用约定（仓库根的 package.json / CHANGELOG.md），不写死任何项目路径。
 */
import { readFileSync, existsSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve, isAbsolute } from 'node:path';
import { execFileSync } from 'node:child_process';

export const 默认配置 = {
  /** 版本来源（相对仓库根） */
  versionFile: 'package.json',
  /** 变更日志文件（相对仓库根；--changelog 可覆盖） */
  changelog: 'CHANGELOG.md',
  /** 版本 tag 前缀（v1.2.3 / 1.2.3 都认） */
  tagPrefix: 'v',
  /** 不该出现在对外说明里的提交类型 */
  过滤类型: ['chore', 'docs', 'ci', 'test'],
  /** 归类顺序 */
  分类: [
    ['feat', '新增'],
    ['fix', '修复'],
  ],
  兜底分类: '其他',
};

/** 只读 git；失败抛错（由调用方决定退出码 2）。 */
export function git(仓库, 参数) {
  return execFileSync('git', ['-C', 仓库, ...参数], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 32 * 1024 * 1024,
  });
}

function 试git(仓库, 参数) {
  try { return git(仓库, 参数).trim(); } catch { return null; }
}

function 读JSON(路) {
  try { return JSON.parse(readFileSync(路, 'utf8')); } catch { return null; }
}

export function 读包版本(仓库, 配置) {
  const 包 = 读JSON(join(仓库, 配置.versionFile));
  return 包 && 包.version ? { 包, 版本: String(包.version), 名: String(包.name || '') } : null;
}

/* ── 语义化版本比较（数字三段 + 预发布后缀） ── */
export function 解析版本号(文本) {
  const m = String(文本 || '').trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!m) return null;
  return { 主: [Number(m[1]), Number(m[2]), Number(m[3])], 预: m[4] || '' };
}

export function 比较版本(a, b) {
  const A = 解析版本号(a);
  const B = 解析版本号(b);
  if (!A || !B) return 0;
  for (let i = 0; i < 3; i++) if (A.主[i] !== B.主[i]) return A.主[i] - B.主[i];
  if (A.预 === B.预) return 0;
  if (!A.预) return 1; // 正式版 > 预发布
  if (!B.预) return -1;
  return A.预 < B.预 ? -1 : 1;
}

/** 列出仓库里能当版本号的 tag（去掉配置前缀后是语义化版本）。 */
export function 列版本tag(仓库, 配置) {
  const 原 = 试git(仓库, ['for-each-ref', '--sort=-creatordate', '--format=%(refname:short)', 'refs/tags']) || '';
  const 前缀 = 配置.tagPrefix || '';
  const 结果 = [];
  for (const 名 of 原.split('\n').map((s) => s.trim()).filter(Boolean)) {
    let 版本 = 名;
    if (前缀 && 版本.startsWith(前缀)) 版本 = 版本.slice(前缀.length);
    if (!解析版本号(版本)) continue;
    结果.push({ tag: 名, 版本 });
  }
  return 结果;
}

/**
 * 算出本次要覆盖的提交范围。
 * 当前版本 tag 已存在 → 取它前一个 tag .. 这个 tag；
 * 不存在 → 取比当前版本小的最大 tag .. HEAD（这就是「准备发版时」的常见状态）；
 * 一个 tag 都没有 → 全量（首个版本）。
 */
export function 计算范围(仓库, 配置, 版本, 选项 = {}) {
  if (选项.since) return { 范围: `${选项.since}..HEAD`, 从: 选项.since, 到: 'HEAD', 模式: 'since', 首个版本: false };
  const tags = 列版本tag(仓库, 配置);
  const 当前tag = tags.find((t) => t.版本 === 版本) || null;
  if (当前tag) {
    const 比当前小的 = tags
      .filter((t) => 比较版本(t.版本, 版本) < 0)
      .sort((a, b) => 比较版本(b.版本, a.版本));
    const 上一个 = 比当前小的[0] || null;
    return {
      范围: 上一个 ? `${上一个.tag}..${当前tag.tag}` : `${当前tag.tag}`,
      从: 上一个 ? 上一个.tag : null,
      到: 当前tag.tag,
      模式: 上一个 ? 'tag..tag' : '首版-tag',
      首个版本: !上一个,
    };
  }
  const 比当前小的 = tags
    .filter((t) => 比较版本(t.版本, 版本) < 0)
    .sort((a, b) => 比较版本(b.版本, a.版本));
  const 上一个 = 比当前小的[0] || null;
  return {
    范围: 上一个 ? `${上一个.tag}..HEAD` : 'HEAD',
    从: 上一个 ? 上一个.tag : null,
    到: 'HEAD',
    模式: 上一个 ? 'tag..HEAD' : '首个版本',
    首个版本: !上一个,
  };
}

/* ── 提交解析 ── */
const 记录分隔 = '\x1e';
const 字段分隔 = '\x1f';

export function 读提交(仓库, 范围) {
  const 原 = git(仓库, ['log', '--no-merges', '--date=short', `--format=%H${字段分隔}%h${字段分隔}%ad${字段分隔}%s${记录分隔}`, 范围]);
  return 原
    .split(记录分隔)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((块) => {
      const [hash, short, date, ...余] = 块.split(字段分隔);
      return { hash, short, date, subject: 余.join(字段分隔).trim() };
    })
    .filter((c) => c.hash && c.subject);
}

export function 解析提交主题(subject) {
  const m = String(subject || '').match(/^([A-Za-z]+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/);
  if (m) return { type: m[1].toLowerCase(), scope: (m[2] || '').trim(), breaking: !!m[3], 文本: m[4].trim(), 约定式: true };
  return { type: '', scope: '', breaking: false, 文本: String(subject || '').trim(), 约定式: false };
}

/** 该过滤掉的：类型在过滤表、merge、版本号提交。 */
export function 过滤原因(提交, 配置) {
  const 主题 = 提交.subject;
  if (/^Merge\b/i.test(主题)) return 'merge 提交';
  const { type } = 解析提交主题(主题);
  if (type && 配置.过滤类型.includes(type)) return `类型 ${type} 不对用户`;
  if (/^v?\d+\.\d+\.\d+(?:[-+.\w]*)?$/i.test(主题)) return '版本号提交';
  if (/^(?:chore|build|release)(?:\([^)]*\))?!?:\s*(?:release|bump|v?\d+\.\d+\.\d+)/i.test(主题)) return '版本号提交';
  if (/^bump\b/i.test(主题)) return '版本号提交';
  if (/^(?:release|publish)\b/i.test(主题)) return '版本号提交';
  return null;
}

/** 映射文件：key 可以是整句、`type(scope)`、`type:关键词`、`type`、或任意关键词。 */
export function 查映射(条目, 映射) {
  if (!映射 || typeof 映射 !== 'object' || !Object.keys(映射).length) return null;
  const 原句 = 条目.subject;
  const 取 = (k) => (typeof 映射[k] === 'string' ? 映射[k] : null);
  const 命中 = (条件, 排序) => {
    const 键们 = Object.keys(映射).filter(条件).sort(排序);
    for (const k of 键们) {
      const 值 = 取(k);
      if (值) return { 文本: 值, 规则: k };
    }
    return null;
  };

  // ① 整句完全相同
  if (Object.prototype.hasOwnProperty.call(映射, 原句) && 取(原句)) return { 文本: 取(原句), 规则: 原句 };
  // ② type(scope) 精确
  if (条目.type && 条目.scope) {
    const k = `${条目.type}(${条目.scope})`;
    if (取(k)) return { 文本: 取(k), 规则: k };
  }
  // ③ type:关键词（关键词出现在原句里）
  const 带冒号 = Object.keys(映射).filter((k) => k.includes(':'));
  for (const k of 带冒号.sort((a, b) => b.length - a.length)) {
    const [t, ...其余] = k.split(':');
    const 关键词 = 其余.join(':').trim();
    if (!关键词) continue;
    if (t.trim().toLowerCase() !== 条目.type) continue;
    if (!原句.includes(关键词)) continue;
    const 值 = 取(k);
    if (值) return { 文本: 值, 规则: k };
  }
  // ④ 任意关键词（最长优先）
  const 纯词 = Object.keys(映射).filter((k) => !k.includes(':') && !k.includes('('));
  for (const k of 纯词.sort((a, b) => b.length - a.length)) {
    if (!原句.includes(k)) continue;
    const 值 = 取(k);
    if (值) return { 文本: 值, 规则: k };
  }
  // ⑤ 只按 type 兜底
  if (条目.type) {
    const 值 = 取(条目.type);
    if (值) return { 文本: 值, 规则: 条目.type };
  }
  return null;
}

/** 读映射文件：相对路径按仓库根解析（也接受绝对路径）。 */
export function 读映射文件(仓库, 路) {
  if (!路) return { 映射: null, 路径: null };
  const 全 = isAbsolute(路) ? 路 : resolve(仓库, 路);
  if (!existsSync(全)) throw new Error(`映射文件不存在：${路}`);
  const 数据 = 读JSON(全);
  if (!数据 || typeof 数据 !== 'object' || Array.isArray(数据)) throw new Error(`映射文件必须是 JSON 对象：${路}`);
  return { 映射: 数据, 路径: 全 };
}

const 分类键 = { 新增: 'feature', 修复: 'fix', 其他: 'other' };

/**
 * 主流程：算范围 → 读提交 → 过滤 → 归类 → 润色。
 * @param {string} 目录 仓库目录
 * @param {{since?:string, map?:string, version?:string, tagPrefix?:string, changelog?:string, write?:boolean, dryRun?:boolean}} 选项
 */
export function 生成(目录, 选项 = {}) {
  const 仓库 = resolve(目录);
  if (!existsSync(仓库)) { const e = new Error(`目录不存在：${目录}`); e.代码 = 2; throw e; }
  if (!existsSync(join(仓库, '.git')) && 试git(仓库, ['rev-parse', '--git-dir']) === null) {
    const e = new Error(`不是 git 仓库：${目录}`); e.代码 = 2; throw e;
  }
  const 配置 = {
    ...默认配置,
    ...(选项.tagPrefix ? { tagPrefix: 选项.tagPrefix } : {}),
    ...(选项.changelog ? { changelog: 选项.changelog } : {}),
  };
  const 包信息 = 读包版本(仓库, 配置);
  if (!包信息) { const e = new Error(`读不到 ${配置.versionFile} 的 version`); e.代码 = 2; throw e; }
  const 版本 = String(选项.version || 包信息.版本);
  const 范围 = 计算范围(仓库, 配置, 版本, 选项);

  let 提交们 = [];
  try {
    提交们 = 读提交(仓库, 范围.范围);
  } catch (e) {
    const err = new Error(`git log 失败（范围 ${范围.范围}）：${e.message}`);
    err.代码 = 2;
    throw err;
  }

  const { 映射, 路径: 映射路径 } = 读映射文件(仓库, 选项.map);

  const 分组 = { feature: [], fix: [], other: [] };
  const 过滤 = [];
  for (const c of 提交们) {
    const 原因 = 过滤原因(c, 配置);
    const 解析 = 解析提交主题(c.subject);
    if (原因) { 过滤.push({ hash: c.hash, short: c.short, subject: c.subject, reason: 原因 }); continue; }
    const 条目 = { hash: c.hash, short: c.short, date: c.date, type: 解析.type, scope: 解析.scope, subject: c.subject, 文本: 解析.文本 };
    const 命中 = 查映射(条目, 映射);
    const 润色 = 命中 ? { 文本: 命中.文本, 规则: 命中.规则 } : { 文本: 解析.文本, 规则: null };
    const 类 = 配置.分类.find(([t]) => t === 解析.type);
    const 键 = 类 ? 分类键[类[1]] : 'other';
    分组[键].push({
      hash: c.hash, short: c.short, date: c.date,
      type: 解析.type, scope: 解析.scope, subject: c.subject,
      文本: 润色.文本,
      polished: Boolean(命中),
      规则: 润色.规则,
      分类: 类 ? 类[1] : 配置.兜底分类,
    });
  }

  const 采用 = [...分组.feature, ...分组.fix, ...分组.other];
  const 待润色 = 采用.filter((x) => !x.polished).length;
  const 报告 = {
    ok: 采用.length > 0,
    repo: 仓库,
    name: 包信息.名,
    version: 版本,
    range: { text: 范围.范围, from: 范围.从, to: 范围.到, mode: 范围.模式, firstRelease: 范围.首个版本 },
    mapFile: 映射路径,
    counts: {
      commits: 提交们.length,
      kept: 采用.length,
      filtered: 过滤.length,
      pendingPolish: 待润色,
      byKind: { feature: 分组.feature.length, fix: 分组.fix.length, other: 分组.other.length },
    },
    groups: 分组,
    filtered: 过滤,
    exitCode: 采用.length ? 0 : 1,
  };
  报告.md = { written: false, skipped: false, path: join(仓库, 配置.changelog), reason: null, backup: null };
  if (选项.write) 写CHANGELOG(报告, 仓库, 配置, 选项);
  return 报告;
}

/* ── --md 输出 ── */
export function 渲染Markdown段(报告, 日期 = 今天()) {
  const 行 = [`## [${报告.version}] - ${日期}`, ''];
  const 标题 = { feature: '### 新增', fix: '### 修复', other: '### 其他' };
  for (const 键 of ['feature', 'fix', 'other']) {
    const 项 = 报告.groups[键];
    if (!项.length) continue;
    行.push(标题[键]);
    for (const x of 项) 行.push(`- ${x.文本}${x.polished ? '' : ' [待润色]'}`);
    行.push('');
  }
  if (行[行.length - 1] === '') 行.pop();
  return 行.join('\n');
}

export function 今天() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function 已有版本段(文本, 版本) {
  const 转义 = 版本.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^#{1,3}\\s*(?:\\[|【)?\\s*v?${转义}(?![0-9A-Za-z.+-])`, 'm').test(文本);
}

/** 幂等写入：已有该版本段 → 跳过；否则插到一级标题之后（最新在上），写前备份。 */
export function 写CHANGELOG(报告, 仓库, 配置, 选项 = {}) {
  const 路径 = 报告.md.path;
  const 段 = 渲染Markdown段(报告);
  if (existsSync(路径)) {
    const 旧 = readFileSync(路径, 'utf8');
    if (已有版本段(旧, 报告.version)) {
      报告.md.skipped = true;
      报告.md.reason = `${配置.changelog} 里已有 ${报告.version} 的段落，跳过写入`;
      return 报告;
    }
    if (选项.dryRun) {
      报告.md.reason = '--dry-run：只预览，未写入（内容见 md.preview）';
      报告.md.preview = 段;
      return 报告;
    }
    const 备份 = 路径 + '.bak';
    copyFileSync(路径, 备份);
    报告.md.backup = 备份;
    const 标题匹配 = 旧.match(/^(#[^\n]*\n)/);
    const 新 = 标题匹配
      ? `${标题匹配[1]}\n${段}\n\n${旧.slice(标题匹配[0].length).replace(/^\n+/, '')}`
      : `${段}\n\n${旧}`;
    writeFileSync(路径, 新);
    报告.md.written = true;
    return 报告;
  }
  if (选项.dryRun) {
    报告.md.reason = '--dry-run：只预览，未写入（内容见 md.preview）';
    报告.md.preview = `# 变更日志\n\n${段}\n`;
    return 报告;
  }
  writeFileSync(路径, `# 变更日志\n\n${段}\n`);
  报告.md.written = true;
  return 报告;
}

/* ── 终端输出 ── */
export function 格式化(报告) {
  const 行 = [];
  行.push(`版本说明 · ${报告.name || '(无包名)'}@${报告.version}`);
  行.push(`仓库：${报告.repo}`);
  行.push(`范围：${报告.range.text}（${报告.range.firstRelease ? '首个版本，全量列出' : 报告.range.mode}）`);
  if (报告.mapFile) 行.push(`映射：${报告.mapFile}`);
  行.push('');
  const 标题 = { feature: '新增', fix: '修复', other: '其他' };
  for (const 键 of ['feature', 'fix', 'other']) {
    const 项 = 报告.groups[键];
    if (!项.length) continue;
    行.push(`【${标题[键]}】${项.length} 条`);
    for (const x of 项) 行.push(`  - ${x.文本}${x.polished ? '' : ' [待润色]'}（${x.short}）`);
    行.push('');
  }
  if (报告.range.firstRelease && !报告.counts.kept) 行.push('（没有可用提交）');
  if (报告.md && (报告.md.written || 报告.md.skipped || 报告.md.reason)) {
    行.push(`CHANGELOG：${报告.md.written ? '已写入 ' + 报告.md.path : (报告.md.skipped ? '跳过（' + 报告.md.reason + '）' : 报告.md.reason)}`);
    if (报告.md.backup) 行.push(`备份：${报告.md.backup}`);
    if (报告.md.preview) { 行.push(''); 行.push(报告.md.preview); }
    行.push('');
  }
  行.push(`这一版会写进 changelog 的 ${报告.counts.kept} 条，其中 ${报告.counts.pendingPolish} 条待润色` +
    (报告.counts.pendingPolish ? '（加 --map <file> 把前缀翻成人话）' : ''));
  行.push(`过滤掉 ${报告.counts.filtered} 条（chore/docs/ci/test/merge/版本号）· 共读 ${报告.counts.commits} 个提交 · 退出码 ${报告.exitCode}`);
  return 行.join('\n');
}
