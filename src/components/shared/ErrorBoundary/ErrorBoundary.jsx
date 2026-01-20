import React from 'react';
import { AlertIcon, RefreshIcon } from '../Icons';
import './ErrorBoundary.css';

export class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null
        };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('ErrorBoundary caught an error:', error, errorInfo);
        this.setState({
            error,
            errorInfo
        });
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="error-boundary">
                    <div className="error-boundary-content">
                        <div className="error-icon">
                            <AlertIcon size={48} />
                        </div>
                        <h2 className="error-title">Something went wrong</h2>
                        <p className="error-message">
                            The application encountered an unexpected error.
                            Please try reloading the page.
                        </p>

                        {process.env.NODE_ENV === 'development' && this.state.error && (
                            <details className="error-details">
                                <summary>Error Details (Development Only)</summary>
                                <pre className="error-stack">
                                    {this.state.error.toString()}
                                    {this.state.errorInfo?.componentStack}
                                </pre>
                            </details>
                        )}

                        <button
                            className="btn btn-primary btn-lg"
                            onClick={this.handleReset}
                        >
                            <RefreshIcon size={18} />
                            Reload Application
                        </button>

                        <p className="error-note">
                            Your wallet data is safe. If this persists, please contact support.
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}
