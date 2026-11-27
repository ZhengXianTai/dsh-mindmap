/**
 * dsh-mindmap — browser half.
 *
 * A `main` panel plus a sidebar entry. The panel renders every branch of the
 * session tree as a mind map, auto-summarizes each branch through the host
 * half, and offers the two actions that make a tree pleasant to learn with:
 *
 *   - create a subtopic (fork at the current completed turn, then open it)
 *   - return to the parent (optionally carrying the subtopic summary back as
 *     a draft, so the parent learns the conclusion without the transcript)
 *
 * The browser bundle is authored directly in the module-loader format used by
 * the other DSH client plugins, so the package needs no build step.
 */
/* The factory id MUST equal the installed package name: the module system keys
 * the boot graph by package name (`client-modules: no registered factory for
 * "<package>"` otherwise), so a locally mounted `dsh-mindmap` and the published
 * `@zhengxiantai/dsh-mindmap` must not diverge. */
window.__ModuleLoader__.load({
  id: '@zhengxiantai/dsh-mindmap',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo, useRef, useCallback, useSyncExternalStore } = React

    const NS = 'mindmap'
    const PANEL_ID = 'mindmap'
    const API = '/mindmap/api'
    /* Fixed hierarchy palette: current node, parent, grandparent, ... */
    const TURN_LEVEL_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#64748b']

    const NODE_W = 252
    const NODE_H = 112
    const GAP_X = 96
    const GAP_Y = 18
    const PAD = 56

    /* ── stylesheet ─────────────────────────────────────────────────────── */

    const CSS = `
.mm-root{--mm-accent:var(--dsw-alias-state-business-primary,#4d6bfe);--mm-card:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.06));--mm-border:var(--dsw-alias-border-l2,rgba(127,127,127,.24));--mm-border-strong:var(--dsw-alias-border-l3,rgba(127,127,127,.36));--mm-text:var(--dsw-alias-label-primary,#e8e8ec);--mm-sub:var(--dsw-alias-label-secondary,#b4b4bd);--mm-mute:var(--dsw-alias-label-tertiary,#8b8b95);--mm-hover:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.12));box-sizing:border-box;height:100%;min-height:0;color:var(--mm-text);font-size:13px;line-height:20px;display:flex;flex-direction:column;background:transparent;position:relative}
.mm-head{box-sizing:border-box;flex:none;align-items:center;gap:12px;min-height:56px;padding:10px 18px;border-bottom:.5px solid var(--mm-border);display:flex;flex-wrap:wrap}
.mm-headMain{flex-direction:column;gap:1px;min-width:0;display:flex}
.mm-headTitle{white-space:nowrap;font-size:15px;font-weight:600;line-height:22px}
.mm-headSub{white-space:nowrap;color:var(--mm-mute);font-size:12px;line-height:18px}
.mm-headActions{margin-left:auto;align-items:center;gap:6px;display:flex}
.mm-btn{box-sizing:border-box;height:28px;color:var(--mm-sub);cursor:pointer;white-space:nowrap;background:0 0;border:.5px solid var(--mm-border);border-radius:8px;align-items:center;gap:5px;padding:0 9px;font:inherit;font-size:12px;display:inline-flex}
.mm-btn:hover:not(:disabled){background:var(--mm-hover);color:var(--mm-text)}
.mm-btn:disabled{opacity:.45;cursor:default}
.mm-btn.primary{background:var(--mm-accent);border-color:transparent;color:#fff}
.mm-btn.primary:hover:not(:disabled){background:var(--mm-accent);color:#fff;filter:brightness(1.08)}
.mm-btn.icon{width:28px;justify-content:center;padding:0}
.mm-select{box-sizing:border-box;height:28px;max-width:240px;color:var(--mm-sub);background:var(--dsw-alias-bg-layer-1,rgba(127,127,127,.06));border:.5px solid var(--mm-border);border-radius:8px;outline:none;padding:0 8px;font:inherit;font-size:12px}
.mm-select:hover{color:var(--mm-text)}
.mm-select:focus{border-color:var(--mm-accent)}
.mm-body{min-height:0;flex:1;display:flex;position:relative}
.mm-canvas{min-width:0;flex:1;position:relative;overflow:hidden;cursor:grab;background-image:radial-gradient(circle,var(--mm-border) 1px,transparent 1.2px);background-size:24px 24px}
.mm-canvas[data-dragging=true]{cursor:grabbing}
.mm-canvas:focus{outline:none}
.mm-world{position:absolute;top:0;left:0;transform-origin:0 0;will-change:transform}
.mm-edges{position:absolute;top:0;left:0;overflow:visible;pointer-events:none}
.mm-edge{fill:none;stroke:var(--mm-mute);stroke-width:1.25;opacity:.7}
.mm-edge[data-active=true]{stroke:var(--mm-accent);stroke-width:1.75;opacity:1}
.mm-node{box-sizing:border-box;position:absolute;width:252px;height:112px;padding:11px 13px 10px;border-radius:12px;border:.5px solid var(--mm-border-strong);background:var(--mm-card);text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:5px;overflow:hidden;transition:border-color .12s,box-shadow .12s,background .12s}
.mm-node:hover{background:color-mix(in srgb,var(--mm-card) 82%,var(--mm-hover))}
.mm-node[data-selected=true]{border-color:var(--mm-accent);box-shadow:0 0 0 1px var(--mm-accent),0 6px 22px rgba(0,0,0,.18)}
.mm-node[data-current=true]:before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:3px;border-radius:0 3px 3px 0;background:var(--mm-accent)}
.mm-nodeTop{align-items:center;gap:6px;min-width:0;display:flex}
.mm-nodeTitle{min-width:0;flex:1;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:600;line-height:19px;overflow:hidden}
.mm-dot{flex:none;width:6px;height:6px;border-radius:50%;background:var(--mm-mute)}
.mm-dot[data-running=true]{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.18);animation:mm-pulse 1.6s ease-in-out infinite}
.mm-nodeSummary{color:var(--mm-sub);-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:12px;line-height:17px;display:-webkit-box;overflow:hidden;flex:1}
.mm-nodeSummary[data-empty=true]{color:var(--mm-mute);font-style:italic}
.mm-nodeMeta{margin-top:auto;color:var(--mm-mute);align-items:center;gap:6px;font-size:11px;line-height:16px;display:flex}
.mm-nodeMeta .mm-spacer{flex:1}
.mm-badge{color:var(--mm-mute);border:.5px solid var(--mm-border);border-radius:5px;padding:0 4px;font-size:10px;line-height:15px}
.mm-badge[data-kind=current]{color:var(--mm-accent);border-color:color-mix(in srgb,var(--mm-accent) 45%,transparent)}
.mm-badge[data-kind=degraded]{color:#d97706;border-color:rgba(217,119,6,.4)}
.mm-nodeTools{opacity:0;position:absolute;top:6px;right:6px;align-items:center;gap:2px;display:flex;transition:opacity .12s}
.mm-node:hover .mm-nodeTools,.mm-node:focus-within .mm-nodeTools,.mm-node[data-selected=true] .mm-nodeTools{opacity:1}
.mm-nodeTool{width:22px;height:22px;color:var(--mm-sub);cursor:pointer;background:var(--mm-card);border:.5px solid var(--mm-border);border-radius:6px;justify-content:center;align-items:center;padding:0;font:inherit;font-size:13px;line-height:1;display:inline-flex}
.mm-nodeTool:hover{color:var(--mm-text);background:var(--mm-hover)}
.mm-drawer{box-sizing:border-box;width:336px;flex:none;border-left:.5px solid var(--mm-border);background:var(--dsw-alias-bg-layer-2,var(--mm-card));flex-direction:column;min-height:0;display:flex;overflow:auto}
.mm-drawerHead{position:sticky;top:0;z-index:2;background:inherit;border-bottom:.5px solid var(--mm-border);align-items:flex-start;gap:8px;padding:14px 14px 12px;display:flex}
.mm-drawerTitle{margin:0;flex:1;overflow-wrap:anywhere;font-size:14px;font-weight:600;line-height:20px}
.mm-drawerBody{flex-direction:column;gap:14px;padding:14px;display:flex}
.mm-kicker{color:var(--mm-mute);letter-spacing:.04em;text-transform:uppercase;font-size:10.5px;font-weight:600;line-height:16px}
.mm-summary{color:var(--mm-sub);white-space:pre-wrap;margin:0;font-size:12.5px;line-height:19px}
.mm-emptyLine{color:var(--mm-mute);margin:0;font-size:12px;font-style:italic;line-height:18px}
.mm-openList{margin:0;padding-left:18px;color:var(--mm-sub);font-size:12px;line-height:18px}
.mm-openList li{margin:2px 0}
.mm-actions{flex-wrap:wrap;gap:6px;display:flex}
.mm-facts{margin:0;flex-direction:column;gap:0;display:flex}
.mm-fact{border-bottom:.5px solid var(--mm-border);justify-content:space-between;align-items:baseline;gap:12px;padding:6px 0;display:flex}
.mm-fact:last-child{border-bottom:0}
.mm-fact dt{color:var(--mm-mute);flex:none;font-size:11.5px}
.mm-fact dd{text-align:right;overflow-wrap:anywhere;margin:0;font-size:11.5px}
.mm-code{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px}
.mm-empty{text-align:center;flex:1;justify-content:center;align-items:center;gap:8px;padding:32px;display:flex;flex-direction:column}
.mm-emptyTitle{margin:0;font-size:15px;font-weight:600}
.mm-emptyText{max-width:380px;color:var(--mm-mute);margin:0;font-size:12.5px;line-height:19px}
.mm-error{border:.5px solid rgba(239,68,68,.35);border-radius:8px;background:rgba(239,68,68,.08);color:var(--dsw-alias-state-error-primary,#ef4444);margin:10px 18px 0;padding:8px 10px;font-size:12px;line-height:18px}
.mm-overlay{z-index:1000;background:rgba(0,0,0,.42);justify-content:center;align-items:center;padding:24px;display:flex;position:fixed;inset:0}
.mm-modal{box-sizing:border-box;width:min(480px,100%);max-height:min(86vh,720px);overflow:auto;background:var(--dsw-alias-bg-layer-1,#1c1c20);border:.5px solid var(--mm-border-strong);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.42);flex-direction:column;gap:12px;padding:18px;display:flex}
.mm-modalTitle{margin:0;font-size:15px;font-weight:600;line-height:22px}
.mm-modalText{color:var(--mm-mute);margin:0;font-size:12px;line-height:18px}
.mm-input{box-sizing:border-box;width:100%;min-height:96px;resize:vertical;color:var(--mm-text);background:var(--dsw-alias-bg-layer-3,rgba(127,127,127,.08));border:.5px solid var(--mm-border-strong);border-radius:10px;outline:none;padding:10px 12px;font:inherit;font-size:13px;line-height:20px}
.mm-input:focus{border-color:var(--mm-accent);box-shadow:inset 0 0 0 .5px var(--mm-accent)}
.mm-renameInput{min-height:40px;height:40px;resize:none;font-size:13px}
.mm-modes{flex-direction:column;gap:6px;display:flex}
.mm-mode{box-sizing:border-box;cursor:pointer;border:.5px solid var(--mm-border);border-radius:10px;align-items:flex-start;gap:9px;padding:9px 11px;display:flex}
.mm-mode[data-active=true]{border-color:var(--mm-accent);background:color-mix(in srgb,var(--mm-accent) 8%,transparent)}
.mm-mode input{margin:3px 0 0;accent-color:var(--mm-accent)}
.mm-modeMain{flex-direction:column;gap:1px;min-width:0;display:flex}
.mm-modeTitle{font-size:12.5px;font-weight:600;line-height:18px}
.mm-modeHint{color:var(--mm-mute);font-size:11.5px;line-height:17px}
.mm-modalFoot{justify-content:flex-end;align-items:center;gap:8px;display:flex}
.mm-modal.wide{width:min(680px,100%)}
.mm-turnsHead{display:flex;align-items:center;justify-content:space-between;gap:8px}
.mm-turns{flex-direction:column;gap:8px;max-height:56vh;display:flex;overflow:auto;padding-right:2px}
.mm-turn{border:.5px solid var(--mm-border);border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#1c1c20) 55%,transparent);padding:9px 11px}
.mm-turnHead{flex-wrap:wrap;align-items:center;gap:8px;display:flex}
.mm-turnIndex{font-size:12px;font-weight:600;line-height:18px}
.mm-turnTime{color:var(--mm-mute);margin-right:auto;font-size:11px;line-height:17px}
.mm-turnText{text-overflow:ellipsis;margin-top:5px;font-size:12px;line-height:18px;overflow:hidden}
.mm-turnSub{color:var(--mm-mute);text-overflow:ellipsis;margin-top:3px;font-size:11.5px;line-height:17px;overflow:hidden}
.mm-toast{z-index:1200;position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:var(--dsw-alias-bg-layer-3,#26262b);border:.5px solid var(--mm-border-strong);border-radius:9px;box-shadow:0 10px 30px rgba(0,0,0,.28);color:var(--mm-text);max-width:min(560px,90vw);padding:9px 14px;font-size:12.5px;line-height:18px}
.mm-spin{width:12px;height:12px;border:1.5px solid color-mix(in srgb,var(--mm-mute) 40%,transparent);border-top-color:var(--mm-sub);border-radius:50%;display:inline-block;animation:mm-spin .8s linear infinite}
@keyframes mm-spin{to{transform:rotate(360deg)}}
@keyframes mm-pulse{0%,to{opacity:1}50%{opacity:.45}}
.mm-mode[data-active=true]{color:var(--mm-text);border-color:color-mix(in srgb,var(--mm-accent) 55%,var(--mm-border));background:color-mix(in srgb,var(--mm-accent) 9%,transparent)}
.mm-cta{z-index:24;position:absolute;left:50%;bottom:20px;transform:translateX(-50%);box-shadow:0 10px 28px rgba(0,0,0,.24);white-space:nowrap;background:var(--mm-accent);border:0;border-radius:999px;color:#fff;cursor:pointer;align-items:center;gap:8px;padding:8px 16px;font:inherit;font-size:12.5px;font-weight:600;display:inline-flex}
.mm-cta:hover{filter:brightness(1.08)}
.mm-cta kbd{background:#ffffff2b;border-radius:5px;padding:1px 5px;font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:10.5px;font-weight:500}
.mm-float{z-index:35;box-sizing:border-box;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#1c1c20) 62%,transparent);backdrop-filter:blur(24px) saturate(1.3);-webkit-backdrop-filter:blur(24px) saturate(1.3);border:.5px solid color-mix(in srgb,var(--mm-border-strong) 70%,transparent);border-radius:16px;box-shadow:0 30px 90px rgba(0,0,0,.42),inset 0 1px 0 #ffffff1f;flex-direction:column;min-width:400px;min-height:280px;display:flex;position:absolute;overflow:hidden}
@supports not ((backdrop-filter:blur(1px)) or (-webkit-backdrop-filter:blur(1px))){.mm-float{background:var(--dsw-alias-bg-layer-1,#1c1c20)}}
.mm-float[data-minimized=true]{min-height:0;height:auto!important}
.mm-float[data-minimized=true] .mm-floatBody,.mm-float[data-minimized=true] .mm-resize{display:none}
.mm-floatHead{cursor:grab;touch-action:none;-webkit-app-region:no-drag;background:color-mix(in srgb,var(--dsw-alias-bg-layer-1,#1c1c20) 38%,transparent);flex:none;align-items:center;gap:8px;height:40px;padding:0 8px 0 13px;border-bottom:.5px solid var(--mm-border);display:flex;user-select:none}
.mm-floatHead:active{cursor:grabbing}
.mm-floatTitle{text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1;font-size:12.5px;font-weight:600}
.mm-floatTools{flex:none;align-items:center;gap:2px;display:flex}
.mm-floatTool{width:26px;height:26px;color:var(--mm-sub);cursor:pointer;background:0 0;border:0;border-radius:6px;justify-content:center;align-items:center;padding:0;font:inherit;font-size:14px;line-height:1;display:inline-flex}
.mm-floatTool:hover{background:var(--mm-hover);color:var(--mm-text)}
.mm-floatBody{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.mm-floatChat{flex:1;min-height:0;display:flex;flex-direction:column;overflow:hidden}
.mm-floatChat>[data-conversation-content]{flex:1;min-height:0}
.mm-floatFallback{color:var(--mm-sub);flex:1;justify-content:center;align-items:center;gap:10px;padding:24px;display:flex;flex-direction:column;text-align:center}
.mm-floatFallback p{margin:0;font-size:12.5px;line-height:19px}
.mm-resize{z-index:4;background:transparent;position:absolute;touch-action:none}
.mm-resize[data-dir=n]{top:0;left:14px;right:14px;height:8px;cursor:ns-resize}
.mm-resize[data-dir=s]{bottom:0;left:14px;right:14px;height:8px;cursor:ns-resize}
.mm-resize[data-dir=w]{top:14px;bottom:14px;left:0;width:8px;cursor:ew-resize}
.mm-resize[data-dir=e]{top:14px;bottom:14px;right:0;width:8px;cursor:ew-resize}
.mm-resize[data-dir=nw],.mm-resize[data-dir=ne],.mm-resize[data-dir=sw],.mm-resize[data-dir=se]{width:16px;height:16px}
.mm-resize[data-dir=nw]{top:0;left:0;cursor:nwse-resize}
.mm-resize[data-dir=ne]{top:0;right:0;cursor:nesw-resize}
.mm-resize[data-dir=sw]{bottom:0;left:0;cursor:nesw-resize}
.mm-resize[data-dir=se]{bottom:0;right:0;cursor:nwse-resize}
.mm-resize[data-dir=se]:after{content:"";border-right:2px solid var(--mm-border-strong);border-bottom:2px solid var(--mm-border-strong);border-radius:0 0 3px 0;width:7px;height:7px;position:absolute;bottom:4px;right:4px;opacity:.65}
@media (max-width:900px){.mm-drawer{box-sizing:border-box;z-index:20;background:var(--dsw-alias-bg-layer-1,#1c1c20);border-left:.5px solid var(--mm-border-strong);position:absolute;top:0;right:0;bottom:0;box-shadow:-18px 0 50px rgba(0,0,0,.28)}.mm-float{min-width:0;left:8px!important;right:8px;width:auto!important}}
@media (prefers-reduced-motion:reduce){.mm-dot,.mm-spin{animation:none}.mm-node,.mm-nodeTools{transition:none}}
`
    const STYLE_ID = 'dsh-mindmap/styles.css'
    if (typeof document !== 'undefined' && document.querySelector(`style[data-plugin-css="${STYLE_ID}"]`) === null) {
      const style = document.createElement('style')
      style.dataset.plugin = 'dsh-mindmap'
      style.dataset.pluginCss = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }

    /* ── dictionary ─────────────────────────────────────────────────────── */

    const zh = {
      panel: '话题地图',
      title: '话题地图',
      subtitle: '{n} 个话题 · {running} 个进行中',
      emptyTitle: '还没有可显示的话题',
      emptyText: '先开始一段对话，或在侧边栏新建会话。之后每次「插入子话题」都会在这里长出一根新枝。',
      fit: '适配视图',
      zoomIn: '放大',
      zoomOut: '缩小',
      expandAll: '展开全部',
      collapseAll: '收起全部',
      showSubagents: '显示子代理',
      refreshAll: '总结全部',
      refreshOne: '重新总结',
      summarizing: '总结中…',
      noSummary: '尚未总结',
      open: '打开对话',
      openFloat: '浮窗对话',
      rename: '重命名',
      renameTitle: '重命名话题',
      renameHint: '会同步修改左侧栏和思维导图中的会话标题。',
      renamePlaceholder: '输入新的会话标题',
      renameRequired: '标题不能为空',
      renamed: '已重命名',
      renameFailed: '重命名失败',
      save: '保存',
      saving: '保存中…',
      newChild: '新子话题',
      childDraft: '子话题草稿',
      briefBranch: '轻量子话题',
      viewChat: '查看对话',
      newChildHint: '在浮窗中输入并在发送后生成子节点',
      floatToggle: '浮窗',
      askChild: '提问新子话题',
      deleteSession: '删除/归档会话',
      archiveTitle: '归档这个会话？',
      archiveText: '它会从侧边栏和话题地图中移除；会话日志仍保留，可在归档中恢复。若正在运行，会先停止。子话题会保留。',
      archive: '归档',
      archiving: '归档中…',
      archived: '已归档',
      archiveFailed: '归档失败',
      turnsTitle: '轮次',
      turnsEmpty: '这个节点还没有可回退的轮次',
      turnN: '第 {n} 轮',
      rewindTitle: '从此轮重开',
      rewindHint: '会创建一个新节点，只继承这一轮之前的历史；这一轮及之后都不会进入新节点。旧节点会归档（可恢复）。',
      rewindAction: '创建回退节点',
      rewindConfirm: '从第 {n} 轮重开并归档旧节点？',
      rewound: '已创建回退节点，旧节点已归档',
      rewindFailed: '回退失败',
      rewindArchiveFailed: '回退节点已创建，但旧节点归档失败',
      hostStale: 'Host 半侧仍是旧版本，缺少 /mindmap/api/turns。请完全退出并重启 DSH 后再试。',
      floatOpen: '在浮窗中打开',
      floatFull: '在主页打开',
      floatClose: '关闭浮窗',
      floatMinimize: '最小化',
      floatRestore: '还原',
      floatResize: '拖动边缘或角调整大小',
      floatUnavailable: '当前 DSH 版本不支持嵌入式会话，请在主页打开',
      floatFallback: '浮窗加载失败，请在主页打开',
      floatBlank: '这是新会话，在主页打开后开始对话',
      floatShortcut: 'Ctrl+Shift+M',
      floatHint: '选中节点后按 Ctrl+Shift+M 新建子话题浮窗',
      mapHome: '地图主区',
      mapHomeHint: '开启后，左栏选择会话只会载入地图，不再切换主面板',
      fullOpen: '完整会话',
      branch: '新建子话题',
      backToParent: '回到父话题',
      backToRoot: '回到根话题',
      bridge: '把结论带回父话题',
      copy: '复制概要',
      copied: '概要已复制',
      current: '当前',
      root: '根话题',
      degraded: '离线概要',
      turns: '{n} 轮',
      steps: '{n} 步',
      turnsLabel: '轮次',
      stepsLabel: '步骤',
      justNow: '刚刚',
      minutesAgo: '{n} 分钟前',
      hoursAgo: '{n} 小时前',
      daysAgo: '{n} 天前',
      branchTitle: '从「{name}」生长一个子话题',
      branchHint: '子话题会从当前话题的最后一个完整轮次分叉；之后回到父话题时，父话题不会带上子话题的对话内容。',
      question: '你想深入的问题',
      questionPlaceholder: '例如：为什么这个协议需要三次握手？',
      modeInherit: '继承当前上下文',
      modeInheritHint: '子话题从父话题的完整讨论继续，适合顺着当前思路深入。',
      modeBrief: '只带摘要',
      modeBriefHint: '子话题只收到一段父话题摘要和你的问题，上下文最小，适合跳出去查一个独立概念。',
      create: '创建并打开',
      cancel: '取消',
      creating: '创建中…',
      created: '子话题已创建，在输入框写下你的问题即可开始',
      branchFailed: '创建子话题失败',
      openFailed: '打开会话失败',
      noTurn: '当前话题还没有完整的一轮对话，先聊一轮再来分支',
      questionRequired: '请先写下要讨论的问题',
      summaryFailed: '总结失败，稍后重试',
      fetchFailed: '话题摘要服务不可用，请刷新页面重试',
      carry: '已把「{name}」的结论放进父话题的输入框',
      carryFailed: '没有可带回的结论，先总结这个话题',
      openHint: '双击话题卡片也可以打开对话',
      sessionId: '会话 ID',
      workspace: '工作目录',
      updated: '最近活动',
      parent: '父话题',
      children: '直接子话题',
      openQuestions: '待探索',
      overview: '概要',
      details: '详情',
      close: '关闭',
      selectHint: '选择一个话题查看详情',
      summarizingCount: '{n} 个话题总结中',
      allFresh: '所有话题都已总结',
    }

    const en = {
      panel: 'Topic map',
      title: 'Topic map',
      subtitle: '{n} topics · {running} running',
      emptyTitle: 'No topics yet',
      emptyText: 'Start a conversation, or create a session from the sidebar. Every “New subtopic” grows a new branch here.',
      fit: 'Fit view',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      expandAll: 'Expand all',
      collapseAll: 'Collapse all',
      showSubagents: 'Show subagents',
      refreshAll: 'Summarize all',
      refreshOne: 'Summarize again',
      summarizing: 'Summarizing…',
      noSummary: 'Not summarized yet',
      open: 'Open conversation',
      openFloat: 'Floating chat',
      rename: 'Rename',
      renameTitle: 'Rename topic',
      renameHint: 'This updates the session title in the left sidebar and on the mind map.',
      renamePlaceholder: 'Enter a new session title',
      renameRequired: 'Title cannot be empty',
      renamed: 'Renamed',
      renameFailed: 'Rename failed',
      save: 'Save',
      saving: 'Saving…',
      newChild: 'New subtopic',
      childDraft: 'Subtopic draft',
      briefBranch: 'Light subtopic',
      viewChat: 'View conversation',
      newChildHint: 'Type in the floating window; sending creates a child node',
      floatToggle: 'Float',
      askChild: 'Ask as a subtopic',
      deleteSession: 'Delete / archive session',
      archiveTitle: 'Archive this session?',
      archiveText: 'It will disappear from the sidebar and the map. The session log is kept and can be restored from the archive. Running work is stopped first. Child topics are kept.',
      archive: 'Archive',
      archiving: 'Archiving…',
      archived: 'Archived',
      archiveFailed: 'Archive failed',
      turnsTitle: 'Turns',
      turnsEmpty: 'No turns available to rewind in this node',
      turnN: 'Turn {n}',
      rewindTitle: 'Restart from this turn',
      rewindHint: 'Creates a new node with only the history before this turn. This turn and everything after it are left out. The old node is archived (recoverable).',
      rewindAction: 'Create rewound node',
      rewindConfirm: 'Restart from turn {n} and archive the old node?',
      rewound: 'Rewound node created; the old node was archived',
      rewindFailed: 'Rewind failed',
      rewindArchiveFailed: 'Rewound node created, but the old node could not be archived',
      hostStale: 'The Host half is still an older build without /mindmap/api/turns. Fully quit and restart DSH, then retry.',
      floatOpen: 'Open in floating window',
      floatFull: 'Open in main view',
      floatClose: 'Close floating window',
      floatMinimize: 'Minimize',
      floatRestore: 'Restore',
      floatResize: 'Drag an edge or corner to resize',
      floatUnavailable: 'This DSH version cannot embed the conversation; open it in the main view',
      floatFallback: 'The floating conversation failed to load; open it in the main view',
      floatBlank: 'New session: open it in the main view to start chatting',
      floatShortcut: 'Ctrl+Shift+M',
      floatHint: 'Select a topic and press Ctrl+Shift+M to start a subtopic float',
      mapHome: 'Map home',
      mapHomeHint: 'When on, choosing a session in the sidebar loads the map instead of switching the main panel',
      fullOpen: 'Full conversation',
      branch: 'New subtopic',
      backToParent: 'Back to parent',
      backToRoot: 'Back to root',
      bridge: 'Carry conclusion to parent',
      copy: 'Copy summary',
      copied: 'Summary copied',
      current: 'Current',
      root: 'Root',
      degraded: 'Offline summary',
      turns: '{n} turns',
      steps: '{n} steps',
      turnsLabel: 'Turns',
      stepsLabel: 'Steps',
      justNow: 'just now',
      minutesAgo: '{n} min ago',
      hoursAgo: '{n} h ago',
      daysAgo: '{n} d ago',
      branchTitle: 'Grow a subtopic from “{name}”',
      branchHint: 'The subtopic forks at the last completed turn. When you come back, the parent keeps no transcript from the child.',
      question: 'What do you want to explore?',
      questionPlaceholder: 'e.g. Why does this protocol need a three-way handshake?',
      modeInherit: 'Inherit current context',
      modeInheritHint: 'The child continues from the full discussion — best for drilling into the current thread.',
      modeBrief: 'Brief only',
      modeBriefHint: 'The child receives only a parent summary and your question — smallest context, best for an independent concept.',
      create: 'Create and open',
      cancel: 'Cancel',
      creating: 'Creating…',
      created: 'Subtopic created. Type your question to begin',
      branchFailed: 'Could not create the subtopic',
      openFailed: 'Could not open the session',
      noTurn: 'This topic has no completed turn yet; chat one round before branching',
      questionRequired: 'Write the question first',
      summaryFailed: 'Summarization failed, try again later',
      fetchFailed: 'Summary service is unavailable; reload the page and retry',
      carry: 'Put the conclusion of “{name}” into the parent draft',
      carryFailed: 'Nothing to carry yet — summarize this topic first',
      openHint: 'Double-click a card to open its conversation',
      sessionId: 'Session id',
      workspace: 'Workspace',
      updated: 'Last activity',
      parent: 'Parent',
      children: 'Direct children',
      openQuestions: 'To explore',
      overview: 'Overview',
      details: 'Details',
      close: 'Close',
      selectHint: 'Select a topic to see its details',
      summarizingCount: '{n} topics summarizing',
      allFresh: 'Everything is summarized',
    }

    function interpolate(text, vars) {
      if (vars === undefined) return text
      return text.replace(/\{(\w+)\}/g, (match, key) => (vars[key] === undefined ? match : String(vars[key])))
    }

    function makeT(dict) {
      return (key, vars) => interpolate(dict[key] ?? key, vars)
    }

    const FALLBACK_T = makeT(zh)

    /* ── tiny utilities ─────────────────────────────────────────────────── */

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    function relTime(ts, t) {
      if (typeof ts !== 'number' || !Number.isFinite(ts)) return ''
      const diff = Math.max(0, Date.now() - ts)
      if (diff < 60_000) return t('justNow')
      if (diff < 3_600_000) return t('minutesAgo', { n: Math.floor(diff / 60_000) })
      if (diff < 86_400_000) return t('hoursAgo', { n: Math.floor(diff / 3_600_000) })
      return t('daysAgo', { n: Math.floor(diff / 86_400_000) })
    }

    function titleOf(node, summary) {
      /* The durable session title is the user-facing name: renaming in the
       * left sidebar must win over a stale summary topic. */
      if (typeof node.title === 'string' && node.title !== '') return node.title
      if (summary !== undefined && typeof summary.topic === 'string' && summary.topic !== '') return summary.topic
      return node.displayTitle ?? node.id
    }

    function statsOf(node) {
      const stats = node.projectionValues?.sessionStats
      return stats !== null && typeof stats === 'object' ? stats : undefined
    }

    function countTurns(node) {
      const stats = statsOf(node)
      return typeof stats?.turns === 'number' ? stats.turns : undefined
    }

    function countSteps(node) {
      const stats = statsOf(node)
      return typeof stats?.steps === 'number' ? stats.steps : undefined
    }

    function hasChildrenInTree(tree) {
      return tree.children !== undefined && tree.children.length > 0
    }

    function countDescendants(tree) {
      let total = 0
      for (const child of tree.children ?? []) total += 1 + countDescendants(child)
      return total
    }

    function containsId(tree, id) {
      if (tree.id === id) return true
      for (const child of tree.children ?? []) if (containsId(child, id)) return true
      return false
    }

    function buildForest(snapshot, includeSubagents) {
      const byId = snapshot.byId ?? {}
      const all = []
      for (const id of snapshot.ids ?? Object.keys(byId)) {
        const node = byId[id]
        if (node === undefined) continue
        if (!includeSubagents && node.origin === 'subagent') continue
        all.push(node)
      }
      const present = new Set(all.map((node) => node.id))
      const childrenOf = new Map()
      const roots = []
      for (const node of all) {
        let parentId = node.parentId
        let guard = 0
        while (typeof parentId === 'string' && !present.has(parentId) && guard < 128) {
          const ancestor = byId[parentId]
          if (ancestor === undefined) break
          parentId = ancestor.parentId
          guard += 1
        }
        if (typeof parentId === 'string' && present.has(parentId)) {
          const siblings = childrenOf.get(parentId) ?? []
          siblings.push(node)
          childrenOf.set(parentId, siblings)
        } else {
          roots.push(node)
        }
      }
      const newestFirst = (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
      roots.sort(newestFirst)
      for (const siblings of childrenOf.values()) siblings.sort(newestFirst)
      const materialize = (node, depth) => ({
        id: node.id,
        node,
        depth,
        children: (childrenOf.get(node.id) ?? []).map((child) => materialize(child, depth + 1)),
      })
      return {
        roots: roots.map((node) => materialize(node, 0)),
        byId: new Map(all.map((node) => [node.id, node])),
      }
    }

    function layoutTree(root, collapsed) {
      if (root === undefined) return { items: [], edges: [], width: 0, height: 0 }
      const items = []
      const edges = []
      let cursor = 0
      const walk = (tree, parent) => {
        const item = { ...tree, x: PAD + tree.depth * (NODE_W + GAP_X), y: 0, parent }
        const kids = collapsed.has(tree.id) ? [] : tree.children
        if (kids.length > 0) {
          const childItems = kids.map((child) => walk(child, item))
          item.y = (childItems[0].y + childItems[childItems.length - 1].y) / 2
        } else {
          item.y = cursor
          cursor += NODE_H + GAP_Y
        }
        items.push(item)
        if (parent !== undefined) edges.push({ from: parent, to: item })
        return item
      }
      walk(root, undefined)
      const width = Math.max(...items.map((item) => item.x + NODE_W)) + PAD
      const height = Math.max(cursor + PAD - GAP_Y, NODE_H + PAD * 2)
      return { items, edges, width, height }
    }

    function edgePath(from, to) {
      const x1 = from.x + NODE_W
      const y1 = from.y + NODE_H / 2
      const x2 = to.x
      const y2 = to.y + NODE_H / 2
      const mid = (x1 + x2) / 2
      return `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`
    }

    async function api(method, payload) {
      const response = await fetch(`${API}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      })
      const value = await response.json().catch(() => undefined)
      if (value === undefined) throw new Error(`mindmap ${method}: invalid response`)
      if (value.ok !== true) throw new Error(value.error?.message ?? `mindmap ${method} failed`)
      return value
    }

    async function openSession(ctx, id) {
      const workspace = ctx.get('uiWorkspace')
      if (workspace !== undefined && typeof workspace.openSession === 'function') {
        workspace.openSession(id)
        return true
      }
      try {
        ctx.sessions.retain(id, { source: 'mainView' })
        ctx.layout?.selectPanel?.(null)
        return true
      } catch {
        return false
      }
    }

    async function renameSession(ctx, id, title) {
      const result = await ctx.sessions.using(id, { source: 'mindmap' }, (reference) =>
        reference.binding.session.rename(title))
      if (result !== undefined && result.ok === false) {
        throw new Error(result.error?.message ?? 'rename failed')
      }
    }

    async function prefillDraft(ctx, id, text, whenDraftExists) {
      const conversation = ctx.get('conversation')
      const input = conversation?.input
      if (input === undefined || typeof input.requestDraftInitialization !== 'function') return false
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const binding = ctx.sessions.binding?.(id)
        if (binding !== undefined) {
          try {
            const outcome = input.requestDraftInitialization(binding, {
              prompt: text,
              whenDraftExists: whenDraftExists ?? 'replace',
            })
            if (outcome !== 'blocked') return true
          } catch {
            // The session shell may still be mounting; retry briefly.
          }
        }
        await sleep(100)
      }
      return false
    }

    /* ── React hooks / components ───────────────────────────────────────── */

    function useSessionList(ctx) {
      const store = ctx.sessions.list
      return React.useSyncExternalStore(
        React.useCallback((listener) => store.subscribe(listener), [store]),
        React.useCallback(() => store.getSnapshot(), [store]),
      )
    }

    function IconMindmap({ size = 16 }) {
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', 'aria-hidden': 'true' },
        h('rect', { x: 1, y: 6.2, width: 4.4, height: 3.6, rx: 1.1, stroke: 'currentColor', strokeWidth: 1.1 }),
        h('rect', { x: 10.6, y: 1, width: 4.4, height: 3.4, rx: 1.1, stroke: 'currentColor', strokeWidth: 1.1 }),
        h('rect', { x: 10.6, y: 6.1, width: 4.4, height: 3.4, rx: 1.1, stroke: 'currentColor', strokeWidth: 1.1 }),
        h('rect', { x: 10.6, y: 11.2, width: 4.4, height: 3.4, rx: 1.1, stroke: 'currentColor', strokeWidth: 1.1 }),
        h('path', { d: 'M5.4 8h2.4M7.8 2.7v10.6M7.8 2.7h2.8M7.8 8h2.8M7.8 13.3h2.8', stroke: 'currentColor', strokeWidth: 1.1, strokeLinecap: 'round' }),
      )
    }

    function NodeCard({ item, summary, pending, selected, current, collapsed, t, onSelect, onOpen, onFloat, onBranch, onRename, onToggle }) {
      const node = item.node
      const label = titleOf(node, summary)
      const summaryLine = summary?.summary !== undefined && summary.summary !== '' ? summary.summary : t('noSummary')
      const turns = countTurns(node)
      const kids = countDescendants(item)
      return h(
        'div',
        {
          className: 'mm-node',
          style: { left: item.x, top: item.y },
          role: 'button',
          tabIndex: 0,
          'aria-label': label,
          'data-selected': selected === true,
          'data-current': current === true,
          onClick: () => onSelect(item.id),
          onDoubleClick: () => onFloat(item.id),
          onKeyDown: (event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onFloat(item.id)
            } else if (event.key === ' ') {
              event.preventDefault()
              onSelect(item.id)
            }
          },
        },
        h(
          'div',
          { className: 'mm-nodeTop' },
          h('span', { className: 'mm-dot', 'data-running': node.running === true }),
          h('span', { className: 'mm-nodeTitle' }, label),
          current === true ? h('span', { className: 'mm-badge', 'data-kind': 'current' }, t('current')) : null,
        ),
        h('div', { className: 'mm-nodeSummary', 'data-empty': summary?.summary === undefined || summary.summary === '' }, summaryLine),
        h(
          'div',
          { className: 'mm-nodeMeta' },
          turns !== undefined ? h('span', null, t('turns', { n: turns })) : null,
          pending === true
            ? h('span', { className: 'mm-spinner' }, h('span', { className: 'mm-spin' }), ` ${t('summarizing')}`)
            : h('span', null, relTime(node.updatedAt, t)),
          h('span', { className: 'mm-spacer' }),
          summary?.degraded === true ? h('span', { className: 'mm-badge', 'data-kind': 'degraded' }, t('degraded')) : null,
          hasChildrenInTree(item) && collapsed === false ? h('span', { className: 'mm-badge' }, `${item.children.length}`) : null,
          hasChildrenInTree(item) && collapsed === true
            ? h('button', {
                type: 'button',
                className: 'mm-nodeTool',
                style: { position: 'static', width: '20px', height: '18px', opacity: 1, marginLeft: '2px' },
                title: t('expandAll'),
                onClick: (event) => {
                  event.stopPropagation()
                  onToggle(item.id)
                },
              }, `+${kids}`)
            : null,
        ),
        h(
          'div',
          { className: 'mm-nodeTools' },
          h('button', {
            type: 'button',
            className: 'mm-nodeTool',
            title: t('rename'),
            onClick: (event) => {
              event.stopPropagation()
              onRename(item.id)
            },
          }, '✎'),
          h('button', {
            type: 'button',
            className: 'mm-nodeTool',
            title: t('floatOpen'),
            onClick: (event) => {
              event.stopPropagation()
              onFloat(item.id)
            },
          }, '◱'),
          h('button', {
            type: 'button',
            className: 'mm-nodeTool',
            title: t('branch'),
            onClick: (event) => {
              event.stopPropagation()
              onBranch(item.id)
            },
          }, '+'),
          hasChildrenInTree(item)
            ? h('button', {
                type: 'button',
                className: 'mm-nodeTool',
                title: collapsed === true ? t('expandAll') : t('collapseAll'),
                onClick: (event) => {
                  event.stopPropagation()
                  onToggle(item.id)
                },
              }, collapsed === true ? '▾' : '−')
            : null,
        ),
      )
    }

    function Drawer({ item, summary, pending, t, ctx, current, onClose, onOpen, onFloat, onChild, onBranch, onRename, onRefresh, onBridge, toast }) {
      const node = item.node
      const label = titleOf(node, summary)
      const turns = countTurns(node)
      const steps = countSteps(node)
      const parentId = node.parentId
      const openQuestions = Array.isArray(summary?.open) ? summary.open : []
      return h(
        'aside',
        { className: 'mm-drawer', 'aria-label': t('details') },
        h(
          'div',
          { className: 'mm-drawerHead' },
          h('h2', { className: 'mm-drawerTitle' }, label),
          h('button', { type: 'button', className: 'mm-btn icon', title: t('close'), onClick: onClose }, '×'),
        ),
        h(
          'div',
          { className: 'mm-drawerBody' },
          h(
            'div',
            { className: 'mm-actions' },
            h('button', { type: 'button', className: 'mm-btn primary', onClick: () => onChild(node.id, false) }, `＋ ${t('newChild')}`),
            h('button', { type: 'button', className: 'mm-btn', onClick: () => onFloat(node.id) }, `◱ ${t('viewChat')}`),
            h('button', { type: 'button', className: 'mm-btn', onClick: () => onRename(node.id) }, `✎ ${t('rename')}`),
            h('button', { type: 'button', className: 'mm-btn', onClick: () => onChild(node.id, true) }, t('briefBranch')),
            h('button', { type: 'button', className: 'mm-btn', onClick: () => onOpen(node.id) }, t('floatFull')),
            typeof parentId === 'string'
              ? h('button', {
                  type: 'button',
                  className: 'mm-btn',
                  onClick: () => onFloat(parentId),
                }, `↑ ${t('backToParent')}`)
              : null,
          ),
          h(
            'div',
            null,
            h('div', { className: 'mm-kicker' }, t('overview')),
            h('p', { className: 'mm-summary' }, summary?.summary !== undefined && summary.summary !== ''
              ? summary.summary
              : pending === true ? t('summarizing') : t('noSummary')),
            pending === true
              ? h('div', { className: 'mm-emptyLine', style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                  h('span', { className: 'mm-spin' }), t('summarizing'))
              : null,
          ),
          openQuestions.length > 0
            ? h(
                'div',
                null,
                h('div', { className: 'mm-kicker' }, t('openQuestions')),
                h('ul', { className: 'mm-openList' }, openQuestions.map((question, index) => h('li', { key: index }, question))),
              )
            : null,
          h(
            'div',
            { className: 'mm-actions' },
            h('button', {
              type: 'button',
              className: 'mm-btn',
              disabled: pending === true,
              onClick: () => onRefresh(node.id),
            }, pending === true ? t('summarizing') : t('refreshOne')),
            summary?.summary !== undefined && summary.summary !== ''
              ? h('button', {
                  type: 'button',
                  className: 'mm-btn',
                  onClick: async () => {
                    try {
                      await navigator.clipboard.writeText(`${label}\n${summary.summary}`)
                      toast(t('copied'))
                    } catch {
                      toast(t('summaryFailed'))
                    }
                  },
                }, t('copy'))
              : null,
            typeof parentId === 'string' && summary?.summary !== undefined && summary.summary !== ''
              ? h('button', {
                  type: 'button',
                  className: 'mm-btn',
                  onClick: () => onBridge(node.id, parentId),
                }, `↩ ${t('bridge')}`)
              : null,
          ),
          h(
            'div',
            null,
            h('div', { className: 'mm-kicker' }, t('details')),
            h(
              'dl',
              { className: 'mm-facts' },
              current === true
                ? h('div', { className: 'mm-fact' }, h('dt', null, t('current')), h('dd', null, '●'))
                : null,
              turns !== undefined
                ? h('div', { className: 'mm-fact' }, h('dt', null, t('turnsLabel')), h('dd', null, turns))
                : null,
              steps !== undefined
                ? h('div', { className: 'mm-fact' }, h('dt', null, t('stepsLabel')), h('dd', null, steps))
                : null,
              typeof node.updatedAt === 'number'
                ? h('div', { className: 'mm-fact' }, h('dt', null, t('updated')), h('dd', null, relTime(node.updatedAt, t)))
                : null,
              typeof node.cwd === 'string' && node.cwd !== ''
                ? h('div', { className: 'mm-fact' }, h('dt', null, t('workspace')), h('dd', { className: 'mm-code' }, node.cwd))
                : null,
              typeof parentId === 'string'
                ? h('div', { className: 'mm-fact' }, h('dt', null, t('parent')), h('dd', { className: 'mm-code' }, parentId))
                : null,
              h('div', { className: 'mm-fact' }, h('dt', null, t('sessionId')), h('dd', { className: 'mm-code' }, node.id)),
            ),
          ),
        ),
      )
    }

    /* ── floating conversation ──────────────────────────────────────────── */

    const MAP_HOME_KEY = 'dsh-mindmap.mapHome'
    const FLOAT_KEY = 'dsh-mindmap.float.v2'
    const FLOAT_STATE_KEY = 'dsh-mindmap.floatState.v1'
    const MODE = { mapHome: true, bypass: false }

    function readStorage(key) {
      try {
        const raw = localStorage.getItem(key)
        return raw === null ? undefined : JSON.parse(raw)
      } catch {
        return undefined
      }
    }

    function writeStorage(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // Private windows and quota failures must not break the map.
      }
    }

    function readMapHome() {
      const stored = readStorage(MAP_HOME_KEY)
      return typeof stored === 'boolean' ? stored : true
    }

    function loadGeometry() {
      const stored = readStorage(FLOAT_KEY)
      if (stored !== undefined && typeof stored === 'object' && stored !== null
        && ['x', 'y', 'w', 'h'].every((key) => Number.isFinite(stored[key]))) {
        return { x: stored.x, y: stored.y, w: stored.w, h: stored.h }
      }
      return undefined
    }

    function readFloatMinimized() {
      const stored = readStorage(FLOAT_KEY)
      return stored !== undefined && stored !== null && stored.minimized === true
    }

    function readFloatState() {
      const stored = readStorage(FLOAT_STATE_KEY)
      if (stored === undefined || stored === null || typeof stored !== 'object') return undefined
      if (stored.open !== true && stored.open !== false) return undefined
      return {
        open: stored.open === true && typeof stored.sessionId === 'string',
        sessionId: typeof stored.sessionId === 'string' ? stored.sessionId : undefined,
        mode: stored.mode === 'child' ? 'child' : 'chat',
        parentId: typeof stored.parentId === 'string' ? stored.parentId : undefined,
        brief: stored.brief === true,
        startedAt: typeof stored.startedAt === 'number' ? stored.startedAt : 0,
      }
    }

    function clampBox(box, bounds) {
      const width = Math.max(400, Math.min(box.w, Math.max(400, bounds.width - 16)))
      const height = Math.max(280, Math.min(box.h, Math.max(280, bounds.height - 16)))
      const x = Math.max(8, Math.min(box.x, Math.max(8, bounds.width - width - 8)))
      const y = Math.max(8, Math.min(box.y, Math.max(8, bounds.height - height - 8)))
      return { x, y, w: width, h: height }
    }

    /** Retain the selected Session for the float; release it when the target changes. */
    function useSessionReference(ctx, sessionId) {
      const [reference, setReference] = useState(undefined)
      useEffect(() => {
        if (sessionId === undefined || typeof ctx.sessions?.retain !== 'function') {
          setReference(undefined)
          return undefined
        }
        let next
        try {
          next = ctx.sessions.retain(sessionId, { source: 'mindmap-float' })
        } catch {
          setReference(undefined)
          return undefined
        }
        setReference(next)
        return () => {
          setReference(undefined)
          try {
            next.release()
          } catch {
            // The controller may already have retired the generation.
          }
        }
      }, [ctx, sessionId])
      return reference
    }

    class FloatBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }

      static getDerivedStateFromError() {
        return { failed: true }
      }

      componentDidCatch(error) {
        console.error('[mindmap] floating conversation crashed:', error)
      }

      render() {
        return this.state.failed ? this.props.fallback : this.props.children
      }
    }

    function FloatingConversation({
      sessionId,
      node,
      parentLabel,
      summary,
      mode,
      brief,
      t,
      ctx,
      SessionProvider,
      renderFactorySlot,
      initialGeometry,
      minimized,
      boundsRef,
      onGeometry,
      onMinimize,
      onRestore,
      onNewChild,
      onRename,
      onDelete,
      onTurns,
      onClose,
      onFull,
    }) {
      const reference = useSessionReference(ctx, sessionId)
      const [box, setBox] = useState(initialGeometry ?? { x: 48, y: 56, w: 560, h: 600 })
      const boxRef = useRef(initialGeometry ?? { x: 48, y: 56, w: 560, h: 600 })
      const dragRef = useRef(undefined)
      const resizeRef = useRef(undefined)
      const frameRef = useRef(null)
      boxRef.current = box

      useEffect(() => {
        const frame = frameRef.current
        if (frame !== null) frame.focus({ preventScroll: true })
        const bounds = boundsRef.current?.getBoundingClientRect()
        if (bounds === undefined || bounds.width < 80) return
        let next
        if (initialGeometry === undefined) {
          const margin = 28
          const header = boundsRef.current?.querySelector?.('.mm-head')
          const headerHeight = header?.getBoundingClientRect?.().height ?? 56
          const width = Math.max(400, Math.round(bounds.width - margin * 2))
          const height = Math.max(280, Math.round(bounds.height - headerHeight - margin * 2))
          next = clampBox({
            x: margin,
            y: headerHeight + margin,
            w: width,
            h: height,
          }, bounds)
        } else {
          next = clampBox(initialGeometry, bounds)
        }
        setBox(next)
        boxRef.current = next
      }, [])

      const beginDrag = (event) => {
        if (event.button !== 0) return
        const target = event.target
        if (target !== null && typeof target.closest === 'function' && target.closest('button') !== null) return
        event.preventDefault()
        event.stopPropagation()
        const bounds = boundsRef.current?.getBoundingClientRect()
        dragRef.current = { x: event.clientX, y: event.clientY, box: boxRef.current, bounds }
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }

      const moveDrag = (event) => {
        const drag = dragRef.current
        if (drag === undefined) return
        const raw = {
          ...drag.box,
          x: drag.box.x + event.clientX - drag.x,
          y: drag.box.y + event.clientY - drag.y,
        }
        const next = drag.bounds === undefined ? raw : clampBox(raw, drag.bounds)
        boxRef.current = next
        setBox(next)
      }

      const endDrag = (event) => {
        if (dragRef.current === undefined) return
        dragRef.current = undefined
        try {
          event.currentTarget.releasePointerCapture?.(event.pointerId)
        } catch {
          // The pointer may already be gone; the geometry is still saved.
        }
        onGeometry(boxRef.current)
      }

      const beginResize = (event, direction) => {
        if (event.button !== 0) return
        event.preventDefault()
        event.stopPropagation()
        const bounds = boundsRef.current?.getBoundingClientRect()
        resizeRef.current = {
          x: event.clientX,
          y: event.clientY,
          box: boxRef.current,
          bounds,
          direction,
        }
        try {
          event.currentTarget.setPointerCapture?.(event.pointerId)
        } catch {
          // Synthetic pointer events may not have a capturable pointer id.
        }
      }

      const moveResize = (event) => {
        const resize = resizeRef.current
        if (resize === undefined) return
        const dx = event.clientX - resize.x
        const dy = event.clientY - resize.y
        const direction = resize.direction
        let { x, y, w, h } = resize.box
        if (direction.includes('e')) w = resize.box.w + dx
        if (direction.includes('s')) h = resize.box.h + dy
        if (direction.includes('w')) {
          x = resize.box.x + dx
          w = resize.box.w - dx
        }
        if (direction.includes('n')) {
          y = resize.box.y + dy
          h = resize.box.h - dy
        }
        const minWidth = 400
        const minHeight = 280
        if (w < minWidth) {
          if (direction.includes('w')) x = resize.box.x + resize.box.w - minWidth
          w = minWidth
        }
        if (h < minHeight) {
          if (direction.includes('n')) y = resize.box.y + resize.box.h - minHeight
          h = minHeight
        }
        let next = { x, y, w, h }
        if (resize.bounds !== undefined) {
          const gutter = 8
          x = Math.max(gutter, Math.min(x, resize.bounds.width - minWidth - gutter))
          y = Math.max(gutter, Math.min(y, resize.bounds.height - minHeight - gutter))
          w = Math.max(minWidth, Math.min(w, resize.bounds.width - x - gutter))
          h = Math.max(minHeight, Math.min(h, resize.bounds.height - y - gutter))
          next = { x, y, w, h }
        }
        boxRef.current = next
        setBox(next)
      }

      const endResize = (event) => {
        if (resizeRef.current === undefined) return
        resizeRef.current = undefined
        try {
          event.currentTarget.releasePointerCapture?.(event.pointerId)
        } catch {
          // The pointer may already be gone; the geometry is still saved.
        }
        onGeometry(boxRef.current)
      }

      const resizeHandles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((direction) =>
        h('div', {
          key: direction,
          className: 'mm-resize',
          'data-dir': direction,
          title: t('floatResize'),
          onPointerDown: (event) => beginResize(event, direction),
          onPointerMove: moveResize,
          onPointerUp: endResize,
          onPointerCancel: endResize,
        }))

      const label = titleOf(node ?? { id: sessionId }, summary)
      const child = mode === 'child'
      const heading = child
        ? `${t('newChild')}${parentLabel === undefined ? '' : ` · ${parentLabel}`}`
        : label
      const canEmbed = typeof SessionProvider === 'function' && typeof renderFactorySlot === 'function'
      const hero = node?.blank === true
      const fallbackText = canEmbed ? t('floatFallback') : t('floatUnavailable')
      const fallback = h(
        'div',
        { className: 'mm-floatFallback' },
        h('p', null, fallbackText),
        h('button', { type: 'button', className: 'mm-btn primary', onClick: onFull }, t('floatFull')),
      )
      const content = reference !== undefined && canEmbed
        ? h(
            FloatBoundary,
            { fallback },
            h(
              SessionProvider,
              {
                key: sessionId,
                session: reference,
                empty: () => fallback,
              },
              renderFactorySlot(
                'conversation.content',
                { variant: 'embedded', phase: hero ? 'hero' : 'active', hero },
                { fallback },
              ),
            ),
          )
        : fallback

      return h(
        'section',
        {
          ref: frameRef,
          className: 'mm-float',
          style: { left: `${box.x}px`, top: `${box.y}px`, width: `${box.w}px`, height: `${box.h}px` },
          'data-minimized': minimized === true,
          tabIndex: -1,
          role: 'dialog',
          'aria-label': `${t('openFloat')}: ${heading}`,
          'data-mode': mode,
          onPointerDown: (event) => event.stopPropagation(),
        },
        h(
          'div',
          {
            className: 'mm-floatHead',
            onPointerDown: beginDrag,
            onPointerMove: moveDrag,
            onPointerUp: endDrag,
            onPointerCancel: endDrag,
          },
          h('span', { className: 'mm-dot', 'data-running': node?.running === true }),
          h('span', { className: 'mm-floatTitle', title: heading }, heading),
          child
            ? h('span', { className: 'mm-badge', 'data-kind': brief === true ? 'degraded' : 'current' },
                brief === true ? t('briefBranch') : t('childDraft'))
            : null,
          h(
            'div',
            { className: 'mm-floatTools' },
            !child
              ? h('button', {
                  type: 'button',
                  className: 'mm-floatTool',
                  title: t('rename'),
                  onClick: onRename,
                }, '✎')
              : null,
            !child && node?.blank !== true
              ? h('button', {
                  type: 'button',
                  className: 'mm-floatTool',
                  title: t('newChild'),
                  onClick: onNewChild,
                }, '＋')
              : null,
            h('button', {
              type: 'button',
              className: 'mm-floatTool',
              title: t('turnsTitle'),
              onClick: onTurns,
            }, '☰'),
            h('button', {
              type: 'button',
              className: 'mm-floatTool',
              title: t('deleteSession'),
              onClick: onDelete,
            }, '🗑'),
            h('button', {
              type: 'button',
              className: 'mm-floatTool',
              title: minimized === true ? t('floatRestore') : t('floatMinimize'),
              onClick: minimized === true ? onRestore : onMinimize,
            }, minimized === true ? '▢' : '−'),
            h('button', { type: 'button', className: 'mm-floatTool', title: t('floatFull'), onClick: onFull }, '↗'),
            h('button', { type: 'button', className: 'mm-floatTool', title: t('floatClose'), onClick: onClose }, '×'),
          ),
        ),
        h('div', { className: 'mm-floatBody' }, h('div', { className: 'mm-floatChat' }, content)),
        resizeHandles,
      )
    }

    function RenameDialog({ target, t, onCancel, onRename }) {
      const [title, setTitle] = useState(target.title ?? '')
      const [busy, setBusy] = useState(false)
      const [error, setError] = useState(undefined)
      const submit = async () => {
        const text = title.trim()
        if (text === '') {
          setError(t('renameRequired'))
          return
        }
        setBusy(true)
        setError(undefined)
        try {
          await onRename(target.id, text)
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason))
          setBusy(false)
        }
      }
      return h(
        'div',
        {
          className: 'mm-overlay',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget && !busy) onCancel()
          },
        },
        h(
          'div',
          { className: 'mm-modal mm-rename', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('rename') },
          h('h2', { className: 'mm-modalTitle' }, t('renameTitle')),
          h('p', { className: 'mm-modalText' }, t('renameHint')),
          h('input', {
            className: 'mm-input mm-renameInput',
            autoFocus: true,
            value: title,
            maxLength: 120,
            placeholder: t('renamePlaceholder'),
            onChange: (event) => setTitle(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void submit()
              } else if (event.key === 'Escape') {
                event.preventDefault()
                if (!busy) onCancel()
              }
            },
          }),
          error !== undefined ? h('div', { className: 'mm-error', style: { margin: 0 } }, error) : null,
          h(
            'div',
            { className: 'mm-modalFoot' },
            h('button', { type: 'button', className: 'mm-btn', disabled: busy, onClick: onCancel }, t('cancel')),
            h('button', { type: 'button', className: 'mm-btn primary', disabled: busy, onClick: () => void submit() },
              busy ? t('saving') : t('save')),
          ),
        ),
      )
    }

    function App({ t: providedT, SessionProvider, renderFactorySlot }) {
      const t = typeof providedT === 'function' ? providedT : FALLBACK_T
      const ctx = REACT_CTX
      const list = useSessionList(ctx)
      const [selectedId, setSelectedId] = useState(undefined)
      const [rootOverride, setRootOverride] = useState(undefined)
      const [summaries, setSummaries] = useState({})
      const [pending, setPending] = useState({})
      const [collapsed, setCollapsed] = useState(() => new Set())
      const [showSubagents, setShowSubagents] = useState(false)
      const [toast, setToast] = useState(undefined)
      const [renameTarget, setRenameTarget] = useState(undefined)
      const [fetchError, setFetchError] = useState(false)
      const [hostConfig, setHostConfig] = useState({ autoSummarize: true, available: true })
      const [view, setView] = useState({ x: 20, y: 20, k: 1 })
      const [float, setFloat] = useState(() => {
        const saved = readFloatState()
        return {
          open: saved?.open === true,
          minimized: readFloatMinimized(),
          sessionId: saved?.sessionId,
          mode: saved?.mode ?? 'chat',
          parentId: saved?.parentId,
          brief: saved?.brief ?? false,
          startedAt: saved?.startedAt ?? 0,
        }
      })
      const [mapHome, setMapHomeState] = useState(() => MODE.mapHome)
      const [archivedIds, setArchivedIds] = useState(() => {
        const snapshot = ctx.uiWorkspace?.workspaces?.list?.getSnapshot?.()
        return new Set(snapshot?.archivedSessionIds ?? [])
      })
      const [deleteTarget, setDeleteTarget] = useState(undefined)
      const [deleting, setDeleting] = useState(false)
      const [turnsTarget, setTurnsTarget] = useState(undefined)
      const [turns, setTurns] = useState([])
      const [turnsLoading, setTurnsLoading] = useState(false)
      const [turnsError, setTurnsError] = useState(undefined)
      const [turnConfirm, setTurnConfirm] = useState(undefined)
      const [rewinding, setRewinding] = useState(false)
      const [geometry, setGeometry] = useState(loadGeometry)
      const canvasRef = React.useRef(null)
      const rootRef = React.useRef(null)
      const dragRef = React.useRef(undefined)
      const requestedRef = React.useRef(new Set())
      const pendingRef = React.useRef(new Set())
      const viewRef = React.useRef(view)
      viewRef.current = view
      const toastTimer = React.useRef(undefined)
      const pendingCenterRef = React.useRef(undefined)
      const lastCurrentRef = React.useRef(undefined)
      const lastDraftRef = React.useRef('')
      const settlingRef = React.useRef(undefined)

      const notify = React.useCallback((text) => {
        setToast(text)
        clearTimeout(toastTimer.current)
        toastTimer.current = setTimeout(() => setToast(undefined), 3200)
      }, [])

      const formatTurnTime = (at) => {
        if (typeof at !== 'number' || !Number.isFinite(at)) return ''
        try {
          return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        } catch {
          return ''
        }
      }

      React.useEffect(() => {
        writeStorage(FLOAT_STATE_KEY, {
          open: float.open,
          sessionId: float.sessionId,
          mode: float.mode,
          parentId: float.parentId,
          brief: float.brief,
          startedAt: float.startedAt,
        })
      }, [float.open, float.sessionId, float.mode, float.parentId, float.brief, float.startedAt])

      /* While the float is open it owns the map surface: an automatic panel
       * switch (for example when a turn settles) must not unmount it. */
      React.useEffect(() => {
        if (!float.open) return undefined
        const source = ctx.layout?.panelInfo
        const check = () => {
          try {
            const active = source?.getSnapshot?.().activePanelId
            if (active !== PANEL_ID && (active === null || active === undefined || active === 'conversation')) {
              ctx.layout.selectPanel(PANEL_ID)
            }
          } catch {
            // The panel tree may be between registrations during HMR.
          }
        }
        check()
        if (typeof source?.subscribe !== 'function') return undefined
        return source.subscribe(check)
      }, [float.open, ctx])

      React.useEffect(() => {
        const list = ctx.uiWorkspace?.workspaces?.list
        if (typeof list?.subscribe !== 'function') return undefined
        const refresh = () => {
          const snapshot = list.getSnapshot()
          setArchivedIds(new Set(snapshot?.archivedSessionIds ?? []))
        }
        refresh()
        return list.subscribe(refresh)
      }, [ctx])

      /* A blank fork is a draft branch: it stays off the canvas until its
       * first message. Blank roots (a fresh Session) still render. */
      const mapList = React.useMemo(() => {
        const draftId = float.mode === 'child' ? float.sessionId : undefined
        const ids = (list.ids ?? Object.keys(list.byId ?? {})).filter((id) => {
          const node = list.byId?.[id]
          if (node === undefined) return false
          if (archivedIds.has(id)) return false
          if (id === draftId) return false
          return !(node.blank === true && typeof node.parentId === 'string')
        })
        if (ids.length === (list.ids ?? []).length) return list
        return { ...list, ids }
      }, [list, float.mode, float.sessionId, archivedIds])

      const currentId = React.useMemo(() => {
        for (const node of Object.values(mapList.byId ?? {})) {
          if ((node.retainedBy?.mainView ?? 0) > 0) return node.id
        }
        return undefined
      }, [mapList])

      const forest = React.useMemo(() => buildForest(mapList, showSubagents), [mapList, showSubagents])

      const rootTree = React.useMemo(() => {
        if (rootOverride !== undefined) {
          const picked = forest.roots.find((root) => root.id === rootOverride)
          if (picked !== undefined) return picked
        }
        for (const candidate of [selectedId, currentId]) {
          if (candidate === undefined) continue
          const found = forest.roots.find((root) => containsId(root, candidate))
          if (found !== undefined) return found
        }
        return forest.roots[0]
      }, [forest, rootOverride, selectedId, currentId])

      const layout = React.useMemo(() => layoutTree(rootTree, collapsed), [rootTree, collapsed])
      const itemById = React.useMemo(() => new Map(layout.items.map((item) => [item.id, item])), [layout])
      const treeIds = React.useMemo(() => layout.items.map((item) => item.id), [layout])
      const selected = selectedId === undefined ? undefined : itemById.get(selectedId)
      const rootId = rootTree?.id

      const centerOnItem = React.useCallback((item) => {
        const canvas = canvasRef.current
        if (canvas === null || item === undefined) return
        const rect = canvas.getBoundingClientRect()
        if (rect.width < 40 || rect.height < 40) return
        const k = Math.max(0.65, viewRef.current.k)
        setView({
          k,
          x: rect.width / 2 - (item.x + NODE_W / 2) * k,
          y: rect.height / 2 - (item.y + NODE_H / 2) * k,
        })
      }, [])

      /* A session selected in the left sidebar roots the map at its topic and focuses its node. */
      React.useEffect(() => {
        if (currentId === undefined || currentId === lastCurrentRef.current) return
        lastCurrentRef.current = currentId
        setSelectedId(currentId)
        setRootOverride(undefined)
        pendingCenterRef.current = currentId
      }, [currentId])

      /* health + cached summaries */
      React.useEffect(() => {
        let alive = true
        fetch(`${API}/health`)
          .then((response) => response.json())
          .then((value) => {
            if (!alive || value.ok !== true) return
            setHostConfig({ autoSummarize: value.autoSummarize !== false, available: true })
          })
          .catch(() => {
            if (alive) setHostConfig({ autoSummarize: false, available: false })
          })
        return () => {
          alive = false
        }
      }, [])

      const requestSummary = React.useCallback(async (node, force) => {
        if (node === undefined) return undefined
        if (pendingRef.current.has(node.id)) return undefined
        const key = `${node.id}:${node.updatedAt}`
        if (force !== true && requestedRef.current.has(key)) return undefined
        requestedRef.current.add(key)
        pendingRef.current.add(node.id)
        setPending((previous) => ({ ...previous, [node.id]: true }))
        try {
          const value = await api('summarize', { sessionId: node.id, force: force === true })
          if (value.summary !== null && value.summary !== undefined) {
            setSummaries((previous) => ({ ...previous, [node.id]: value.summary }))
            return value.summary
          }
        } catch (error) {
          notify(`${t('summaryFailed')}: ${error.message}`)
        } finally {
          pendingRef.current.delete(node.id)
          setPending((previous) => {
            const next = { ...previous }
            delete next[node.id]
            return next
          })
        }
        return undefined
      }, [notify, t])

      /* cached summaries for the current tree */
      React.useEffect(() => {
        if (rootId === undefined) return
        let alive = true
        if (treeIds.length === 0) return
        api('summaries', { ids: treeIds }).then((value) => {
          if (!alive) return
          setSummaries((previous) => ({ ...previous, ...(value.summaries ?? {}) }))
        }).catch(() => {
          if (alive) setFetchError(true)
        })
        return () => {
          alive = false
        }
      }, [rootId, treeIds])

      /* auto-summary: idle, non-blank topics of this tree, one small batch */
      React.useEffect(() => {
        if (hostConfig.autoSummarize !== true) return
        const timer = setTimeout(() => {
          const now = Date.now()
          const candidates = layout.items
            .map((item) => item.node)
            .filter((node) => {
              if (node.blank === true || node.running === true) return false
              const turns = countTurns(node)
              if (turns === undefined || turns < 1) return false
              if (typeof node.updatedAt === 'number' && now - node.updatedAt < 12_000) return false
              if (typeof node.updatedAt === 'number' && now - node.updatedAt > 30 * 86_400_000) return false
              const cached = summaries[node.id]
              if (cached !== undefined && cached.at >= node.updatedAt) return false
              return true
            })
          for (const node of candidates.slice(0, 3)) void requestSummary(node, false)
        }, 1400)
        return () => clearTimeout(timer)
      }, [layout, summaries, hostConfig.autoSummarize, requestSummary])

      /* fit on root change */
      React.useEffect(() => {
        if (pendingCenterRef.current !== undefined) return
        const canvas = canvasRef.current
        if (canvas === null || layout.items.length === 0) return
        const rect = canvas.getBoundingClientRect()
        if (rect.width < 40 || rect.height < 40) return
        const scale = Math.min(1.05, Math.max(0.28, Math.min((rect.width - 72) / layout.width, (rect.height - 72) / layout.height)))
        setView({
          k: scale,
          x: (rect.width - layout.width * scale) / 2,
          y: (rect.height - layout.height * scale) / 2,
        })
        // eslint-disable-next-line react-hooks/exhaustive-deps -- refit only when the root changes
      }, [rootId])

      /* Center the node chosen from the left sidebar after its tree/layout exists. */
      React.useEffect(() => {
        const id = pendingCenterRef.current
        if (id === undefined) return
        const item = layout.items.find((candidate) => candidate.id === id)
        if (item === undefined) return
        pendingCenterRef.current = undefined
        centerOnItem(item)
      }, [layout, centerOnItem])

      /* wheel zoom (non-passive listener so ctrl+wheel does not zoom the page) */
      React.useEffect(() => {
        const canvas = canvasRef.current
        if (canvas === null) return undefined
        const onWheel = (event) => {
          const rect = canvas.getBoundingClientRect()
          const pointerX = event.clientX - rect.left
          const pointerY = event.clientY - rect.top
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            setView((previous) => {
              const factor = Math.exp(-event.deltaY * 0.0018)
              const k = Math.min(2.2, Math.max(0.25, previous.k * factor))
              const ratio = k / previous.k
              return { k, x: pointerX - (pointerX - previous.x) * ratio, y: pointerY - (pointerY - previous.y) * ratio }
            })
          } else {
            event.preventDefault()
            setView((previous) => ({ ...previous, x: previous.x - event.deltaX, y: previous.y - event.deltaY }))
          }
        }
        canvas.addEventListener('wheel', onWheel, { passive: false })
        return () => canvas.removeEventListener('wheel', onWheel)
      }, [])

      /* keyboard */
      React.useEffect(() => {
        const onKey = (event) => {
          if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === 'M' || event.key === 'm')) {
            event.preventDefault()
            if (float.open) hideFloat()
            else if (selectedId !== undefined) void toggleFloat()
            return
          }
          if (event.key !== 'Escape') return
          const target = event.target
          const insideFloat = target !== null && typeof target.closest === 'function' && target.closest('.mm-float') !== null
          if (float.open && !insideFloat) {
            hideFloat()
            return
          }
          if (selectedId !== undefined) setSelectedId(undefined)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [selectedId, float.open])

      const fit = React.useCallback(() => {
        const canvas = canvasRef.current
        if (canvas === null) return
        const rect = canvas.getBoundingClientRect()
        const scale = Math.min(1.05, Math.max(0.28, Math.min((rect.width - 72) / layout.width, (rect.height - 72) / layout.height)))
        setView({ k: scale, x: (rect.width - layout.width * scale) / 2, y: (rect.height - layout.height * scale) / 2 })
      }, [layout])

      const zoom = (factor) => {
        const canvas = canvasRef.current
        if (canvas === null) return
        const rect = canvas.getBoundingClientRect()
        setView((previous) => {
          const k = Math.min(2.2, Math.max(0.25, previous.k * factor))
          const ratio = k / previous.k
          return { k, x: rect.width / 2 - (rect.width / 2 - previous.x) * ratio, y: rect.height / 2 - (rect.height / 2 - previous.y) * ratio }
        })
      }

      const toggle = (id) => {
        setCollapsed((previous) => {
          const next = new Set(previous)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
      }

      const archiveDraft = () => {
        const id = float.sessionId
        if (float.mode !== 'child' || id === undefined) return
        const node = list.byId?.[id]
        const startedAt = float.startedAt ?? 0
        const untouched = node === undefined
          || node.blank === true
          || (typeof node.updatedAt === 'number' && node.updatedAt <= startedAt)
        if (!untouched) return
        try {
          const result = ctx.uiWorkspace?.archiveSession?.(id)
          if (result !== undefined && typeof result.catch === 'function') result.catch(() => {})
        } catch {
          // A draft that cannot be archived stays hidden until the next workspace refresh.
        }
      }

      const resetFloat = () => {
        setTurnsTarget(undefined)
        setTurnConfirm(undefined)
        setFloat({
          open: false,
          minimized: false,
          sessionId: undefined,
          mode: 'chat',
          parentId: undefined,
          brief: false,
          startedAt: 0,
        })
      }

      const closeFloat = () => {
        archiveDraft()
        resetFloat()
      }

      const confirmDelete = async () => {
        if (deleteTarget === undefined || deleting) return
        setDeleting(true)
        try {
          await ctx.uiWorkspace.archiveSession(deleteTarget.id, { stopActivity: true })
          if (float.sessionId === deleteTarget.id) resetFloat()
          if (selectedId === deleteTarget.id) setSelectedId(undefined)
          notify(t('archived'))
          setDeleteTarget(undefined)
        } catch (error) {
          notify(`${t('archiveFailed')}: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
          setDeleting(false)
        }
      }

      const hideFloat = () => {
        setFloat((previous) => ({ ...previous, open: false }))
      }

      const setFloatMinimized = (minimized) => {
        setFloat((previous) => {
          const next = { ...previous, minimized }
          writeStorage(FLOAT_KEY, { ...geometry, minimized })
          return next
        })
      }

      const rememberGeometry = (value) => {
        setGeometry(value)
        writeStorage(FLOAT_KEY, { ...value, minimized: float.minimized })
      }

      /* View or continue an existing topic. */
      const showChat = async (id) => {
        if (id === undefined || id === null) return false
        archiveDraft()
        if (float.open && float.mode === 'chat' && float.sessionId === id) {
          if (float.minimized) setFloatMinimized(false)
          return true
        }
        setSelectedId(id)
        setRootOverride(undefined)
        pendingCenterRef.current = id
        setFloat({
          open: true,
          minimized: false,
          sessionId: id,
          mode: 'chat',
          parentId: undefined,
          brief: false,
          startedAt: 0,
        })
        let opened = false
        try {
          opened = await openSession(ctx, id)
        } catch (error) {
          console.warn('[mindmap] could not select the session for the float:', error)
        }
        try {
          ctx.layout.selectPanel(PANEL_ID)
        } catch {
          // The map panel can be between registrations during HMR; selection still worked.
        }
        if (!opened) {
          notify(t('openFailed'))
          // Keep the retained float alive: the workspace selection may be
          // temporarily unavailable while a turn is settling.
          return false
        }
        return true
      }

      /* New child: fork eagerly, keep the parent selected, and let the first
       * message turn the blank draft into a visible child node. */
      const startChild = async (parentId, brief = false) => {
        if (parentId === undefined || parentId === null) return false
        archiveDraft()
        let childId
        let effectiveBrief = brief
        try {
          childId = brief
            ? await ctx.sessions.fork({ sessionId: parentId, atSeq: 0 })
            : await ctx.sessions.fork({ sessionId: parentId })
        } catch (error) {
          if (!brief) {
            try {
              childId = await ctx.sessions.fork({ sessionId: parentId, atSeq: 0 })
              effectiveBrief = true
            } catch (fallbackError) {
              notify(`${t('branchFailed')}: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`)
              return false
            }
          } else {
            notify(`${t('branchFailed')}: ${error instanceof Error ? error.message : String(error)}`)
            return false
          }
        }
        setSelectedId(parentId)
        setRootOverride(undefined)
        pendingCenterRef.current = parentId
        setFloat({
          open: true,
          minimized: false,
          sessionId: childId,
          mode: 'child',
          parentId,
          brief: effectiveBrief,
          startedAt: Date.now(),
        })
        try {
          ctx.layout.selectPanel(PANEL_ID)
        } catch {
          // Already on the map in the normal path.
        }
        return true
      }

      const openTurns = async (sessionId) => {
        setTurnsTarget(sessionId)
        setTurns([])
        setTurnsLoading(true)
        setTurnsError(undefined)
        setTurnConfirm(undefined)
        try {
          const response = await fetch(`${API}/turns`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          })
          const payload = await response.json()
          if (payload.ok !== true) throw new Error(payload.error?.message ?? 'could not read turns')
          setTurns(Array.isArray(payload.turns) ? payload.turns : [])
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          setTurnsError(/unknown mindmap method\s+["']?turns/i.test(message) ? t('hostStale') : message)
        } finally {
          setTurnsLoading(false)
        }
      }

      const closeTurns = () => {
        if (rewinding) return
        setTurnsTarget(undefined)
        setTurns([])
        setTurnConfirm(undefined)
        setTurnsError(undefined)
      }

      const rewindTo = async (turn) => {
        if (turnsTarget === undefined || rewinding || turn?.rewindAt === undefined) return
        const oldId = turnsTarget
        setRewinding(true)
        try {
          const childId = await ctx.sessions.fork({ sessionId: oldId, atSeq: turn.rewindAt })
          const oldTitle = titleOf(list.byId?.[oldId] ?? { id: oldId }, summaries[oldId])
          try {
            const title = `${oldTitle} · 回退`
            await renameSession(ctx, childId, title.length > 64 ? `${title.slice(0, 63)}…` : title)
          } catch {
            // A fork is still usable with the inherited title.
          }
          try {
            await ctx.uiWorkspace.archiveSession(oldId, { stopActivity: true })
          } catch (error) {
            notify(`${t('rewindArchiveFailed')}: ${error instanceof Error ? error.message : String(error)}`)
          }
          setTurnsTarget(undefined)
          setTurns([])
          setTurnConfirm(undefined)
          await showChat(childId)
          notify(t('rewound'))
        } catch (error) {
          notify(`${t('rewindFailed')}: ${error instanceof Error ? error.message : String(error)}`)
        } finally {
          setRewinding(false)
        }
      }

      const toggleFloat = async () => {
        if (float.open) {
          hideFloat()
          return
        }
        if (float.sessionId !== undefined) {
          const node = list.byId?.[float.sessionId]
          if (float.mode === 'chat') {
            if (selectedId !== undefined && selectedId !== float.sessionId) {
              await showChat(selectedId)
              return
            }
            setFloat((previous) => ({ ...previous, open: true, minimized: false }))
            return
          }
          if (node?.blank !== false) {
            if (float.parentId === selectedId) {
              setFloat((previous) => ({ ...previous, open: true, minimized: false }))
              return
            }
            await startChild(selectedId)
            return
          }
          await showChat(float.sessionId)
          return
        }
        if (selectedId !== undefined) await startChild(selectedId)
      }

      /* Remember the question while it is still in the draft box; the title
       * is applied when the first message turns the draft into a node. */
      React.useEffect(() => {
        lastDraftRef.current = ''
        if (!float.open || float.mode !== 'child' || float.sessionId === undefined) return undefined
        let disposed = false
        let unsubscribe
        let timer
        const shellRef = { current: undefined }
        const read = () => {
          if (disposed) return
          const shell = shellRef.current
          if (shell === undefined) return
          const text = shell.draftSnapshot
          if (typeof text === 'string' && text.trim() !== '') lastDraftRef.current = text.trim()
        }
        const attach = () => {
          if (disposed || shellRef.current !== undefined) return
          try {
            const input = ctx.get('conversation')?.input
            const shell = input?.shell?.(float.sessionId)
            if (shell === undefined) return
            shellRef.current = shell
            read()
            const stop = shell.state?.subscribe?.(read)
            if (typeof stop === 'function') unsubscribe = stop
          } catch {
            // The Session binding may still be materializing; retry once on the next task.
            if (timer === undefined) timer = setTimeout(attach, 60)
          }
        }
        attach()
        if (shellRef.current === undefined && timer === undefined) timer = setTimeout(attach, 0)
        return () => {
          disposed = true
          clearTimeout(timer)
          if (typeof unsubscribe === 'function') unsubscribe()
        }
      }, [float.open, float.mode, float.sessionId])

      /* Color the native turn rail inside the float by ancestry level.
       * A turn's level is how many inherited fork seeds precede it. */
      React.useEffect(() => {
        if (!float.open || float.sessionId === undefined) return undefined
        const host = rootRef.current
        if (host === null) return undefined
        let disposed = false
        let observer
        let frame
        let levels
        const raf = typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame
          : (callback) => setTimeout(callback, 16)
        const cancel = typeof cancelAnimationFrame === 'function'
          ? cancelAnimationFrame
          : clearTimeout
        const apply = () => {
          if (disposed || !Array.isArray(levels)) return
          const floatEl = host.querySelector('.mm-float')
          if (floatEl === null) return
          const marks = floatEl.querySelectorAll('nav button[data-index]')
          for (const mark of marks) {
            const index = Number(mark.dataset.index)
            const level = Number.isInteger(index) && index >= 0 ? (levels[index] ?? 0) : 0
            const color = TURN_LEVEL_COLORS[Math.min(level, TURN_LEVEL_COLORS.length - 1)]
            mark.dataset.mmLevel = String(level)
            mark.style.setProperty('--dsw-alias-border-l4', color)
            mark.style.setProperty('--dsw-alias-label-primary', color)
          }
        }
        const schedule = () => {
          if (disposed || frame !== undefined) return
          frame = raf(() => {
            frame = undefined
            apply()
          })
        }
        const observe = () => {
          if (disposed) return
          const floatEl = host.querySelector('.mm-float')
          if (floatEl === null) return
          if (observer !== undefined) observer.disconnect()
          if (typeof MutationObserver !== 'function') {
            schedule()
            return
          }
          observer = new MutationObserver(schedule)
          observer.observe(floatEl, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-index'],
          })
          schedule()
        }
        void api('turns', { sessionId: float.sessionId, railOnly: true })
          .then((payload) => {
            if (disposed) return
            levels = Array.isArray(payload.railLevels)
              ? payload.railLevels.map((level) => (Number.isInteger(level) ? level : 0))
              : (Array.isArray(payload.turns) ? payload.turns : [])
                  .map((turn) => (Number.isInteger(turn?.level) ? turn.level : 0))
            observe()
          })
          .catch(() => {
            // Older Host halves have no level data; leave the rail at its native color.
          })
        return () => {
          disposed = true
          if (frame !== undefined) cancel(frame)
          observer?.disconnect()
        }
      }, [float.open, float.sessionId])

      /* Turn a draft into a normal topic without touching the float's open
       * state. Workspace selection is best-effort; a settling turn must not
       * be allowed to close a window the user opened. */
      const settleChild = (childId) => {
        setFloat((previous) => previous.sessionId === childId
          ? { ...previous, mode: 'chat', parentId: undefined, brief: false, startedAt: 0 }
          : previous)
        setSelectedId(childId)
        setRootOverride(undefined)
        pendingCenterRef.current = childId
        try {
          const result = ctx.get('uiWorkspace')?.openSession?.(childId)
          if (result !== undefined && typeof result.catch === 'function') result.catch(() => {})
        } catch {
          // The float already owns a retained reference; selection can catch up later.
        }
        try {
          ctx.layout.selectPanel(PANEL_ID)
        } catch {
          // The map panel may be between registrations during HMR.
        }
      }

      /* The draft child became a real topic after its first new message. */
      React.useEffect(() => {
        if (!float.open || float.mode !== 'child' || float.sessionId === undefined) return undefined
        if (settlingRef.current === float.sessionId) return undefined
        const node = list.byId?.[float.sessionId]
        if (node === undefined) return undefined
        const startedAt = float.startedAt ?? 0
        if (typeof node.updatedAt !== 'number' || node.updatedAt <= startedAt) return undefined
        let alive = true
        settlingRef.current = float.sessionId
        const childId = float.sessionId
        const question = lastDraftRef.current
        void (async () => {
          if (question !== '') {
            try {
              await renameSession(ctx, childId, question.length > 60 ? `${question.slice(0, 59)}…` : question)
            } catch {
              // The map still gets a node; the inherited title is a safe fallback.
            }
          }
          if (alive) settleChild(childId)
        })().finally(() => {
          if (settlingRef.current === childId) settlingRef.current = undefined
        })
        return () => {
          alive = false
        }
      }, [list, float.open, float.mode, float.sessionId, float.startedAt])

      const openFull = async (id) => {
        closeFloat()
        MODE.bypass = true
        try {
          let opened = false
          try {
            opened = await openSession(ctx, id)
          } catch (error) {
            console.warn('[mindmap] could not open the full conversation:', error)
          }
          try {
            ctx.layout.selectPanel(null)
          } catch {
            // The floating fallback still offers a working map.
          }
          if (!opened) notify(t('openFailed'))
        } finally {
          setTimeout(() => {
            MODE.bypass = false
          }, 0)
        }
      }

      const applyMapHome = (value) => {
        MODE.mapHome = value
        setMapHomeState(value)
        writeStorage(MAP_HOME_KEY, value)
        try {
          ctx.layout.selectPanel(value ? PANEL_ID : null)
        } catch {
          // Layout may still be mounting; the guard retries on the next selection.
        }
      }

      const focusNode = (id) => {
        setSelectedId(id)
        if (!float.open) return
        if (float.mode === 'chat' && float.sessionId !== id) void showChat(id)
        else if (float.mode === 'child' && float.parentId !== id) hideFloat()
      }

      const bridge = async (childId, parentId) => {
        const summary = summaries[childId]
        if (summary?.summary === undefined || summary.summary === '') {
          notify(t('carryFailed'))
          return
        }
        const label = titleOf(itemById.get(childId)?.node ?? { id: childId }, summary)
        const opened = await showChat(parentId)
        if (!opened) return
        const text = `【子话题「${label}」的结论】${summary.summary}`
        const prefilled = await prefillDraft(ctx, parentId, `${text}\n\n`, 'append')
        notify(prefilled ? t('carry', { name: label }) : t('openFailed'))
      }

      const openRename = (id) => {
        if (id === undefined || id === null) return
        const node = itemById.get(id)?.node ?? list.byId?.[id] ?? { id }
        setRenameTarget({ id, title: titleOf(node, summaries[id]) })
      }

      const performRename = async (id, title) => {
        await renameSession(ctx, id, title)
        setRenameTarget(undefined)
        notify(t('renamed'))
      }

      const summarizeAll = async () => {
        if (hostConfig.available !== true) return
        const nodes = layout.items.map((item) => item.node)
        for (const node of nodes) {
          if (node.blank === true) continue
          if (pendingRef.current.has(node.id)) continue
          const cached = summaries[node.id]
          if (cached !== undefined && cached.at >= node.updatedAt) continue
          await requestSummary(node, false)
        }
        notify(t('allFresh'))
      }

      const runningCount = layout.items.filter((item) => item.node.running === true).length
      const pendingCount = layout.items.filter((item) => pending[item.id] === true).length

      const turnModal = turnsTarget === undefined ? null : h(
        'div',
        {
          className: 'mm-overlay',
          role: 'presentation',
          onMouseDown: (event) => {
            if (event.target === event.currentTarget) closeTurns()
          },
        },
        h(
          'div',
          { className: 'mm-modal wide', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('turnsTitle') },
          h(
            'div',
            { className: 'mm-turnsHead' },
            h('h2', { className: 'mm-modalTitle' }, t('turnsTitle')),
            h('button', {
              type: 'button',
              className: 'mm-btn icon',
              disabled: rewinding,
              onClick: closeTurns,
            }, '×'),
          ),
          turnConfirm !== undefined
            ? h(
                'div',
                null,
                h('p', { className: 'mm-modalText' }, t('rewindConfirm', { n: turnConfirm.index })),
                h('p', { className: 'mm-modalText' }, t('rewindHint')),
                h(
                  'div',
                  { className: 'mm-modalFoot' },
                  h('button', {
                    type: 'button',
                    className: 'mm-btn',
                    disabled: rewinding,
                    onClick: () => setTurnConfirm(undefined),
                  }, t('cancel')),
                  h('button', {
                    type: 'button',
                    className: 'mm-btn primary',
                    disabled: rewinding,
                    onClick: () => void rewindTo(turnConfirm),
                  }, rewinding ? t('archiving') : t('rewindAction')),
                ),
              )
            : h(
                'div',
                null,
                turnsLoading
                  ? h('div', { className: 'mm-emptyLine' }, h('span', { className: 'mm-spin' }), t('summarizing'))
                  : null,
                turnsError !== undefined ? h('div', { className: 'mm-error' }, turnsError) : null,
                !turnsLoading && turnsError === undefined && turns.length === 0
                  ? h('p', { className: 'mm-modalText' }, t('turnsEmpty'))
                  : null,
                h(
                  'div',
                  { className: 'mm-turns' },
                  turns.map((turn) => h(
                    'div',
                    { className: 'mm-turn', key: String(turn.startSeq ?? turn.index) },
                    h(
                      'div',
                      { className: 'mm-turnHead' },
                      h('span', { className: 'mm-turnIndex' }, t('turnN', { n: turn.index })),
                      h('span', { className: 'mm-turnTime' }, formatTurnTime(turn.at)),
                      h('button', {
                        type: 'button',
                        className: 'mm-btn',
                        disabled: turn.rewindAt === undefined,
                        onClick: () => setTurnConfirm(turn),
                      }, t('rewindTitle')),
                    ),
                    h('div', { className: 'mm-turnText' }, turn.user),
                    turn.assistant !== '' ? h('div', { className: 'mm-turnSub' }, turn.assistant) : null,
                  )),
                ),
              ),
        ),
      )

      if (list.phase === 'pending' && forest.roots.length === 0) {
        return h('div', { className: 'mm-root' },
          h('div', { className: 'mm-empty' }, h('span', { className: 'mm-spin', style: { width: '18px', height: '18px' } })))
      }

      if (forest.roots.length === 0) {
        return h(
          'div',
          { className: 'mm-root' },
          h('div', { className: 'mm-head' },
            h('div', { className: 'mm-headMain' },
              h('div', { className: 'mm-headTitle' }, t('title')),
              h('div', { className: 'mm-headSub' }, t('panel'))),
            h('div', { className: 'mm-headActions' },
              h('button', { type: 'button', className: 'mm-btn', onClick: () => setShowSubagents((value) => !value) },
                t('showSubagents')))),
          h('div', { className: 'mm-empty' },
            h(IconMindmap, { size: 34 }),
            h('h2', { className: 'mm-emptyTitle' }, t('emptyTitle')),
            h('p', { className: 'mm-emptyText' }, t('emptyText'))),
        )
      }

      return h(
        'div',
        { className: 'mm-root', ref: rootRef },
        h(
          'div',
          { className: 'mm-head' },
          h(
            'div',
            { className: 'mm-headMain' },
            h('div', { className: 'mm-headTitle' }, t('title')),
            h('div', { className: 'mm-headSub' },
              t('subtitle', { n: layout.items.length, running: runningCount }),
              pendingCount > 0 ? ` · ${t('summarizingCount', { n: pendingCount })}` : ''),
          ),
          h(
            'div',
            { className: 'mm-headActions' },
            h('button', {
              type: 'button',
              className: 'mm-btn mm-mode',
              'data-active': mapHome,
              title: t('mapHomeHint'),
              onClick: () => applyMapHome(!mapHome),
            }, t('mapHome')),
            h('button', {
              type: 'button',
              className: 'mm-btn mm-mode',
              'data-active': float.open,
              title: t('floatHint'),
              onClick: () => void toggleFloat(),
            }, t('floatToggle')),
            forest.roots.length > 1
              ? h('select', {
                  className: 'mm-select',
                  'aria-label': t('title'),
                  value: rootTree?.id ?? '',
                  onChange: (event) => {
                    setRootOverride(event.target.value)
                    setSelectedId(undefined)
                  },
                }, forest.roots.map((candidate) => {
                  const label = titleOf(candidate.node, summaries[candidate.id])
                  const total = 1 + countDescendants(candidate)
                  return h('option', { key: candidate.id, value: candidate.id }, `${label} · ${total}`)
                }))
              : null,
            h('button', { type: 'button', className: 'mm-btn', title: t('zoomOut'), onClick: () => zoom(0.85) }, '−'),
            h('button', { type: 'button', className: 'mm-btn', title: t('zoomIn'), onClick: () => zoom(1.18) }, '+'),
            h('button', { type: 'button', className: 'mm-btn', onClick: fit }, t('fit')),
            h('button', {
              type: 'button',
              className: 'mm-btn',
              disabled: !hostConfig.available,
              onClick: () => void summarizeAll(),
            }, t('refreshAll')),
            h('button', {
              type: 'button',
              className: 'mm-btn',
              'data-active': showSubagents,
              onClick: () => setShowSubagents((value) => !value),
            }, t('showSubagents')),
          ),
        ),
        fetchError === true || hostConfig.available === false
          ? h('div', { className: 'mm-error' }, t('fetchFailed'))
          : null,
        h(
          'div',
          { className: 'mm-body' },
          h(
            'div',
            {
              className: 'mm-canvas',
              ref: canvasRef,
              tabIndex: 0,
              'data-dragging': dragRef.current !== undefined,
              onPointerDown: (event) => {
                if (event.button !== 0) return
                const target = event.target
                if (target !== null && typeof target.closest === 'function' && target.closest('.mm-node') !== null) return
                dragRef.current = { x: event.clientX, y: event.clientY, ox: viewRef.current.x, oy: viewRef.current.y }
                event.currentTarget.setPointerCapture?.(event.pointerId)
                event.currentTarget.dataset.dragging = 'true'
              },
              onPointerMove: (event) => {
                const drag = dragRef.current
                if (drag === undefined) return
                setView((previous) => ({
                  ...previous,
                  x: drag.ox + event.clientX - drag.x,
                  y: drag.oy + event.clientY - drag.y,
                }))
              },
              onPointerUp: (event) => {
                dragRef.current = undefined
                event.currentTarget.dataset.dragging = 'false'
                event.currentTarget.releasePointerCapture?.(event.pointerId)
              },
              onPointerCancel: () => {
                dragRef.current = undefined
              },
            },
            h(
              'div',
              {
                className: 'mm-world',
                style: { transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, width: layout.width, height: layout.height },
              },
              h(
                'svg',
                { className: 'mm-edges', width: layout.width, height: layout.height, 'aria-hidden': 'true' },
                layout.edges.map((edge, index) => h('path', {
                  key: index,
                  className: 'mm-edge',
                  d: edgePath(edge.from, edge.to),
                  'data-active': selectedId === edge.to.id,
                })),
              ),
              layout.items.map((item) => h(NodeCard, {
                key: item.id,
                item,
                summary: summaries[item.id],
                pending: pending[item.id] === true,
                selected: selectedId === item.id,
                current: currentId === item.id,
                collapsed: collapsed.has(item.id),
                t,
                onSelect: focusNode,
                onOpen: (id) => void openFull(id),
                onFloat: (id) => void showChat(id),
                onBranch: (id) => void startChild(id),
                onRename: openRename,
                onToggle: toggle,
              })),
            ),
          ),
          selected !== undefined && float.open !== true
            ? h(Drawer, {
                item: selected,
                summary: summaries[selected.id],
                pending: pending[selected.id] === true,
                t,
                ctx,
                current: currentId === selected.id,
                onClose: () => setSelectedId(undefined),
                onOpen: (id) => void openFull(id),
                onFloat: (id) => void showChat(id),
                onChild: (id, brief) => void startChild(id, brief === true),
                onBranch: (id) => void startChild(id),
                onRename: openRename,
                onRefresh: (id) => void requestSummary(itemById.get(id)?.node, true),
                onBridge: (childId, parentId) => void bridge(childId, parentId),
                toast: notify,
              })
            : null,
        ),
        selected !== undefined && float.open !== true
          ? h('button', {
              type: 'button',
              className: 'mm-cta',
              onClick: () => void startChild(selected.id),
              title: t('newChildHint'),
            }, `＋ ${t('askChild')}`, h('kbd', null, t('floatShortcut')))
          : null,
        float.open === true && float.sessionId !== undefined
          ? h(FloatingConversation, {
              sessionId: float.sessionId,
              node: itemById.get(float.sessionId)?.node ?? list.byId?.[float.sessionId],
              parentLabel: float.parentId === undefined
                ? undefined
                : titleOf(list.byId?.[float.parentId] ?? { id: float.parentId }, summaries[float.parentId]),
              summary: summaries[float.sessionId],
              mode: float.mode,
              brief: float.brief,
              t,
              ctx,
              SessionProvider,
              renderFactorySlot,
              initialGeometry: geometry,
              minimized: float.minimized === true,
              boundsRef: rootRef,
              onGeometry: rememberGeometry,
              onMinimize: () => setFloatMinimized(true),
              onRestore: () => setFloatMinimized(false),
              onNewChild: () => void startChild(float.sessionId),
              onRename: () => openRename(float.sessionId),
              onDelete: () => setDeleteTarget({
                id: float.sessionId,
                title: float.mode === 'child'
                  ? t('newChild')
                  : titleOf(list.byId?.[float.sessionId] ?? { id: float.sessionId }, summaries[float.sessionId]),
              }),
              onTurns: () => void openTurns(float.sessionId),
              onClose: closeFloat,
              onFull: () => void openFull(
                float.mode === 'child' && float.parentId !== undefined ? float.parentId : float.sessionId,
              ),
            })
          : null,
        renameTarget !== undefined
          ? h(RenameDialog, {
              target: renameTarget,
              t,
              onCancel: () => setRenameTarget(undefined),
              onRename: performRename,
            })
          : null,
        turnModal,
        deleteTarget !== undefined
          ? h('div', {
              className: 'mm-overlay',
              role: 'presentation',
              onMouseDown: (event) => {
                if (event.target === event.currentTarget && !deleting) setDeleteTarget(undefined)
              },
            },
            h('div', { className: 'mm-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('archiveTitle') },
              h('h2', { className: 'mm-modalTitle' }, t('archiveTitle')),
              h('p', { className: 'mm-modalText' }, `${deleteTarget.title} — ${t('archiveText')}`),
              h('div', { className: 'mm-modalFoot' },
                h('button', {
                  type: 'button',
                  className: 'mm-btn',
                  disabled: deleting,
                  onClick: () => setDeleteTarget(undefined),
                }, t('cancel')),
                h('button', {
                  type: 'button',
                  className: 'mm-btn primary',
                  disabled: deleting,
                  onClick: () => void confirmDelete(),
                }, deleting ? t('archiving') : t('archive')))))
          : null,
        toast !== undefined ? h('div', { className: 'mm-toast', role: 'status' }, toast) : null,
      )
    }

    /* `apply` runs inside the client Cordis fiber; components reach the same
     * context through this module-scope binding. */
    let REACT_CTX

    const inject = ['slots', 'sessions', 'locale', 'layout', 'uiWorkspace']

    function apply(ctx) {
      REACT_CTX = ctx
      MODE.mapHome = readMapHome()
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'mindmap: dictionaries')
      const t = ctx.locale.bind(NS)

      ctx.slots.inject('main', () => {
        const dispose = ctx.slots.register({
          name: 'main',
          key: PANEL_ID,
          locale: NS,
          label: () => t('panel'),
          // A non-root child gives this entry the standard SessionProvider and
          // lets the floating window host the official conversation content.
          children: {
            'mindmap.session-host': { kind: 'single', scope: 'session' },
          },
        }, App)
        setTimeout(() => {
          if (!MODE.mapHome || MODE.bypass) return
          try {
            ctx.layout.selectPanel(PANEL_ID)
          } catch {
            // Layout may not have committed the panel registry yet.
          }
        }, 0)
        return dispose
      })

      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: 20,
        locale: NS,
        label: () => t('panel'),
      }, IconMindmap))

      /* In map-home mode a Session selection (left sidebar, search, a plugin)
       * must load the map instead of switching the main panel to conversation.
       * uiWorkspace.openSession already retains/selects the session; only the
       * panel choice is overridden, so the right sidebar follows normally. */
      const workspace = ctx.uiWorkspace
      const originalOpenSession = workspace?.openSession
      if (workspace !== undefined && typeof originalOpenSession === 'function') {
        try {
          workspace.openSession = function guardedOpenSession(target, ...rest) {
            const result = originalOpenSession.apply(this, [target, ...rest])
            if (MODE.mapHome && !MODE.bypass) {
              try {
                ctx.layout.selectPanel(PANEL_ID)
              } catch {
                // The map panel is between registration and layout during HMR.
              }
            }
            return result
          }
          ctx.effect(() => () => {
            if (workspace.openSession !== originalOpenSession) workspace.openSession = originalOpenSession
          }, 'mindmap: openSession guard')
        } catch {
          // A frozen service falls back to the panel-info guard below.
        }
      }

      ctx.effect(() => {
        const info = ctx.layout.panelInfo
        const enforce = () => {
          if (!MODE.mapHome || MODE.bypass) return
          const active = info.getSnapshot().activePanelId
          if (active === null || active === 'conversation') {
            try {
              ctx.layout.selectPanel(PANEL_ID)
            } catch {
              // The main panel is not registered yet; the next change retries.
            }
          }
        }
        const dispose = info.subscribe(enforce)
        enforce()
        return dispose
      }, 'mindmap: map-home guard')
    }

    exports.name = 'mindmap'
    exports.inject = inject
    exports.apply = apply
    exports.__test = {
      buildForest,
      layoutTree,
      edgePath,
      titleOf,
      relTime,
      makeT,
      dictionaries: { zh, en },
      constants: { NODE_W, NODE_H, GAP_X, GAP_Y, PAD, PANEL_ID },
    }
    return module.exports
  },
})
