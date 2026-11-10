# 深鲸版本说明（dsh-changelog）

## 不装会怎样

发版前对着 `git log` 一条条翻，挑出能给用户看的，再手打一遍 CHANGELOG：`chore: 更新依赖`、`docs: 改注释`、`merge` 混在一起，漏掉中文提交，写完还忘了版本号段。下一次发版又重来一遍。

这个插件把「这一版对外说了什么」从提交历史里直接长出来。

## 它做什么

- **按约定式提交归类**：`feat` → 新增、`fix` → 修复、其余（`perf`/`refactor`/`revert`…）→ 其他。
- **自动过滤不该对外的**：`chore` / `docs` / `ci` / `test`、merge 提交、纯版本号提交（`1.2.3`、bump/release）。
- **自动定范围**：读 `package.json` 版本 + 上一个版本 tag；没有 tag 就退化成「首个版本，全量列出」。
- **中文润色映射**：`--map <file>` 把提交前缀/关键词翻成面向用户的话；没命中的条目原样保留并标 `[待润色]`。写之前先告诉你「这一版会写进 changelog 的 N 条，其中 M 条待润色」。
- **三种输出**：终端中文分组、`--md` 幂等写 CHANGELOG（已有该版本段就跳过，写前自动备份 `.bak`）、`--json`（含 commit hash，便于追溯）。
- **带面板**：侧栏「深鲸版本说明」，填路径 → 生成预览 → 一键写入 CHANGELOG。

## 安装

```bash
dsh plugin --profile web add @deepwhale-cn/dsh-changelog
```

装好后侧栏出现面板；命令行也可以直接用：

```bash
dsh-changelog /path/to/repo                     # 终端中文预览
dsh-changelog /path/to/repo --json              # 机器可读（含 hash）
dsh-changelog /path/to/repo --md                # 写进 CHANGELOG.md（幂等 + 备份）
dsh-changelog /path/to/repo --md --dry-run      # 只看会写什么，不落盘
dsh-changelog /path/to/repo --map .changelog-map.json
echo $?                                          # 0 正常 / 1 无有效提交 / 2 参数或 git 错误
```

参数：`--since <ref>` 指定起始点、`--version <v>` 覆盖版本号、`--tag-prefix <p>` 改 tag 前缀（默认 `v`）、`--changelog <file>` 改目标文件（默认 `CHANGELOG.md`）。

## 润色映射怎么写

JSON 对象，key 越具体越优先：

```json
{
  "feat(ui)": "支持深色模式",
  "feat: 支持批量导入": "支持批量导入素材（最多 2000 个文件）",
  "fix: 登录": "修复登录偶尔超时的问题",
  "fix": "修复若干问题",
  "perf": "长列表滚动更顺"
}
```

匹配优先级：**整句** > `type(scope)` > `type:关键词` > 任意关键词（最长优先）> 仅 `type`。没命中任何一条 → 原样保留 + `[待润色]`。

## 自测

```bash
bash tests/run.sh
```

临时目录造三个 git 仓库（不碰本机真实仓库、不联网）：主仓库验证归类/过滤/映射/幂等写入，无 tag 仓库验证首个版本退化，只有 chore 的仓库验证退出码 1；另跑一组纯函数单测。

## 边界（已知限制）

- 只读本地 git，**不联网**、不 fetch；范围判断依赖本地已有的 tag。
- merge 提交由 `git log --no-merges` 排除，所以不会出现在任何分组里。
- 写 CHANGELOG 只追加本版段落、插在一级标题之后（最新在上），不重排旧内容；每次写前把原文件复制成 `<文件>.bak`。
- `[待润色]` 会原样写进 CHANGELOG（提醒你还没改），发布前请用 `--map` 或手工改掉。
- 不判断「这条改动值不值得对外」：归类靠约定式提交，写法不规范的提交会落到「其他」。

本插件是一个工具。使用者必须遵守所在地区法律法规，**对使用本项目造成的任何后果自行承担责任。**

---

[![](https://img.shields.io/badge/powered_by-dwh-005A8C?style=flat&logoColor=white)](https://deepwhale.org.cn)
