# 发布到 DSH 插件市场

DSH 的插件市场（`dshmarket`）本身**不接收投稿**。它每次打开时读取
[awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
生成的目录；上架的唯一入口是向这个目录仓库提一个 PR，添加**一个**
`data/plugins/<owner>__<repo>.yml`。

官方规则以该仓库的
[contributing.md](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)
为准。本文只记录本插件的具体步骤和已经踩到的坑。

---

## 0. 先看结论：当前 npm 名字已被占用

`dsh-mindmap` 这个 npm 包名**不能再用**：

- npm 上已有 `dsh-mindmap`（`guhanfei-ai/dsh-mindmap`，0.18.x），是“Markdown 文件即脑图”的另一个插件；
- 市场目录里已有 4 个仓库叫 `dsh-mindmap`（`guhanfei-ai`、`LoongYun`、`Xiao-53`、`IsaacHuo`），其中两个已发布 scoped npm 包；
- 还有一个 `dsh-session-mindmap`（`jianyuepei/dsh-session-mindmap`），做的是“把会话导出成静态 HTML 脑图”，和本插件相邻但不同。

所以直接在当前目录 `npm publish` 会失败。发布前必须二选一：

| 方案 | 包名 | 说明 |
|---|---|---|
| **推荐：换一个唯一名字** | `dsh-topic-tree` | 目前 npm 404、目录中没有同名条目；和“话题树”语义一致 |
| 保留 `dsh-mindmap` 字样 | `@<你的npm用户名>/dsh-mindmap` | 需要 scope；市场仍可收录，但安装命令变成 scoped 包名 |

下面以 `dsh-topic-tree` 为例。当前开发目录可以继续叫 `dsh-mindmap`，**发布副本**再改名；
不要把现有 desktop 安装目录直接改名，否则当前 profile 的挂载行会找不到包。

---

## 1. 当前仓库已经满足/需要补的东西

| 市场要求 | 当前状态 |
|---|---|
| `package.json` 声明 `dsh.bundle.patch` | ✅ 已有 |
| 仓库根有 `cordis.patch.yml`，且有一行 `insert` | ✅ 已有 |
| `dsh.client.platform = "web"` | ✅ 已有 |
| 真实可运行代码，不是占位包 | ✅ 已有 |
| 官方 `@deepseek-ai/*` 放在 `peerDependencies` | ✅ 已有，且已补预发布分支（0.2.1-rc.3 可满足） |
| `screenshots.json` | ✅ 已添加（`docs/preview-float.png`、`docs/preview.png`） |
| `LICENSE` | ✅ 已添加（MIT） |
| npm `name` 唯一 | ❌ 当前 `dsh-mindmap` 被占用，需改名/加 scope |
| `package.json` 的 `repository` 指回 GitHub 仓库 | ❌ 还没有 GitHub 仓库，需补 |
| GitHub 仓库创建满 1 天、带 `dsh-plugin` topic | ❌ 还没有仓库 |
| 描述与实际功能一致 | ⚠️ 提交前按当前 0.7.0 功能再核对一遍 |

`peerDependencies` 里已经用了显式预发布分支，例如：

```json
">=0.2.0-rc.1 <0.3.0-0 || >=0.2.1-rc.1 <0.3.0-0 || >=0.2.2-rc.1 <0.3.0-0 || >=0.2.3-rc.1 <0.3.0-0"
```

这样 `0.2.1-rc.3` 不会被 node-semver 静默排除。

---

## 2. 生成发布副本并改名

在仓库根执行（路径按自己的改）：

```powershell
$src = 'D:\Projects\DSH-TREE\dsh-mindmap'
$out = 'D:\Projects\dsh-topic-tree'
robocopy $src $out /E /XD node_modules /XF *.tgz
```

然后：

```powershell
cd $out
npm pkg set name=dsh-topic-tree
npm pkg set version=0.7.0
npm pkg set repository.type=git
npm pkg set repository.url=git+https://github.com/<owner>/dsh-topic-tree.git
npm pkg set homepage=https://github.com/<owner>/dsh-topic-tree#readme
npm pkg set bugs.url=https://github.com/<owner>/dsh-topic-tree/issues
```

把 `cordis.patch.yml` 的挂载名改成同一个包名：

```yaml
- insert:
    - id: mindmap
      name: 'dsh-topic-tree'
      config:
        autoSummarize: true
```

`package.json` 的 `files` 里如果还保留 `install.ps1`，要么把脚本里的
`dsh-mindmap` 路径一起改掉，要么从发布副本里删掉这个文件（npm 安装不需要它）。
README 里的安装命令也建议同步改成新包名。

检查打包内容：

```powershell
npm pack --dry-run --json
```

应该只包含 `lib/`、`cordis.patch.yml`、`README.md`、`LICENSE`、
`screenshots.json`、`docs/` 和 `package.json`；**不能**把
`node_modules/`、测试临时文件、`test-output/` 打进去。

---

## 3. 建 GitHub 仓库

发布副本本身就是仓库根（`package.json` 在根目录，不能放在子目录里再靠 monorepo 规则）：

```powershell
cd D:\Projects\dsh-topic-tree
git init
git add .
git commit -m "feat: initial dsh-topic-tree"
git branch -M main
git remote add origin https://github.com/<owner>/dsh-topic-tree.git
git push -u origin main
```

然后：

- 在 GitHub 仓库设置里加 topic **`dsh-plugin`**（硬性要求）；
- 确认仓库是 public；
- 仓库创建后**至少等 1 天**再提市场 PR（CI 检查仓库年龄）；
- 可选：在 `docs/icon-180.png` 放一张方形 PNG，市场卡片会用它，否则回退到 GitHub 头像。

---

## 4. 发布 npm（推荐）

npm 发布后，市场会优先走预构建安装，并显示 30 天下载量；目录里的 npm 映射是
**自动**读取的，不需要在 YAML 里写 `npm:`（写了反而会被校验拒绝）。

```powershell
cd D:\Projects\dsh-topic-tree
npm publish --access public
npm view dsh-topic-tree version repository
```

`repository` 必须指回第 3 步的 GitHub 仓库，否则 npm 包和目录条目不会关联。
然后在一个临时 profile 里验证安装：

```powershell
dsh plugin --profile <test-profile> add dsh-topic-tree
```

### 不发 npm 的备选

把 `npm pack` 生成的 `.tgz` 挂到 GitHub Release，然后在目录 YAML 里加
`tarball:`。两种写法只能选一种，别写坏：

```yaml
# 推荐：钉 tag，文件名带版本，永不腐烂
tarball: https://github.com/<owner>/dsh-topic-tree/releases/download/v0.7.0/dsh-topic-tree-0.7.0.tgz
```

或者：

```yaml
# latest + 资产名不带版本号；下次发版仍能解析
tarball: https://github.com/<owner>/dsh-topic-tree/releases/latest/download/dsh-topic-tree.tgz
```

**不要**写 `latest/download/dsh-topic-tree-0.7.0.tgz`：下次发版就会 404。

---

## 5. 向 awesome-dsh-plugin 提 PR

Fork 并 clone：

```powershell
git clone https://github.com/<your-github>/awesome-dsh-plugin.git
cd awesome-dsh-plugin
git checkout -b add-dsh-topic-tree
```

新建**一个**文件：

```text
data/plugins/<owner>__dsh-topic-tree.yml
```

内容（把 `<owner>` 换成 GitHub 用户名；描述含 `: ` 必须加引号）：

```yaml
url: https://github.com/<owner>/dsh-topic-tree
name: <owner>/dsh-topic-tree
category: ui
description:
  en: 'Map-first DSH workspace: the session tree is the main mind map, and a frosted floating conversation creates a child subtopic when you send its first message.'
  zh: '把 DSH 主面板变成会话树思维导图，并用毛玻璃浮窗对话；在浮窗里发送第一条消息会生成子话题节点。'
# 可选，GitHub 托管的方形 PNG
# icon: https://raw.githubusercontent.com/<owner>/dsh-topic-tree/main/docs/icon-180.png
```

然后：

```powershell
git add data/plugins/<owner>__dsh-topic-tree.yml
git commit -m "Add dsh-topic-tree"
git push origin add-dsh-topic-tree
```

去 `awesome-dsh-plugin/awesome-dsh-plugin` 开 PR：

- **只改这一个文件**；不要手工改生成的 README，也不要动别人的条目；
- PR 标题例如 `Add dsh-topic-tree`；
- 正文说明：插件做什么、和已有 `dsh-session-mindmap` 的区别（本插件是实时会话树 + 主面板 + 浮窗子话题，不是静态 HTML 导出）、已发布 npm 版本；
- 不要向 `dsh-market/dsh-market` 提条目，那个仓库只是市场前端。

CI 会依次检查：条目数 ≤ 3、目标仓库有 `dsh.bundle`、仓库满 1 天、
`awesome-lint`/站点构建。失败会在 PR 里指出，改同一分支再推即可。

---

## 6. 合并之后

目录合并后，市场下一次拉取 `plugins.json`（通常一天内）就能搜到。
在 DSH 里：

1. 打开 **设置 → 插件市场**（DSH 0.2.1 起在账号菜单里）；
2. 搜索 `Topic Tree` / `dsh-topic-tree`；
3. 一键安装；
4. 安装后刷新页面。

安装命令等价于：

```powershell
dsh plugin --profile web add dsh-topic-tree
```

### 后续更新

- **npm 路线**：`npm version patch && npm publish` 即可；目录里的 npm 映射会自动指向新版，不需要再改 YAML。
- **tarball 路线**：每次 Release 更新 `tarball:`，或使用 `latest/download/` + 不带版本号的资产名。
- 已经发布的 Release/tag **永远不要删除或改写**，否则老用户安装会断链。

---

## 7. 提交前检查清单

```text
[ ] npm 包名唯一（当前 dsh-mindmap 已被占用）
[ ] package.json repository 指回 GitHub 仓库
[ ] cordis.patch.yml 的 insert name = npm 包名
[ ] dsh.bundle.patch 和 dsh.client.platform 都在
[ ] npm pack --dry-run 没有 node_modules / test-output
[ ] GitHub public + dsh-plugin topic + 创建满 1 天
[ ] 描述只写实际做到的功能，不夸大
[ ] 只新增 data/plugins/<owner>__<repo>.yml 一个文件
[ ] 不向 dsh-market 仓库提条目
```

## 参考

- 目录仓库：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>
- 贡献指南：<https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md>
- 市场前端：<https://github.com/dsh-market/dsh-market>
- 目录线上数据：<https://awesome-dsh-plugin.com/plugins.json>
- npm 名字占用：<https://www.npmjs.com/package/dsh-mindmap>
