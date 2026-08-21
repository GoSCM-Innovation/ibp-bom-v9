import { alpha } from '../../styles/tokens'
export default function PromotedBadge({ fontSize = 9 }) {
  return (
    <span title="Promovido a producción" style={{
      fontSize, fontWeight: 700, padding: '1px 5px', borderRadius: 8,
      background: alpha.green(.15), color: '#34d399',
      border: `1px solid ${alpha.green(.35)}`, flexShrink: 0,
      fontFamily: 'var(--mono)', letterSpacing: '.04em', lineHeight: 1.4,
    }}>PRD</span>
  )
}
