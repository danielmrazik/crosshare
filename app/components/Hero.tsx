import { ReactNode } from 'react';
import styles from './Hero.module.scss';
import { Link } from './Link.js';

export function Hero(props: {
  text: string;
  subtitle?: ReactNode;
  quote?: string;
  children?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <Link href="/" className={styles.link} title="Crosshare Home">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className={styles.logo}
          src="/trees-invis.png"
          alt="Crosswoods logo"
          width={120}
          height={120}
        />
      </Link>
      <h2 className={styles.text}>{props.text}</h2>
      {props.subtitle ? <div className={styles.subtitle}>{props.subtitle}</div> : null}
      {props.quote ? (
        <div className={styles.quoteWrapper}>
          <span className={styles.quote}>{props.quote}</span>
        </div>
      ) : null}
      {props.children}
    </header>
  );
}
