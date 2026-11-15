import { useTranslation } from "@/modules/i18n";
import { LspServersGroup } from "../components/LspServersGroup";
import { SectionHeader } from "../components/SectionHeader";

export function LspSection() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title={t("settings.lsp.title")}
        description={t("settings.lsp.desc")}
      />

      <LspServersGroup />
    </div>
  );
}
