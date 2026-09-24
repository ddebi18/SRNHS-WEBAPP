import React from 'react';
import { motion } from 'framer-motion';

/** Hand-drawn campus scene (original SVG) — books, cap, and a quiet breeze. */
export const CampusDoodle: React.FC<{ className?: string }> = ({ className }) => {
  return (
    <div className={className} aria-hidden>
      <svg viewBox="0 0 280 220" className="w-full h-full" fill="none">
        <motion.ellipse
          cx="140"
          cy="198"
          rx="92"
          ry="10"
          fill="rgba(255,255,255,0.12)"
          animate={{ opacity: [0.12, 0.22, 0.12] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* School block */}
        <rect x="78" y="78" width="124" height="88" rx="8" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.45)" />
        <rect x="118" y="118" width="44" height="48" rx="4" fill="rgba(212,163,115,0.85)" />
        <polygon points="70,82 140,38 210,82" fill="rgba(255,255,255,0.22)" stroke="rgba(255,255,255,0.5)" />

        {/* Windows */}
        {[90, 122, 154, 186].map((x, i) => (
          <motion.rect
            key={x}
            x={x}
            y="94"
            width="16"
            height="16"
            rx="2"
            fill="#F6E27A"
            animate={{ opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 2.4, delay: i * 0.25, repeat: Infinity }}
          />
        ))}

        {/* Graduation cap */}
        <motion.g
          animate={{ y: [0, -6, 0], rotate: [-4, 4, -4] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
          style={{ originX: '70px', originY: '48px' }}
        >
          <polygon points="38,48 70,34 102,48 70,58" fill="#D4A373" />
          <rect x="66" y="48" width="8" height="18" fill="#F4E4C1" />
          <line x1="102" y1="48" x2="118" y2="70" stroke="#F6E27A" strokeWidth="2" />
          <circle cx="118" cy="72" r="4" fill="#F6E27A" />
        </motion.g>

        {/* Open book */}
        <motion.g
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
        >
          <path d="M196 156 C210 142 236 142 248 156 L248 178 C232 168 214 168 196 178 Z" fill="#F8F1E3" />
          <path d="M196 156 C182 142 156 142 144 156 L144 178 C160 168 178 168 196 178 Z" fill="#FFF8EC" />
          <line x1="196" y1="156" x2="196" y2="178" stroke="#D4A373" />
        </motion.g>

        {/* Floating papers */}
        {[0, 1, 2].map(i => (
          <motion.rect
            key={i}
            x={32 + i * 18}
            y={128}
            width="10"
            height="14"
            rx="1.5"
            fill="rgba(255,255,255,0.7)"
            animate={{ y: [128, 112, 128], x: [32 + i * 18, 38 + i * 18, 32 + i * 18], rotate: [-8, 10, -8] }}
            transition={{ duration: 3.2 + i * 0.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
          />
        ))}
      </svg>
    </div>
  );
};
