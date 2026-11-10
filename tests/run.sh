#!/usr/bin/env bash
# 深鲸版本说明自测：临时目录造 git 仓库 fixture，断言归类 / 过滤 / 幂等 / 映射 / 退化 / 退出码。
#
#   A 主仓库：有 tag v1.0.0，之后混着 feat/fix/chore/docs/ci/merge/版本号/中文提交，版本 1.1.0
#   B 无 tag：当作首个版本，全量列出
#   C 干净仓库：只有 chore → 无有效提交，退出码 1
#
# 不依赖本机真实仓库，不联网，可重复跑。
set -u

NODE_BIN=/usr/local/bin/node
[ -x "$NODE_BIN" ] || NODE_BIN=$(command -v node)
command -v git >/dev/null || { echo "需要 git"; exit 1; }

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
CLI="$ROOT/bin/cli.mjs"
TMP=$(mktemp -d "${TMPDIR:-/tmp}/dsh-changelog.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

FAILS=0
CHECKS=0
RC=0

ok()  { CHECKS=$((CHECKS + 1)); echo "  ok  $1"; }
bad() { CHECKS=$((CHECKS + 1)); FAILS=$((FAILS + 1)); echo "  FAIL $1"; }

gitq() { local repo="$1"; shift; git -C "$repo" -c user.name=fixture -c user.email=fixture@example.com -c commit.gpgsign=false "$@" >/dev/null 2>&1; }
write_json() { printf '%s' "$2" > "$1"; }

# ----------------------- fixture A：主仓库 -----------------------
A="$TMP/main"
mkdir -p "$A"
write_json "$A/package.json" '{ "name": "fixture-main", "version": "1.0.0" }'
cat > "$A/CHANGELOG.md" <<'MD'
# 变更日志
MD
gitq "$A" init -q --initial-branch=main
gitq "$A" add -A
gitq "$A" commit -q -m "chore: 初始化仓库"
gitq "$A" tag v1.0.0

write_json "$A/package.json" '{ "name": "fixture-main", "version": "1.1.0" }'
write_json "$A/map.json" '{
  "feat(ui)": "支持深色模式",
  "支持批量导入": "支持批量导入素材",
  "fix": "修复问题"
}'

gitq "$A" add -A
gitq "$A" commit -q -m "chore(release): bump version to 1.1.0"

gitq "$A" commit -q --allow-empty -m "feat: 支持批量导入"
gitq "$A" commit -q --allow-empty -m "fix: 修复登录超时"
gitq "$A" commit -q --allow-empty -m "chore: 更新依赖"
gitq "$A" commit -q --allow-empty -m "docs: 补充使用说明"
gitq "$A" commit -q --allow-empty -m "ci: 调整流水线"
gitq "$A" commit -q --allow-empty -m "fix: 修复导出乱码"
gitq "$A" commit -q --allow-empty -m "1.1.0"

# 分支 + merge 提交（merge 不该进对外说明）
gitq "$A" checkout -q -b feature/ui
gitq "$A" commit -q --allow-empty -m "feat(ui): add dark mode"
gitq "$A" checkout -q main
gitq "$A" merge -q --no-ff -m "Merge branch 'feature/ui'" feature/ui

# ----------------------- fixture B：无 tag -----------------------
B="$TMP/notag"
mkdir -p "$B"
write_json "$B/package.json" '{ "name": "fixture-notag", "version": "0.1.0" }'
gitq "$B" init -q --initial-branch=main
gitq "$B" add -A
gitq "$B" commit -q -m "chore: 初始化"
gitq "$B" commit -q --allow-empty -m "feat: 第一个功能"
gitq "$B" commit -q --allow-empty -m "fix: 修个 bug"

# ----------------------- fixture C：只有 chore -----------------------
C="$TMP/clean"
mkdir -p "$C"
write_json "$C/package.json" '{ "name": "fixture-clean", "version": "1.0.0" }'
gitq "$C" init -q --initial-branch=main
gitq "$C" add -A
gitq "$C" commit -q -m "chore: 只改依赖"

# ----------------------------- 工具 -----------------------------
run_case() { # run_case <args...> → 设置 RC；stdout 存全局 OUT，stderr 存 ERR
  OUT="$("$NODE_BIN" "$CLI" "$@" 2>"$TMP/last.err")"
  RC=$?
}

run_json() { # run_json <outfile> <args...>
  local out="$1"; shift
  "$NODE_BIN" "$CLI" "$@" --json > "$out" 2> "$out.err"
  RC=$?
}

