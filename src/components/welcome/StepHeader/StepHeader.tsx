import React from "react";
import { ChevronLeftIcon, CheckIcon } from "../../shared/Icons";
import "./StepHeader.css";

interface StepHeaderProps {
  title: string;
  currentStep: number;
  totalSteps?: number;
  onBack?: () => void;
}

/**
 * StepHeader Component
 */
export function StepHeader({
  title,
  currentStep,
  totalSteps = 3,
  onBack,
}: StepHeaderProps) {
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

interface StepIndicatorProps {
  stepNum: number;
  shouldAnimate: boolean;
  isActive: boolean;
  isCompleted: boolean;
  isLast: boolean;
}

function StepIndicator({
  stepNum,
  shouldAnimate,
  isActive,
  isCompleted,
  isLast,
}: StepIndicatorProps) {
  return (
    <React.Fragment>
      <div
        className={`step-header-dot ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""} ${shouldAnimate ? "animate" : ""}`}
      >
        {isCompleted ? (
          <div className="step-check-wrapper">
            <CheckIcon size={14} className={shouldAnimate ? "animate" : ""} />
          </div>
        ) : (
          stepNum
        )}
      </div>
      {!isLast && (
        <div
          className={`step-header-line ${isCompleted ? "completed" : ""} ${shouldAnimate ? "animate" : ""}`}
        />
      )}
    </React.Fragment>
  );
}

export default StepHeader;
