# Render 部署说明

这个项目推荐使用 `Docker` 方式部署到 Render。

原因：

- 项目同时依赖 `Python` 后端和 `Node.js` 前端构建
- Docker 可以把“前端构建 + 后端服务”放进同一条部署链路
- 不需要手动拼接复杂的 Build / Start Command

## 一、GitHub 仓库

仓库地址：

- `git@github.com:saikadance/AI-Videode-briefing-analysis.git`

## 二、Render 创建方式

在 Render 后台：

1. 点击 `New +`
2. 选择 `Web Service`
3. 连接 GitHub 仓库 `saikadance/AI-Videode-briefing-analysis`
4. Environment 选择 `Docker`

如果你是手动创建，而不是用 Blueprint：

- `Build Command` 留空
- `Start Command` 留空

因为 Render 会直接使用仓库根目录的 [Dockerfile](<E:\A 弹幕评论复盘\Dockerfile>)。

## 三、基础配置

建议填写：

- `Name`: `bilibili-video-review-studio`
- `Region`: 选离你近的区域
- `Branch`: `main`
- `Plan`: `Free`

## 四、环境变量

在 Render 的 `Environment Variables` 中添加：

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL`
- `BILIBILI_COOKIE`

推荐值：

```env
OPENAI_BASE_URL=https://llm-proxy.tapsvc.com/v1
OPENAI_MODEL=gpt-5.4-mini
```

说明：

- `OPENAI_API_KEY`：填你们内部可用的 key
- `BILIBILI_COOKIE`：填当前可用的 B 站登录 cookie
- 如果 Cookie 失效，线上评论抓取数量会下降

## 五、健康检查

Render 可以把健康检查路径填成：

```text
/api/health
```

## 六、部署完成后

部署成功后，Render 会给你一个固定链接，例如：

```text
https://bilibili-video-review-studio.onrender.com
```

打开后即可直接使用，不再需要本地启动。

## 七、注意事项

- Render 免费服务会休眠，第一次打开可能会慢几十秒
- B 站抓取依赖外部接口，偶发失败时建议重试
- 如果 AI 调用失败，优先检查 `OPENAI_API_KEY` 和 `OPENAI_BASE_URL`
- 如果评论抓取明显变少，优先检查 `BILIBILI_COOKIE` 是否过期
