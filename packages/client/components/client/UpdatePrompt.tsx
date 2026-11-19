import { createEffect, on } from "solid-js";

import { useLingui } from "@lingui/solid/macro";

import { useSnackbar } from "@revolt/ui";

import { pendingUpdate } from "../../src/serviceWorkerInterface";

/**
 * Offer to reload once a new version is ready, rather than reloading by
 * itself and losing whatever is being typed
 */
export function UpdatePrompt() {
  const { t } = useLingui();
  const snackbar = useSnackbar();

  createEffect(
    on(pendingUpdate, (update) => {
      if (!update) return;
      snackbar.show({
        message: t`A new version of Stoat is ready.`,
        action: t`Reload`,
        closeable: true,
        closeOnAction: true,
        onAction: update,
      });
    }),
  );

  return null;
}
