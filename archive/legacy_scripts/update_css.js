const fs = require('fs');

let css = fs.readFileSync('public/style.css', 'utf8');

// Replace .slip-hero-amount .hero-val styling
const oldHeroVal = `.slip-hero-amount .hero-val {
    font-size: 24px !important;
    font-weight: 900 !important;
    color: #059669 !important;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
    font-variant-numeric: tabular-nums !important;
    letter-spacing: -0.5px !important;
}`;

const newHeroVal = `.slip-hero-amount .hero-val.plain-text-amount,
.slip-hero-amount .hero-val {
    font-size: 24px !important;
    font-weight: 800 !important;
    color: #059669 !important;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
    font-variant-numeric: normal !important;
    letter-spacing: 0px !important;
}

[data-theme="dark"] .slip-hero-amount .hero-val,
body.dark .slip-hero-amount .hero-val,
body.dark-theme .slip-hero-amount .hero-val {
    color: #34d399 !important;
}

[data-theme="light"] .slip-hero-amount .hero-val,
body.light-theme .slip-hero-amount .hero-val {
    color: #059669 !important;
}`;

if (css.includes(oldHeroVal)) {
    css = css.replace(oldHeroVal, newHeroVal);
    console.log('Updated .slip-hero-amount .hero-val in style.css');
} else {
    console.log('oldHeroVal exact string not found, appending custom plain-text-amount rule');
    css += `\n\n/* Plain text amount without slashed zeroes */\n` + newHeroVal + '\n';
}

// Add .btn-zoom-footer-main style if not present
if (!css.includes('.btn-zoom-footer-main')) {
    css += `
/* Zoom Button in Modal Footer */
.btn-zoom-footer-main {
    background: linear-gradient(135deg, #d97706, #b45309) !important;
    color: white !important;
    border: none !important;
    border-radius: 8px !important;
    padding: 6px 13px !important;
    font-size: 12.5px !important;
    font-weight: 700 !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    cursor: pointer !important;
    box-shadow: 0 2px 6px rgba(217, 119, 6, 0.35) !important;
    white-space: nowrap !important;
    transition: all 0.15s ease !important;
}
.btn-zoom-footer-main:hover {
    filter: brightness(1.08) !important;
    transform: translateY(-1px) !important;
}
.btn-zoom-footer-main:active {
    transform: translateY(0) !important;
}

@media print {
    #bcSlipZoomOverlay,
    .zoom-backdrop,
    .btn-zoom-footer-main,
    .btn-zoom-hdr,
    #bcSlipZoomToggleBtn {
        display: none !important;
    }
}
`;
    console.log('Added .btn-zoom-footer-main styles to style.css');
}

fs.writeFileSync('public/style.css', css);
console.log('Saved public/style.css successfully!');
