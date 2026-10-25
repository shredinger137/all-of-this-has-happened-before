import { INCIDENTS, RAIN_DRIVE_MINUTES } from '../sim/content';
import { COMMUTE_MINUTES, formatClock } from '../sim/constants';
import type { Results } from '../sim/engine';
import type { GameState } from '../sim/types';

/**
 * The jump: pressing leave plays a short sequence (door shut, what came with you, what stayed
 * behind, the drive, arrival) before the after-action report. Lines arrive one after another.
 */
export function Departure({ s, r }: { s: GameState; r: Results }) {
  const walk = COMMUTE_MINUTES + (s.day.weather === 'rain' ? RAIN_DRIVE_MINUTES : 0);
  const unresolved = s.incidents.map((i) => INCIDENTS[i.id].title.toLowerCase());
  const behind = [...new Set([...unresolved, ...r.leftBehind.map((m) => m.toLowerCase())])];
  const late = r.lateness > 0;
  const gate = r.misses.some((m) => m.id === 'gate');
  const at = (step: number) => `${(0.4 + step * 0.7).toFixed(1)}s`;
  const lines: { t?: string; text: string; tone?: string }[] = [
    { t: formatClock(r.departed), text: 'Out the door.' },
    { text: r.completed.length ? `With you: ${r.completed.join(', ').toLowerCase()}.` : 'With you: just her.' },
    behind.length ? { text: `Left behind: ${behind.slice(0, 6).join(', ')}${behind.length > 6 ? '…' : '.'}`, tone: 'amber' } : { text: 'Left behind: nothing.', tone: 'green' },
  ];
  if (s.wave) {
    lines.push({ text: `${s.wave.size === 1 ? 'A crisis was' : `${s.wave.size} crises were`} on the way. They hit an empty house.`, tone: 'cyan' });
  }

  return (
    <div className="panel frame screen departure">
      <div className="sectionhead">
        <span className="sectitle">Departure</span>
        <span className="status">Door shut {formatClock(r.departed)}</span>
      </div>
      <div className="panel-body">
        <ol className="seq">
          {lines.map((l, i) => (
            <li key={i} className={l.tone} style={{ animationDelay: at(i) }}>
              <span className="t">{l.t ?? ''}</span>
              <span>{l.text}</span>
            </li>
          ))}
        </ol>
        <div className="walk" style={{ animationDelay: at(lines.length) }}>
          <div className="walk-label">
            <span>Driving to school</span>
            <span>{walk} min{s.day.weather === 'rain' ? ', in the rain' : ''}</span>
          </div>
          <div className="walk-bar">
            <span style={{ animationDelay: at(lines.length) }} />
          </div>
        </div>
        <div className={`arrival ${gate ? 'red' : late ? 'amber' : 'green'}`} style={{ animationDelay: at(lines.length + 3.7) }}>
          <span className="t">{formatClock(r.arrived)}</span>
          {gate
            ? 'Arrived. The gate has shut: sign in at the office.'
            : late
              ? `Arrived. ${r.lateness} min late.`
              : `Arrived. ${-r.lateness} min before the bell.`}
        </div>
      </div>
    </div>
  );
}
