try {
  if (sessionStorage.getItem("gameControlSession")) {
    document.documentElement.classList.add("session-pending");
  }
} catch (_error) {
  // Storage can be unavailable in privacy-restricted browsing contexts.
}
