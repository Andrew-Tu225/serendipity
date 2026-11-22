import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

export function ProfileSubscreen({ title, subtitle, count, countLabel, backLabel, onBack, children, footer }: {
  title: string;
  subtitle: string;
  count?: number;
  countLabel?: string;
  backLabel: string;
  onBack: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => heading.current?.focus(), []);

  return (
    <section className="place-lists-screen" aria-labelledby="profile-subscreen-heading" onKeyDown={(event) => {
      if (event.key === "Escape") onBack();
    }}>
      <header className="place-lists-header">
        <button type="button" className="place-lists-back" aria-label={backLabel} onClick={onBack}>
          <Icon name="arrow" size={19} />
        </button>
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h1 id="profile-subscreen-heading" ref={heading} tabIndex={-1}>{title}</h1>
        </div>
        {count !== undefined && <span className="place-lists-count" aria-label={countLabel}>{count}</span>}
      </header>
      <div className="place-lists-content">{children}</div>
      {footer}
    </section>
  );
}
