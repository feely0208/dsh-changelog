/**
 * 深鲸版本说明 —— 客户端半边（侧栏面板）
 *
 * 槽位：sidebar.panellist（图标）+ main（keyed 'changelog'）
 * 数据：/dsh-changelog/api/{info,generate,badge}
 *
 * 取向：先看再写。默认只生成预览；「写入 CHANGELOG.md」是第二个按钮，写前宿主会自动备份。
 */
window.__ModuleLoader__.load({
  id: '@deepwhale-cn/dsh-changelog',
  factory: (require) => {
    try {
      var module = { exports: {} };
      var exports = module.exports;
      const react = require('react');
      const h = react.createElement;

      const API = '/dsh-changelog/api';
      const SLOT_ICON = 'sidebar.panellist';
      const SLOT_MAIN = 'main';
      const PANEL_ID = 'changelog';

      const V = {
        卡底: 'var(--dsw-alias-bg-layer-2, rgba(127,127,127,0.10))',
        浅底: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,0.14))',
        边: 'var(--dsw-alias-border-l1, rgba(127,127,127,0.28))',
        差: 'var(--dsw-alias-state-error-primary, #D64541)',
        警: 'var(--dsw-alias-state-warning-primary, #C77F1A)',
        好: 'var(--dsw-alias-state-success-primary, #2E9E5B)',
      };
      const 卡样式 = { background: V.卡底, border: '1px solid ' + V.边, borderRadius: 10, padding: '10px 12px', marginBottom: 10, color: 'inherit' };
      const 小字 = { fontSize: 12, opacity: 0.72, lineHeight: 1.65 };
      const 等宽 = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };
      const 按钮 = (主要) => ({
        background: 主要 ? 'rgba(127,127,127,0.20)' : V.浅底, color: 'inherit',
        border: '1px solid ' + V.边, borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 12,
        ...(主要 ? { boxShadow: 'inset 0 0 0 1.6px currentColor', fontWeight: 600 } : {}),
      });
      const 输入 = { background: V.浅底, color: 'inherit', border: '1px solid ' + V.边, borderRadius: 6, padding: '6px 8px', fontSize: 12.5, width: '100%', boxSizing: 'border-box', ...等宽 };

      async function 取(路, 选项) {
        const res = await fetch(API + 路, 选项);
        const 数据 = await res.json().catch(() => ({}));
        if (!res.ok || (数据 && 数据.ok === false && !数据.groups)) {
          throw new Error((数据 && 数据.原因) || ('HTTP ' + res.status));
        }
        return 数据;
      }

      function 徽章() {
        return h('div', { key: 'badge', style: { display: 'flex', justifyContent: 'flex-end' } }, [
          h('a', {
            key: 'a', href: 'https://deepwhale.org.cn', target: '_blank', rel: 'noopener',
            style: { display: 'inline-block', marginTop: 10 },
          }, [h('img', { src: API + '/badge', alt: 'powered by dwh', style: { height: 20, width: 121, display: 'block' } })]),
        ]);
      }

      const 组标题 = { feature: '新增', fix: '修复', other: '其他' };
      const 组色 = { feature: V.好, fix: V.警, other: 'inherit' };

      function 组卡(键, 项) {
        if (!项 || !项.length) return null;
        return h('div', { key: 键, style: { ...卡样式, padding: '8px 10px', marginBottom: 8 } }, [
          h('div', { key: 'h', style: { fontSize: 13, fontWeight: 600, color: 组色[键] || 'inherit' } }, `${组标题[键]} · ${项.length} 条`),
          ...项.map((x) => h('div', { key: x.hash, style: { ...小字, marginTop: 4, display: 'flex', gap: 6, alignItems: 'baseline' } }, [
            h('span', { key: 't', style: { flex: '1 1 auto', wordBreak: 'break-word', color: 'inherit' } }, x.文本 + (x.polished ? '' : ' [待润色]')),
            h('span', { key: 's', style: { ...等宽, fontSize: 10.5, opacity: 0.6, flex: '0 0 auto' } }, x.short),
          ])),
        ]);
      }

      function 面板() {
        const [路径, 设路径] = react.useState('');
        const [起始, 设起始] = react.useState('');
        const [映射, 设映射] = react.useState('');
        const [报告, 设报告] = react.useState(null);
        const [忙, 设忙] = react.useState(false);
        const [错, 设错] = react.useState('');
        const [版本, 设版本] = react.useState('');

        // 版本号：宿主 /api/info 读 package.json，面板不自带版本字符串
        react.useEffect(() => { void (async () => { try { const r = await 取('/info'); if (r && r.version) 设版本(String(r.version)); } catch { /* 取不到就不显示 */ } })(); }, []);

        const 运行 = async (写入) => {
          设忙(true); 设错('');
          try {
            const r = await 取('/generate', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                path: 路径.trim() || '.',
                since: 起始.trim() || undefined,
                map: 映射.trim() || undefined,
                write: !!写入,
              }),
            });
            设报告(r);
          } catch (e) {
            设错(String(e && e.message ? e.message : e));
          } finally { 设忙(false); }
        };

        const 生效版本 = 报告 && 报告.version ? 报告.version : 版本;
        const 结论 = !报告 ? '' : (报告.ok ? '可以写进版本说明了' : '没有可对外的提交');
        const 结论色 = !报告 ? 'inherit' : (报告.ok ? V.好 : V.差);

        return h('div', { style: { padding: '14px 16px', height: '100%', overflow: 'auto', color: 'inherit', background: 'transparent', boxSizing: 'border-box' } }, [
          /* 头部 */
          h('div', { key: 'hd', style: { ...卡样式, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' } }, [
            h('div', { key: 'l' }, [
              h('div', { key: 't', style: { fontSize: 14, fontWeight: 600 } }, [
                '深鲸版本说明',
                版本 ? h('span', { key: 'v', style: { marginLeft: 8, fontSize: 11, fontWeight: 400, opacity: 0.75, border: '1px solid ' + V.边, borderRadius: 6, padding: '0 5px' } }, 'v' + 版本) : null,
              ]),
              h('div', { key: 's', style: 小字 }, '读 git 提交 → 按约定式提交归类 → 生成对外可发的版本说明（可一键写进 CHANGELOG）'),
            ]),
            h('div', { key: 'r', style: { display: 'flex', gap: 8, alignItems: 'center' } }, [
              忙 ? h('span', { key: 'b', style: 小字 }, '处理中…') : null,
            ]),
          ]),

          /* 表单 */
          h('div', { key: 'form', style: 卡样式 }, [
            h('div', { key: 'l1', style: 小字 }, '仓库目录（本地 git 仓库；留空 = 宿主当前工作目录）'),
            h('input', {
              key: 'in', value: 路径, placeholder: '例如 /Users/you/projects/app', style: { ...输入, marginTop: 4 },
              onChange: (e) => 设路径(e.target.value),
              onKeyDown: (e) => { if (e.key === 'Enter') void 运行(false); },
            }),
            h('div', { key: 'r2', style: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' } }, [
              h('input', {
                key: 'since', value: 起始, placeholder: '起始 tag（留空=自动找上一个版本）', style: { ...输入, flex: '1 1 180px' },
                onChange: (e) => 设起始(e.target.value),
              }),
              h('input', {
                key: 'map', value: 映射, placeholder: '润色映射文件（JSON，留空=不润色）', style: { ...输入, flex: '1 1 180px' },
                onChange: (e) => 设映射(e.target.value),
              }),
            ]),
            h('div', { key: 'row', style: { display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' } }, [
              h('button', { key: 'go', style: 按钮(true), onClick: () => 运行(false), disabled: 忙 }, '生成预览'),
              h('button', { key: 'w', style: 按钮(false), onClick: () => 运行(true), disabled: 忙 }, '写入 CHANGELOG.md'),
              h('span', { key: 'tip', style: { ...小字, flex: '1 1 200px' } }, '写入是幂等的：已有该版本段就跳过；写前自动备份 .bak'),
            ]),
            错 ? h('div', { key: 'e', style: { ...小字, color: V.差, marginTop: 8, whiteSpace: 'pre-wrap' } }, '❌ ' + 错) : null,
          ]),

          /* 结论 */
          报告 ? h('div', { key: 'sum', style: { ...卡样式, borderColor: 结论色 } }, [
            h('div', { key: 't', style: { fontSize: 13, fontWeight: 600, color: 结论色 } }, `v${生效版本} · ${结论}`),
            h('div', { key: 'r', style: { ...小字, marginTop: 4, wordBreak: 'break-all' } }, `范围 ${报告.range && 报告.range.text}（${报告.range && (报告.range.firstRelease ? '首个版本，全量列出' : 报告.range.mode)}）`),
            h('div', { key: 'c', style: { ...小字, marginTop: 2 } },
              `采用 ${报告.counts.kept} 条（新增 ${报告.counts.byKind.feature} / 修复 ${报告.counts.byKind.fix} / 其他 ${报告.counts.byKind.other}）· 过滤 ${报告.counts.filtered} 条 · 待润色 ${报告.counts.pendingPolish} 条`),
            报告.counts.pendingPolish
              ? h('div', { key: 'w', style: { ...小字, color: V.警, marginTop: 4 } }, '⚠️ 有 ' + 报告.counts.pendingPolish + ' 条还没翻成面向用户的中文：--map 给映射文件后再写，或先手工改')
              : null,
            报告.md && (报告.md.written || 报告.md.skipped || 报告.md.reason)
              ? h('div', { key: 'md', style: { ...小字, marginTop: 4, color: 报告.md.written ? V.好 : 'inherit', wordBreak: 'break-all' } },
                报告.md.written ? `已写入 ${报告.md.path}${报告.md.backup ? '（备份 ' + 报告.md.backup + '）' : ''}` : (报告.md.skipped ? '跳过：' + 报告.md.reason : 报告.md.reason))
              : null,
          ]) : null,

          报告 ? 组卡('feature', 报告.groups.feature) : null,
          报告 ? 组卡('fix', 报告.groups.fix) : null,
          报告 ? 组卡('other', 报告.groups.other) : null,

          !报告 ? h('div', { key: 'tip', style: 小字 }, '只读 git，不联网；默认只预览，「写入 CHANGELOG.md」才会落盘（幂等 + 自动备份）。') : null,

          徽章(),
        ]);
      }

      /* 侧栏图标：文档 + 列表 */
      function 图标文档({ size = 18 }) {
        return h('svg', {
          width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
          stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
        }, [
          h('path', { key: 'a', d: 'M6 3h8l4 4v14H6z' }),
          h('path', { key: 'b', d: 'M14 3v4h4' }),
          h('path', { key: 'c', d: 'M9 12h6M9 16h6M9 8h2' }),
        ]);
      }

      // 极少数校验环境只桩了 createElement、没有 Component；别为此把整个面板降级。
      const 组件基类 = (react && react.Component) || class {
        constructor(props) { this.props = props || {}; this.state = {}; }
        setState() {}
      };

      class 错误边界 extends 组件基类 {
        constructor(p) { super(p); this.state = { 错: null }; }
        static getDerivedStateFromError(e) { return { 错: e }; }
        componentDidCatch(e) { try { console.warn('[版本说明] 渲染出错，已降级：', e && e.message ? e.message : e); } catch { /* ignore */ } }
        render() {
          if (this.state && this.state.错) return h('div', { style: { padding: 16, fontSize: 13 } }, '版本说明面板出错（已降级，不影响其他界面）：' + String(this.state.错.message || this.state.错));
          return this.props ? this.props.children : null;
        }
      }

      function 安全面板() {
        try { return h(错误边界, null, h(面板)); }
        catch (e) { return h('div', { style: { padding: 16, fontSize: 13 } }, '版本说明面板出错（已降级）：' + String(e && e.message || e)); }
      }

      const inject = ['slots'];
      let 已注册 = false;
      return {
        inject,
        apply(ctx) {
          if (已注册) return;
          已注册 = true;
          ctx.slots.register({ name: SLOT_ICON, id: PANEL_ID, order: 47, label: '深鲸版本说明' }, 图标文档);
          ctx.slots.register({ name: SLOT_MAIN, id: PANEL_ID, order: 47, label: '深鲸版本说明', key: PANEL_ID }, 安全面板);
        },
      };
    } catch (e) {
      try { console.warn('[版本说明] 客户端加载失败，已降级为空插件：', e && e.message ? e.message : e); } catch { /* ignore */ }
      return { inject: [], apply() {} };
    }
  },
});
