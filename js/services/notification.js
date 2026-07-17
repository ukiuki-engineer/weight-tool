// アプリ全体で共通利用する通知の発行・購読サービス。

const subscribers = new Set();
let currentNotice = null;
let nextNoticeId = 1;

export function showNotice(message, type = "success", duration = 2400) {
  currentNotice = {
    id: nextNoticeId++,
    message,
    type,
    duration,
  };
  subscribers.forEach((subscriber) => subscriber(currentNotice));
}

export function subscribeNotices(subscriber) {
  subscribers.add(subscriber);
  if (currentNotice) subscriber(currentNotice);
  return () => subscribers.delete(subscriber);
}

export function clearNotice(id) {
  if (currentNotice?.id === id) currentNotice = null;
}
