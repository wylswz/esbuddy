interface ColorDotProps {
  color: string;
  size?: number;
}

export function ColorDot({ color, size = 8 }: ColorDotProps) {
  return (
    <span
      className="rounded-full shrink-0"
      style={{ width: size, height: size, backgroundColor: color }}
    />
  );
}
