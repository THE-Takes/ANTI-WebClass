// Marks WebClass-owned entry and result pages for scoped visual enhancements.

(() => {
  const supportedPages = new Set([
    "show_frame.php",
    "show_info.php",
    "reslt_frame.php",
    "reslt_menu.php",
    "reslt_answer.php",
  ]);
  const pageName = window.location.pathname.split("/").pop();

  if (!supportedPages.has(pageName)) return;
  if (
    typeof isUxExtensionVisualEnabled === "function" &&
    !isUxExtensionVisualEnabled()
  ) {
    return;
  }

  document.documentElement.classList.add("ux-course-entry");
})();
