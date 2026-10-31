import { facts } from "../data/career.js";
import { useReveal } from "../hooks/useReveal.js";

export default function Facts() {
  const ref = useReveal();

  return (
    <section className="facts reveal" ref={ref}>
      <p className="label">Вне эфира</p>
      <dl>
        {facts.map((fact) => (
          <div key={fact.dt}>
            <dt>{fact.dt}</dt>
            <dd>{fact.dd}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
