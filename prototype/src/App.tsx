// PROTOTYPE — throwaway UI exploration for the Clipmark frontend rebuild.
// Question: "What should Clipmark look like?"
// Three structurally different variants, switched via ?variant=A|B|C on this
// single route, plus a floating bottom bar. See prototype/NOTES.md.
import "./base.css";
import { PrototypeSwitcher, useVariant } from "./PrototypeSwitcher";
import VariantA from "./variants/Simple";
import VariantB from "./variants/Complex";
import VariantC from "./variants/Creative";

export default function App() {
  const [variant, setVariant] = useVariant();
  return (
    <>
      {variant === "A" && <VariantA />}
      {variant === "B" && <VariantB />}
      {variant === "C" && <VariantC />}
      <PrototypeSwitcher current={variant} onChange={setVariant} />
    </>
  );
}
