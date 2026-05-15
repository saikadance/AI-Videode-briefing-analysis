# Bilibili Video Review Studio

一个用于读取 B 站评论和弹幕，并输出视频内容复盘结果的本地 Web 工具。

当前版本已经搭好基础环境与最小可用功能：

- 直接输入 B 站视频链接或 BV 号，自动抓取视频信息、评论和弹幕
- 导入评论文件，统计高频词、正负向评价和代表性观点
- 导入弹幕文件，生成按秒统计的密度时间轴
- 在主页面直接粘贴视频文案 / 文稿，调用 GPT 做媒体运营视角的专业点评
- 支持时间轴缩放与秒 / 分钟级聚合切换
- 自动识别高密度弹幕区间，并对区间内容做重点总结
- 可选接入 OpenAI 兼容接口生成 AI 复盘摘要

## 项目结构

- `frontend/`: React + Vite + TypeScript Web UI
- `backend/`: Flask 分析与本地网页服务
- `skills/video-copy-analyst/`: 文案文稿分析用的本地 skill
- `docs/plan.md`: 产品与实施计划

## 支持的数据来源

推荐直接输入 B 站视频链接或 BV 号，系统会自动抓取：

- 视频基本信息
- 评论内容
- 分段弹幕数据

也保留本地文件导入模式，适合补充数据或离线分析。

文案分析模式适合直接粘贴：

- 视频脚本
- 口播文案
- 采访稿
- 选题包装方案
- 标题 / 开头钩子草稿

## 支持的数据格式

评论文件：

- `.json`: 数组格式，字段可为 `content` / `message` / `text` / `comment`
- `.csv`: 至少包含上面任意一个文本字段

弹幕文件：

- `.xml`: 兼容 B 站常见弹幕 XML，解析 `d[@p]`
- `.json`: 数组格式，字段可为 `content` / `text`，时间字段可为 `time` / `progress` / `timestamp`

## 后端环境变量

复制 `backend/.env.example` 为 `backend/.env`，然后填入你的接口配置：

```env
OPENAI_API_KEY=YOUR_API_KEY
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-5.4-mini
```

如果你们内部服务兼容标准 OpenAI 地址写法，这样只填 key 和模型就能直接用。
如果后续你们有自己的兼容网关地址，再把 `OPENAI_BASE_URL` 改掉即可。

## 启动方式

后端：

```powershell
cd "E:\A 弹幕评论复盘\backend"
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m app.main
```

前端：

```powershell
cd "E:\A 弹幕评论复盘\frontend"
npm install
npm run dev
```

浏览器访问：

- `http://127.0.0.1:8000`

也可以直接双击根目录下的 `start_app.cmd` 一键启动。
这个脚本会构建前端后由后端直接提供网页，因此默认只保留一个运行窗口。

## Render 部署

这个项目已经补好 Docker 部署骨架，推荐直接部署到 Render。

- 入口文件：[Dockerfile](<E:\A 弹幕评论复盘\Dockerfile>)
- Render 配置样例：[render.yaml](<E:\A 弹幕评论复盘\render.yaml>)
- 详细步骤：[docs/render-deploy.md](<E:\A 弹幕评论复盘\docs\render-deploy.md>)

## 当前默认分析策略

- 评论分析：`jieba` 分词 + 停用词过滤 + 轻量正负向词典打分
- 弹幕分析：按秒聚合密度，自动检测高峰区间，提取区间高频词与代表性弹幕
- AI 总结：将统计结果压缩后提交给兼容 Chat Completions 的模型
- 文案分析：读取 `skills/video-copy-analyst/SKILL.md` 作为系统提示词，从专业视频媒体运营视角点评文案的钩子、结构、包装和留存风险

## 下一步建议

- 增加情绪趋势分段图
- 增加“高能片段”片段卡片与导出报告
- 支持可选 Cookie，提高部分视频评论抓取成功率
- 接入用户自定义词典与行业术语
