import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AppCloseBlocker } from "@/app/hooks/useAppCloseGuard";
import { useTranslation } from "@/modules/i18n";
import type { Tab } from "@/modules/tabs";

type Props = {
  tabs: Tab[];
  pendingCloseTab: number | null;
  onCancelClose: () => void;
  onConfirmClose: () => void;
  pendingTerminalCloseTab: number | null;
  onCancelTerminalClose: () => void;
  onConfirmTerminalClose: () => void;
  pendingDeleteTabs: number[] | null;
  onCancelDeleteClose: () => void;
  onConfirmDeleteClose: () => void;
  pendingAppClose: AppCloseBlocker | null;
  onCancelAppClose: () => void;
  onConfirmAppClose: () => void;
};

export function CloseDialogs({
  tabs,
  pendingCloseTab,
  onCancelClose,
  onConfirmClose,
  pendingTerminalCloseTab,
  onCancelTerminalClose,
  onConfirmTerminalClose,
  pendingDeleteTabs,
  onCancelDeleteClose,
  onConfirmDeleteClose,
  pendingAppClose,
  onCancelAppClose,
  onConfirmAppClose,
}: Props) {
  const { t } = useTranslation();

  const getAppCloseMessage = (blocker: AppCloseBlocker): string => {
    const dirty =
      blocker.dirtyEditors === 1
        ? t("dialogs.appClose.singleDirty")
        : t("dialogs.appClose.multipleDirty", { count: blocker.dirtyEditors });
    if (blocker.dirtyEditors > 0 && blocker.busyTerminal) {
      return t("dialogs.appClose.runningAndDirty", { dirty });
    }
    if (blocker.dirtyEditors > 0) {
      return t("dialogs.appClose.dirtyOnly", { dirty: dirty.charAt(0).toUpperCase() + dirty.slice(1) });
    }
    return t("dialogs.appClose.runningOnly");
  };

  return (
    <>
      <AlertDialog
        open={pendingCloseTab !== null}
        onOpenChange={(open) => !open && onCancelClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialogs.unsaved.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {tabs.find((t) => t.id === pendingCloseTab)?.title
                ? t("dialogs.unsaved.descWithName", {
                    name: tabs.find((t) => t.id === pendingCloseTab)?.title ?? "",
                  })
                : t("dialogs.unsaved.descGeneric")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelClose}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmClose}>
              {t("dialogs.unsaved.closeAnyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingTerminalCloseTab !== null}
        onOpenChange={(open) => !open && onCancelTerminalClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialogs.terminalClose.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dialogs.terminalClose.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelTerminalClose}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmTerminalClose}>
              {t("dialogs.terminalClose.closeAnyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDeleteTabs !== null}
        onOpenChange={(open) => !open && onCancelDeleteClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialogs.unsaved.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteTabs?.length === 1
                ? (() => {
                    const title = tabs.find(
                      (t) => t.id === pendingDeleteTabs[0],
                    )?.title;
                    return title
                      ? t("dialogs.unsaved.deletedDescWithName", { name: title })
                      : t("dialogs.unsaved.deletedDescGeneric");
                  })()
                : t("dialogs.unsaved.deletedDescMultiple", { count: pendingDeleteTabs?.length ?? 0 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelDeleteClose}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDeleteClose}>
              {t("dialogs.unsaved.closeAnyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingAppClose !== null}
        onOpenChange={(open) => !open && onCancelAppClose()}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dialogs.appClose.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAppClose ? getAppCloseMessage(pendingAppClose) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onCancelAppClose}>
              {t("common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmAppClose}>
              {t("dialogs.appClose.quitAnyway")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
