/**
 * Saving files on phones (W11): a download link can open the file in a new
 * browser tab, leaving the installed app, and iOS often can't download at
 * all. On touchscreens, hand the file to the system share sheet instead,
 * which offers Save Image / Save to Files and sending it to other apps.
 * Elsewhere, or if sharing isn't possible, download as before.
 */
export async function saveFile(url: string, filename = "file") {
  const touch = matchMedia("(pointer: coarse)").matches;

  if (touch && typeof navigator.canShare === "function") {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(response.statusText);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: blob.type });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
        return;
      }
    } catch (error) {
      // closing the share sheet isn't a failure
      if ((error as DOMException)?.name === "AbortError") return;
      // otherwise (e.g. too slow after the tap to be allowed), download
    }
  }

  download(url, filename);
}

function download(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noreferrer";
  document.body.append(link);
  link.click();
  link.remove();
}
