#!/usr/bin/env node
/**
 * 深鲸版本说明 —— 命令行入口
 *
 * 用法：
 *   dsh-changelog [仓库目录] [选项]
 *
 * 选项：
 *   --md                 把本版段落写进 CHANGELOG.md（幂等；写前自动备份）
 *   --dry-run            配合 --md：只预览要写什么，不落盘
 *   --json               机器可读（含 commit hash）
 *   --map <file>         中文润色映射（JSON；相对仓库根）
 *   --since <ref>        指定起始点（默认自动找上一个版本 tag）
 *   --version <v>        覆盖版本号（默认读 package.json）
 *   --tag-prefix <p>     tag 前缀（默认 v）
 *   --changelog <file>   目标文件（默认 CHANGELOG.md）
 *
 * 退出码：0 正常 / 1 无有效提交 / 2 参数或 git 错误
 */
import { resolve } from 'node:path';
import { 生成, 格式化 } from '../lib/core.mjs';

const 参数 = process.argv.slice(2);
const 选项 = {};
const 位置 = [];
let 要JSON = false;
let 错误 = null;

const 带值 = new Set(['--map', '--since', '--version', '--tag-prefix', '--changelog']);
for (let i = 0; i < 参数.length; i++) {
  const a = 参数[i];
  if (a === '--json') 要JSON = true;
  else if (a === '--md') 选项.write = true;
  else if (a === '--dry-run') 选项.dryRun = true;
  else if (a === '--help' || a === '-h') 选项.help = true;
  else if (带值.has(a)) {
    const 值 = 参数[i + 1];
    if (值 === undefined || 值.startsWith('--')) { 错误 = `${a} 需要一个值`; break; }
    选项[a.slice(2)] = 值;
    i++;
  } else if (a.startsWith('-')) { 错误 = `未知参数：${a}`; break; }
  else 位置.push(a);
}

const 用法 = `用法：dsh-changelog [仓库目录] [--md] [--dry-run] [--json] [--map <file>]
                    [--since <ref>] [--version <v>] [--tag-prefix <p>] [--changelog <file>]
退出码：0 正常 / 1 无有效提交 / 2 参数或 git 错误`;

function 退出(码, 内容) {
  if (内容 !== undefined && 内容 !== null && 内容 !== '') console.log(内容);
  process.exit(码);
}

if (选项.help) 退出(0, 用法);
if (错误) {
  console.error(`❌ ${错误}`);
  console.error(用法);
  退出(2);
}

let 报告 = null;
try {
  报告 = 生成(resolve(位置[0] || '.'), 选项);
} catch (e) {
  const 码 = (e && e.代码) || 2;
  if (要JSON) console.log(JSON.stringify({ ok: false, error: String((e && e.message) || e), exitCode: 码 }, null, 2));
  else console.error(`❌ ${String((e && e.message) || e)}`);
  退出(码);
}

if (要JSON) 退出(报告.exitCode, JSON.stringify(报告, null, 2));
退出(报告.exitCode, 格式化(报告));
