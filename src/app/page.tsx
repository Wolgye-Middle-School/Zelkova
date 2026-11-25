import AuthGate from "@/components/AuthGate";
import TimetableApp from "@/components/TimetableApp";

export default function Home() {
  return (
    <AuthGate>
      <TimetableApp />
    </AuthGate>
  );
}
