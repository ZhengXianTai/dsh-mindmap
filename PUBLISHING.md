# 发布到 DSH 插件市场

DSH 的插件市场（`dshmarket`）本身**不接收投稿**。它每次打开时读取
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
生成的目录；上架的唯一入口是向这个目录仓库提一个 PR，添加**一个**
`data/plugins/<owner>__<repo>.yml`。

官方规则以该仓库的
[contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)
为准。

---

## 0. 本插件的发布身份

| 项目 | 值 |
|---|---|
| GitHub 仓库 | <https://github.com/ZhengXianTai/dsh-mindmap> |
| 市场展示名 | `ZhengXianTai/dsh-mindmap` |
| npm 包名 | `@zhengxiantai/dsh-mindmap` |
| 目录条目文件 | `data/plugins/ZhengXianTai__dsh-mindmap.yml` |
| 安装命令 | `dsh plugin --profile web add @zhengxiantai/dsh-mindmap` |

**为什么 npm 要加 scope：** unscoped 的 `dsh-mindmap` 已被
`guhanfei-ai/dsh-mindmap` 占用，不能重复发布。市场搜索用的是目录条目的
`name: ZhengXianTai/dsh-mindmap` 和描述，不是 npm 包名，所以加 scope
不会影响 `dsh-mindmap` 的搜索曝光。

---

## 1. 当前状态

