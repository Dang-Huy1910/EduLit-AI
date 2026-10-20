// Socratic assistant: two overlapping speech bubbles, a four-point spark in the front one. 24px grid, 2px strokes.
const SOLID_PATH =
  'M11.7 6.5H18.3Q20.04 6.5 21.27 7.73Q22.5 8.96 22.5 10.7V21.3Q22.5 21.5 22.42 21.68Q22.35 21.87 22.21 22.01Q22.07 22.15 21.88 22.22Q21.7 22.3 21.5 22.3Q21.16 22.3 20.89 22.09L17.56 19.5H11.7Q9.96 19.5 8.73 18.27Q7.5 17.04 7.5 15.3V10.7Q7.5 8.96 8.73 7.73Q9.96 6.5 11.7 6.5ZM5.7 1.5H12.3Q14.04 1.5 15.27 2.73Q16.21 3.67 16.43 4.9H14.41Q14.05 3.5 12.3 3.5H5.7Q3.5 3.5 3.5 5.7V13.26L5.49 11.71Q5.68 11.56 5.9 11.52V13.92L3.11 16.09Q2.96 16.21 2.77 16.26Q2.57 16.32 2.38 16.29Q2.18 16.27 2.01 16.17Q1.83 16.07 1.71 15.91Q1.5 15.64 1.5 15.3V5.7Q1.5 3.96 2.73 2.73Q3.96 1.5 5.7 1.5ZM15 9.6Q14.49 12.49 11.6 13Q14.49 13.51 15 16.4Q15.51 13.51 18.4 13Q15.51 12.49 15 9.6Z';

// Front bubble drawn as a line, to sit beside Material Symbols Outlined in navigation.
const OUTLINE_PATH =
  'M11.7 6.5H18.3Q20.04 6.5 21.27 7.73Q22.5 8.96 22.5 10.7V21.3Q22.5 21.5 22.42 21.68Q22.35 21.87 22.21 22.01Q22.07 22.15 21.88 22.22Q21.7 22.3 21.5 22.3Q21.16 22.3 20.89 22.09L17.56 19.5H11.7Q9.96 19.5 8.73 18.27Q7.5 17.04 7.5 15.3V10.7Q7.5 8.96 8.73 7.73Q9.96 6.5 11.7 6.5ZM11.7 8.5Q9.5 8.5 9.5 10.7V15.3Q9.5 17.5 11.7 17.5H17.9Q18.24 17.5 18.51 17.71L20.5 19.26V10.7Q20.5 8.5 18.3 8.5ZM5.7 1.5H12.3Q14.04 1.5 15.27 2.73Q16.21 3.67 16.43 4.9H14.41Q14.05 3.5 12.3 3.5H5.7Q3.5 3.5 3.5 5.7V13.26L5.49 11.71Q5.68 11.56 5.9 11.52V13.92L3.11 16.09Q2.96 16.21 2.77 16.26Q2.57 16.32 2.38 16.29Q2.18 16.27 2.01 16.17Q1.83 16.07 1.71 15.91Q1.5 15.64 1.5 15.3V5.7Q1.5 3.96 2.73 2.73Q3.96 1.5 5.7 1.5ZM15 9.6Q15.51 12.49 18.4 13Q15.51 13.51 15 16.4Q14.49 13.51 11.6 13Q14.49 12.49 15 9.6Z';

interface AssistantMarkProps {
  className?: string;
  /** Line version for menus next to outlined icons; the solid version reads better inside coloured tiles. */
  outline?: boolean;
}

export default function AssistantMark({ className, outline = false }: AssistantMarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d={outline ? OUTLINE_PATH : SOLID_PATH} />
    </svg>
  );
}
