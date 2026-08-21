import { alpha, fontSize } from '../../styles/tokens'
export default function PromotedBadge() {
  return (
    <span title="Promovido a producción" style={{
      fontSize: fontSize.micro, fontWeight: 700, padding: '1px 4px', borderRadius: 8,
      background: alpha.green(.15), color: 'var(--green)',
      border: `1px solid ${alpha.green(.35)}`, flexShrink: 0,
      fontFamily: 'var(--mono)', letterSpacing: '.04em', lineHeight: 1.4,
    }}>PRD</span>
  )
}