| 市场要求 | 状态 |
|---|---|
| `package.json` 声明 `dsh.bundle.patch` | ✅ |
| 仓库根有 `cordis.patch.yml`，且有一行 `insert` | ✅ |
| `dsh.client.platform = "web"` | ✅ |
| 真实可运行代码 | ✅ |
| 官方 `@deepseek-ai/*` 放在 `peerDependencies`，含预发布分支 | ✅ |
| `screenshots.json` / `LICENSE` | ✅ |
| npm 包名唯一 | ✅ `@zhengxiantai/dsh-mindmap` |
| `repository` 指回 GitHub | ✅ |
| GitHub 仓库已有第一个 commit | ✅ `f4a39e4` 起 |
| GitHub 仓库加 `dsh-plugin` topic | ✅ 已通过 API 设置 |
| GitHub 仓库创建满 1 天 | ✅（2026-11-23 创建） |
| npm 登录 | ✅ `npm whoami` = `zhengxiantai` |
| npm 发布 | ✅ `0.7.0` 已发布；`0.8.0` 待发布 |
| 市场目录 PR | ✅ [#18800](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/pull/18800)（仅 1 个文件） |

`peerDependencies` 使用显式预发布分支，例如：

```json
">=0.2.0-rc.1 <0.3.0-0 || >=0.2.1-rc.1 <0.3.0-0 || >=0.2.2-rc.1 <0.3.0-0 || >=0.2.3-rc.1 <0.3.0-0"
```

这样 `0.2.1-rc.3` 不会被 node-semver 静默排除。

---

## 2. 发布 npm 包

项目根已有 `.npmrc`：

```ini
registry=https://registry.npmjs.org/
```

`package.json` 里也有：

```json
"publishConfig": {
  "access": "public",
  "registry": "https://registry.npmjs.org/"
}
```

确认登录和包内容：

```powershell
cd D:\Projects\DSH-TREE\dsh-mindmap
npm whoami
npm pack --dry-run
```

`npm pack --dry-run` 应该只包含 `lib/`、`cordis.patch.yml`、README、
LICENSE、PUBLISHING、screenshots、docs 和 package.json；不能有
`node_modules/`、`test-output/` 或 `.tgz`。

发布：

```powershell
npm publish --access public
```

发布后验证：

```powershell
npm view @zhengxiantai/dsh-mindmap version repository
```

npm 11 对新包返回 `202 Accepted`，会提示 “being processed and may take a few minutes”；通常 1–3 分钟后 `npm view` 才能查到，未立即出现不是失败。

如果 npm 提示 OTP，输入验证器里的 6 位码即可。**recovery code 只有在
验证器丢失时才使用，用一次就作废，不要提交到仓库。**

### 更新版本

```powershell
npm version patch
npm publish --access public
```

npm 路线不需要再改目录 YAML；市场会按仓库的 `repository` 字段自动映射到
新版本。

### 不发 npm 的备选

如果以后改成 GitHub Release tarball，把 `.tgz` 挂到 Release，并在目录
条目里加 `tarball:`。推荐钉 tag：

```yaml
tarball: https://github.com/ZhengXianTai/dsh-mindmap/releases/download/v0.7.0/dsh-mindmap-0.7.0.tgz
```

不要写 `latest/download/dsh-mindmap-0.7.0.tgz`，下次发版会 404。

---

## 3. GitHub 仓库设置

仓库已经创建并推送了第一个 commit，不再需要新建仓库。

### 添加 Topics

在仓库首页右侧 **About** 区域点齿轮/铅笔（Edit repository details），在
**Topics** 里添加并保存：

```text
dsh-plugin
deepseek-harness
dsh
mindmap
mind-map
session-tree
subtopic
floating-window
javascript
```

`dsh-plugin` 是市场收录的硬性要求。

### 仓库年龄

仓库创建于 **2026-11-23 22:09（本地时间）**；市场 CI 要求创建满 1 天，
所以最早 **2026-11-24 22:09 之后**再提目录 PR。

### 推送

仓库本地已配置 `http.version = HTTP/1.1`，GitHub 网络不稳时优先用它：

```powershell
git -c http.version=HTTP/1.1 push
```

---

## 4. 提目录 PR

Fork 并 clone：

```powershell
git clone https://github.com/<your-github>/awesome-dsh-plugin.git
cd awesome-dsh-plugin
git checkout -b add-zhengxiantai-dsh-mindmap
```

新建**一个**文件：

```text
data/plugins/ZhengXianTai__dsh-mindmap.yml
```

内容：

```yaml
url: https://github.com/ZhengXianTai/dsh-mindmap
name: ZhengXianTai/dsh-mindmap
category: ui
description:
  en: 'A map-first DeepSeek Harness (DSH) plugin: the session tree is the main mind map, and a frosted floating chat forks a child subtopic when you send its first message.'
  zh: 'DeepSeek Harness（DSH）插件：会话树就是主面板思维导图；在毛玻璃浮窗里发送第一条消息，会生成子话题节点。'
# icon: https://raw.githubusercontent.com/ZhengXianTai/dsh-mindmap/main/docs/icon-180.png
```

然后：

```powershell
git add data/plugins/ZhengXianTai__dsh-mindmap.yml
git commit -m "Add ZhengXianTai/dsh-mindmap"
git push origin add-zhengxiantai-dsh-mindmap
```

去 <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin> 开 PR：

- 只改这一个文件，不要手改生成的 README，不要动别人的条目；
- PR 正文说明它和已有 `dsh-session-mindmap` 的区别：本插件是**实时会话树
  + 主面板 + 浮窗输入即 fork 子话题**，不是静态 HTML 导出；
- 不要向 `dsh-market/dsh-market` 提条目。

CI 会检查：条目数 ≤ 3、目标仓库有 `dsh.bundle`、仓库满 1 天、
`awesome-lint`/站点构建。失败会在 PR 里指出，同一分支推修复即可。

---

## 5. 合并之后

目录合并后，市场下一次拉取 `plugins.json`（通常一天内）就能搜到：

1. **Settings → Plugin Market**（DSH 0.2.1 起 Settings 在账号菜单里）；
2. 搜 `dsh-mindmap` / `ZhengXianTai`；
3. 一键安装，刷新页面。

等价命令：

```powershell
dsh plugin --profile web add @zhengxiantai/dsh-mindmap
```

---

## 6. 提交前检查清单

```text
[ ] package.json name = @zhengxiantai/dsh-mindmap
[ ] cordis.patch.yml insert.name = @zhengxiantai/dsh-mindmap
[ ] package.json repository 指回 GitHub
[ ] npm whoami = zhengxiantai
[ ] npm pack --dry-run 没有 node_modules / test-output
[ ] npm publish 成功，npm view 能查到 version
[ ] GitHub 仓库 public + dsh-plugin topic + 创建满 1 天
[ ] 描述只写实际做到的功能，不夸大
[ ] 只新增 data/plugins/ZhengXianTai__dsh-mindmap.yml 一个文件
[ ] 不向 dsh-market 仓库提条目
```

## 参考

- 目录仓库：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>
- 贡献指南：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md>
- 市场前端：<https://github.com/dsh-market/dsh-market>
- 目录线上数据：<https://awesome-dsh-plugin.com/plugins.json>
- npm 包：<https://www.npmjs.com/package/@zhengxiantai/dsh-mindmap>
