
import React from 'react';

export const UbaAnimatedIcon = () => {
    return (
        <svg className="uba-icon-svg" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <style>
                {`
                    .uba-icon-svg {
                        width: 100%;
                        height: 100%;
                        overflow: visible;
                    }
                    
                    /* U-Shape: Continuous "Tracing" Loop */
                    .uba-u {
                        stroke-dasharray: 60; /* Total length approx ~55 */
                        stroke-dashoffset: 60; /* Start hidden */
                        animation: ubaTraceLoop 3s ease-in-out infinite;
                        transform-origin: center;
                    }

                    @keyframes ubaTraceLoop {
                        0% { stroke-dashoffset: 60; }   /* Hidden (Start) */
                        40%, 60% { stroke-dashoffset: 0; } /* Fully Drawn (Hold) */
                        100% { stroke-dashoffset: -60; } /* Hidden (End - Erase) */
                    }

                    /* Dot: Continuous Bounce Loop */
                    .uba-dot {
                        animation: ubaBounceLoop 3s ease-in-out infinite;
                        transform-origin: 16px 18px;
                    }

                    @keyframes ubaBounceLoop {
                        0%, 100% { transform: translateY(0); } /* Rest position */
                        10% { transform: translateY(0) scale(1.1, 0.9); } /* Anticipation Squash */
                        20% { transform: translateY(-12px) scale(0.9, 1.1); } /* Jump Up */
                        30% { transform: translateY(0) scale(1); } /* Land */
                        40%, 60% { transform: translateY(0); } /* Wait while U holds */
                        /* Sync with U erasing/drawing? Maybe just persistent idle bounce? */
                        /* Let's make it more active during the U hold phase */
                        45% { transform: translateY(-3px); }
                        55% { transform: translateY(0); }
                    }
                `}
            </style>

            {/* U Letter */}
            <path className="uba-u" d="M10 8V18C10 21.3137 12.6863 24 16 24C19.3137 24 22 21.3137 22 18V8"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round" />

            {/* Dot */}
            <circle className="uba-dot" cx="16" cy="18" r="2" fill="white" />
        </svg>
    );
};
