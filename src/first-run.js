async function runFirstRun({
  savedPosition,
  choose,
  enableNotifications,
  persistPosition,
  showResult
}) {
  if (savedPosition !== null) return { shown: false, enabled: false };

  let enabled = false;
  let error = null;
  try {
    if (await choose()) {
      try {
        await enableNotifications();
        enabled = true;
      } catch (caught) {
        error = caught;
      }
      await showResult({ enabled, error });
    }
  } finally {
    await persistPosition();
  }
  return { shown: true, enabled, error };
}

module.exports = { runFirstRun };
