export default function ViGoMark({ width = 38, height = 38 }) {
  return (
    <svg width={width} height={height} viewBox="0 0 320 195" xmlns="http://www.w3.org/2000/svg" fill="none" aria-hidden="true">
      <defs>
        <clipPath id="nc">
          <rect x="0" y="0" width="320" height="180" />
        </clipPath>
      </defs>
      <circle cx="160" cy="180" r="164" stroke="#C4982A" strokeWidth="2.2" clipPath="url(#nc)" />
      <circle cx="160" cy="180" r="147" stroke="#C4982A" strokeWidth="1.3" clipPath="url(#nc)" />
      <g fill="#A07A18">
        <rect x="10"  y="158" width="11" height="22" /><rect x="23"  y="150" width="9"  height="30" />
        <rect x="34"  y="144" width="12" height="36" /><ellipse cx="40" cy="144" rx="7" ry="5" />
        <rect x="48"  y="132" width="9"  height="48" /><rect x="59"  y="140" width="8"  height="40" />
        <rect x="69"  y="148" width="10" height="32" /><rect x="81"  y="155" width="8"  height="25" />
        <rect x="91"  y="145" width="11" height="35" /><rect x="104" y="150" width="9"  height="30" />
        <rect x="115" y="158" width="10" height="22" />
        <rect x="195" y="158" width="10" height="22" /><rect x="207" y="150" width="9"  height="30" />
        <rect x="218" y="145" width="11" height="35" /><rect x="231" y="155" width="8"  height="25" />
        <rect x="241" y="148" width="10" height="32" /><rect x="253" y="140" width="8"  height="40" />
        <rect x="263" y="132" width="9"  height="48" /><rect x="274" y="144" width="12" height="36" />
        <ellipse cx="280" cy="144" rx="7" ry="5" />
        <rect x="288" y="150" width="9"  height="30" /><rect x="299" y="158" width="11" height="22" />
      </g>
      <g fill="#C9A030">
        <polygon points="160,12 163,24 157,24" />
        <rect x="159" y="24" width="2" height="12" />
        <polygon points="159,28 161,28 165.5,54 154.5,54" />
        <rect x="152" y="54" width="16" height="3.5" />
        <polygon points="154.5,57.5 165.5,57.5 170.5,80 149.5,80" />
        <rect x="147" y="80" width="26" height="4" />
        <polygon points="149.5,84 170.5,84 179,112 141,112" />
        <rect x="142" y="93"  width="36" height="1.4" opacity="0.5" />
        <rect x="141" y="102" width="38" height="1.4" opacity="0.5" />
        <polygon points="141,112 152,112 148,180 132,180" />
        <polygon points="168,112 179,112 188,180 172,180" />
        <rect x="130" y="177" width="60" height="3.5" />
      </g>
      <path d="M148,180 Q160,162 172,180" fill="none" stroke="#C9A030" strokeWidth="1.4" opacity="0.7" />
    </svg>
  )
}
