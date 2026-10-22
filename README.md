# dsh-image-zoom

Trackpad pinch zoom and native scroll panning for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) image previews.

给 DSH 的图片预览加上「捏合缩放 + 原生滑动平移」。

## 特性

- **捏合缩放**：1×–8×，以指针位置为锚点；macOS 触控板捏合在 Chromium 里以 `ctrl + wheel` 送达
- **原生平移**：缩放后双指滑动，走原生滚动容器，速度和惯性跟系统滚动区一致，没有自造惯性
- **Esc**：放大状态下先回到 100%，已经在 100% 时关闭预览；右上角也有关闭按钮
- **SVG 清晰**：按布局尺寸放大，浏览器会重新矢量绘制，不会把 SVG 栅格化后拉糊
- 无百分比条、无提示文字，保持干净
- 覆盖聊天里的附件图片、Markdown 内嵌图片、工具结果图片，以及输入框里待发送图片的预览

## 安装

需要能运行 DSH Web GUI 的 profile。

1. 把仓库克隆到本地插件目录（或任意位置）：

   ```sh
   git clone https://github.com/Howard0924/dsh-image-zoom.git ~/.dsh/plugins/dsh-image-zoom
   ```

2. 在 profile 里安装这个目录：

   ```sh
   dsh plugin --profile <profile> add ~/.dsh/plugins/dsh-image-zoom
   ```

   也可以让 DSH 的 `plugin_manager` 调用 `install_bundle`，目标传这个目录；或者使用插件管理页面安装本地目录。

3. 刷新一次 Web GUI（`⌘R`）。

客户端插件安装/升级后需要页面重新加载才能生效。

## 使用

| 操作 | 行为 |
| --- | --- |
| 点聊天里的图片 | 打开缩放查看器 |
| 触控板捏合 | 以指针为中心缩放，最大 8× |
| 缩放后双指滑动 | 平移（原生滚动） |
| `Esc` | 放大时复位，已复位时关闭 |
| 点图片外的空白处 / 右上角 × | 关闭 |

## 实现方式

### 1. 图片槽位

`client.js` 在四个官方图片槽位上以 `priority: 50` 注册，覆盖官方 `priority: 100` 的附件画廊：

```
conversation.chat.message.images
conversation.chat.user.images
conversation.trajectory.images
tool.call.images
```

单值槽位规则是「priority 最低者渲染」。画廊组件 `ImageZoomGallery` / `GalleryImage` 负责缩略图尺寸、加载与失败重试。

### 2. Markdown 图片点击拦截

聊天里的 Markdown 图片由共享渲染器绘制，不经过上面的槽位，点击会打开它自带的 lightbox。`installImageClickInterception()` 在 `window` 捕获阶段监听 `click`，命中聊天区域里的 `<img>` 时阻止原事件并打开本插件的查看器：

- 只处理 `PREVIEWABLE_SLOTS` 内的图片
- 跳过链接里的图片、我们查看器自身的图片，以及小于 48px 的图标
- 不依赖 DSH 的哈希 class 名，只依赖稳定的 `data-slot` 槽位名

### 3. 查看器

查看器渲染在 `shell.overlay` 槽位，通过模块内的一个小 store 与画廊通信。结构：

```
.dshIz_backdrop          固定满屏 + 官方遮罩 token
  .dshIz_stage
    .dshIz_scroll        原生滚动容器（隐藏滚动条，overscroll-behavior: contain）
      .dshIz_center      max-content 居中
        img.dshIz_image  宽高 = 基准尺寸 × 缩放倍数
    button.dshIz_close   右上角关闭
```

缩放不使用 `transform: scale()`，而是修改 `<img>` 的布局宽高：SVG 会按新尺寸重新绘制。缩放后通过调整原生 `scrollLeft/scrollTop` 让指针下的内容保持在指针下方，因此平移和缩放都保留原生手感。

基准尺寸在图片加载后按 `naturalWidth/Height` 与可用视口计算，不会放大超过原始尺寸。

## 目录

| 文件 | 作用 |
| --- | --- |
| `client.js` | 全部 UI：画廊、点击拦截、查看器、样式、文案 |
| `index.js` | Host 侧空壳 |
| `cordis.patch.yml` | 插入 `image-zoom` 插件行 |
| `locale/*.json` | 插件管理里的标题与描述 |
| `icon.svg` | 图标 |
| `package.json` | 导出、bundle、客户端入口 |

## 可调参数

| 想改什么 | 位置 |
| --- | --- |
| 最大放大倍数 | `client.js` 的 `MAX_SCALE`（默认 8） |
| 捏合灵敏度 | `onWheel` 中的 `Math.exp(-event.deltaY * 0.008)` |
| 单次缩放限幅 | 同处 `Math.min(1.25, Math.max(0.8, ...))` |
| 接管哪些图片 | `PREVIEWABLE_SLOTS` 与拦截器里的尺寸判断 |
| 遮罩、圆角、阴影 | `CSS` 数组，全部使用 `--dsw-alias-*` / `--dsw-radius-*` token |
| 界面文案 | `DICTS` 与 `locale/*.json` |

## 开发

- 修改 `client.js` 后客户端 HMR 会轮询文件并热替换模块；若页面无反应，刷新一次
- 提交前做语法检查：`node --check client.js`
- 用 DSH 的 `Slots.listSubTree` 查看槽位占用者，例如 `conversation.chat.message.images` 应显示 `priority: 50` 为 active
- 本插件不依赖任何 DSH Client 包；共享 primitives 是冻结的，不要尝试直接覆盖

## 限制

- 只接管会话里的图片预览；右侧栏的文件/文档预览仍使用 DSH 自带查看器
- 位图放大仍受源分辨率限制，只有 SVG 能做到无限清晰
- 触屏设备使用 Pointer Events 做双指缩放，但主要针对 macOS 触控板设计

## License

[MIT](LICENSE)
