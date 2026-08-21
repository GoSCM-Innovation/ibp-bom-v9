import { labelStyle } from '../../styles/forms'

// Label en mayúsculas sobre su control. El patrón estaba repetido inline en
// NodeConfigPanel, RunSingleModal y Tasks.
export default function Field({ label, gap = 12, children }) {
  return (
    <div style={{ marginBottom: gap }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}
