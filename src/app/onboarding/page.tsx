import { OnboardingPanel } from "@/components/onboarding/onboarding-panel";

// The client session gate defers this segment until identity is verified.
export const instant = false;

export default function OnboardingPage() { return <OnboardingPanel />; }
