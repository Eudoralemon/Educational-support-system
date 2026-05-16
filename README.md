# 高中数学轻量错题诊断系统

本项目是一个本机局域网可用的 Next.js Web 应用，面向单教师、多学生的江苏高中数学错题诊断闭环。

快速上手请先阅读 [`USER_GUIDE.md`](USER_GUIDE.md)。

## 功能

- 教师登录、学生管理、学生档案
- 错题图片上传、本地保存、人工校对
- 题干、答案、解析、订正提示四栏图文草稿
- 知识点、错误类型、江苏苏教版教材标签
- 学生诊断看板
- 可登录窗口式复习闭环：支持上学期/寒暑假模式、学生复习频率、掌握度和复习记录
- 按薄弱知识点从四本本地苏教版教材抽取题源并生成专项练习包
- 练习包编辑、题库侧栏选题、确认、打印
- 教师可对教材题源收藏、备注、修订难度、停用，并记录学生题源使用历史
- 本地教材识别状态页，支持 PDF 文本抽取、本地 OCR 识别和低置信题源确认
- AI 任务接口预留；未配置密钥时自动跳过，不外发学生数据或题图

## 教材范围

当前知识点标签参考项目根目录中的四本苏教版教材目录：

- `苏教版高中数学 必修第1册.pdf`
- `苏教版高中数学 必修第2册.pdf`
- `苏教版高中数学 选择性必修1.pdf`
- `苏教版高中数学 选择性必修2.pdf`

PDF 文件仅作为本地参考资料使用，默认不会提交到 GitHub；系统内置的是整理后的教材目录级知识点标签。运行 `npm.cmd run db:seed` 时，如果本机可用 `pdftotext` 且 PDF 文件存在，系统会把本地教材中的“练习/习题”抽取到 SQLite 的教材题源表中，练习包会优先使用这些本地题源。进入“教材识别”页面后，可以重跑本地 PDF 识别；若本机配置了 `pdftoppm` 与 `LOCAL_OCR_COMMAND`，系统会渲染页面图片并尝试本地 OCR，低置信题源可由老师确认后写入题库。

## 启动系统

以下命令需要在项目目录中运行。打开 PowerShell 或命令提示符后，先进入项目目录：

```powershell
cd /d D:\桌面\教学系统
```

如果使用 PowerShell，`cd /d` 不可用时请改用：

```powershell
Set-Location D:\桌面\教学系统
```

### 首次安装或升级后

请按顺序执行下面三步。每一步都要等命令执行完成、命令行回到提示符后，再执行下一步。

1. 安装依赖：

```powershell
npm.cmd install
```

2. 初始化数据库和示例数据：

```powershell
npm.cmd run setup
```

请等到命令执行完成，并且看到命令行回到类似下面的提示符后，再继续下一步：

```text
D:\桌面\教学系统>
```

3. 启动系统：

```powershell
npm.cmd run dev
```

启动成功后，命令行窗口会显示类似内容：

```text
Local:   http://localhost:3000
Ready
```

这时打开：

```text
http://localhost:3000/login
```

启动服务的命令行窗口需要保持打开；关闭这个窗口，系统就会停止。

### 登录账号

打开登录页后填写：

- 教师姓名：`示例教师`
- 登录标识：`demo`

局域网访问时，将 `localhost` 换成本机 IP。开发脚本已使用 `-H 0.0.0.0` 监听。

### 日常启动

如果已经安装并初始化过，平时只需要进入项目目录后运行：

```powershell
npm.cmd run dev
```

然后打开 `http://localhost:3000/login`。

### 停止系统

在运行 `npm.cmd run dev` 的命令行窗口中按：

```text
Ctrl + C
```

出现确认提示时输入 `Y` 并回车。

### 常见问题

如果浏览器提示无法访问 `localhost:3000`，先检查运行 `npm.cmd run dev` 的窗口是否还在，并且是否显示 `Ready`。如果没有这个窗口，说明系统服务没有启动，请重新运行 `npm.cmd run dev`。

不要在 `npm.cmd run setup` 还没结束时输入 `npm.cmd run dev`。`setup` 只负责准备数据库，不会启动网页服务。

如果 `setup`、`build` 或 `db:push` 出现 Prisma DLL 被占用、`EPERM`、`query_engine-windows.dll.node` 等错误，请先关闭正在运行的 `npm.cmd run dev` 或 `npm.cmd run start` 窗口，再重新执行命令。

如果提示端口 `3000` 已被占用，通常是旧的开发服务还在运行。先在旧窗口按 `Ctrl + C` 停止，或者重启电脑后再运行 `npm.cmd run dev`。

## 数据位置

- SQLite 数据库：`prisma/dev.db`
- 题图文件：`uploads/`
- OCR 临时图片：`tmp/textbook-ocr/`
- 环境变量：`.env`
- 教材题源：运行 seed 后写入本地 SQLite，不上传到 GitHub

## 常用命令

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd run db:push
npm.cmd run db:seed
npm.cmd run start
```

生产构建后可用：

```powershell
npm.cmd run start
```
