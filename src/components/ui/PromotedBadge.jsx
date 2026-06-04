export default function PromotedBadge({ fontSize = 9 }) {
  return (
    <span title="Promovido a producción" style={{
      fontSize, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
      background: 'rgba(52,211,153,.15)', color: '#34d399',
      border: '1px solid rgba(52,211,153,.35)', flexShrink: 0,
      fontFamily: 'var(--mono)', letterSpacing: '.04em', lineHeight: 1.4,
    }}>PRD</span>
  )
}
