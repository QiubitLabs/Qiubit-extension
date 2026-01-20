
import React from 'react';

export const QuantumAnimatedIcon = () => {
    return (
        <div className="quantum-icon-container">
            <img
                src="/icon.svg"
                alt="Quantum Logo"
                className="quantum-icon-svg"
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain'
                }}
            />
            <style>
                {`
                    .quantum-icon-container {
                        width: 100%;
                        height: 100%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                `}
            </style>
        </div>
    );
};
