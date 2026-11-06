import { LspServersGroup } from "../components/LspServersGroup";
import { SectionHeader } from "../components/SectionHeader";

export function LspSection() {
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Language Servers"
        description="Configure Language Server Protocol (LSP) servers for intelligent autocompletion, diagnostics, and code navigation."
      />

      <LspServersGroup />
    </div>
  );
}
