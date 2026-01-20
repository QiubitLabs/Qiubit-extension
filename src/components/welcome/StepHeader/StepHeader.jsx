import React from 'react';
import Lottie from 'lottie-react';
import { ChevronLeftIcon } from '../../shared/Icons/Icons';
import stepCompleteAnimation from '../animations/step-complete.json';
import './StepHeader.css';

/**
 * StepHeader Component
 */
export function StepHeader({
    title,
    currentStep,
    totalSteps = 3,
    onBack
}) {
    return (
        <div className="step-header">
            {/* Row 1: Back Button + Title */}
            <div className="step-header-row">
                <button className="step-header-back" onClick={onBack}>
                    <ChevronLeftIcon size={20} />
                </button>
                <span className="step-header-title">{title}</span>
                <div className="step-header-spacer" />
            </div>

            {/* Row 2: Step Indicators */}
            <div className="step-header-indicators">
                {Array.from({ length: totalSteps }, (_, i) => {
                    const stepNum = i + 1;
                    const isActive = stepNum === currentStep;
                    const isCompleted = stepNum < currentStep;

                    // Logic: Only animate the step that IMMEDIATELY precedes the current step.
                    // This prevents older steps from re-popping when we move to step 3, 4, etc.
                    const shouldAnimate = isCompleted && stepNum === currentStep - 1;

                    return (
                        <StepIndicator
                            key={stepNum}
                            stepNum={stepNum}
                            shouldAnimate={shouldAnimate}
                            isActive={isActive}
                            isCompleted={isCompleted}
                            isLast={stepNum === totalSteps}
                        />
                    );
                })}
            </div>
        </div>
    );
}

// Sub-component
function StepIndicator({ stepNum, shouldAnimate, isActive, isCompleted, isLast }) {
    return (
        <React.Fragment>
            <div
                className={`step-header-dot ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${shouldAnimate ? 'animate' : ''}`}
            >
                {isCompleted ? (
                    <div className="step-lottie-wrapper">
                        <Lottie
                            animationData={stepCompleteAnimation}
                            loop={false}
                            // If `shouldAnimate` is true: Play from start (0).
                            // If `shouldAnimate` is false: Freeze at end frame (59).
                            autoplay={shouldAnimate}
                            initialSegment={shouldAnimate ? [0, 60] : [59, 60]}
                        />
                    </div>
                ) : (
                    stepNum
                )}
            </div>
            {!isLast && (
                <div
                    className={`step-header-line ${isCompleted ? 'completed' : ''} ${shouldAnimate ? 'animate' : ''}`}
                />
            )}
        </React.Fragment>
    );
}

export default StepHeader;