field() { # field <json> <js-expr-on-r>
  "$NODE_BIN" -e '
    const fs = require("node:fs");
    const r = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    process.stdout.write(String(eval(process.argv[2])));
  ' "$1" "$2"
}

echo "版本说明自测（$("$NODE_BIN" -v)）"

echo
echo "0 纯函数单测："
"$NODE_BIN" "$ROOT/tests/unit.mjs" > "$TMP/unit.txt" 2>&1
if [ "$?" = "0" ]; then ok "版本比较 / 提交解析 / 过滤 / 映射优先级"; else bad "纯函数单测失败"; sed -n '1,8p' "$TMP/unit.txt"; fi

echo
echo "A 主仓库（tag v1.0.0 → 1.1.0）："
run_json "$TMP/a.json" "$A"
A_RC=$RC
[ "$A_RC" = "0" ] && ok "退出码 0" || bad "退出码应为 0，实际 $A_RC"
[ "$(field "$TMP/a.json" 'r.counts.kept')" = "4" ] && ok "采用 4 条" || bad "采用应为 4，实际 $(field "$TMP/a.json" 'r.counts.kept')"
[ "$(field "$TMP/a.json" 'r.counts.filtered')" = "5" ] && ok "过滤 5 条" || bad "过滤应为 5，实际 $(field "$TMP/a.json" 'r.counts.filtered')"
[ "$(field "$TMP/a.json" 'r.counts.byKind.feature')" = "2" ] && ok "新增 2 条（feat + feat(ui)）" || bad "新增条数不对"
[ "$(field "$TMP/a.json" 'r.counts.byKind.fix')" = "2" ] && ok "修复 2 条（含中文提交）" || bad "修复条数不对"
[ "$(field "$TMP/a.json" 'r.groups.feature.map((x) => x.text === undefined ? x["文本"] : x.text).some((t) => t.includes("支持批量导入"))')" = "true" ] \
  && ok "中文 feat 提交进「新增」" || bad "中文 feat 提交没归类"
[ "$(field "$TMP/a.json" 'r.range.firstRelease')" = "false" ] && ok "自动识别上一版本 tag v1.0.0" || bad "范围识别不对"
[ "$(field "$TMP/a.json" 'r.range.text')" = "v1.0.0..HEAD" ] && ok "范围是 v1.0.0..HEAD" || bad "范围文本不对"
[ "$(field "$TMP/a.json" 'JSON.stringify(r.groups).includes("Merge branch")')" = "false" ] && ok "merge 提交没进对外说明" || bad "merge 提交漏进来了"
[ "$(field "$TMP/a.json" 'r.filtered.some((x) => x.subject.includes("1.1.0") && (x.reason || "").includes("版本号"))')" = "true" ] \
  && ok "纯版本号提交被按「版本号」过滤" || bad "版本号提交没被过滤"
[ "$(field "$TMP/a.json" 'r.filtered.some((x) => x.subject.startsWith("chore:")) && r.filtered.some((x) => x.subject.startsWith("docs:")) && r.filtered.some((x) => x.subject.startsWith("ci:"))')" = "true" ] \
  && ok "chore / docs / ci 都被过滤" || bad "chore/docs/ci 过滤不全"
[ "$(field "$TMP/a.json" 'r.counts.pendingPolish')" = "4" ] && ok "没给 map 时 4 条全标待润色" || bad "待润色计数不对"

echo
echo "A2 --map 中文润色："
run_json "$TMP/a2.json" "$A" --map map.json
[ "$(field "$TMP/a2.json" 'r.counts.pendingPolish')" = "0" ] && ok "映射命中的条目不再待润色" || bad "映射后仍有待润色"
[ "$(field "$TMP/a2.json" 'r.groups.feature.some((x) => x["文本"] === "支持深色模式")')" = "true" ] && ok "type(scope) 映射生效" || bad "feat(ui) 映射没生效"
[ "$(field "$TMP/a2.json" 'r.groups.feature.some((x) => x["文本"] === "支持批量导入素材")')" = "true" ] && ok "关键词映射生效" || bad "关键词映射没生效"
[ "$(field "$TMP/a2.json" 'r.groups.fix.every((x) => x["文本"] === "修复问题" && x.polished === true)')" = "true" ] && ok "type 兜底映射生效" || bad "type 兜底映射没生效"
run_case "$A" --map map.json
echo "$OUT" | grep -q '其中 0 条待润色' && ok "终端输出「N 条里有 M 条待润色」" || bad "终端没有待润色计数"

