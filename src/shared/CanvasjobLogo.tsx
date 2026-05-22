type CanvasjobLogoProps = {
  markClassName?: string;
  textClassName?: string;
  className?: string;
};

export function CanvasjobLogo({
  markClassName = "h-6 w-6",
  textClassName = "text-sm",
  className = "",
}: CanvasjobLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img
        src="/icons/canvasjob-mark.svg"
        alt=""
        aria-hidden="true"
        className={`shrink-0 ${markClassName}`}
      />
      <span className={`font-semibold tracking-tight text-foreground ${textClassName}`}>
        canvasjob
      </span>
    </span>
  );
}
