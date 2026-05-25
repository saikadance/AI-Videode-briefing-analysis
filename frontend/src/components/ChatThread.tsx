import { useEffect, useMemo, useState } from "react";
import { ProjectMessage } from "../types";

interface ChatThreadProps {
  messages: ProjectMessage[];
}

export function ChatThread({ messages }: ChatThreadProps) {
  const groups = useMemo(() => groupMessagesByDay(messages), [messages]);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCollapsedGroups((current) => {
      const next: Record<string, boolean> = {};
      groups.forEach((group, index) => {
        next[group.key] = current[group.key] ?? index < groups.length - 1;
      });
      return next;
    });
  }, [groups]);

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((current) => ({
      ...current,
      [groupKey]: !current[groupKey],
    }));
  };

  return (
    <section className="panel chat-thread-panel">
      <div className="panel-header">
        <div className="stack compact">
          <span className="section-kicker">项目记录</span>
          <h3>对话与分析历史</h3>
        </div>
        {groups.length > 1 ? (
          <button className="summary-nav-button" type="button" onClick={() => setCollapsedGroups({})}>
            展开全部
          </button>
        ) : null}
      </div>

      {messages.length ? (
        <div className="chat-thread">
          {groups.map((group) => {
            const collapsed = collapsedGroups[group.key];
            return (
              <section className="chat-group" key={group.key}>
                <button className="chat-group-toggle" type="button" onClick={() => toggleGroup(group.key)}>
                  <strong>{group.label}</strong>
                  <span>{collapsed ? `展开 ${group.messages.length} 条` : `收起 ${group.messages.length} 条`}</span>
                </button>

                {!collapsed ? (
                  <div className="chat-group-body">
                    {group.messages.map((message) => (
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
                ) : null}
              </section>
            );
          })}
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

function groupMessagesByDay(messages: ProjectMessage[]) {
  const groups = new Map<string, { key: string; label: string; messages: ProjectMessage[] }>();

  messages.forEach((message) => {
    const date = new Date(message.createdAt);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: date.toLocaleDateString("zh-CN", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
        messages: [],
      });
    }
    groups.get(key)?.messages.push(message);
  });

  return Array.from(groups.values());
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
