// /Users/montysharma/Projects/news_agg/news_agg/electron/services/scheduler.js

function createScheduler({ refreshService, getIntervalMinutes }) {
  let timer = null;

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    stop();
    const intervalMinutes = Math.max(5, Number(getIntervalMinutes?.() ?? 15));
    timer = setInterval(() => {
      void refreshService.runRefresh({ scheduled: true });
    }, intervalMinutes * 60 * 1000);
    return intervalMinutes;
  }

  function runAfterDelay(delayMs = 2500) {
    setTimeout(() => {
      void refreshService.runRefresh({ launch: true });
    }, delayMs);
  }

  function isRunning() {
    return Boolean(timer);
  }

  return {
    isRunning,
    runAfterDelay,
    start,
    stop,
  };
}

module.exports = {
  createScheduler,
};
