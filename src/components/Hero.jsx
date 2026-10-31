import { useEffect, useRef } from "react";

export default function Hero() {
  const frameRef = useRef(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const motionOk = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!motionOk) return;

    function onMove(event) {
      const rect = frame.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      frame.style.transform =
        "perspective(900px) rotateY(" + (x * 7).toFixed(2) + "deg) rotateX(" + (-y * 7).toFixed(2) + "deg)";
    }
    function onLeave() {
      frame.style.transform = "";
    }
    frame.addEventListener("mousemove", onMove);
    frame.addEventListener("mouseleave", onLeave);
    return () => {
      frame.removeEventListener("mousemove", onMove);
      frame.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <section className="hero">
      <div className="hero-copy">
        <p className="kicker">Эльмира Манаповна · Караганда, 26 ноября 1982</p>
        <h1>
          Эльмира
          <br />
          Исаханова
        </h1>
        <ul className="tags">
          <li>Коммуникации</li>
          <li>Телеведущая</li>
          <li>PR</li>
          <li>Документалистика</li>
          <li>Скоро книга</li>
        </ul>
        <p className="lead">
          Двадцать лет в прямом эфире научили находить историю в каждом моменте. С микрофона я перешла к
          тексту, пресс-службе и кадру, который снимаю сама.
        </p>
        <div className="hero-actions">
          <a className="btn gold" href="#resume">
            Смотреть резюме
          </a>
          <a className="btn ghost" href="https://www.instagram.com/elmira_issakhanova/" target="_blank" rel="noopener">
            Instagram
          </a>
        </div>
      </div>
      <figure className="frame" ref={frameRef}>
        <img src="/img/hero.jpg" alt="Эльмира Исаханова, селфи в сером пальто" />
        <figcaption>
          <span>REC</span>
          <strong>Эльмира Исаханова</strong>
          <em>Руководитель пресс-службы · ТОО «Евразия Инвест LTD»</em>
        </figcaption>
      </figure>
    </section>
  );
}
