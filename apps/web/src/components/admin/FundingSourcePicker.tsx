import type { AdminFundingSource } from '../../lib/api';

interface Props {
  value: '' | AdminFundingSource;
  onChange: (value: AdminFundingSource) => void;
  disabled?: boolean;
}

// Adds the classification that the balance sheet depends on. There is no
// default: the admin has to declare whether money was really received.
const OPTIONS: { value: AdminFundingSource; title: string; description: string; accent: string; tint: string; ring: string }[] = [
  {
    value: 'manual_funding',
    title: 'Manually funded — money received',
    description: 'You really received the payment (UPI, bank transfer or cash) and are adding it to the wallet. Counts as collected cash.',
    accent: '#10b981',
    tint: 'rgba(16, 185, 129, 0.12)',
    ring: 'rgba(16, 185, 129, 0.30)',
  },
  {
    value: 'free_grant',
    title: 'Free funds by admin — no money received',
    description: 'Goodwill, compensation or promotional balance. Increases wallet liability but is never counted as revenue.',
    accent: '#a855f7',
    tint: 'rgba(168, 85, 247, 0.12)',
    ring: 'rgba(168, 85, 247, 0.30)',
  },
];

export default function FundingSourcePicker({ value, onChange, disabled }: Props) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
        Funding source <span style={{ color: '#ef4444' }}>*</span>
      </label>
      {OPTIONS.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            style={{
              textAlign: 'left',
              padding: '0.6rem 0.75rem',
              borderRadius: 'var(--radius-md)',
              border: active ? `1px solid ${option.ring}` : '1px solid var(--border-subtle)',
              background: active ? option.tint : 'var(--bg-tertiary)',
              color: 'inherit',
              cursor: disabled ? 'not-allowed' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.2rem',
            }}
          >
            <span style={{ fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span
                style={{
                  width: '9px',
                  height: '9px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: active ? option.accent : 'var(--text-muted)',
                  boxShadow: active ? `0 0 0 3px ${option.tint}` : 'none',
                }}
              />
              {option.title}
            </span>
            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{option.description}</span>
          </button>
        );
      })}
    </div>
  );
}
