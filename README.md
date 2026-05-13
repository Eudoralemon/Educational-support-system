# 高中数学轻量错题诊断系统

本项目是一个本机局域网可用的 Next.js Web 应用，面向单教师、多学生的江苏高中数学错题诊断闭环。

## 功能

- 教师登录、学生管理、学生档案
- 错题图片上传、本地保存、人工校对
- 知识点、错误类型、江苏苏教版教材标签
- 学生诊断看板
- 按薄弱知识点生成专项练习包
- 练习包编辑、确认、打印
- AI 任务接口预留；未配置密钥时自动跳过，不外发学生数据或题图

## 教材范围

当前知识点标签参考项目根目录中的四本苏教版教材目录：

- `苏教版高中数学 必修第1册.pdf`
- `苏教版高中数学 必修第2册.pdf`
- `苏教版高中数学 选择性必修1.pdf`
- `苏教版高中数学 选择性必修2.pdf`

PDF 文件仅作为本地参考资料使用，默认不会提交到 GitHub；系统内置的是整理后的教材目录级知识点标签。

## 运行

```powershell
npm.cmd install
npm.cmd run setup
npm.cmd run dev
```

打开：

```text
http://localhost:3000/login
```

示例登录：

```text
教师姓名：示例教师
登录标识：demo
```

局域网访问时，将 `localhost` 换成本机 IP。开发脚本已使用 `-H 0.0.0.0` 监听。

## 数据位置

- SQLite 数据库：`prisma/dev.db`
- 题图文件：`uploads/`
- 环境变量：`.env`

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
