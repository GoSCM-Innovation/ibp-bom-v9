import { avatarColor } from '../../constants/avatar'
import { color } from '../../styles/tokens'

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('')
}

export default function ConnectionAvatar({ name, logoUrl, size = 36 }) {
  const bg = avatarColor(name)
  const letters = initials(name)

  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={name}
        onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
        style={{ width: size, height: size, borderRadius: 8, objectFit: 'contain', background: color.white, flexShrink: 0 }}
      />
    )
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: 8, background: bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 700, fontSize: size * 0.36, color: color.white,
      flexShrink: 0, userSelect: 'none',
    }}>
      {letters}
    </div>
  )
}