echo
echo "A3 --md 幂等写入："
run_case "$A" --md --map map.json
[ "$RC" = "0" ] && ok "首次 --md 退出码 0" || bad "首次写入退出码 $RC"
grep -q '^## \[1.1.0\]' "$A/CHANGELOG.md" && ok "写了 1.1.0 段落" || bad "没有 1.1.0 段落"
grep -q '^### 新增' "$A/CHANGELOG.md" && ok "按类别分节" || bad "没有新增分节"
[ -f "$A/CHANGELOG.md.bak" ] && ok "写前有备份 .bak" || bad "没有备份文件"
grep -q '^# 变更日志' "$A/CHANGELOG.md" && ok "保留了一级标题" || bad "一级标题丢了"
cp "$A/CHANGELOG.md" "$TMP/md1"
run_case "$A" --md --map map.json
[ "$RC" = "0" ] && ok "第二次 --md 退出码 0" || bad "第二次退出码 $RC"
cmp -s "$TMP/md1" "$A/CHANGELOG.md" && ok "第二次内容零变化（幂等）" || bad "第二次把文件改了（不幂等）"
echo "$OUT" | grep -q '已有 1.1.0 的段落，跳过写入' && ok "第二次明确提示跳过" || bad "第二次没提示跳过"
[ "$(grep -c '^## \[1.1.0\]' "$A/CHANGELOG.md")" = "1" ] && ok "1.1.0 段落只有一份" || bad "出现了重复段落"

echo
echo "A4 面板渲染："
"$NODE_BIN" "$ROOT/tests/client-render.mjs" > "$TMP/client.txt" 2>&1
if [ "$?" = "0" ]; then ok "初始态 + 报告态渲染不抛错"; else bad "面板渲染失败"; sed -n '1,6p' "$TMP/client.txt"; fi

echo
echo "B 无 tag（首个版本）："
run_json "$TMP/b.json" "$B"
[ "$RC" = "0" ] && ok "退出码 0" || bad "退出码应为 0，实际 $RC"
[ "$(field "$TMP/b.json" 'r.range.firstRelease')" = "true" ] && ok "标记为首个版本" || bad "首个版本标记不对"
[ "$(field "$TMP/b.json" 'r.counts.kept')" = "2" ] && ok "全量列出 2 条有效提交" || bad "有效提交数不对"
[ "$(field "$TMP/b.json" 'r.groups.feature.length === 1 && r.groups.fix.length === 1')" = "true" ] && ok "归类正确" || bad "归类不对"
run_case "$B" --md --dry-run
[ ! -f "$B/CHANGELOG.md" ] && ok "--md --dry-run 不落盘" || bad "dry-run 竟然写文件了"
echo "$OUT" | grep -q '## \[0.1.0\]' && ok "dry-run 预览里能看到将要写的内容" || bad "dry-run 没有预览"

echo
echo "C 只有 chore："
run_case "$C"
[ "$RC" = "1" ] && ok "退出码 1（无有效提交）" || bad "退出码应为 1，实际 $RC"
run_json "$TMP/c.json" "$C"
[ "$(field "$TMP/c.json" 'r.counts.kept')" = "0" ] && ok "0 条采用" || bad "采用应为 0"
[ "$(field "$TMP/c.json" 'r.counts.filtered')" = "1" ] && ok "chore 被过滤" || bad "chore 没被过滤"

echo
echo "D 错误参数退出码 2："
run_case "$TMP/does-not-exist"
[ "$RC" = "2" ] && ok "目录不存在 → 2" || bad "目录不存在应为 2，实际 $RC"
run_case "$A" --nope
[ "$RC" = "2" ] && ok "未知参数 → 2" || bad "未知参数应为 2，实际 $RC"
run_case "$A" --map "$TMP/no-such-map.json"
[ "$RC" = "2" ] && ok "映射文件不存在 → 2" || bad "映射文件不存在应为 2，实际 $RC"
run_case "$A" --map
[ "$RC" = "2" ] && ok "--map 缺值 → 2" || bad "--map 缺值应为 2，实际 $RC"

echo
echo "---- 断言 $CHECKS 条，失败 $FAILS 条 ----"
if [ "$FAILS" -ne 0 ]; then echo "自测未通过"; exit 1; fi
echo "全部通过"
