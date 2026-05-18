import { ProjectMessage } from "../types";

interface ChatThreadProps {
  messages: ProjectMessage[];
}

export function ChatThread({ messages }: ChatThreadProps) {
  return (
    <section className="panel chat-thread-panel">
      <div className="panel-header">
        <div className="stack compact">
          <span className="section-kicker">项目记录</span>
          <h3>对话与分析历史</h3>
        </div>
      </div>

      {messages.length ? (
        <div className="chat-thread">
          {messages.map((message) => (
            <article className={message.role === "assistant" ? "chat-bubble assistant" : "chat-bubble user"} key={message.id}>
              <div className="chat-bubble-header">
                <strong>
                  {message.role === "assistant" ? "AI 助手" : "你"}
                  {message.source !== "chat" ? ` · ${getSourceLabel(message.source)}` : ""}
                </strong>
                <span>{new Date(message.createdAt).toLocaleString("zh-CN")}</span>
              </div>
              <div className="chat-bubble-body">
                <p>{message.content}</p>
              </div>
              {message.attachments.length ? (
                <div className="chat-history-attachments">
                  {message.attachments.map((attachment) => (
                    <figure className="chat-history-attachment" key={attachment.id}>
                      <img alt={attachment.name} src={attachment.dataUrl} />
                      <figcaption>
                        <strong>{attachment.name}</strong>
                        <span>{attachment.kind === "data" ? "数据截图" : "参考图片"}</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <div className="project-empty">
          <h3>还没有项目对话</h3>
          <p>先运行一次文稿分析，或者直接在下面输入你的追问与修改需求，后续这个项目会一直把结果保存在当前浏览器里。</p>
        </div>
      )}
    </section>
  );
}

function getSourceLabel(source: ProjectMessage["source"]) {
  switch (source) {
    case "copy-analysis":
      return "文稿分析";
    case "metrics-analysis":
      return "数据截图";
    case "community-analysis":
      return "评论弹幕";
    default:
      return "对话";
  }
}
