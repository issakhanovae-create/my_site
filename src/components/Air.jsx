import { awards, programs } from "../data/career.js";
import { useReveal } from "../hooks/useReveal.js";

export default function Air() {
  const ref = useReveal();

  return (
    <section className="air reveal" id="air" ref={ref}>
      <p className="label">Эфир · 2010–2018</p>
      <h2>Программы, которые вела</h2>
      <ul className="tapes">
        {programs.map((program) => (
          <li key={program.title}>
            <h3>{program.title}</h3>
            <p>{program.text}</p>
          </li>
        ))}
      </ul>

      <h2 className="awards-title">Награды</h2>
      <ol className="awards">
        {awards.map((award) => (
          <li key={award.title + award.meta}>
            <b>{award.place}</b>
            <span>{award.meta}</span>
            <strong>{award.title}</strong>
            <p>{award.text}</p>
          </li>
        ))}
      </ol>
      <p className="note">
        Также благодарности и почётные грамоты руководства города, области, управления молодёжной политики
        Карагандинской области и карагандинского филиала АО «РТРК „Казахстан“».
      </p>
    </section>
  );
}
