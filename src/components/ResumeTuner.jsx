import { useState } from "react";
import { channels } from "../data/career.js";
import { useReveal } from "../hooks/useReveal.js";

export default function ResumeTuner() {
  const [active, setActive] = useState("1");
  const ref = useReveal();

  return (
    <section className="resume reveal" id="resume" ref={ref}>
      <p className="label">Резюме</p>
      <h2>Переключите канал</h2>
      <p className="note">Каждый этап — отдельный канал. Нажмите номер или строку в сетке.</p>

      <div className="tuner">
        <div className="screen" aria-live="polite">
          {channels.map((channel) => (
            <article
              key={channel.id}
              className={"panel" + (active === channel.id ? " is-on" : "")}
              data-panel={channel.id}
            >
              <p className="ch">{channel.ch}</p>
              <h3>{channel.period}</h3>
              <p className="place">{channel.place}</p>
              <p className="role">{channel.role}</p>
              <p>{channel.text}</p>
            </article>
          ))}
        </div>
        <div className="keys" role="group" aria-label="Каналы карьеры">
          {channels.map((channel) => (
            <button
              key={channel.id}
              type="button"
              className={active === channel.id ? "is-on" : undefined}
              aria-pressed={active === channel.id}
              onClick={() => setActive(channel.id)}
            >
              {channel.id}
            </button>
          ))}
        </div>
      </div>

      <ol className="guide">
        {channels.map((channel) => (
          <li key={channel.id}>
            <button
              type="button"
              className={active === channel.id ? "is-on" : undefined}
              aria-pressed={active === channel.id}
              onClick={() => setActive(channel.id)}
            >
              <time>{channel.period}</time>
              <span>{channel.placeShort}</span>
              <small>{channel.roleShort}</small>
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}
