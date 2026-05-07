interface TypographyProps {
  className?: string
}

export function LogoTypography({ className = '' }: TypographyProps) {
  return (
    <svg
      width="820"
      height="180"
      viewBox="0 0 820 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <text
        x="410"
        y="138"
        textAnchor="middle"
        fill="currentColor"
        fontSize="150"
        fontWeight="900"
        fontFamily="system-ui, -apple-system, sans-serif"
        letterSpacing="0"
      >
        VERITY
      </text>
    </svg>
  )
}
