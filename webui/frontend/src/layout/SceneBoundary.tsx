import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { fallback: ReactNode; onError: (error: Error) => void; children: ReactNode };

export class SceneBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.props.onError(error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
