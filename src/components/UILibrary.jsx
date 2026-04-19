/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * UILibrary.jsx - Reusable Component Library
 * Consolidates all repeated UI patterns across the app
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import React from 'react';

// ════════════════════════════════════════════════════════════════════════════════
// BUTTONS
// ════════════════════════════════════════════════════════════════════════════════

export function Button({ 
  children, 
  variant = 'primary', // primary, secondary, ghost, danger, success
  size = 'md', // sm, md, lg
  disabled = false,
  loading = false,
  className = '',
  ...props 
}) {
  const baseStyles = {
    primary: 'btn btn-primary',
    secondary: 'btn',
    ghost: 'btn btn-ghost',
    danger: 'btn',
    success: 'btn btn-success',
  };

  const sizeStyles = {
    sm: { fontSize: '0.75rem', padding: '7px 14px' },
    md: { fontSize: '0.85rem', padding: '10px 18px' },
    lg: { fontSize: '0.95rem', padding: '12px 24px' },
  };

  const variantStyles = {
    danger: { background: 'rgba(255,107,107,0.15)', color: 'var(--red)', border: '1px solid rgba(255,107,107,0.3)' },
  };

  return (
    <button
      className={`${baseStyles[variant]} ${className}`}
      disabled={disabled || loading}
      style={{ ...sizeStyles[size], ...variantStyles[variant] }}
      {...props}
    >
      {loading && <span className="spinner" style={{ marginRight: 6 }} />}
      {children}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// INPUT FIELDS
// ════════════════════════════════════════════════════════════════════════════════

export function TextField({ 
  label, 
  placeholder, 
  value, 
  onChange, 
  type = 'text',
  error = '',
  required = false,
  fullWidth = true,
  rows = 3,
  ...props 
}) {
  const isTextarea = type === 'textarea';
  const Element = isTextarea ? 'textarea' : 'input';
  
  return (
    <div style={{ marginBottom: 14, width: fullWidth ? '100%' : 'auto', ...props.containerStyle }}>
      {label && (
        <label style={{ 
          fontSize: '0.78rem', 
          color: 'var(--muted)', 
          display: 'block', 
          marginBottom: 6,
          fontWeight: 500 
        }}>
          {label} {required && <span style={{ color: 'var(--red)' }}>*</span>}
        </label>
      )}
      <Element
        className={isTextarea ? '' : 'input'}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        {...(isTextarea ? { rows } : { type })}
        style={{ 
          ...(!isTextarea && {}),
          ...(isTextarea && { 
            width: '100%',
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid var(--border)`,
            background: 'rgba(255,255,255,0.03)',
            color: 'var(--text)',
            fontFamily: 'inherit',
            fontSize: '0.85rem',
            fontWeight: 400,
            resize: 'vertical',
          }),
          borderColor: error ? 'var(--red)' : undefined,
          ...props.style 
        }}
      />
      {error && (
        <div style={{ fontSize: '0.7rem', color: 'var(--red)', marginTop: 4 }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// RATING SCALE (1-10)
// ════════════════════════════════════════════════════════════════════════════════

export function RatingScale({ 
  value, 
  onChange, 
  label = 'Rate',
  max = 10,
  labels = ['Low', 'Medium', 'High'],
}) {
  return (
    <div>
      {label && (
        <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>
          🤖 {label}
        </div>
      )}
      <div style={{ display: 'flex', gap: 3, marginBottom: 6 }}>
        {Array.from({ length: max }, (_, i) => i + 1).map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              border: `1px solid ${n <= value ? 'var(--purple)' : 'var(--border)'}`,
              background: n <= value ? 'var(--purple)' : 'rgba(255,255,255,0.03)',
              color: n <= value ? 'white' : 'var(--text-sec)',
              cursor: 'pointer',
              fontSize: '0.7rem',
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            {n}
          </button>
        ))}
      </div>
      {labels && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: 'var(--muted)' }}>
          {labels.map((l, i) => <span key={i}>{l}</span>)}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// OPTION GRID (For selections)
// ════════════════════════════════════════════════════════════════════════════════

export function OptionGrid({ 
  options, // Array of { value, label, emoji, desc }
  value, 
  onChange, 
  columns = 'auto',
  label = '',
  type = 'single', // single, multiple
  ...props
}) {
  const isSelected = (opt) => 
    type === 'multiple' 
      ? (Array.isArray(value) ? value.includes(opt.value) : false)
      : value === opt.value;

  const handleClick = (opt) => {
    if (type === 'multiple') {
      const newVal = Array.isArray(value) ? value : [];
      onChange(newVal.includes(opt.value) 
        ? newVal.filter(v => v !== opt.value)
        : [...newVal, opt.value]
      );
    } else {
      onChange(opt.value);
    }
  };

  return (
    <div style={{ ...props.style }}>
      {label && (
        <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
          {label}
        </div>
      )}
      <div style={{
        display: 'grid',
        gridTemplateColumns: columns === 'auto' ? 'repeat(auto-fit, minmax(140px, 1fr))' : `repeat(${columns}, 1fr)`,
        gap: 10,
      }}>
        {options.map(opt => (
          <button
            key={opt.value}
            onClick={() => handleClick(opt)}
            style={{
              padding: '14px 12px',
              borderRadius: 'var(--radius-xs)',
              cursor: 'pointer',
              textAlign: 'center',
              border: `1.5px solid ${isSelected(opt) ? 'var(--purple)' : 'var(--border)'}`,
              background: isSelected(opt) ? 'rgba(139,125,255,0.12)' : 'rgba(255,255,255,0.03)',
              transition: 'all 0.15s',
            }}
          >
            {opt.emoji && <div style={{ fontSize: '1.6rem', marginBottom: 6 }}>{opt.emoji}</div>}
            <div style={{ 
              fontSize: '0.85rem', 
              fontWeight: isSelected(opt) ? 600 : 500,
              color: isSelected(opt) ? 'var(--purple-l)' : 'var(--text-sec)',
              marginBottom: opt.desc ? 4 : 0,
            }}>
              {opt.label}
            </div>
            {opt.desc && (
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>
                {opt.desc}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// TAG/BADGE BUTTON GROUP
// ════════════════════════════════════════════════════════════════════════════════

export function TagGroup({ 
  options, // Array of strings or objects
  value, 
  onChange,
  type = 'single', // single or multiple
  variant = 'default', // default, error, success
}) {
  const colorMap = {
    default: { border: 'var(--purple)', bg: 'rgba(139,125,255,0.15)', color: 'var(--purple-l)' },
    error: { border: 'var(--red)', bg: 'rgba(255,107,107,0.15)', color: 'var(--red)' },
    success: { border: 'var(--green)', bg: 'rgba(74,222,128,0.15)', color: 'var(--green)' },
  };

  const colors = colorMap[variant];

  const isSelected = (opt) => {
    const v = typeof opt === 'string' ? opt : opt.value;
    return type === 'multiple' 
      ? (Array.isArray(value) ? value.includes(v) : false)
      : value === v;
  };

  const handleClick = (opt) => {
    const v = typeof opt === 'string' ? opt : opt.value;
    if (type === 'multiple') {
      const newVal = Array.isArray(value) ? value : [];
      onChange(newVal.includes(v) ? newVal.filter(x => x !== v) : [...newVal, v]);
    } else {
      onChange(v);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {options.map(opt => {
        const v = typeof opt === 'string' ? opt : opt.value;
        const label = typeof opt === 'string' ? opt : opt.label;
        const selected = isSelected(opt);

        return (
          <button
            key={v}
            onClick={() => handleClick(opt)}
            style={{
              padding: '6px 14px',
              borderRadius: 20,
              cursor: 'pointer',
              fontSize: '0.72rem',
              fontWeight: selected ? 700 : 500,
              border: `1px solid ${selected ? colors.border : 'var(--border)'}`,
              background: selected ? colors.bg : 'rgba(255,255,255,0.03)',
              color: selected ? colors.color : 'var(--text-sec)',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// CARD
// ════════════════════════════════════════════════════════════════════════════════

export function Card({ 
  title, 
  subtitle, 
  children, 
  variant = 'default', // default, highlight, danger
  icon = null,
  action = null,
}) {
  const variantStyles = {
    default: { border: 'var(--border)', bg: 'rgba(255,255,255,0.02)' },
    highlight: { border: 'rgba(139,125,255,0.3)', bg: 'rgba(139,125,255,0.08)' },
    danger: { border: 'rgba(255,107,107,0.3)', bg: 'rgba(255,107,107,0.08)' },
  };

  const style = variantStyles[variant];

  return (
    <div
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 'var(--radius)',
        padding: 16,
        marginBottom: 12,
        transition: 'all 0.2s',
      }}
    >
      {(title || action) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: title || subtitle ? 12 : 0 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            {icon && <div style={{ fontSize: '1.4rem' }}>{icon}</div>}
            <div>
              {title && <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text)' }}>{title}</div>}
              {subtitle && <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>}
            </div>
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// ALERT / MESSAGE
// ════════════════════════════════════════════════════════════════════════════════

export function Alert({ 
  message, 
  type = 'info', // info, success, warning, error
  icon = null,
  action = null,
}) {
  const typeStyles = {
    info: { bg: 'rgba(94,179,255,0.08)', border: 'rgba(94,179,255,0.3)', color: 'var(--blue-l)', icon: 'ℹ️' },
    success: { bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.3)', color: 'var(--green)', icon: '✅' },
    warning: { bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.3)', color: 'var(--amber)', icon: '⚠️' },
    error: { bg: 'rgba(255,107,107,0.08)', border: 'rgba(255,107,107,0.3)', color: 'var(--red)', icon: '❌' },
  };

  const style = typeStyles[type];

  return (
    <div
      style={{
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 'var(--radius-xs)',
        padding: '12px 14px',
        marginBottom: 12,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '1rem' }}>{icon || style.icon}</span>
        <div style={{ fontSize: '0.85rem', color: style.color, fontWeight: 500 }}>
          {message}
        </div>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// STAT BOX
// ════════════════════════════════════════════════════════════════════════════════

export function StatBox({ 
  label, 
  value, 
  icon = null, 
  trend = null,
  variant = 'default',
}) {
  const variantColors = {
    default: { bg: 'rgba(139,125,255,0.08)', color: 'var(--purple-l)' },
    success: { bg: 'rgba(74,222,128,0.08)', color: 'var(--green)' },
    warning: { bg: 'rgba(251,191,36,0.08)', color: 'var(--amber)' },
  };

  const colors = variantColors[variant];

  return (
    <div
      style={{
        background: colors.bg,
        border: '1px solid rgba(139,125,255,0.15)',
        borderRadius: 'var(--radius-sm)',
        padding: 14,
        textAlign: 'center',
      }}
    >
      {icon && <div style={{ fontSize: '1.8rem', marginBottom: 6 }}>{icon}</div>}
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: colors.color, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 4, fontWeight: 500 }}>
        {label}
      </div>
      {trend && (
        <div style={{ fontSize: '0.65rem', color: trend.positive ? 'var(--green)' : 'var(--red)', marginTop: 4 }}>
          {trend.positive ? '↑' : '↓'} {trend.text}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// FORM ROW (Two fields side by side)
// ════════════════════════════════════════════════════════════════════════════════

export function FormRow({ children, gap = 12 }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap }}>
      {children}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// LOADING STATE
// ════════════════════════════════════════════════════════════════════════════════

export function LoadingState({ message = 'Loading...', fullScreen = false }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: fullScreen ? '100vh' : '200px',
        gap: 12,
      }}
    >
      <div
        className="spinner"
        style={{ width: 32, height: 32, borderWidth: 3 }}
      />
      <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
        {message}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// EMPTY STATE
// ════════════════════════════════════════════════════════════════════════════════

export function EmptyState({ 
  icon = '📭', 
  title = 'Nothing here yet', 
  message = 'Get started by creating something new',
  action = null,
}) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '40px 20px',
        color: 'var(--muted)',
      }}
    >
      <div style={{ fontSize: '3rem', marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ fontSize: '0.85rem', marginBottom: action ? 20 : 0 }}>
        {message}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// DIVIDER
// ════════════════════════════════════════════════════════════════════════════════

export function Divider({ label = null, style = {} }) {
  if (label) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0', ...style }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', fontWeight: 600 }}>
          {label}
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
    );
  }
  return <div style={{ height: 1, background: 'var(--border)', margin: '16px 0', ...style }} />;
}

// ════════════════════════════════════════════════════════════════════════════════
// BADGE (Standalone)
// ════════════════════════════════════════════════════════════════════════════════

export function Badge({ 
  label, 
  variant = 'default', // default, success, warning, error, info
  icon = null,
}) {
  const variantStyles = {
    default: { bg: 'rgba(139,125,255,0.15)', color: 'var(--purple-l)' },
    success: { bg: 'rgba(74,222,128,0.15)', color: 'var(--green)' },
    warning: { bg: 'rgba(251,191,36,0.15)', color: 'var(--amber)' },
    error: { bg: 'rgba(255,107,107,0.15)', color: 'var(--red)' },
    info: { bg: 'rgba(94,179,255,0.15)', color: 'var(--blue-l)' },
  };

  const style = variantStyles[variant];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 20,
        fontSize: '0.7rem',
        fontWeight: 600,
        background: style.bg,
        color: style.color,
      }}
    >
      {icon && <span>{icon}</span>}
      {label}
    </span>
  );
}
