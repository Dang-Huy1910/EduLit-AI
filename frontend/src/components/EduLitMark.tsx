// Fountain-pen nib whose slit runs into a cut-out "E". Same paths as public/brand/edulit-mark*.svg.
const REGULAR_PATH =
  'M48.4 4.03V34.26C46.42 34.93 45 36.8 45 39C45 41.2 46.42 43.07 48.4 43.74V51H45V92H71V83H55V76H67V67H55V60H71V51H51.6V43.74C53.58 43.07 55 41.2 55 39C55 36.8 53.58 34.93 51.6 34.26V4.03C61 15.03 90.12 38 92 68C93.5 86 89 99 83 104H17C11 99 6.5 86 8 68C9.88 38 39 15.03 48.4 4.03Z';

// Thicker slit and E strokes that stay legible at 32px and below.
const SMALL_PATH =
  'M45.5 7.2V38H43V92H71V80H57V71H66V59H57V50H71V38H54.5V7.2C65.9 19.11 90.29 40.63 92 68C93.5 86 89 99 83 104H17C11 99 6.5 86 8 68C9.71 40.63 34.1 19.11 45.5 7.2Z';

interface EduLitMarkProps {
  className?: string;
  /** Use the sturdier cut; set to false only when the mark renders larger than 32px. */
  small?: boolean;
}

export default function EduLitMark({ className, small = true }: EduLitMarkProps) {
  return (
    <svg viewBox="0 0 100 106" fill="currentColor" aria-hidden="true" focusable="false" className={className}>
      <path d={small ? SMALL_PATH : REGULAR_PATH} />
    </svg>
  );
}
